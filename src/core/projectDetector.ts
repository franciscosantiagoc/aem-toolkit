import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface MavenProfile {
  id: string;
  /** Módulo donde se declaró el perfil (ej. 'ui.frontend'), o undefined si viene del pom raíz. */
  sourceModule?: string;
}

export interface AemProjectInfo {
  /** Carpeta raíz del proyecto Maven (donde está el pom.xml con <modules>). */
  rootPath: string;
  /** Módulos declarados en <modules> del pom raíz, ej. ['all','core','ui.frontend','ui.apps',...]. */
  modules: string[];
  /** Perfiles <profile><id> del pom raíz Y de los poms de cada submódulo de primer nivel (ej. 'fedDev' en ui.frontend/pom.xml). */
  profiles: MavenProfile[];
  /** true si el módulo ui.frontend existe físicamente (no todos los proyectos lo tienen). */
  hasFrontendModule: boolean;
  /** true si el proyecto trae wrapper de Maven (mvnw / mvnw.cmd). */
  hasMavenWrapper: boolean;
  /** Namespace detectado bajo ui.apps/.../jcr_root/apps/<namespace>. */
  namespace: string | undefined;
  /** Ruta absoluta a la carpeta components del namespace, si se pudo resolver. */
  componentsPath: string | undefined;
  /** true si algún pom (raíz o submódulo) ya configura jacoco-maven-plugin. */
  hasJacoco: boolean;
  /** Nombre del script npm de tests en ui.frontend/package.json, si existe (ej. 'test'). */
  frontendTestScript: string | undefined;
  /** Nombre del script npm que genera coverage en ui.frontend/package.json, si existe (ej. 'test:coverage'). */
  frontendCoverageScript: string | undefined;
  /** Versión mayor de Java que requiere el proyecto (ej. 11, 17), leída de maven.compiler.release/
   * target/source o java.version en el pom raíz y en los poms de cada módulo (se toma la más alta
   * encontrada). undefined si ningún pom declara una versión reconocible. */
  requiredJavaVersion: number | undefined;
}

/**
 * Extrae los <module>...</module> declarados dentro del primer bloque <modules>...</modules>
 * del pom.xml raíz. Se usa una lectura por regex (no un parser XML completo) porque el pom raíz
 * de un arquetipo AEM es simple y esto evita agregar una dependencia solo para esto.
 */
function parseModules(pomXml: string): string[] {
  const modulesBlock = /<modules>([\s\S]*?)<\/modules>/.exec(pomXml);
  if (!modulesBlock) return [];
  const moduleMatches = [...modulesBlock[1].matchAll(/<module>\s*([^<\s]+)\s*<\/module>/g)];
  return moduleMatches.map((m) => m[1]);
}

/**
 * Extrae los ids de <profile><id>...</id></profile> dentro de <profiles> de un pom dado.
 */
function parseProfileIds(pomXml: string, sourceModule?: string): MavenProfile[] {
  const profilesBlock = /<profiles>([\s\S]*?)<\/profiles>/.exec(pomXml);
  if (!profilesBlock) return [];
  const ids = new Set<string>();
  for (const profileMatch of profilesBlock[1].matchAll(/<profile>([\s\S]*?)<\/profile>/g)) {
    const idMatch = /<id>\s*([^<\s]+)\s*<\/id>/.exec(profileMatch[1]);
    if (idMatch) ids.add(idMatch[1]);
  }
  return [...ids].map((id) => ({ id, sourceModule }));
}

