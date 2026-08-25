import * as vscode from 'vscode';
import * as path from 'path';
import { AemProjectInfo, detectAemProjectsInWorkspace } from '../core/projectDetector';
import { getConfig, saveCompilePreset, deleteCompilePreset, CompilePreset, BaseCompileMode } from '../config';
import { buildMavenCommand, buildFrontendCommand, runAsTask, resolveDeployArgs, DeployTarget } from './compileRunner';
import { hasUncommittedChangesIn } from '../core/gitInfo';
import { addJacocoProfile } from '../coverage/jacocoSetup';
import { collectBackendCoverage } from '../coverage/jacocoParser';
import { collectFrontendCoverage } from '../coverage/istanbulParser';
import { showCoveragePanel } from '../coverage/coveragePanel';

const LAST_RUN_KEY = 'aemToolkit.lastCompileRun';

export interface ResolvedRun {
  baseMode: BaseCompileMode;
  profiles: string[];
  skipFrontendTests: boolean;
  skipBackendTests: boolean;
  deploy: DeployTarget;
  extraArgs: string;
}

interface LastRun {
  rootPath: string;
  run: ResolvedRun;
}

export async function pickProject(): Promise<AemProjectInfo | undefined> {
  const projects = detectAemProjectsInWorkspace();
  if (projects.length === 0) {
    vscode.window.showErrorMessage(
      'AEM Toolkit no encontró ningún proyecto AEM (pom.xml con <modules>) en las carpetas abiertas. Abre la carpeta del proyecto (o la carpeta que lo contiene) e inténtalo de nuevo.'
    );
    return undefined;
  }
  if (projects.length === 1) return projects[0];

  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({
      label: p.namespace ?? p.rootPath.split(/[\\/]/).pop() ?? p.rootPath,
      description: p.rootPath,
      detail: `Módulos: ${p.modules.join(', ')}${p.hasFrontendModule ? '' : ' (sin ui.frontend)'}`,
      project: p
    })),
    { placeHolder: 'Se detectaron varios proyectos AEM — escribe para filtrar y elige uno', matchOnDescription: true, matchOnDetail: true }
  );
  return picked?.project;
}

function findProjectByRoot(rootPath: string): AemProjectInfo | undefined {
  return detectAemProjectsInWorkspace().find((p) => p.rootPath === rootPath);
}

