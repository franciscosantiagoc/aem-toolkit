import * as vscode from 'vscode';
import { detectAemProjectsInWorkspace } from './core/projectDetector';
import { AemToolkitTreeProvider } from './treeView';
import { runCompileWizard, repeatLastCompile, runCompileFavorite } from './compile/compileWizard';

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
    return `• ${name} — módulos: [${p.modules.join(', ')}] · ui.frontend: ${front} · mvnw: ${wrapper} · perfiles: [${p.profiles
      .map((x) => x.id)
      .join(', ')}]`;
  });
  vscode.window.showInformationMessage(`Proyectos AEM detectados:\n${lines.join('\n')}`, { modal: true });
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aemToolkit.compile', () => runCompileWizard(context)),
    vscode.commands.registerCommand('aemToolkit.compileRepeatLast', () => repeatLastCompile(context)),
    vscode.commands.registerCommand('aemToolkit.compileFavorite', () => runCompileFavorite(context)),
    vscode.commands.registerCommand('aemToolkit.showProjectInfo', () => showProjectInfo()),
    vscode.commands.registerCommand('aemToolkit.refreshProjectInfo', () => {
      treeProvider.refresh();
      vscode.window.showInformationMessage('AEM Toolkit: detección de proyecto actualizada.');
    })
  );

  const treeProvider = new AemToolkitTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('aemToolkitView', treeProvider));
}

export function deactivate(): void {
  // no-op
}
