import { DocViewNode, DocViewProperty } from '../sync/docview';

/**
 * Inverso de `docview.ts#parseDocView`: convierte un árbol `DocViewNode` de vuelta a texto XML
 * FileVault Document View, listo para escribirse tal cual en un `.content.xml`.
 *
 * Formato de salida (v1.5.0, a pedido explícito del usuario):
 *  - La abertura de la etiqueta y su primer atributo van en la primera línea: `<nombre attr1="...">`
 *    o, si hay más atributos, `<nombre attr1="..."` (sin `>` todavía).
 *  - Si el nodo tiene más de un atributo, los siguientes se listan uno por línea, cada uno
 *    indentado un nivel más a la derecha que la abertura, y el `>` de cierre va pegado al final del
 *    ÚLTIMO atributo (no en una línea aparte).
 *  - Si el nodo tiene 0 o 1 atributos, el `>` va en esa misma primera línea.
 *  - En todos los casos la etiqueta de cierre `</nombre>` va en su propia línea siguiente — nunca se
 *    usa autocierre `/>`, aunque el nodo no tenga hijos (XML-equivalente; a un parser SAX/DOM le da
 *    igual, así todo el árbol queda formateado de manera uniforme, no solo los campos agregados
 *    desde el editor visual).
 */

export const STANDARD_NAMESPACES: [string, string][] = [
  ['jcr', 'http://www.jcp.org/jcr/1.0'],
  ['sling', 'http://sling.apache.org/jcr/sling/1.0'],
  ['cq', 'http://www.day.com/jcr/cq/1.0'],
  ['nt', 'http://www.jcp.org/jcr/nt/1.0']
];

/** Combina las 4 namespaces estándar (siempre presentes, por si el árbol usa esos prefijos) con
 * cualquier namespace adicional detectada en el archivo original (ej. `granite`, `dam`, `wcmio`) —
 * usado por el comando "Formatear XML" para no perder namespaces propias de un archivo existente al
 * reserializarlo. Las estándar van primero y en orden fijo; las detectadas que ya estén en las
 * estándar se ignoran (evita duplicar el prefijo). */
export function mergeNamespaces(detected: [string, string][]): [string, string][] {
  const result: [string, string][] = [...STANDARD_NAMESPACES];
  const known = new Set(result.map(([prefix]) => prefix));
  for (const [prefix, uri] of detected) {
    if (!known.has(prefix)) {
      result.push([prefix, uri]);
      known.add(prefix);
    }
  }
  return result;
}

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inverso de la unión escape+split que hace `docview.ts` al leer un valor — dobla las barras
 * invertidas literales y, en un arreglo, además escapa las comas literales de cada elemento. */
function escapeDocViewScalar(raw: string, isArrayItem: boolean): string {
  let out = raw.replace(/\\/g, '\\\\');
  if (isArrayItem) out = out.replace(/,/g, '\\,');
  return out;
}

function serializePropertyValue(prop: DocViewProperty): string {
  const typePrefix = prop.type !== 'String' ? `{${prop.type}}` : '';
  if (prop.multi) {
    const joined = prop.values.map((v) => escapeDocViewScalar(v, true)).join(',');
    return `${typePrefix}[${joined}]`;
  }
  return `${typePrefix}${escapeDocViewScalar(prop.values[0] ?? '', false)}`;
}

function attributeStrings(properties: DocViewProperty[], extraNamespaces: [string, string][]): string[] {
  const parts: string[] = [];
  for (const [prefix, uri] of extraNamespaces) parts.push(`xmlns:${prefix}="${uri}"`);
  for (const prop of properties) {
    parts.push(`${prop.name}="${escapeXmlAttr(serializePropertyValue(prop))}"`);
  }
  return parts;
}

function serializeNode(node: DocViewNode, depth: number, extraNamespaces: [string, string][] = []): string {
  const indent = '  '.repeat(depth);
  const attrIndent = '  '.repeat(depth + 1);
  const attrs = attributeStrings(node.properties, extraNamespaces);

  let openLines: string[];
  if (attrs.length === 0) {
    openLines = [`${indent}<${node.name}>`];
  } else if (attrs.length === 1) {
    openLines = [`${indent}<${node.name} ${attrs[0]}>`];
  } else {
    const first = `${indent}<${node.name} ${attrs[0]}`;
    const middle = attrs.slice(1, -1).map((a) => `${attrIndent}${a}`);
    const last = `${attrIndent}${attrs[attrs.length - 1]}>`;
    openLines = [first, ...middle, last];
  }

  const closeLine = `${indent}</${node.name}>`;
  if (node.children.length === 0) {
    return `${openLines.join('\n')}\n${closeLine}`;
  }
  const childrenXml = node.children.map((c) => serializeNode(c, depth + 1)).join('\n');
  return `${openLines.join('\n')}\n${childrenXml}\n${closeLine}`;
}

/** Serializa un árbol completo (la raíz que representa el nodo `jcr:root`) a texto XML listo para
 * escribirse en un `.content.xml`. Por defecto declara las 4 namespaces estándar; pasa `namespaces`
 * (ej. el resultado de `mergeNamespaces(extractRootNamespaces(original))`) para preservar además
 * cualquier namespace adicional que ya tuviera el archivo original. */
export function serializeDocView(root: DocViewNode, namespaces: [string, string][] = STANDARD_NAMESPACES): string {
  const body = serializeNode(root, 0, namespaces);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}