export async function executeResolvedRun(context: vscode.ExtensionContext, project: AemProjectInfo, run: ResolvedRun): Promise<void> {
  const config = getConfig(vscode.Uri.file(project.rootPath));
  await context.workspaceState.update(LAST_RUN_KEY, { rootPath: project.rootPath, run } as LastRun);

  if (run.baseMode === 'full') {
    const { profiles, extraArgs: deployArgs } = resolveDeployArgs(project, run.profiles, run.deploy);
    const combinedExtra = [deployArgs, run.extraArgs].filter(Boolean).join(' ');
    const { cwd, command } = buildMavenCommand(project, config, { profiles, skipTests: run.skipBackendTests, extraArgs: combinedExtra });
    const exit = await runAsTask(cwd, command, 'AEM: Compilar (Completa)');
    if (exit !== 0) {
      vscode.window.showErrorMessage(`La compilación completa terminó con errores (código ${exit}). Revisa la terminal.`);
      return;
    }
    if (project.hasFrontendModule && project.frontendTestScript && !run.skipFrontendTests) {
      const frontCmd = buildFrontendCommand(project, `npm run ${project.frontendTestScript}`);
      const frontExit = await runAsTask(frontCmd.cwd, frontCmd.command, 'AEM: Tests de Front');
      if (frontExit !== 0) {
        vscode.window.showWarningMessage(`El build completo terminó bien, pero los tests de front fallaron (código ${frontExit}).`);
        return;
      }
    }
    vscode.window.showInformationMessage('✔ Compilación completa terminada correctamente.');
    return;
  }

  if (run.baseMode === 'front') {
    const { cwd, command } = buildFrontendCommand(project, config.frontBuildCommand);
    const exit = await runAsTask(cwd, command, 'AEM: Compilar (Solo Front)');
    if (exit !== 0) {
      vscode.window.showErrorMessage(`El build de front terminó con errores (código ${exit}).`);
      return;
    }
    if (project.frontendTestScript && !run.skipFrontendTests) {
      const testCmd = buildFrontendCommand(project, `npm run ${project.frontendTestScript}`);
      const testExit = await runAsTask(testCmd.cwd, testCmd.command, 'AEM: Tests de Front');
      if (testExit !== 0) {
        vscode.window.showWarningMessage(`El build de front terminó bien, pero los tests fallaron (código ${testExit}).`);
        return;
      }
    }
    vscode.window.showInformationMessage('✔ Build de front terminado correctamente.');
    return;
  }

  if (run.baseMode === 'back') {
    const { profiles, extraArgs: deployArgs } = resolveDeployArgs(project, run.profiles, run.deploy);
    const combinedExtra = [deployArgs, run.extraArgs].filter(Boolean).join(' ');
    const { cwd, command } = buildMavenCommand(project, config, {
      profiles,
      skipTests: run.skipBackendTests,
      extraArgs: combinedExtra,
      excludeFrontend: true
    });
    const exit = await runAsTask(cwd, command, 'AEM: Compilar (Solo Back)');
    if (exit === 0) {
      vscode.window.showInformationMessage('✔ Back compilado correctamente.');
    } else {
      vscode.window.showErrorMessage(`El back terminó con errores (código ${exit}).`);
    }
    return;
  }

  if (run.baseMode === 'coverage-front') {
    if (!project.frontendCoverageScript) {
      vscode.window.showWarningMessage(
        'Este proyecto no tiene un script de coverage en ui.frontend/package.json (ej. un script que corra con --coverage). Agrégalo primero y vuelve a intentar.'
      );
      return;
    }
    const { cwd, command } = buildFrontendCommand(project, `npm run ${project.frontendCoverageScript}`);
    const exit = await runAsTask(cwd, command, 'AEM: Coverage Front');
    if (exit !== 0) {
      vscode.window.showErrorMessage(`Los tests de front fallaron (código ${exit}) — no se generó el coverage.`);
      return;
    }
    const rows = collectFrontendCoverage(project.rootPath).map((f) => ({
      name: path.basename(f.filePath),
      group: path.dirname(f.filePath),
      pct: f.linesPct
    }));
    if (rows.length === 0) {
      vscode.window.showWarningMessage(
        'No se encontró ui.frontend/coverage/coverage-summary.json — revisa que el reporter "json-summary" esté configurado en tu herramienta de test.'
      );
      return;
    }
    showCoveragePanel(`Coverage Frontend — ${project.namespace ?? ''}`, rows);
    return;
  }

  // coverage-back
  const backendModules = project.modules.filter((m) => m !== 'ui.frontend');
  if (!project.hasJacoco) {
    const choice = await vscode.window.showWarningMessage(
      'Este proyecto no tiene jacoco-maven-plugin configurado todavía. AEM Toolkit puede agregar automáticamente un perfil "coverage" al pom raíz (heredado por todos los módulos, igual que autoInstallBundle/Package).',
      'Agregar automáticamente',
      'Cancelar'
    );
    if (choice !== 'Agregar automáticamente') return;
    const ok = addJacocoProfile(project.rootPath);
    if (!ok) {
      vscode.window.showErrorMessage('No se pudo agregar el perfil de coverage automáticamente. Agrégalo manualmente al pom.xml raíz.');
      return;
    }
    vscode.window.showInformationMessage('Perfil "coverage" agregado al pom raíz. Usa "AEM: Actualizar detección de proyecto" si no lo ves reflejado.');
  }

  const profiles = [...new Set([...run.profiles, 'coverage'])];
  const changed = hasUncommittedChangesIn(project.rootPath, backendModules);
  const goal = changed ? 'clean install' : 'test';
  const { cwd, command } = buildMavenCommand(project, config, {
    goal,
    profiles,
    skipTests: false,
    extraArgs: run.extraArgs,
    excludeFrontend: true
  });
  const label = changed ? 'AEM: Coverage Back (build completo)' : 'AEM: Coverage Back (solo tests)';
  const exit = await runAsTask(cwd, command, label);
  if (exit !== 0) {
    vscode.window.showErrorMessage(`Los tests de back fallaron (código ${exit}) — revisa el reporte antes de confiar en el coverage.`);
    return;
  }
  const rows = collectBackendCoverage(project.rootPath, project.modules).map((c) => ({
    name: c.className.split('.').pop() ?? c.className,
    group: c.packageName,
    pct: c.linePct
  }));
  if (rows.length === 0) {
    vscode.window.showWarningMessage('No se encontró ningún reporte target/site/jacoco/jacoco.xml — revisa que el perfil "coverage" se haya aplicado.');
    return;
  }
  showCoveragePanel(
    `Coverage Backend — ${project.namespace ?? ''}${changed ? ' (build completo, había cambios)' : ' (solo tests, sin cambios desde el último commit)'}`,
    rows
  );
}

