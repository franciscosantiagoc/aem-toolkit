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

/**
 * Si el usuario configuró `aemToolkit.javaHome`, arma las variables de entorno (JAVA_HOME +
 * PATH con su carpeta bin al frente) para que la Task de Maven use ese JDK en vez del que
 * resuelva por defecto la shell del sistema (bash/Git Bash, cmd, etc.). Esto existe porque el
 * JDK que usa esa shell por defecto puede NO ser el mismo que usa un IDE como IntelliJ (que deja
 * elegir el JDK del proyecto de forma independiente al PATH del sistema) — si son distintos,
 * plugins de Maven compilados para una versión de Java más nueva que la que trae esa shell por
 * defecto fallan con "UnsupportedClassVersionError" incluso con el mismo comando `mvn` exacto.
 * Sin esta configuración (vacía por defecto) el comportamiento no cambia: se usa lo que la shell
 * resuelva, igual que antes.
 */
export function buildJavaEnv(javaHome: string): Record<string, string> | undefined {
  const trimmed = javaHome.trim();
  if (!trimmed) return undefined;
  const binDir = path.join(trimmed, 'bin');
  const pathSep = process.platform === 'win32' ? ';' : ':';
  return {
    ...process.env,
    JAVA_HOME: trimmed,
    PATH: `${binDir}${pathSep}${process.env.PATH ?? ''}`
  } as Record<string, string>;
}

const TERMINAL_NAME = 'AEM Toolkit';

// Referencia a la Task actualmente en ejecución (si hay alguna) para poder detenerla desde el
// botón ▶/⏹ del panel — VS Code no expone un "listado global de tasks" cómodo, así que la
// llevamos nosotros. Solo corre una a la vez (el panel deshabilita los demás botones mientras
// hay una en curso), por eso alcanza con una única referencia en vez de una pila.
let currentExecution: vscode.TaskExecution | undefined;
let cancelRequested = false;
let lastRunWasCancelled = false;

/** true si hay una Task de AEM Toolkit corriendo en este momento. */
export function isTaskRunning(): boolean {
  return !!currentExecution;
}

/** Detiene la Task en curso (si hay alguna) — la llama el botón ⏹ del panel. */
export function stopCurrentTask(): void {
  if (currentExecution) {
    cancelRequested = true;
    currentExecution.terminate();
  }
}

/**
 * true si la última llamada a runAsTask() que terminó fue detenida manualmente con
 * stopCurrentTask() (en vez de terminar sola con un código de salida real, que en ese caso suele
 * venir 'undefined'). Se consume (se resetea a false) al leerla, así que hay que llamarla
 * justo después de cada runAsTask() y antes de lanzar el siguiente paso encadenado.
 */
export function wasLastRunCancelled(): boolean {
  const value = lastRunWasCancelled;
  lastRunWasCancelled = false;
  return value;
}

/**
 * Corre un comando como una VS Code Task (no un simple 'sendText' a una terminal) para poder
 * esperar a que termine (necesario para encadenar pasos, ej. correr tests después del build, o
 * leer el reporte de coverage solo si el comando terminó bien). El usuario sigue viendo el
 * output real en un panel de terminal, igual que antes.
 */
export function runAsTask(cwd: string, command: string, label: string, env?: Record<string, string>): Promise<number | undefined> {
  return new Promise((resolve) => {
    const execution = new vscode.ShellExecution(command, env ? { cwd, env } : { cwd });
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
        lastRunWasCancelled = cancelRequested;
        cancelRequested = false;
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
        lastRunWasCancelled = cancelRequested;
        cancelRequested = false;
        resolve(undefined);
      }
    );
  });
}

export function describePlan(cwd: string, command: string): string {
  return `${command}  (en ${cwd})`;
}
