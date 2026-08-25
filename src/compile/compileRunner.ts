import * as vscode from 'vscode';
import * as path from 'path';
import { AemProjectInfo } from '../core/projectDetector';
import { ExtensionConfig } from '../config';

export interface DeployTarget {
  target: 'author' | 'publish' | 'none';
  host: string;
  port: string;
}

function resolveMavenExecutable(project: AemProjectInfo, config: ExtensionConfig): string {
  if (config.mavenExecutable === 'mvn') return 'mvn';
  if (config.mavenExecutable === 'mvnw') return process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  if (project.hasMavenWrapper) return process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw';
  return 'mvn';
}

const AUTHOR_DEFAULT_PORT = '4502';
const PUBLISH_DEFAULT_PORT = '4503';
const DEFAULT_HOST = 'localhost';

/**
 * Resuelve el/los perfil(es) Maven finales y los argumentos -D de host/puerto a partir del
 * destino Author/Publish elegido. Sigue la convención vista en los proyectos de referencia:
 * un perfil hermano '<perfil>Publish' (ej. autoInstallPackage -> autoInstallPackagePublish) usa
 * aem.publish.host/aem.publish.port; si no existe ese hermano para NINGUNO de los perfiles
 * elegidos, se sobrescribe aem.host/aem.port directamente como mejor esfuerzo.
 */
export function resolveDeployArgs(
  project: AemProjectInfo,
  profiles: string[],
  deploy: DeployTarget
): { profiles: string[]; extraArgs: string } {
  if (deploy.target === 'none' || profiles.length === 0) return { profiles, extraArgs: '' };

  const isAuthorDefault = deploy.host === DEFAULT_HOST && deploy.port === AUTHOR_DEFAULT_PORT;
  const isPublishDefault = deploy.host === DEFAULT_HOST && deploy.port === PUBLISH_DEFAULT_PORT;

  if (deploy.target === 'author') {
    return { profiles, extraArgs: isAuthorDefault ? '' : `-Daem.host=${deploy.host} -Daem.port=${deploy.port}` };
  }

  // publish
  const knownIds = new Set(project.profiles.map((p) => p.id));
  const resolved = profiles.map((p) => {
    const sibling = [...knownIds].find((id) => id.toLowerCase() === `${p}publish`.toLowerCase());
    return sibling ?? p;
  });
  const anySwapped = resolved.some((p, i) => p !== profiles[i]);
  const extraArgs = isPublishDefault
    ? anySwapped
      ? ''
      : `-Daem.publish.host=${deploy.host} -Daem.publish.port=${deploy.port}`
    : anySwapped
    ? `-Daem.publish.host=${deploy.host} -Daem.publish.port=${deploy.port}`
    : `-Daem.host=${deploy.host} -Daem.port=${deploy.port}`;
  return { profiles: resolved, extraArgs };
}

export function buildMavenCommand(
  project: AemProjectInfo,
  config: ExtensionConfig,
  opts: {
    goal?: string; // por defecto 'clean install'
    profiles: string[];
    skipTests: boolean;
    extraArgs: string;
    excludeFrontend?: boolean;
    modules?: string[];
  }
): { cwd: string; command: string } {
  const mvnExe = resolveMavenExecutable(project, config);
  const parts: string[] = [mvnExe, ...(opts.goal ?? 'clean install').split(' ')];

  if (opts.modules && opts.modules.length > 0) {
    parts.push('-pl', opts.modules.join(','), '-am');
  } else if (opts.excludeFrontend && project.hasFrontendModule) {
    parts.push('-pl', '!ui.frontend', '-am');
  }

  if (opts.profiles.length > 0) {
    parts.push(`-P${opts.profiles.join(',')}`);
  }
  if (opts.skipTests) {
    parts.push('-DskipTests');
  }
  if (opts.extraArgs.trim()) {
    parts.push(opts.extraArgs.trim());
  }

  return { cwd: project.rootPath, command: parts.join(' ') };
}

export function buildFrontendCommand(project: AemProjectInfo, command: string): { cwd: string; command: string } {
  return { cwd: path.join(project.rootPath, 'ui.frontend'), command };
}

const TERMINAL_NAME = 'AEM Toolkit';

// Referencia a la Task actualmente en ejecución (si hay alguna) para poder detenerla desde el
// botón ▶/⏹ del panel — VS Code no expone un "listado global de tasks" cómodo, así que la
// llevamos nosotros. Solo corre una a la vez (el panel deshabilita los demás botones mientras
// hay una en curso), por eso alcanza con una única referencia en vez de una pila.
let currentExecution: vscode.TaskExecution | undefined;

/** true si hay una Task de AEM Toolkit corriendo en este momento. */
export function isTaskRunning(): boolean {
  return !!currentExecution;
}

/** Detiene la Task en curso (si hay alguna) — la llama el botón ⏹ del panel. */
export function stopCurrentTask(): void {
  currentExecution?.terminate();
}

/**
 * Corre un comando como una VS Code Task (no un simple 'sendText' a una terminal) para poder
 * esperar a que termine (necesario para encadenar pasos, ej. correr tests después del build, o
 * leer el reporte de coverage solo si el comando terminó bien). El usuario sigue viendo el
 * output real en un panel de terminal, igual que antes.
 */
export function runAsTask(cwd: string, command: string, label: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const execution = new vscode.ShellExecution(command, { cwd });
    const task = new vscode.Task(
      { type: 'aemToolkit', task: label },
      vscode.TaskScope.Workspace,
      label,
      TERMINAL_NAME,
      execution
    );
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared,
      clear: false,
      echo: true
    };
    const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
      if (e.execution.task === task) {
        disposable.dispose();
        currentExecution = undefined;
        resolve(e.exitCode);
      }
    });
    vscode.tasks.executeTask(task).then(
      (taskExecution) => {
        currentExecution = taskExecution;
      },
      () => {
        disposable.dispose();
        currentExecution = undefined;
        resolve(undefined);
      }
    );
  });
}

export function describePlan(cwd: string, command: string): string {
  return `${command}  (en ${cwd})`;
}
