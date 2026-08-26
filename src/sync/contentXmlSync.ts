import * as path from 'path';
import { spawnSync } from 'child_process';
import { DocViewNode, parseDocView, treeHasRemovals } from './docview';
import { createOrUpdateNode, deleteNode, SyncResult, SyncTarget } from './slingClient';

/** true si el archivo es el `.content.xml` del diálogo de edición de un componente (o de una
 * página/plantilla, que usa exactamente el mismo mecanismo `_cq_dialog`) — el único caso donde el
 * usuario pidió reemplazo total (que las eliminaciones también se reflejen en AEM). */
export function isEditDialogContentXml(fsPath: string): boolean {
  return path.basename(fsPath) === '.content.xml' && path.basename(path.dirname(fsPath)) === '_cq_dialog';
}

/**
 * Sube un árbol ya interpretado (ver `docview.ts`) a partir de `nodePath`, nodo por nodo, en el
 * mismo orden del documento (los padres siempre antes que sus hijos, para que la ruta del hijo ya
 * exista al crearlo). Se detiene en el primer nodo que falla — no tiene sentido seguir creando
 * hijos de un nodo que no se pudo crear.
 */
export async function pushNodeTree(target: SyncTarget, nodePath: string, node: DocViewNode): Promise<SyncResult[]> {
  const own = await createOrUpdateNode(target, nodePath, node.properties);
  if (!own.ok) return [own];

  const results = [own];
  for (const child of node.children) {
    const childPath = `${nodePath}/${child.name}`;
    results.push(...(await pushNodeTree(target, childPath, child)));
    if (!results[results.length - 1].ok) break;
  }
  return results;
}

function tryGitShowHead(fsPath: string): string | undefined {
  const dir = path.dirname(fsPath);
  const root = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 5000 });
  if (root.status !== 0 || !root.stdout) return undefined;
  const repoRoot = root.stdout.trim();
  const rel = path.relative(repoRoot, fsPath).split(path.sep).join('/');
  const show = spawnSync('git', ['-C', repoRoot, 'show', `HEAD:${rel}`], { encoding: 'utf8', timeout: 5000 });
  if (show.status !== 0) return undefined; // archivo nuevo (aún no commiteado) u otro problema — no hay con qué comparar
  return show.stdout;
}

/**
 * Compara la versión commiteada (HEAD) de este `.content.xml` contra el árbol ya parseado de la
 * versión actual en disco, para detectar si el usuario eliminó alguna propiedad o nodo — se usa
 * SOLO para avisarle (esta sincronización nunca borra nada fuera del flujo de diálogos). No
 * consulta el servidor AEM en absoluto, por diseño: se basa en git, no en el estado remoto.
 * Devuelve false (sin aviso) si el archivo no está en git todavía o no se puede comparar.
 */
export function detectLocalDeletions(fsPath: string, currentTree: DocViewNode): boolean {
  const previousXml = tryGitShowHead(fsPath);
  if (!previousXml) return false;
  let previousTree: DocViewNode;
  try {
    previousTree = parseDocView(previousXml);
  } catch {
    return false;
  }
  return treeHasRemovals(previousTree, currentTree);
}
