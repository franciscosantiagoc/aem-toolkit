import * as vscode from 'vscode';
import { detectAemProjectsInWorkspace } from './core/projectDetector';
import { AemToolkitTreeProvider } from './treeView';
import { CompileViewProvider, repeatLastCompile } from './compile/compilePanel';
import { syncUris } from './sync/syncRunner';
import { getSyncTarget, configureSyncCredentials } from './sync/credentials';
import { openDialogEditor } from './dialog/dialogPanel';
import { showDialogQuickAddMenu } from './dialog/dialogQuickAdd';
import { formatXmlFiles } from './format/formatXmlCommand';
import { createComponentWizard } from './component/componentCreate';

function showProjectInfo(): void {
  const projects = detectAemProjectsInWorkspace();
  if (projects.length === 0) {
    vscode.window.showWarningMessage(
      'AEM Toolkit: no se detectó ningún proyecto AEM (pom.xml con <modules>) en las carpetas abiertas.'
    );
    return;
  }
  const lines = projects.map((p) => {
    const name = p.namespace ?? p.rootPath.split(/[\\/]/).pop() ?? p.rootPath;
    const front = p.hasFrontendModule ? 'sí' : 'no';
    const wrapper = p.hasMavenWrapper ? 'sí' : 'no';
    const jacoco = p.hasJacoco ? 'sí' : 'no';
    return `• ${name} — módulos: [${p.modules.join(', ')}] · ui.frontend: ${front} · mvnw: ${wrapper} · jacoco: ${jacoco} · perfiles: [${p.profiles
      .map((x) => (x.sourceModule ? `${x.id} (${x.sourceModule})` : x.id))
      .join(', ')}]`;
  });
  vscode.window.showInformationMessage(`Proyectos AEM detectados:\n${lines.join('\n')}`, { modal: true });
}

/** Normaliza los argumentos que VS Code pasa a un comando de menú contextual: un solo Uri, o un
 * Uri + el array completo de la selección múltiple (explorer/context / editor/context). */
function resolveSelectedUris(uri?: vscode.Uri, uris?: vscode.Uri[]): vscode.Uri[] {
  if (uris && uris.length > 0) return uris;
  if (uri) return [uri];
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? [active] : [];
}

async function runSync(context: vscode.ExtensionContext, which: 'author' | 'publish', uri?: vscode.Uri, uris?: vscode.Uri[]): Promise<void> {
  const targets = resolveSelectedUris(uri, uris);
  if (targets.length === 0) {
    vscode.window.showWarningMessage('Selecciona un archivo o carpeta dentro de "jcr_root" para sincronizar.');
    return;
  }
  const syncTarget = await getSyncTarget(context, which, targets[0]);
  await syncUris(targets, syncTarget, which === 'author' ? 'Author' : 'Publish');
}

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new AemToolkitTreeProvider();
  const compileViewProvider = new CompileViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CompileViewProvider.viewType, compileViewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('aemToolkit.compile', () => compileViewProvider.show()),
    vscode.commands.registerCommand('aemToolkit.compileRepeatLast', () => repeatLastCompile(context)),
    vscode.commands.registerCommand('aemToolkit.showProjectInfo', () => showProjectInfo()),
    vscode.commands.registerCommand('aemToolkit.refreshProjectInfo', () => {
      treeProvider.refresh();
      vscode.window.showInformationMessage('AEM Toolkit: detección de proyecto actualizada.');
    }),
    vscode.commands.registerCommand('aemToolkit.syncToAuthor', (uri?: vscode.Uri, uris?: vscode.Uri[]) => runSync(context, 'author', uri, uris)),
    vscode.commands.registerCommand('aemToolkit.syncToPublish', (uri?: vscode.Uri, uris?: vscode.Uri[]) => runSync(context, 'publish', uri, uris)),
    vscode.commands.registerCommand('aemToolkit.configureSyncCredentials', () => configureSyncCredentials(context)),
    vscode.commands.registerCommand('aemToolkit.editDialog', (uri?: vscode.Uri) => openDialogEditor(context, uri)),
    vscode.commands.registerCommand('aemToolkit.dialogQuickAdd', (uri?: vscode.Uri) => showDialogQuickAddMenu(context, uri)),
    vscode.commands.registerCommand('aemToolkit.formatXml', (uri?: vscode.Uri, uris?: vscode.Uri[]) => formatXmlFiles(resolveSelectedUris(uri, uris))),
    vscode.commands.registerCommand('aemToolkit.createComponent', (uri?: vscode.Uri) => createComponentWizard(context, uri)),
    vscode.window.registerTreeDataProvider('aemToolkitView', treeProvider)
  );
}

export function deactivate(): void {
  // no-op
}
