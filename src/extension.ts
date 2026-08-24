import * as vscode from 'vscode';
import { detectAemProjectsInWorkspace } from './core/projectDetector';
import { AemToolkitTreeProvider } from './treeView';
import { CompileViewProvider, repeatLastCompile } from './compile/compilePanel';

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
    vscode.window.registerTreeDataProvider('aemToolkitView', treeProvider)
  );
}

export function deactivate(): void {
  // no-op
}
