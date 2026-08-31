import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { toJcrPath } from './jcrPath';
import { uploadFile, deleteNode, SyncTarget } from './slingClient';
import { parseDocView, DocViewNode } from './docview';
import { isEditDialogContentXml, pushNodeTree, detectLocalDeletions } from './contentXmlSync';

export interface SyncFileOutcome {
  localPath: string;
  jcrPath: string;
  ok: boolean;
  message: string;
  /** true si se sincronizó con éxito pero se detectaron eliminaciones locales que esta
   * sincronización NO aplicó en el servidor (solo aplica a .content.xml que no son de diálogo). */
  hasUnsyncedDeletions?: boolean;
}

let outputChannel: vscode.OutputChannel | undefined;
function getSyncOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) outputChannel = vscode.window.createOutputChannel('AEM Toolkit — Sync');
  return outputChannel;
}

/** Junta, de forma recursiva, todos los archivos "reales" (no directorios) bajo una ruta. */
function collectFiles(fsPath: string): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(fsPath);
  } catch {
    return [];
  }
  if (stat.isFile()) return [fsPath];
  if (!stat.isDirectory()) return [];

  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  walk(fsPath);
  return out;
}

/**
 * Sube un `.content.xml`: se parsea localmente (nunca se manda el XML crudo — ver la nota en
 * `slingClient.ts` sobre por qué `:operation=import` con `:contentType=xml` no sirve para esto) y
 * se reconstruye como una serie de POSTs normales de Sling, nodo por nodo.
 *
 * Para el diálogo de edición de un componente/página (`_cq_dialog`) se hace reemplazo total: se
 * borra el nodo completo en el servidor y se recrea desde cero, así que tanto los cambios como las
 * eliminaciones de campos quedan reflejados. Para cualquier otro `.content.xml` solo se
 * crean/actualizan nodos y propiedades — nunca se borra nada — y si se detecta que el archivo
 * local perdió algo respecto a la última versión commiteada en git, se avisa para que el usuario
 * corra una compilación completa (que sí aplica esas eliminaciones vía instalación de paquete).
 */
async function syncContentXml(target: SyncTarget, fsPath: string, jcrPath: string): Promise<SyncFileOutcome> {
  const nodePath = path.posix.dirname(jcrPath);
  const xml = fs.readFileSync(fsPath, 'utf8');

  let tree: DocViewNode;
  try {
    tree = parseDocView(xml);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { localPath: fsPath, jcrPath, ok: false, message: `No se pudo interpretar el XML: ${detail}` };
  }

  if (isEditDialogContentXml(fsPath)) {
    const del = await deleteNode(target, nodePath);
    if (!del.ok) {
      return { localPath: fsPath, jcrPath, ok: false, message: `No se pudo limpiar el diálogo antes de recrearlo — ${del.message}` };
    }
    const results = await pushNodeTree(target, nodePath, tree);
    const failed = results.find((r) => !r.ok);
    return failed
      ? { localPath: fsPath, jcrPath, ok: false, message: failed.message }
      : { localPath: fsPath, jcrPath, ok: true, message: 'Diálogo reemplazado por completo (cambios y eliminaciones aplicados).' };
  }

  const results = await pushNodeTree(target, nodePath, tree);
  const failed = results.find((r) => !r.ok);
  if (failed) {
    return { localPath: fsPath, jcrPath, ok: false, message: failed.message };
  }
  const hasUnsyncedDeletions = detectLocalDeletions(fsPath, tree);
  return {
    localPath: fsPath,
    jcrPath,
    ok: true,
    message: hasUnsyncedDeletions
      ? 'Sincronizado. Se detectaron elementos eliminados en este XML que esta sincronización no borra en el servidor — corre una compilación completa para aplicarlos.'
      : 'OK',
    hasUnsyncedDeletions
  };
}

