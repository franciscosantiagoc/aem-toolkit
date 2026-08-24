import * as vscode from 'vscode';
import * as path from 'path';
import { AemProjectInfo } from '../core/projectDetector';
import { ExtensionConfig } from '../config';

export type BuildScope = 'all' | 'front' | 'back' | 'modules';

export interface CompileSelection {
  scope: BuildScope;
  modules?: string[]; // solo cuando scope === 'modules'
  mavenProfile: string; // '' = ninguno
  skipTests: boolean;
  extraArgs: string;
}

const TERMINAL_NAME = 'AEM Toolkit: Compilar';

function resolveMavenExecutable(project: AemProjectInfo, config: ExtensionConfig): string {
  if (config.mavenExecutable === 'mvn') return 'mvn';
  if (config.mavenExecutable === 'mvnw') return process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  // auto
  if (project.hasMavenWrapper) return process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  return 'mvn';
}

/**
 * Arma el comando (o comandos) de shell para la selección hecha en el asistente. Devuelve tanto
 * la carpeta de trabajo como el comando, para que el llamador decida cómo ejecutarlo (terminal
 * integrada, guardado como perfil favorito, mostrado en un preview, etc.).
 */
export function buildCompileCommand(
  project: AemProjectInfo,
  selection: CompileSelection,
  config: ExtensionConfig
): { cwd: string; command: string } {
  if (selection.scope === 'front') {
    return { cwd: path.join(project.rootPath, 'ui.frontend'), command: config.frontBuildCommand };
  }

  const mvnExe = resolveMavenExecutable(project, config);
  const parts: string[] = [mvnExe, 'clean', 'install'];

  if (selection.scope === 'back' && project.hasFrontendModule) {
    parts.push('-pl', `!ui.frontend`, '-am');
  } else if (selection.scope === 'modules' && selection.modules && selection.modules.length > 0) {
    parts.push('-pl', selection.modules.join(','), '-am');
  }
  // scope === 'all' compila el reactor completo, sin -pl.

  if (selection.mavenProfile) {
    parts.push(`-P${selection.mavenProfile}`);
  }
  if (selection.skipTests) {
    parts.push('-DskipTests');
  }
  if (selection.extraArgs.trim()) {
    parts.push(selection.extraArgs.trim());
  }

  return { cwd: project.rootPath, command: parts.join(' ') };
}

/** Reutiliza una terminal existente con el mismo nombre en vez de acumular una nueva por cada compilación. */
function getOrCreateTerminal(): vscode.Terminal {
  const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
  return existing ?? vscode.window.createTerminal(TERMINAL_NAME);
}

export function runInTerminal(cwd: string, command: string): void {
  const terminal = getOrCreateTerminal();
  terminal.show(true);
  terminal.sendText(`cd "${cwd}"`);
  terminal.sendText(command);
}

export function describeSelection(selection: CompileSelection): string {
  const scopeLabel =
    selection.scope === 'all'
      ? 'Todo (front+back)'
      : selection.scope === 'front'
      ? 'Solo Front'
      : selection.scope === 'back'
      ? 'Solo Back'
      : `Módulos: ${(selection.modules ?? []).join(', ')}`;
  const profileLabel = selection.mavenProfile ? `perfil ${selection.mavenProfile}` : 'sin perfil de instalación';
  const testsLabel = selection.skipTests ? 'sin tests' : 'con tests';
  return `${scopeLabel} · ${profileLabel} · ${testsLabel}${selection.extraArgs ? ` · ${selection.extraArgs}` : ''}`;
}