export type QuickActionId = 'downloadDependencies' | 'generateSources' | 'compileSkipTests' | 'clean' | 'dependencyTree' | 'customGoal';

export interface QuickActionPayload {
  action: QuickActionId;
  profiles: string[];
  customGoal?: string;
}

/**
 * Barra de "Acciones rápidas" del panel, al estilo de los íconos de la ventana de Maven de
 * IntelliJ. Son acciones Maven puntuales (no pasan por el select de Modo) que usan los perfiles
 * que estén marcados en ese momento en la sección de checkboxes. Igual que "Solo Back", excluyen
 * ui.frontend del reactor (-pl !ui.frontend -am) para no disparar de rebote un build de webpack.
 */
export async function executeQuickAction(project: AemProjectInfo, payload: QuickActionPayload): Promise<void> {
  const config = getConfig(vscode.Uri.file(project.rootPath));
  const profiles = payload.profiles ?? [];

  const runGoal = async (goal: string, label: string, skipTests = false) => {
    const { cwd, command } = buildMavenCommand(project, config, { goal, profiles, skipTests, extraArgs: '', excludeFrontend: true });
    return runAsTask(cwd, command, label);
  };

  switch (payload.action) {
    case 'downloadDependencies': {
      const exit = await runGoal('dependency:resolve', 'AEM: Descargar dependencias');
      if (exit === 0) vscode.window.showInformationMessage('✔ Dependencias descargadas/resueltas.');
      else vscode.window.showErrorMessage(`No se pudieron resolver todas las dependencias (código ${exit}).`);
      return;
    }
    case 'generateSources': {
      const exit = await runGoal('generate-sources', 'AEM: Generar sources');
      if (exit === 0) vscode.window.showInformationMessage('✔ Sources generados y carpetas actualizadas.');
      else vscode.window.showErrorMessage(`Falló la generación de sources (código ${exit}).`);
      return;
    }
    case 'compileSkipTests': {
      const exit = await runGoal('clean install', 'AEM: Compilar (perfiles marcados, sin tests)', true);
      if (exit === 0) vscode.window.showInformationMessage('✔ Back compilado (tests salteados).');
      else vscode.window.showErrorMessage(`El back terminó con errores (código ${exit}).`);
      return;
    }
    case 'clean': {
      const exit = await runGoal('clean', 'AEM: Limpiar (clean)');
      if (exit === 0) vscode.window.showInformationMessage('✔ Proyecto limpiado.');
      else vscode.window.showErrorMessage(`El clean terminó con errores (código ${exit}).`);
      return;
    }
    case 'dependencyTree': {
      await runGoal('dependency:tree', 'AEM: Árbol de dependencias');
      return;
    }
    case 'customGoal': {
      const goal = (payload.customGoal ?? '').trim();
      if (!goal) return;
      const exit = await runGoal(goal, `AEM: mvn ${goal}`);
      if (exit === 0) vscode.window.showInformationMessage(`✔ "${goal}" terminó correctamente.`);
      else vscode.window.showWarningMessage(`"${goal}" terminó con código ${exit}.`);
      return;
    }
  }
}