function findNamespace(rootPath: string): { namespace: string | undefined; componentsPath: string | undefined } {
  const appsRoot = path.join(rootPath, 'ui.apps', 'src', 'main', 'content', 'jcr_root', 'apps');
  try {
    const entries = fs.readdirSync(appsRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
    // Convención de los proyectos de referencia: una sola carpeta de namespace bajo /apps
    // (ej. 'gatesconnect', 'gnp-solvimas', 'repsol-lubricantes'). Si hay varias, se toma la
    // primera que contenga una subcarpeta 'components' y se avisa al usuario en showProjectInfo.
    for (const entry of entries) {
      const candidateComponents = path.join(appsRoot, entry.name, 'components');
      if (fs.existsSync(candidateComponents)) {
        return { namespace: entry.name, componentsPath: candidateComponents };
      }
    }
  } catch {
    // ui.apps no existe o no tiene la forma esperada todavía; no es un error fatal.
  }
  return { namespace: undefined, componentsPath: undefined };
}

function readFileSafe(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

function detectFrontendScripts(rootPath: string): { testScript: string | undefined; coverageScript: string | undefined } {
  const pkgPath = path.join(rootPath, 'ui.frontend', 'package.json');
  const raw = readFileSafe(pkgPath);
  if (!raw) return { testScript: undefined, coverageScript: undefined };
  try {
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const scriptNames = Object.keys(scripts);
    // Prioriza nombres explícitos de coverage; cualquier script cuyo comando incluya --coverage
    // también cuenta, por si el proyecto lo llama distinto (ej. 'test:ci').
    const coverageScript = scriptNames.find((n) => /coverage/i.test(n) || /--coverage/i.test(scripts[n] ?? ''));
    const testScript = scriptNames.find((n) => n === 'test' || /^test/i.test(n));
    return { testScript, coverageScript };
  } catch {
    return { testScript: undefined, coverageScript: undefined };
  }
}

function detectJacoco(rootPath: string, modules: string[]): boolean {
  const poms = [path.join(rootPath, 'pom.xml'), ...modules.map((m) => path.join(rootPath, m, 'pom.xml'))];
  return poms.some((p) => {
    const content = readFileSafe(p);
    return !!content && content.includes('jacoco');
  });
}

/** "1.8" (convención vieja hasta Java 8) -> 8; "17" o "17.0" -> 17. */
function normalizeJavaVersion(raw: string): number | undefined {
  const parts = raw.trim().split('.');
  if (parts[0] === '1' && parts[1]) {
    const n = parseInt(parts[1], 10);
    return Number.isFinite(n) ? n : undefined;
  }
  const n = parseInt(parts[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

const JAVA_VERSION_PATTERNS = [
  /<maven\.compiler\.release>\s*([\d.]+)\s*<\/maven\.compiler\.release>/,
  /<release>\s*([\d.]+)\s*<\/release>/,
  /<maven\.compiler\.target>\s*([\d.]+)\s*<\/maven\.compiler\.target>/,
  /<maven\.compiler\.source>\s*([\d.]+)\s*<\/maven\.compiler\.source>/,
  /<java\.version>\s*([\d.]+)\s*<\/java\.version>/
];

/**
 * Busca en el pom raíz y en el de cada módulo alguna declaración reconocible de versión de Java
 * (maven.compiler.release/target/source, o la propiedad de convención java.version) y devuelve la
 * más alta encontrada — si un solo módulo requiere una versión mayor, esa es la que necesita tener
 * disponible el reactor completo para compilar sin errores.
 */
function detectRequiredJavaVersion(rootPath: string, modules: string[]): number | undefined {
  const poms = [path.join(rootPath, 'pom.xml'), ...modules.map((m) => path.join(rootPath, m, 'pom.xml'))];
  let max: number | undefined;
  for (const pomPath of poms) {
    const content = readFileSafe(pomPath);
    if (!content) continue;
    for (const pattern of JAVA_VERSION_PATTERNS) {
      const match = pattern.exec(content);
      if (!match) continue;
      const version = normalizeJavaVersion(match[1]);
      if (version !== undefined && (max === undefined || version > max)) max = version;
    }
  }
  return max;
}

/**
 * Detecta la estructura de un proyecto AEM (arquetipo Maven multi-módulo) a partir de la carpeta
 * de un workspace de VS Code. Devuelve undefined si no se encuentra un pom.xml con <modules> en la raíz.
 */
export function detectAemProject(rootPath: string): AemProjectInfo | undefined {
  const pomPath = path.join(rootPath, 'pom.xml');
  const pomXml = readFileSafe(pomPath);
  if (!pomXml) return undefined;

  const modules = parseModules(pomXml);
  if (modules.length === 0) return undefined; // no es el pom raíz multi-módulo, sino un pom de submódulo suelto

  const rootProfiles = parseProfileIds(pomXml);
  // Además del pom raíz, algunos proyectos (ej. gatesconnect-aem con 'fedDev') declaran perfiles
  // propios dentro del pom de un submódulo — hay que recogerlos también para que el panel de
  // compilación los pueda ofrecer como checkbox.
  const submoduleProfiles = modules.flatMap((m) => {
    const subPomXml = readFileSafe(path.join(rootPath, m, 'pom.xml'));
    return subPomXml ? parseProfileIds(subPomXml, m) : [];
  });
  const seen = new Set<string>();
  const profiles: MavenProfile[] = [];
  for (const p of [...rootProfiles, ...submoduleProfiles]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    profiles.push(p);
  }

  const hasFrontendModule = modules.includes('ui.frontend') && fs.existsSync(path.join(rootPath, 'ui.frontend'));
  const hasMavenWrapper =
    fs.existsSync(path.join(rootPath, 'mvnw')) || fs.existsSync(path.join(rootPath, 'mvnw.cmd'));
  const { namespace, componentsPath } = findNamespace(rootPath);
  const hasJacoco = detectJacoco(rootPath, modules);
  const { testScript, coverageScript } = hasFrontendModule
    ? detectFrontendScripts(rootPath)
    : { testScript: undefined, coverageScript: undefined };
  const requiredJavaVersion = detectRequiredJavaVersion(rootPath, modules);

  return {
    rootPath,
    modules,
    profiles,
    hasFrontendModule,
    hasMavenWrapper,
    namespace,
    componentsPath,
    hasJacoco,
    frontendTestScript: testScript,
    frontendCoverageScript: coverageScript,
    requiredJavaVersion
  };
}

/**
 * Recorre las carpetas raíz de los workspace folders abiertos buscando la primera que sea (o
 * contenga en su primer nivel) un proyecto AEM reconocible. Soporta el caso común de abrir la
 * carpeta padre que contiene varios proyectos AEM hermanos (como 'D:\GeneralProjects\AEM').
 */
/**
 * Sube desde `fsPath` (un archivo o carpeta cualquiera dentro del proyecto, ej. la carpeta
 * `components` sobre la que se hizo clic derecho) buscando el primer ancestro que sea la raíz de un
 * proyecto AEM reconocible (`detectAemProject`). Se usa para comandos que se disparan sobre una
 * carpeta profunda del árbol (ej. "Crear componente") en vez de sobre la raíz del workspace.
 */
export function findAemProjectForPath(fsPath: string): AemProjectInfo | undefined {
  let dir = fs.statSync(fsPath).isDirectory() ? fsPath : path.dirname(fsPath);
  // Límite de seguridad: no subir más de 20 niveles (evita un bucle infinito en rutas raras).
  for (let i = 0; i < 20; i++) {
    const info = detectAemProject(dir);
    if (info) return info;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined; // llegamos a la raíz del filesystem
    dir = parent;
  }
  return undefined;
}

export function detectAemProjectsInWorkspace(): AemProjectInfo[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const found: AemProjectInfo[] = [];

  for (const folder of folders) {
    const direct = detectAemProject(folder.uri.fsPath);
    if (direct) {
      found.push(direct);
      continue;
    }
    try {
      const children = fs.readdirSync(folder.uri.fsPath, { withFileTypes: true }).filter((e) => e.isDirectory());
      for (const child of children) {
        const info = detectAemProject(path.join(folder.uri.fsPath, child.name));
        if (info) found.push(info);
      }
    } catch {
      // no legible; se ignora
    }
  }

  return found;
}
