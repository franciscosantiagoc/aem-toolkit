import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { toJcrPath } from './jcrPath';
import { uploadFile, importContentXml, SyncTarget, SyncResult } from './slingClient';

export interface SyncFileOutcome {
  localPath: string;
  jcrPath: string;
  ok: boolean;
  message: string;
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

async function syncOneFile(target: SyncTarget, fsPath: string): Promise<SyncFileOutcome> {
  const jcrPath = toJcrPath(fsPath);
  if (!jcrPath) {
    return { localPath: fsPath, jcrPath: '', ok: false, message: 'No está dentro de un "jcr_root" — se omitió.' };
  }

  const fileName = path.basename(fsPath);
  const content = fs.readFileSync(fsPath);

  let result: SyncResult;
  if (fileName === '.content.xml') {
    // El .content.xml describe las propiedades del propio nodo padre (su carpeta contenedora),
    // no de un hijo nuevo — se importa directamente sobre esa ruta.
    const nodePath = path.posix.dirname(jcrPath);
    result = await importContentXml(target, nodePath, content);
  } else {
    const parentPath = path.posix.dirname(jcrPath);
    result = await uploadFile(target, parentPath, fileName, content);
  }
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
        output.appendLine(outcome.ok ? `✔ ${outcome.jcrPath || fsPath}` : `✘ ${outcome.jcrPath || fsPath} — ${outcome.message}`);
      }
    }
  );

  const okCount = outcomes.filter((o) => o.ok).length;
  const failCount = outcomes.length - okCount;

  if (cancelled) {
    vscode.window.showWarningMessage(`⏹ Sincronización detenida — ${okCount} archivo(s) ya se habían subido a ${targetLabel}.`);
    if (failCount > 0) output.show(true);
    return;
  }

  if (outcomes.length === 1) {
    const only = outcomes[0];
    if (only.ok) {
      vscode.window.showInformationMessage(`✔ Sincronizado con ${targetLabel}: ${only.jcrPath}`);
    } else {
      vscode.window.showErrorMessage(`✘ No se pudo sincronizar ${path.basename(only.localPath)} — ${only.message}`);
      output.show(true);
    }
    return;
  }

  if (failCount === 0) {
    vscode.window.showInformationMessage(`✔ ${okCount} archivo(s) sincronizado(s) con ${targetLabel}.`);
  } else {
    vscode.window.showWarningMessage(
      `${okCount} archivo(s) sincronizado(s), ${failCount} con error al sincronizar con ${targetLabel}. Revisa el canal de salida "AEM Toolkit — Sync".`
    );
    output.show(true);
  }
}
