import * as vscode from 'vscode';
import { getConfig } from '../config';
import { SyncTarget } from './slingClient';

const SECRET_KEY_PREFIX = 'aemToolkit.sync.password.';

/** Resuelve host/puerto/usuario/contraseña para un destino. La contraseña vive en VS Code Secret
 * Storage (no en settings.json); si nunca se configuró, cae al estándar de AEM local: "admin". */
export async function getSyncTarget(
  context: vscode.ExtensionContext,
  which: 'author' | 'publish',
  scope?: vscode.Uri
): Promise<SyncTarget> {
  const config = getConfig(scope);
  const host = which === 'author' ? config.syncAuthorHost : config.syncPublishHost;
  const port = which === 'author' ? config.syncAuthorPort : config.syncPublishPort;
  const password = (await context.secrets.get(SECRET_KEY_PREFIX + which)) ?? 'admin';
  return { host, port, username: config.syncUsername, password };
}

/** "AEM: Configurar credenciales de sincronización..." — usuario compartido (Author y Publish
 * suelen usar el mismo) + una contraseña por destino, guardada en Secret Storage. */
export async function configureSyncCredentials(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();

  const username = await vscode.window.showInputBox({
    title: 'Usuario para sincronizar (Author y Publish)',
    value: config.syncUsername,
    prompt: 'Usuario para autenticar contra la API de Sling — por defecto "admin".'
  });
  if (username === undefined) return;
  if (username.trim() && username !== config.syncUsername) {
    await vscode.workspace.getConfiguration('aemToolkit').update('sync.username', username.trim(), vscode.ConfigurationTarget.Workspace);
  }

  const authorPassword = await vscode.window.showInputBox({
    title: 'Contraseña de Author',
    password: true,
    placeHolder: 'Dejar vacío y Enter para no cambiarla (si nunca se configuró, se usa "admin")',
    prompt: 'Se guarda de forma segura en VS Code Secret Storage, no en settings.json.'
  });
  if (authorPassword === undefined) return;
  if (authorPassword.trim()) await context.secrets.store(SECRET_KEY_PREFIX + 'author', authorPassword);

  const publishPassword = await vscode.window.showInputBox({
    title: 'Contraseña de Publish',
    password: true,
    placeHolder: 'Dejar vacío y Enter para no cambiarla (si nunca se configuró, se usa "admin")',
    prompt: 'Se guarda de forma segura en VS Code Secret Storage, no en settings.json.'
  });
  if (publishPassword === undefined) return;
  if (publishPassword.trim()) await context.secrets.store(SECRET_KEY_PREFIX + 'publish', publishPassword);

  vscode.window.showInformationMessage('Credenciales de sincronización actualizadas.');
}
