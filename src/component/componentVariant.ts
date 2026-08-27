import * as fs from 'fs';
import * as path from 'path';
import { DocViewNode, extractRootNamespaces, parseDocView } from '../sync/docview';
import { mergeNamespaces, serializeDocView } from '../dialog/docviewSerializer';
import { isVersionFolderName } from './componentDetector';

export interface VariantMigrationResult {
  componentName: string;
  /** `.content.xml` de la carpeta original, que pasa a ser el proxy. */
  proxyContentXmlPath: string;
  v1Dir: string;
  v2Dir: string;
  title: string;
  componentGroup: string;
}

function readStringProp(node: DocViewNode, name: string): string | undefined {
  return node.properties.find((p) => p.name === name)?.values[0];
}

/** Agrega la propiedad si no existe, o sobreescribe su valor (como String simple) si ya existía —
 * usado para inyectar/actualizar `sling:resourceSuperType` sin tocar el resto de propiedades del
 * `.content.xml` original (icono, `allowedParents`, `cq:noDecoration`, etc. quedan intactas). */
function setStringProp(node: DocViewNode, name: string, value: string): void {
  const existing = node.properties.find((p) => p.name === name);
  if (existing) {
    existing.values = [value];
    existing.multi = false;
    existing.type = 'String';
  } else {
    node.properties.push({ name, type: 'String', multi: false, values: [value] });
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * true si `componentDir` ya es un componente **versionado** (proxy): tiene su propio `.content.xml`
 * Y además al menos una subcarpeta `vN` con su propio `.content.xml` real. Si tiene `.content.xml`
 * pero NINGUNA subcarpeta de versión, es un componente real sin versionar todavía — el caso que
 * `migrateComponentToVariant` sabe convertir.
 */
export function isAlreadyVersionedComponent(componentDir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(componentDir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((e) => e.isDirectory() && isVersionFolderName(e.name) !== undefined && fs.existsSync(path.join(componentDir, e.name, '.content.xml')));
}

/**
 * Convierte un componente existente SIN versionar (carpeta con su propio `.content.xml` y su
 * contenido real directamente adentro — `.html`, `_cq_dialog`, clientlib propia si la tuviera, etc.,
 * sin subcarpetas `v1`/`v2`) al esquema de "proxy" versionado que ya usa el resto de la extensión, a
 * pedido explícito del usuario para poder crear una "variante" de un componente ya existente:
 *
 * 1. Todo el contenido actual de la carpeta se MUEVE tal cual a `v1/` (nada se reescribe: cualquier
 *    propiedad propia del `.content.xml` original, cualquier `sling:resourceSuperType` que ya tuviera
 *    por una herencia real distinta a este esquema, y cualquier archivo/subcarpeta adicional quedan
 *    intactos — la cadena de `resourceSuperType` sigue resolviendo igual que antes, solo que ahora
 *    con un salto más).
 * 2. La carpeta pasa a ser el proxy: se reusa el `.content.xml` ORIGINAL (antes de moverlo) como base
 *    — todas sus propiedades propias (título, grupo, ícono, `allowedParents`, etc.) se preservan tal
 *    cual, porque son las que definen cómo se ve/comporta el componente para el autor, y el proxy es
 *    la ruta que de verdad se referencia desde páginas/plantillas — y se le agrega/sobreescribe
 *    `sling:resourceSuperType` apuntando a la versión vigente.
 * 3. `v1` se duplica tal cual para crear `v2`, como punto de partida de la variante nueva — el
 *    usuario ajusta luego `v2` a mano para que sea la variante real. El proxy queda apuntando a `v2`
 *    (la más nueva), consistente con el resto de la extensión.
 *
 * No se toca ningún archivo dentro de `v1`/`v2` más allá de la copia — HTL, diálogo, clientlib propia
 * si la hubiera, todo queda igual en ambas versiones hasta que el usuario edite `v2`.
 */
export function migrateComponentToVariant(componentDir: string, namespace: string): VariantMigrationResult {
  const componentName = path.basename(componentDir);
  const contentXmlPath = path.join(componentDir, '.content.xml');
  const originalXml = fs.readFileSync(contentXmlPath, 'utf8');
  const namespaces = mergeNamespaces(extractRootNamespaces(originalXml));
  const tree = parseDocView(originalXml);

  const title = readStringProp(tree, 'jcr:title') ?? componentName;
  const componentGroup = readStringProp(tree, 'componentGroup') ?? '';

  // 1. Mover TODO el contenido actual de la carpeta a v1/.
  const v1Dir = path.join(componentDir, 'v1');
  fs.mkdirSync(v1Dir, { recursive: true });
  for (const entry of fs.readdirSync(componentDir, { withFileTypes: true })) {
    if (entry.name === 'v1') continue;
    fs.renameSync(path.join(componentDir, entry.name), path.join(v1Dir, entry.name));
  }

  // 2. La carpeta pasa a ser el proxy (mismo árbol original + resourceSuperType -> v1 por ahora).
  setStringProp(tree, 'sling:resourceSuperType', `${namespace}/components/${componentName}/v1`);
  fs.writeFileSync(contentXmlPath, serializeDocView(tree, namespaces), 'utf8');

  // 3. Duplicar v1 -> v2 tal cual, como punto de partida de la variante nueva.
  const v2Dir = path.join(componentDir, 'v2');
  copyDirRecursive(v1Dir, v2Dir);

  // 4. El proxy pasa a apuntar a v2 (la última).
  setStringProp(tree, 'sling:resourceSuperType', `${namespace}/components/${componentName}/v2`);
  fs.writeFileSync(contentXmlPath, serializeDocView(tree, namespaces), 'utf8');

  return { componentName, proxyContentXmlPath: contentXmlPath, v1Dir, v2Dir, title, componentGroup };
}
