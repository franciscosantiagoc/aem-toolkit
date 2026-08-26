import { XMLParser } from 'fast-xml-parser';

/**
 * Modela una propiedad JCR tal como se describe en un atributo de FileVault Document View
 * (ej. `value="{Boolean}true"`, `name="./seeMoreMobileText"`, `jcr:mixinTypes="[mix:a,mix:b]"`).
 */
export interface DocViewProperty {
  /** Nombre del atributo XML tal cual (ej. "value", "fieldLabel", "jcr:primaryType"). */
  name: string;
  /** Tipo JCR detectado a partir del prefijo "{Tipo}" — "String" si no se indica ninguno. */
  type: string;
  /** true si el valor venía entre corchetes "[...]" (propiedad multivalor). */
  multi: boolean;
  /** Valores ya "desescapados" (sin las barras invertidas de escape de FileVault). */
  values: string[];
}

/** Un nodo JCR tal como lo describe un elemento de un .content.xml (Document View), con sus
 * propiedades propias y sus nodos hijos en el mismo orden en que aparecen en el archivo. */
export interface DocViewNode {
  /** Nombre del nodo (nombre del elemento XML, ej. "content", "seeMoreMobileText2", "jcr:content"). */
  name: string;
  properties: DocViewProperty[];
  children: DocViewNode[];
}

const KNOWN_JCR_TYPES = new Set([
  'String', 'Boolean', 'Long', 'Double', 'Decimal', 'Date', 'Name', 'Path', 'Reference', 'WeakReference', 'URI', 'Binary'
]);

function unescapeDocViewValue(raw: string): string {
  return raw.replace(/\\(.)/g, '$1');
}

/** Divide el contenido de una propiedad multivalor "[a,b,c]" respetando comas escapadas ("\,"). */
function splitMultiValue(inner: string): string[] {
  if (inner.length === 0) return [];
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && i + 1 < inner.length) {
      current += ch + inner[i + 1];
      i++;
      continue;
    }
    if (ch === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map(unescapeDocViewValue);
}

export function parseDocViewValue(name: string, raw: string): DocViewProperty {
  let rest = raw;
  let type = 'String';
  const typeMatch = /^\{([A-Za-z]+)\}/.exec(rest);
  if (typeMatch && KNOWN_JCR_TYPES.has(typeMatch[1])) {
    type = typeMatch[1];
    rest = rest.slice(typeMatch[0].length);
  }
  if (rest.startsWith('[') && rest.endsWith(']')) {
    return { name, type, multi: true, values: splitMultiValue(rest.slice(1, -1)) };
  }
  return { name, type, multi: false, values: [unescapeDocViewValue(rest)] };
}

const ATTR_PREFIX = '@_';

function tagEntry(nodeObj: Record<string, unknown>): { tag: string; children: unknown[] } | undefined {
  for (const key of Object.keys(nodeObj)) {
    if (key === ':@' || key === '#text' || key.startsWith('?') || key === '#comment') continue;
    const children = nodeObj[key];
    if (Array.isArray(children)) return { tag: key, children };
  }
  return undefined;
}

function readAttributes(nodeObj: Record<string, unknown>): Record<string, string> {
  const attrs = nodeObj[':@'] as Record<string, unknown> | undefined;
  if (!attrs) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(attrs)) {
    const plain = key.startsWith(ATTR_PREFIX) ? key.slice(ATTR_PREFIX.length) : key;
    // Las declaraciones de namespace (xmlns / xmlns:xxx) no son propiedades JCR reales — son solo
    // metadata de sintaxis XML, así que se descartan al construir el árbol de nodos.
    if (plain === 'xmlns' || plain.startsWith('xmlns:')) continue;
    out[plain] = String(attrs[key]);
  }
  return out;
}

function buildNode(nodeObj: Record<string, unknown>, name: string): DocViewNode {
  const attrs = readAttributes(nodeObj);
  const entry = tagEntry(nodeObj);
  const properties = Object.entries(attrs).map(([k, v]) => parseDocViewValue(k, v));
  const children: DocViewNode[] = [];
  for (const childObj of entry?.children ?? []) {
    const childEntry = tagEntry(childObj as Record<string, unknown>);
    if (!childEntry) continue; // texto suelto u otros nodos no-elemento — no aplica a document view real
    children.push(buildNode(childObj as Record<string, unknown>, childEntry.tag));
  }
  return { name, properties, children };
}

/**
 * Interpreta el contenido de un `.content.xml` (FileVault Document View) y devuelve el nodo raíz
 * — que representa las propiedades e hijos del elemento `jcr:root` (es decir, del nodo padre que
 * contiene al propio archivo, según la convención ya usada en `syncRunner.ts`).
 */
export function parseDocView(xml: string): DocViewNode {
  // trimValues: false es crítico — sin esto, fast-xml-parser recorta espacios en blanco al inicio
  // y al final de los valores de atributo (ej. value=" hrs." perdería el espacio inicial), lo cual
  // corrompería silenciosamente el contenido real de propiedades de texto.
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: ATTR_PREFIX, preserveOrder: true, trimValues: false });
  const parsed = parser.parse(xml) as Record<string, unknown>[];
  for (const entry of parsed) {
    const tag = tagEntry(entry);
    if (tag) return buildNode(entry, tag.tag);
  }
  throw new Error('El archivo no contiene ningún elemento XML raíz reconocible.');
}

/**
 * Compara dos árboles (versión anterior vs. actual) del mismo nodo y detecta si la versión
 * anterior tenía alguna propiedad o nodo hijo que ya no está en la actual — es decir, si el
 * usuario eliminó algo localmente. Se usa solo para avisar al usuario (nunca para borrar nada
 * remotamente fuera del flujo de reemplazo total de diálogos).
 */
export function treeHasRemovals(previous: DocViewNode, current: DocViewNode): boolean {
  const currentPropNames = new Set(current.properties.map((p) => p.name));
  for (const p of previous.properties) {
    if (!currentPropNames.has(p.name)) return true;
  }
  const currentChildByName = new Map(current.children.map((c) => [c.name, c] as const));
  for (const oldChild of previous.children) {
    const newChild = currentChildByName.get(oldChild.name);
    if (!newChild) return true;
    if (treeHasRemovals(oldChild, newChild)) return true;
  }
  return false;
}
