import * as fs from 'fs';
import * as path from 'path';
import { parseDocView } from '../sync/docview';

export type StyleExt = 'css' | 'scss' | 'less';

/** Estado de versionado ya presente en disco para un nombre de componente dado. */
export interface ExistingComponentInfo {
  name: string;
  /** true si `components/<name>/.content.xml` existe (proxy de un versionado, o componente real sin versión). */
  hasOwnContentXml: boolean;
  /** Números de versión (`v1` → 1, `v2` → 2...) que a su vez tienen su propio `.content.xml` real. */
  versions: number[];
}

export interface ComponentsFolderScan {
  existing: ExistingComponentInfo[];
  /** Extensión de estilos dominante si el proyecto usa una sola de forma consistente; undefined si mezcla más de una o no hay ninguna todavía. */
  dominantStyleExt: StyleExt | undefined;
  /** Todas las extensiones de estilos detectadas en el proyecto (para ofrecerlas cuando se mezclan). */
  detectedStyleExts: StyleExt[];
  /** 'kebab' | 'camel' si hay suficientes componentes existentes para inferirlo; undefined si no. */
  namingConvention: 'kebab' | 'camel' | undefined;
  /** Valores de `componentGroup` ya usados en los componentes existentes del proyecto. */
  existingGroups: string[];
}

/** `"v1"` -> `1`, `"v12"` -> `12`, cualquier otro nombre -> `undefined`. Exportada (además de usarse
 * acá) para que `componentVariant.ts` pueda distinguir un componente ya versionado (tiene subcarpetas
 * `vN` con su propio `.content.xml`) de uno todavía sin versionar, al decidir qué flujo ofrecer. */
export function isVersionFolderName(name: string): number | undefined {
  const m = /^v(\d+)$/.exec(name);
  return m ? parseInt(m[1], 10) : undefined;
}

function listSubdirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function readComponentGroup(contentXmlPath: string): string | undefined {
  try {
    const raw = fs.readFileSync(contentXmlPath, 'utf8');
    const root = parseDocView(raw);
    const prop = root.properties.find((p) => p.name === 'componentGroup');
    return prop?.values[0];
  } catch {
    return undefined;
  }
}

function scanExistingComponents(componentsPath: string, utilsFolderName: string): ExistingComponentInfo[] {
  const entries = listSubdirs(componentsPath).filter((n) => n !== utilsFolderName);
  const result: ExistingComponentInfo[] = [];
  for (const name of entries) {
    const base = path.join(componentsPath, name);
    const hasOwnContentXml = fs.existsSync(path.join(base, '.content.xml'));
    const versions: number[] = [];
    for (const sub of listSubdirs(base)) {
      const versionNumber = isVersionFolderName(sub);
      if (versionNumber !== undefined && fs.existsSync(path.join(base, sub, '.content.xml'))) {
        versions.push(versionNumber);
      }
    }
    if (hasOwnContentXml || versions.length > 0) {
      result.push({ name, hasOwnContentXml, versions: versions.sort((a, b) => a - b) });
    }
  }
  return result;
}

/** Extensión de estilos (css/scss/less) de cada archivo encontrado, recorriendo tanto los
 * componentes ya creados en `ui.frontend/src/main/webpack/components` (si hay frontend) como los
 * clientlibs clásicos en `ui.apps` — tanto las que puedan quedar (de versiones previas de la
 * extensión, o creadas a mano) anidadas dentro de la carpeta de cada componente, como la ubicación
 * compartida actual `apps/<namespace>/clientlibs/clientlib-components/<nombre>` (hermana de
 * `components`). */
function detectStyleExtensions(componentsPath: string, hasFrontendModule: boolean, rootPath: string): StyleExt[] {
  const found = new Set<StyleExt>();
  const STYLE_EXTS: StyleExt[] = ['scss', 'less', 'css'];

  function scanDirRecursive(dir: string, depth: number): void {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirRecursive(full, depth + 1);
        continue;
      }
      for (const ext of STYLE_EXTS) {
        if (entry.name.endsWith(`.${ext}`)) {
          found.add(ext);
          break;
        }
      }
    }
  }

  if (hasFrontendModule) {
    scanDirRecursive(path.join(rootPath, 'ui.frontend', 'src', 'main', 'webpack', 'components'), 0);
  }
  scanDirRecursive(componentsPath, 0);
  // Ubicación compartida de clientlibs clásicos, hermana de "components" (apps/<namespace>/clientlibs).
  scanDirRecursive(path.join(path.dirname(componentsPath), 'clientlibs'), 0);

  return STYLE_EXTS.filter((e) => found.has(e));
}

function detectNamingConvention(existing: ExistingComponentInfo[]): 'kebab' | 'camel' | undefined {
  if (existing.length === 0) return undefined;
  let kebab = 0;
  let camel = 0;
  for (const c of existing) {
    if (c.name.includes('-')) kebab += 1;
    else if (/[a-z][A-Z]/.test(c.name)) camel += 1;
  }
  if (kebab === 0 && camel === 0) return undefined;
  return kebab >= camel ? 'kebab' : 'camel';
}

function collectExistingGroups(componentsPath: string, existing: ExistingComponentInfo[]): string[] {
  const groups = new Set<string>();
  for (const c of existing) {
    if (c.hasOwnContentXml) {
      const g = readComponentGroup(path.join(componentsPath, c.name, '.content.xml'));
      if (g) groups.add(g);
    }
    for (const v of c.versions) {
      const g = readComponentGroup(path.join(componentsPath, c.name, `v${v}`, '.content.xml'));
      if (g) groups.add(g);
    }
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

export function scanComponentsFolder(
  componentsPath: string,
  hasFrontendModule: boolean,
  rootPath: string,
  utilsFolderName: string
): ComponentsFolderScan {
  const existing = scanExistingComponents(componentsPath, utilsFolderName);
  const detectedStyleExts = detectStyleExtensions(componentsPath, hasFrontendModule, rootPath);
  const dominantStyleExt = detectedStyleExts.length === 1 ? detectedStyleExts[0] : undefined;
  const namingConvention = detectNamingConvention(existing);
  const existingGroups = collectExistingGroups(componentsPath, existing);

  return { existing, dominantStyleExt, detectedStyleExts, namingConvention, existingGroups };
}

/** Válido como nombre de nodo JCR (sin namespace): letras/números/guion/guion bajo, empieza por letra o "_". */
export function isValidJcrNodeName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);
}

/** "hero-banner" -> "Hero Banner" (título por defecto a partir del nombre técnico). */
export function titleFromName(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
