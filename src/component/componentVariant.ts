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

export interface NextVersionResult {
  componentName: string;
  /** `.content.xml` del proxy (la carpeta sobre la que se hizo clic), reescrito para apuntar a la versión nueva. */
  proxyContentXmlPath: string;
  previousVersionDir: string;
  previousVersionNumber: number;
  newVersionDir: string;
  newVersionNumber: number;
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

/** Subcarpetas `vN` de `componentDir` que además tienen su propio `.content.xml` real (o sea, son
 * versiones de verdad y no una carpeta `vN` vacía/a medio crear). Base compartida por
 * `isAlreadyVersionedComponent` (¿hay alguna?) y `createNextVersion` (¿cuál es la más alta?). */
function listVersionDirs(componentDir: string): { version: number; dir: string }[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(componentDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: { version: number; dir: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const version = isVersionFolderName(e.name);
    if (version === undefined) continue;
    const dir = path.join(componentDir, e.name);
    if (fs.existsSync(path.join(dir, '.content.xml'))) {
      result.push({ version, dir });
    }
  }
  return result;
}

/**
 * true si `componentDir` ya es un componente **versionado** (proxy): tiene su propio `.content.xml`
 * Y además al menos una subcarpeta `vN` con su propio `.content.xml` real. Si tiene `.content.xml`
 * pero NINGUNA subcarpeta de versión, es un componente real sin versionar todavía — el caso que
 * `migrateComponentToVariant` sabe convertir.
 */
export function isAlreadyVersionedComponent(componentDir: string): boolean {
  return listVersionDirs(componentDir).length > 0;
}

/** Número de la versión más alta ya creada (con `.content.xml` propio), o undefined si no hay
 * ninguna todavía — usado para armar el mensaje de confirmación de `createNextVersion` antes de
 * ejecutarla (para poder mostrar "v3 a partir de v2" en vez de un genérico "una versión nueva"). */
export function getLatestVersionNumber(componentDir: string): number | undefined {
  const versions = listVersionDirs(componentDir);
  if (versions.length === 0) return undefined;
  return Math.max(...versions.map((v) => v.version));
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

/**
 * Crea la siguiente versión (`vN+1`) de un componente que **ya** es un proxy versionado (tiene al
 * menos una subcarpeta `vN` con su propio `.content.xml` — ver `isAlreadyVersionedComponent`), a
 * pedido explícito del usuario al usar "Crear componente" directamente sobre la carpeta del proxy:
 * antes esto solo mostraba un aviso pidiendo ir a `components` a repetir el flujo del formulario; con
 * esta función se resuelve directo, sin formulario, igual que ya hace `migrateComponentToVariant`
 * para el caso de un componente sin versionar.
 *
 * 1. Se ubica la versión más alta ya existente (`vN`, la que tiene mayor número entre las que
 *    cumplen `listVersionDirs`) y se **duplica tal cual** para crear `vN+1` — mismo criterio que
 *    `migrateComponentToVariant` usa para `v1` → `v2`: el usuario arranca la versión nueva con el
 *    contenido real de la anterior (HTL, diálogo, `_cq_editConfig`/`_cq_design_dialog`/`_cq_template`
 *    si los tuviera) en vez de una plantilla vacía, y la ajusta a mano desde ahí. La clientlib clásica
 *    (si la hay) vive fuera de `components` — es compartida entre versiones por convención de la
 *    extensión (ver `computeDefaultAssetsDir`) — así que no hace falta tocarla ni duplicarla aparte.
 * 2. El proxy (el `.content.xml` de `componentDir`, SIN mover ni recrear) se reescribe únicamente en
 *    `sling:resourceSuperType`, que pasa a apuntar a `vN+1` — el resto de sus propiedades (título,
 *    grupo, ícono, `allowedParents`...) quedan intactas, igual que en `migrateComponentToVariant`.
 *
 * No requiere ningún dato del formulario (nombre/título/grupo/estilos...) porque no crea un
 * componente nuevo de cero — parte enteramente del contenido ya existente de la versión anterior.
 */
export function createNextVersion(componentDir: string, namespace: string): NextVersionResult {
  const componentName = path.basename(componentDir);
  const versions = listVersionDirs(componentDir);
  if (versions.length === 0) {
    throw new Error(`"${componentName}" no tiene ninguna subcarpeta de versión (v1, v2...) con su propio .content.xml.`);
  }
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
  const newVersionNumber = latest.version + 1;
  const newVersionDir = path.join(componentDir, `v${newVersionNumber}`);

  // 1. Duplicar tal cual la versión más alta -> la nueva.
  copyDirRecursive(latest.dir, newVersionDir);

  // 2. El proxy (mismo .content.xml, resto de propiedades intactas) pasa a apuntar a la versión nueva.
  const contentXmlPath = path.join(componentDir, '.content.xml');
  const originalXml = fs.readFileSync(contentXmlPath, 'utf8');
  const namespaces = mergeNamespaces(extractRootNamespaces(originalXml));
  const tree = parseDocView(originalXml);
  const title = readStringProp(tree, 'jcr:title') ?? componentName;
  const componentGroup = readStringProp(tree, 'componentGroup') ?? '';

  setStringProp(tree, 'sling:resourceSuperType', `${namespace}/components/${componentName}/v${newVersionNumber}`);
  fs.writeFileSync(contentXmlPath, serializeDocView(tree, namespaces), 'utf8');

  return {
    componentName,
    proxyContentXmlPath: contentXmlPath,
    previousVersionDir: latest.dir,
    previousVersionNumber: latest.version,
    newVersionDir,
    newVersionNumber,
    title,
    componentGroup
  };
}