async function syncOneFile(target: SyncTarget, fsPath: string): Promise<SyncFileOutcome> {
  const jcrPath = toJcrPath(fsPath);
  if (!jcrPath) {
    return { localPath: fsPath, jcrPath: '', ok: false, message: 'No está dentro de un "jcr_root" — se omitió.' };
  }

  const fileName = path.basename(fsPath);
  if (fileName === '.content.xml') {
    return syncContentXml(target, fsPath, jcrPath);
  }

  const content = fs.readFileSync(fsPath);
  const parentPath = path.posix.dirname(jcrPath);
  const result = await uploadFile(target, parentPath, fileName, content);
  return { localPath: fsPath, jcrPath, ok: result.ok, message: result.message };
}

/**
 * Sincroniza uno o varios URIs (archivos y/o carpetas, recursivo) contra un destino AEM (Author o
 * Publish) usando la API POST de Sling directamente — sin Maven ni webpack de por medio. Requiere
 * que el nodo padre ya exista en el servidor (pensado para actualizar algo ya instalado antes con
 * una compilación completa, no para crear estructura nueva desde cero).
 */
export async function syncUris(uris: vscode.Uri[], target: SyncTarget, targetLabel: string): Promise<void> {
  const allFiles: string[] = [];
  for (const uri of uris) {
    allFiles.push(...collectFiles(uri.fsPath));
  }
  if (allFiles.length === 0) {
    vscode.window.showWarningMessage('No se encontraron archivos para sincronizar en la selección.');
    return;
  }

  const output = getSyncOutputChannel();
  output.appendLine(`\n— Sincronizando ${allFiles.length} archivo(s) con ${targetLabel} (${target.host}:${target.port}) —`);
  const outcomes: SyncFileOutcome[] = [];
  let cancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `AEM: Sincronizando con ${targetLabel}`,
      cancellable: true
    },
    async (progress, token) => {
      for (let i = 0; i < allFiles.length; i++) {
        if (token.isCancellationRequested) {
          cancelled = true;
          output.appendLine(`⏹ Sincronización detenida por el usuario (${i}/${allFiles.length} procesados).`);
          break;
        }
        const fsPath = allFiles[i];
        progress.report({
          message: `${path.basename(fsPath)} (${i + 1}/${allFiles.length})`,
          increment: 100 / allFiles.length
        });
        const outcome = await syncOneFile(target, fsPath);
        outcomes.push(outcome);
        const detail = outcome.ok && outcome.message !== 'OK' ? ` — ${outcome.message}` : outcome.ok ? '' : ` — ${outcome.message}`;
        output.appendLine(`${outcome.ok ? '✔' : '✘'} ${outcome.jcrPath || fsPath}${detail}`);
      }
    }
  );

  const okCount = outcomes.filter((o) => o.ok).length;
  const failCount = outcomes.length - okCount;
  const deletionWarnings = outcomes.filter((o) => o.hasUnsyncedDeletions);

  if (cancelled) {
    vscode.window.showWarningMessage(`⏹ Sincronización detenida — ${okCount} archivo(s) ya se habían subido a ${targetLabel}.`);
    if (failCount > 0) output.show(true);
    return;
  }

  if (outcomes.length === 1) {
    const only = outcomes[0];
    if (only.ok) {
      const detail = only.message !== 'OK' ? ` — ${only.message}` : '';
      vscode.window.showInformationMessage(`✔ Sincronizado con ${targetLabel}: ${only.jcrPath}${detail}`);
      if (only.hasUnsyncedDeletions) output.show(true);
    } else {
      vscode.window.showErrorMessage(`✘ No se pudo sincronizar ${path.basename(only.localPath)} — ${only.message}`);
      output.show(true);
    }
    return;
  }

  if (failCount === 0) {
    const deletionNote = deletionWarnings.length > 0 ? ` (${deletionWarnings.length} con eliminaciones sin aplicar — revisa el canal de salida)` : '';
    vscode.window.showInformationMessage(`✔ ${okCount} archivo(s) sincronizado(s) con ${targetLabel}.${deletionNote}`);
    if (deletionWarnings.length > 0) output.show(true);
  } else {
    vscode.window.showWarningMessage(
      `${okCount} archivo(s) sincronizado(s), ${failCount} con error al sincronizar con ${targetLabel}. Revisa el canal de salida "AEM Toolkit — Sync".`
    );
    output.show(true);
  }
}
