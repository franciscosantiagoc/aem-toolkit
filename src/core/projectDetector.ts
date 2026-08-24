import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface MavenProfile {
  id: string;
}

export interface AemProjectInfo {
  /** Carpeta raíz del proyecto Maven (donde está el pom.xml con <modules>). */
  rootPath: string;
  /** Módulos declarados en <modules> del pom raíz, ej. ['all','core','ui.frontend','ui.apps',...]. */
  modules: string[];
  /** Perfiles <profile><id> encontrados en el pom raíz. */
  profiles: MavenProfile[];
  /** true si el módulo ui.frontend existe físicamente (no todos los proyectos lo tienen). */
  hasFrontendModule: boolean;
  /** true si el proyecto trae wrapper de Maven (mvnw / mvnw.cmd). */
  hasMavenWrapper: boolean;
  /** Namespace detectado bajo ui.apps/.../jcr_root/apps/<namespace>. */
  namespace: string | undefined;
  /** Ruta absoluta a la carpeta components del namespace, si se pudo resolver. */
  componentsPath: string | undefined;
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
 * Extrae los ids de <profile><id>...</id></profile> de todo el pom (no solo de <profiles>,
 * por si hay perfiles heredados/anidados poco convencionales) evitando duplicados.
 */
function parseProfileIds(pomXml: string): MavenProfile[] {
  const profilesBlock = /<profiles>([\s\S]*?)<\/profiles>/.exec(pomXml);
  if (!profilesBlock) return [];
  const ids = new Set<string>();
  for (const profileMatch of profilesBlock[1].matchAll(/<profile>([\s\S]*?)<\/profile>/g)) {
    const idMatch = /<id>\s*([^<\s]+)\s*<\/id>/.exec(profileMatch[1]);
    if (idMatch) ids.add(idMatch[1]);
  }
  return [...ids].map((id) => ({ id }));
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

/**
 * Detecta la estructura de un proyecto AEM (arquetipo Maven multi-módulo) a partir de la carpeta
 * de un workspace de VS Code. Devuelve undefined si no se encuentra un pom.xml con <modules> en la raíz.
 */
export function detectAemProject(rootPath: string): AemProjectInfo | undefined {
  const pomPath = path.join(rootPath, 'pom.xml');
  if (!fs.existsSync(pomPath)) return undefined;

  let pomXml: string;
  try {
    pomXml = fs.readFileSync(pomPath, 'utf8');
  } catch {
    return undefined;
  }

  const modules = parseModules(pomXml);
  if (modules.length === 0) return undefined; // no es el pom raíz multi-módulo, sino un pom de submódulo suelto

  const profiles = parseProfileIds(pomXml);
  const hasFrontendModule = modules.includes('ui.frontend') && fs.existsSync(path.join(rootPath, 'ui.frontend'));
  const hasMavenWrapper =
    fs.existsSync(path.join(rootPath, 'mvnw')) || fs.existsSync(path.join(rootPath, 'mvnw.cmd'));
  const { namespace, componentsPath } = findNamespace(rootPath);

  return { rootPath, modules, profiles, hasFrontendModule, hasMavenWrapper, namespace, componentsPath };
}

/**
 * Recorre las carpetas raíz de los workspace folders abiertos buscando la primera que sea (o
 * contenga en su primer nivel) un proyecto AEM reconocible. Soporta el caso común de abrir la
 * carpeta padre que contiene varios proyectos AEM hermanos (como 'D:\GeneralProjects\AEM').
 */
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