export async function repeatLastCompile(context: vscode.ExtensionContext): Promise<void> {
  const last = context.workspaceState.get<LastRun>(LAST_RUN_KEY);
  if (!last) {
    vscode.window.showWarningMessage('Todavía no has compilado nada en esta sesión. Usa "AEM: Compilar proyecto..." primero.');
    return;
  }
  const project = findProjectByRoot(last.rootPath);
  if (!project) {
    vscode.window.showErrorMessage('No se pudo volver a detectar el proyecto de la última compilación.');
    return;
  }
  await executeResolvedRun(context, project, last.run);
}

/**
 * Panel de compilación anclado en la barra lateral (mismo contenedor de actividad que el árbol de
 * acciones), en vez de una pestaña de editor aparte. VS Code solo "resuelve" (crea) la webview la
 * primera vez que el usuario la hace visible; hasta entonces mostramos un estado vacío con un botón
 * para elegir proyecto, para no disparar el QuickPick de proyectos sin que el usuario lo haya pedido.
 */
export class CompileViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aemToolkitCompileView';

  private view?: vscode.WebviewView;
  private project?: AemProjectInfo;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg.type === 'pickProject') {
        await this.pickAndLoadProject();
        return;
      }
      if (!this.project) return;
      if (msg.type === 'run') {
        await executeResolvedRun(this.context, this.project, msg.payload as ResolvedRun);
        return;
      }
      if (msg.type === 'quickAction') {
        const payload = msg.payload as QuickActionPayload;
        if (payload.action === 'customGoal') {
          const goal = await vscode.window.showInputBox({
            title: 'Ejecutar goal de Maven',
            prompt: 'Se ejecuta con los perfiles actualmente marcados en el panel (excluye ui.frontend).',
            placeHolder: 'ej. dependency:tree, help:effective-pom, versions:display-dependency-updates',
            value: 'dependency:tree'
          });
          if (!goal || !goal.trim()) return;
          await executeQuickAction(this.project, { ...payload, customGoal: goal });
          return;
        }
        await executeQuickAction(this.project, payload);
        return;
      }
      if (msg.type === 'savePreset') {
        const preset = msg.payload as CompilePreset;
        if (!preset.name || !preset.name.trim()) {
          vscode.window.showWarningMessage('Ponle un nombre al modo antes de guardarlo.');
          return;
        }
        await saveCompilePreset(preset, vscode.Uri.file(this.project.rootPath));
        vscode.window.showInformationMessage(`Modo "${preset.name}" guardado.`);
        this.refreshHtml();
        return;
      }
      if (msg.type === 'deletePreset') {
        await deleteCompilePreset(msg.name as string, vscode.Uri.file(this.project.rootPath));
        this.refreshHtml();
        return;
      }
    });

    if (this.project) {
      this.refreshHtml();
    } else {
      webviewView.webview.html = renderEmptyHtml();
    }
  }

  /** Invocado por el comando "AEM: Compilar proyecto..." — trae la vista al frente y (re)elige el proyecto. */
  async show(): Promise<void> {
    await vscode.commands.executeCommand(`${CompileViewProvider.viewType}.focus`);
    await this.pickAndLoadProject();
  }

  private async pickAndLoadProject(): Promise<void> {
    const project = await pickProject();
    if (!project) {
      if (this.view) webviewShowEmpty(this.view);
      return;
    }
    this.project = project;
    this.refreshHtml();
  }

  private refreshHtml(): void {
    if (!this.view || !this.project) return;
    const config = getConfig(vscode.Uri.file(this.project.rootPath));
    this.view.webview.html = renderPanelHtml(this.project, config.compilePresets);
  }
}

function webviewShowEmpty(view: vscode.WebviewView): void {
  view.webview.html = renderEmptyHtml();
}

function renderEmptyHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  p { font-size: 12px; opacity: 0.8; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
    padding: 7px 14px; border-radius: 3px; cursor: pointer; font-size: 13px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <p>Elige el proyecto AEM con el que quieres trabajar para ver el panel de compilación.</p>
  <button id="pickBtn">📁 Elegir proyecto</button>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('pickBtn').addEventListener('click', () => vscode.postMessage({ type: 'pickProject' }));
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function renderPanelHtml(project: AemProjectInfo, presets: CompilePreset[]): string {
  const profilesData = JSON.stringify(project.profiles).replace(/</g, '\\u003c');
  const presetsData = JSON.stringify(presets).replace(/</g, '\\u003c');
  const projectData = JSON.stringify({
    hasFrontendModule: project.hasFrontendModule,
    frontendTestScript: project.frontendTestScript ?? null,
    frontendCoverageScript: project.frontendCoverageScript ?? null,
    hasJacoco: project.hasJacoco
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; max-width: 720px; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 14px 0; }
  section { margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--vscode-editorWidget-border, #3c3c3c); }
  section:last-of-type { border-bottom: none; }
  label.field-label { display:block; font-size: 12px; opacity: 0.85; margin-bottom: 6px; font-weight: 600; }
  select, input[type=text], input[type=number] {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); padding: 5px 8px; border-radius: 3px; font-size: 13px;
  }
  select#modo { width: 100%; padding: 7px 8px; font-size: 13px; }
  .hint { font-size: 11px; opacity: 0.65; margin-top: 4px; }
  .profiles-search { width: 100%; margin-bottom: 8px; box-sizing: border-box; }
  .profile-row { display:flex; align-items:center; gap:8px; padding: 3px 0; }
  .profile-row .src { opacity: 0.6; font-size: 11px; }
  .checkbox-row { display:flex; align-items:center; gap:8px; margin: 6px 0; }
  .deploy-row { display:flex; gap:14px; align-items:center; flex-wrap: wrap; margin-top: 8px; }
  .deploy-row label { display:flex; align-items:center; gap:5px; font-size: 13px; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
    padding: 7px 14px; border-radius: 3px; cursor: pointer; font-size: 13px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .run-row { display:flex; gap:10px; align-items:center; }
  .save-row { display:flex; gap:8px; align-items:center; }
  .preset-list { margin-top: 8px; display:flex; flex-direction:column; gap:4px; }
  .preset-item { display:flex; align-items:center; justify-content:space-between; font-size:12px; opacity:0.9; }
  .preset-item .del { cursor:pointer; opacity:0.6; }
  .preset-item .del:hover { opacity:1; color: var(--vscode-errorForeground); }
  .disabled-note { font-size: 11px; opacity: 0.6; font-style: italic; }
  .quick-toolbar { display:flex; flex-wrap: wrap; gap:6px; margin-bottom: 6px; }
  .quick-btn {
    background: transparent; color: var(--vscode-foreground);
    border: 1px solid var(--vscode-editorWidget-border, #3c3c3c); border-radius: 4px;
    padding: 4px 8px; font-size: 15px; line-height: 1.2; cursor: pointer;
  }
  .quick-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); }
</style>
</head>
<body>
  <h2>AEM Toolkit — Compilar (${escapeHtml(project.namespace ?? path.basename(project.rootPath))})</h2>

  <section>
    <label class="field-label">Acciones rápidas (estilo Maven de IntelliJ)</label>
    <div class="quick-toolbar">
      <button class="quick-btn" data-action="downloadDependencies" title="Descargar dependencias (mvn dependency:resolve)">📥</button>
      <button class="quick-btn" data-action="generateSources" title="Generar sources y actualizar carpetas (mvn generate-sources)">🗂️</button>
      <button class="quick-btn" data-action="compileSkipTests" title="Compilar con los perfiles marcados abajo, saltando tests (mvn clean install -DskipTests)">⚡</button>
      <button class="quick-btn" data-action="clean" title="Limpiar (mvn clean)">🧹</button>
      <button class="quick-btn" data-action="dependencyTree" title="Ver árbol de dependencias (mvn dependency:tree)">🌳</button>
      <button class="quick-btn" data-action="customGoal" title="Ejecutar un goal de Maven personalizado...">⚙️</button>
    </div>
    <div class="hint">Usan los perfiles marcados en "Perfiles Maven" de abajo, y excluyen ui.frontend del reactor (igual que "Solo Back").</div>
  </section>

  <section>
    <label class="field-label" for="modo">Modo de compilación</label>
    <select id="modo"></select>
    <div id="modoHint" class="hint"></div>
  </section>

  <section id="profilesSection">
    <label class="field-label">Perfiles Maven (checkboxes)</label>
    <input type="text" id="profileSearch" class="profiles-search" placeholder="Filtrar perfiles..." />
    <div id="profilesList"></div>
  </section>

  <section id="testsSection">
    <label class="field-label">Tests</label>
    <div id="skipFrontRow" class="checkbox-row" style="display:none">
      <input type="checkbox" id="skipFrontendTests" />
      <label for="skipFrontendTests">Saltar tests de Front<span id="frontTestScriptHint"></span></label>
    </div>
    <div id="skipBackRow" class="checkbox-row" style="display:none">
      <input type="checkbox" id="skipBackendTests" />
      <label for="skipBackendTests">Saltar tests de Back (-DskipTests)</label>
    </div>
    <div id="coverageNote" class="disabled-note" style="display:none"></div>
  </section>

  <section id="deploySection">
    <label class="field-label">Destino (solo aplica si eliges un perfil de instalación)</label>
    <div class="deploy-row">
      <label><input type="radio" name="deploy" value="none" checked /> No aplica</label>
      <label><input type="radio" name="deploy" value="author" /> Author</label>
      <label><input type="radio" name="deploy" value="publish" /> Publish</label>
      <span id="deployHostPortRow" style="display:none">
        Host <input type="text" id="deployHost" value="localhost" style="width:110px" />
        Puerto <input type="text" id="deployPort" value="4502" style="width:60px" />
      </span>
    </div>
  </section>

  <section>
    <label class="field-label" for="extraArgs">Argumentos extra</label>
    <input type="text" id="extraArgs" style="width:100%; box-sizing:border-box" placeholder="ej. -o para modo offline" />
  </section>

  <section>
    <div class="run-row">
      <button id="runBtn">▶ Compilar</button>
      <div class="save-row">
        <input type="text" id="presetName" placeholder="Nombre del modo a guardar" />
        <button class="secondary" id="saveBtn">Guardar como modo personalizado</button>
      </div>
    </div>
    <div id="presetList" class="preset-list"></div>
  </section>

<script>
  const vscode = acquireVsCodeApi();
  const project = ${projectData};
  const allProfiles = ${profilesData}; // {id, sourceModule?}[]
  let presets = ${presetsData};

  const BASE_MODES = [
    { value: 'base:full', label: 'Completa (front + back + tests)' },
    { value: 'base:front', label: 'Solo Front', disabled: !project.hasFrontendModule },
    { value: 'base:back', label: 'Solo Back' },
    { value: 'base:coverage-front', label: 'Test-coverage Frontend' + (project.frontendCoverageScript ? '' : ' (no disponible)'), disabled: !project.frontendCoverageScript },
    { value: 'base:coverage-back', label: 'Test-coverage Backend' }
  ];

  let checkedProfiles = new Set();
  let currentBaseMode = 'full';

  // Perfiles que cada modo base normalmente necesita para instalar en author/publish — se marcan
  // solos al elegir el modo (y al cargar el panel con el modo por defecto), igual que hace IntelliJ.
  const DEFAULT_PROFILES_BY_MODE = {
    full: ['autoInstallBundle', 'autoInstallPackage'],
    front: [],
    back: ['autoInstallBundle', 'autoInstallPackage'],
    'coverage-front': [],
    'coverage-back': ['coverage']
  };

  // Aplica TODOS los valores por defecto de un modo base: perfiles marcados, skip-tests (front/back),
  // argumentos extra y destino de despliegue. Se llama tanto al cargar el panel como al cambiar de
  // modo en el select, para que nunca queden valores de un modo anterior "pegados" en la UI.
  function applyModeDefaults(baseMode) {
    const wanted = (DEFAULT_PROFILES_BY_MODE[baseMode] || []).filter(id => allProfiles.some(p => p.id === id));
    checkedProfiles = new Set(wanted);
    renderProfiles(document.getElementById('profileSearch').value);

    document.getElementById('skipFrontendTests').checked = false;
    document.getElementById('skipBackendTests').checked = false;
    document.getElementById('extraArgs').value = '';

    const radios = document.getElementsByName('deploy');
    for (const r of radios) r.checked = (r.value === 'none');
    document.getElementById('deployHost').value = 'localhost';
    document.getElementById('deployPort').value = '4502';
    updateDeployVisibility();
  }

  function baseModeOf(value) {
    if (value.startsWith('base:')) return value.slice(5);
    const preset = presets.find(p => 'preset:' + p.name === value);
    return preset ? preset.baseMode : 'full';
  }

  function populateModoSelect() {
    const sel = document.getElementById('modo');
    sel.innerHTML = '';
    const baseGroup = document.createElement('optgroup');
    baseGroup.label = 'Modos base';
    for (const m of BASE_MODES) {
      const opt = document.createElement('option');
      opt.value = m.value; opt.textContent = m.label;
      if (m.disabled) opt.disabled = true;
      baseGroup.appendChild(opt);
    }
    sel.appendChild(baseGroup);
    if (presets.length > 0) {
      const presetGroup = document.createElement('optgroup');
      presetGroup.label = 'Modos personalizados';
      for (const p of presets) {
        const opt = document.createElement('option');
        opt.value = 'preset:' + p.name; opt.textContent = p.name;
        presetGroup.appendChild(opt);
      }
      sel.appendChild(presetGroup);
    }
  }

  function renderProfiles(filter) {
    const list = document.getElementById('profilesList');
    list.innerHTML = '';
    const f = (filter || '').toLowerCase();
    for (const p of allProfiles) {
      if (f && p.id.toLowerCase().indexOf(f) === -1) continue;
      const row = document.createElement('div');
      row.className = 'profile-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'profile_' + p.id; cb.checked = checkedProfiles.has(p.id);
      cb.addEventListener('change', () => {
        if (cb.checked) checkedProfiles.add(p.id); else checkedProfiles.delete(p.id);
      });
      const label = document.createElement('label');
      label.setAttribute('for', cb.id);
      label.textContent = p.id;
      row.appendChild(cb); row.appendChild(label);
      if (p.sourceModule) {
        const src = document.createElement('span');
        src.className = 'src'; src.textContent = '(definido en ' + p.sourceModule + ')';
        row.appendChild(src);
      }
      list.appendChild(row);
    }
    if (allProfiles.length === 0) {
      list.innerHTML = '<div class="hint">Este proyecto no declara perfiles en su(s) pom.xml.</div>';
    }
  }

  function updateVisibilityForMode(baseMode) {
    currentBaseMode = baseMode;
    const profilesSection = document.getElementById('profilesSection');
    const deploySection = document.getElementById('deploySection');
    const skipFrontRow = document.getElementById('skipFrontRow');
    const skipBackRow = document.getElementById('skipBackRow');
    const coverageNote = document.getElementById('coverageNote');
    const frontHint = document.getElementById('frontTestScriptHint');

    profilesSection.style.display = (baseMode === 'front' || baseMode === 'coverage-front') ? 'none' : '';
    deploySection.style.display = (baseMode === 'full' || baseMode === 'back') ? '' : 'none';
    skipFrontRow.style.display = ((baseMode === 'full' || baseMode === 'front') && project.frontendTestScript) ? '' : 'none';
    skipBackRow.style.display = (baseMode === 'full' || baseMode === 'back') ? '' : 'none';
    frontHint.textContent = project.frontendTestScript ? ' (npm run ' + project.frontendTestScript + ')' : '';

    coverageNote.style.display = 'none';
    if (baseMode === 'coverage-front') {
      coverageNote.style.display = 'block';
      coverageNote.textContent = project.frontendCoverageScript
        ? 'Corre "npm run ' + project.frontendCoverageScript + '" y muestra el % de coverage por archivo.'
        : 'Este proyecto no tiene un script de coverage en ui.frontend/package.json — este modo no está disponible.';
    }
    if (baseMode === 'coverage-back') {
      coverageNote.style.display = 'block';
      coverageNote.textContent = project.hasJacoco
        ? 'Los tests de back son obligatorios para calcular coverage (no se pueden saltar). Si no hay cambios desde el último commit, solo se re-corren los tests; si hay cambios, se compila todo el back.'
        : 'Este proyecto no tiene jacoco-maven-plugin configurado — se te ofrecerá agregarlo automáticamente al compilar.';
    }

  }

  function loadPreset(preset) {
    checkedProfiles = new Set(preset.profiles || []);
    renderProfiles(document.getElementById('profileSearch').value);
    document.getElementById('skipFrontendTests').checked = !!preset.skipFrontendTests;
    document.getElementById('skipBackendTests').checked = !!preset.skipBackendTests;
    document.getElementById('extraArgs').value = preset.extraArgs || '';
    const radios = document.getElementsByName('deploy');
    for (const r of radios) r.checked = (r.value === (preset.deployTarget || 'none'));
    document.getElementById('deployHost').value = preset.deployHost || 'localhost';
    document.getElementById('deployPort').value = preset.deployPort || '4502';
    updateDeployVisibility();
  }

  function updateDeployVisibility() {
    const target = document.querySelector('input[name=deploy]:checked').value;
    document.getElementById('deployHostPortRow').style.display = target === 'none' ? 'none' : 'inline';
    if (target === 'author' && document.getElementById('deployPort').value === '4503') document.getElementById('deployPort').value = '4502';
    if (target === 'publish' && document.getElementById('deployPort').value === '4502') document.getElementById('deployPort').value = '4503';
  }

  function renderPresetList() {
    const el = document.getElementById('presetList');
    el.innerHTML = '';
    for (const p of presets) {
      const row = document.createElement('div');
      row.className = 'preset-item';
      row.innerHTML = '<span>⭐ ' + p.name + '</span>';
      const del = document.createElement('span');
      del.className = 'del'; del.textContent = '🗑 eliminar';
      del.addEventListener('click', () => vscode.postMessage({ type: 'deletePreset', name: p.name }));
      row.appendChild(del);
      el.appendChild(row);
    }
  }

  document.getElementById('modo').addEventListener('change', (e) => {
    const value = e.target.value;
    const bm = baseModeOf(value);
    updateVisibilityForMode(bm);
    if (value.startsWith('preset:')) {
      const preset = presets.find(p => 'preset:' + p.name === value);
      loadPreset(preset);
    } else {
      applyModeDefaults(bm);
    }
  });

  document.getElementById('profileSearch').addEventListener('input', (e) => renderProfiles(e.target.value));
  document.querySelectorAll('input[name=deploy]').forEach(r => r.addEventListener('change', updateDeployVisibility));

  document.getElementById('runBtn').addEventListener('click', () => {
    const deployTarget = document.querySelector('input[name=deploy]:checked').value;
    const payload = {
      baseMode: currentBaseMode,
      profiles: [...checkedProfiles],
      skipFrontendTests: document.getElementById('skipFrontendTests').checked,
      skipBackendTests: document.getElementById('skipBackendTests').checked,
      deploy: { target: deployTarget, host: document.getElementById('deployHost').value || 'localhost', port: document.getElementById('deployPort').value || '4502' },
      extraArgs: document.getElementById('extraArgs').value
    };
    vscode.postMessage({ type: 'run', payload });
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const name = document.getElementById('presetName').value.trim();
    const deployTarget = document.querySelector('input[name=deploy]:checked').value;
    const preset = {
      name,
      baseMode: currentBaseMode,
      profiles: [...checkedProfiles],
      skipFrontendTests: document.getElementById('skipFrontendTests').checked,
      skipBackendTests: document.getElementById('skipBackendTests').checked,
      deployTarget,
      deployHost: document.getElementById('deployHost').value || 'localhost',
      deployPort: document.getElementById('deployPort').value || '4502',
      extraArgs: document.getElementById('extraArgs').value
    };
    vscode.postMessage({ type: 'savePreset', payload: preset });
  });

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'quickAction',
        payload: { action: btn.dataset.action, profiles: [...checkedProfiles] }
      });
    });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'presetsUpdated') {
      presets = msg.presets;
      populateModoSelect();
      renderPresetList();
    }
  });

  populateModoSelect();
  renderProfiles('');
  renderPresetList();
  updateVisibilityForMode('full');
  applyModeDefaults('full');
</script>
</body>
</html>`;
}
