import * as vscode from 'vscode';
import { AemProjectInfo, detectAemProjectsInWorkspace } from '../core/projectDetector';
import { getConfig, saveBuildProfile, deleteBuildProfile, SavedBuildProfile } from '../config';
import { buildCompileCommand, runInTerminal, describeSelection, CompileSelection } from './compileRunner';

const LAST_COMPILE_KEY = 'aemToolkit.lastCompile';

interface LastCompile {
  rootPath: string;
  selection: CompileSelection;
}

async function pickProject(): Promise<AemProjectInfo | undefined> {
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

async function pickScope(project: AemProjectInfo, defaultScope: string): Promise<BuildScopePick | undefined> {
  type Item = vscode.QuickPickItem & { scope: 'all' | 'front' | 'back' | 'modules' };
  const items: Item[] = [
    { label: '$(package) Todo (front + back)', scope: 'all', description: 'mvn clean install del reactor completo' },
    ...(project.hasFrontendModule
      ? [{ label: '$(browser) Solo Front', scope: 'front' as const, description: 'corre el build de ui.frontend (npm), sin Maven' }]
      : [{ label: '$(browser) Solo Front (no disponible)', scope: 'front' as const, description: 'este proyecto no tiene módulo ui.frontend', detail: '⚠ se omitirá si lo seleccionas' }]),
    { label: '$(server) Solo Back', scope: 'back', description: project.hasFrontendModule ? 'mvn clean install excluyendo ui.frontend' : 'mvn clean install (el proyecto ya no tiene ui.frontend)' },
    { label: '$(list-selection) Elegir módulos específicos...', scope: 'modules', description: `de: ${project.modules.join(', ')}` }
  ];
  const defaultIndex = items.findIndex((i) => i.scope === defaultScope);
  if (defaultIndex > 0) {
    const [def] = items.splice(defaultIndex, 1);
    items.unshift(def);
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '¿Qué quieres compilar? (escribe para filtrar)',
    matchOnDescription: true
  });
  if (!picked) return undefined;

  if (picked.scope === 'front' && !project.hasFrontendModule) {
    vscode.window.showErrorMessage('Este proyecto no tiene módulo ui.frontend, así que no hay nada que compilar como "Solo Front".');
    return undefined;
  }

  if (picked.scope === 'modules') {
    const chosen = await vscode.window.showQuickPick(
      project.modules.map((m) => ({ label: m, picked: false })),
      { placeHolder: 'Selecciona uno o más módulos (escribe para filtrar)', canPickMany: true }
    );
    if (!chosen || chosen.length === 0) return undefined;
    return { scope: 'modules', modules: chosen.map((c) => c.label) };
  }

  return { scope: picked.scope };
}

interface BuildScopePick {
  scope: 'all' | 'front' | 'back' | 'modules';
  modules?: string[];
}

async function pickMavenProfile(project: AemProjectInfo, defaultProfile: string): Promise<string | undefined> {
  const NONE = '(ninguno — solo compilar)';
  const CUSTOM = '(escribir perfil personalizado...)';
  const items = [NONE, ...project.profiles.map((p) => p.id), CUSTOM];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Perfil de instalación Maven (-P) — escribe para filtrar',
    activeItems: undefined
  } as vscode.QuickPickOptions);

  // showQuickPick con strings no soporta preseleccionar directamente; se resuelve por índice si se
  // quisiera refinar más adelante. Por ahora se respeta el valor por defecto solo como sugerencia
  // inicial cuando el usuario no escribe nada distinto (ver defaultProfile abajo).
  if (picked === undefined) return undefined;
  if (picked === NONE) return '';
  if (picked === CUSTOM) {
    const custom = await vscode.window.showInputBox({
      prompt: 'Nombre del perfil Maven a usar (-P<perfil>)',
      value: defaultProfile
    });
    return custom?.trim() ?? undefined;
  }
  return picked;
}

const DEFAULT_HOST = 'localhost';
const AUTHOR_DEFAULT_PORT = '4502';
const PUBLISH_DEFAULT_PORT = '4503';

/**
 * Pregunta si se instala en Author o Publish (o "no aplica") y resuelve host/puerto —
 * precargados con los estándares de AEM (localhost:4502 / localhost:4503) para que baste con
 * Enter-Enter si no se necesita nada distinto. Sigue la convención vista en los proyectos de
 * referencia: el perfil "<algo>" apunta a Author vía las propiedades aem.host/aem.port del pom,
 * y si existe un perfil hermano "<algo>Publish" (ej. autoInstallPackage -> autoInstallPackagePublish)
 * este usa aem.publish.host/aem.publish.port para Publish. Si no existe ese hermano, se hace un
 * mejor esfuerzo sobrescribiendo aem.host/aem.port directamente y se avisa al usuario.
 */
async function pickDeployTarget(
  project: AemProjectInfo,
  baseProfile: string
): Promise<{ profile: string; extraArgs: string } | null | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: '$(server) Author', description: `puerto estándar ${AUTHOR_DEFAULT_PORT}`, target: 'author' as const },
      { label: '$(globe) Publish', description: `puerto estándar ${PUBLISH_DEFAULT_PORT}`, target: 'publish' as const },
      { label: '$(circle-slash) No aplica', description: 'no tocar host/puerto, usar el perfil tal cual', target: 'none' as const }
    ],
    { placeHolder: '¿Instalar en Author o Publish?' }
  );
  if (!picked) return undefined;
  if (picked.target === 'none') return null;

  const targetLabel = picked.target === 'author' ? 'Author' : 'Publish';
  const defaultPort = picked.target === 'author' ? AUTHOR_DEFAULT_PORT : PUBLISH_DEFAULT_PORT;

  const host = await vscode.window.showInputBox({
    prompt: `Host de ${targetLabel} (Enter para usar el estándar)`,
    value: DEFAULT_HOST
  });
  if (host === undefined) return undefined;

  const port = await vscode.window.showInputBox({
    prompt: `Puerto de ${targetLabel} (Enter para usar el estándar)`,
    value: defaultPort,
    validateInput: (v) => (/^\d+$/.test(v.trim()) ? undefined : 'El puerto debe ser numérico')
  });
  if (port === undefined) return undefined;

  const isDefault = host === DEFAULT_HOST && port === defaultPort;

  if (picked.target === 'author') {
    return { profile: baseProfile, extraArgs: isDefault ? '' : `-Daem.host=${host} -Daem.port=${port}` };
  }

  const siblingId = project.profiles.find((p) => p.id.toLowerCase() === `${baseProfile}publish`.toLowerCase())?.id;
  if (siblingId) {
    return {
      profile: siblingId,
      extraArgs: isDefault ? '' : `-Daem.publish.host=${host} -Daem.publish.port=${port}`
    };
  }

  vscode.window.showWarningMessage(
    `No se encontró un perfil "${baseProfile}Publish" en el pom. Se usará "${baseProfile}" sobrescribiendo host/puerto directamente (-Daem.host/-Daem.port) — verifica que ese perfil realmente soporte Publish en este proyecto.`
  );
  return { profile: baseProfile, extraArgs: `-Daem.host=${host} -Daem.port=${port}` };
}

async function pickSkipTests(defaultValue: boolean): Promise<boolean | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: '$(check) Saltar tests (-DskipTests)', value: true },
      { label: '$(beaker) Correr tests', value: false }
    ],
    { placeHolder: `¿Saltar tests? (por defecto: ${defaultValue ? 'sí' : 'no'})` }
  );
  return picked?.value;
}

export async function runCompileWizard(context: vscode.ExtensionContext): Promise<void> {
  const project = await pickProject();
  if (!project) return;

  const config = getConfig(vscode.Uri.file(project.rootPath));

  const scopePick = await pickScope(project, config.defaultBuildScope);
  if (!scopePick) return;

  let mavenProfile = '';
  let deployExtraArgs = '';
  if (scopePick.scope !== 'front') {
    const profile = await pickMavenProfile(project, config.defaultInstallProfile);
    if (profile === undefined) return;
    mavenProfile = profile;

    if (mavenProfile) {
      const deploy = await pickDeployTarget(project, mavenProfile);
      if (deploy === undefined) return; // canceló el paso Author/Publish
      if (deploy) {
        mavenProfile = deploy.profile;
        deployExtraArgs = deploy.extraArgs;
      }
    }
  }

  const skipTests = scopePick.scope === 'front' ? false : await pickSkipTests(config.defaultSkipTests);
  if (skipTests === undefined) return;

  const userExtraArgs =
    scopePick.scope === 'front'
      ? ''
      : (await vscode.window.showInputBox({
          prompt: 'Argumentos extra para Maven (opcional, ej. -o para modo offline)',
          placeHolder: ''
        })) ?? '';

  const extraArgs = [deployExtraArgs, userExtraArgs].filter((s) => s.trim()).join(' ');

  const selection: CompileSelection = {
    scope: scopePick.scope,
    modules: scopePick.modules,
    mavenProfile,
    skipTests,
    extraArgs
  };

  const { cwd, command } = buildCompileCommand(project, selection, config);
  runInTerminal(cwd, command);
  await context.workspaceState.update(LAST_COMPILE_KEY, { rootPath: project.rootPath, selection } as LastCompile);

  const saveName = await vscode.window.showInputBox({
    prompt: 'Nombre para guardar esta combinación como perfil favorito (opcional — Esc para no guardar)',
    placeHolder: 'ej. "back rápido sin tests"'
  });
  if (saveName && saveName.trim()) {
    await saveBuildProfile(
      {
        name: saveName.trim(),
        scope: selection.scope,
        modules: selection.modules,
        mavenProfile: selection.mavenProfile,
        skipTests: selection.skipTests,
        extraArgs: selection.extraArgs
      },
      vscode.Uri.file(project.rootPath)
    );
    vscode.window.showInformationMessage(`Perfil "${saveName.trim()}" guardado. Ejecutando: ${describeSelection(selection)}`);
  }
}

export async function repeatLastCompile(context: vscode.ExtensionContext): Promise<void> {
  const last = context.workspaceState.get<LastCompile>(LAST_COMPILE_KEY);
  if (!last) {
    vscode.window.showWarningMessage('Todavía no has compilado nada en esta sesión. Usa "AEM: Compilar proyecto..." primero.');
    return;
  }
  const project = await pickProjectByRoot(last.rootPath);
  if (!project) return;
  const config = getConfig(vscode.Uri.file(project.rootPath));
  const { cwd, command } = buildCompileCommand(project, last.selection, config);
  runInTerminal(cwd, command);
}

function pickProjectByRoot(rootPath: string): AemProjectInfo | undefined {
  return detectAemProjectsInWorkspace().find((p) => p.rootPath === rootPath);
}

export async function runCompileFavorite(context: vscode.ExtensionContext): Promise<void> {
  const project = await pickProject();
  if (!project) return;

  const config = getConfig(vscode.Uri.file(project.rootPath));
  if (config.savedBuildProfiles.length === 0) {
    vscode.window.showInformationMessage('No hay perfiles guardados todavía. Guarda uno la próxima vez que uses "AEM: Compilar proyecto...".');
    return;
  }

  const DELETE_PREFIX = '$(trash) Eliminar: ';
  const items = [
    ...config.savedBuildProfiles.map((p) => ({
      label: `$(star-full) ${p.name}`,
      description: describeSelection({
        scope: p.scope === 'modules' ? 'modules' : p.scope,
        modules: p.modules,
        mavenProfile: p.mavenProfile,
        skipTests: p.skipTests,
        extraArgs: p.extraArgs
      }),
      profile: p
    })),
    ...config.savedBuildProfiles.map((p) => ({
      label: `${DELETE_PREFIX}${p.name}`,
      description: '',
      profile: p
    }))
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Perfiles guardados (escribe para filtrar) — o elige "Eliminar: <nombre>" para borrarlo',
    matchOnDescription: true
  });
  if (!picked) return;

  if (picked.label.startsWith(DELETE_PREFIX)) {
    await deleteBuildProfile(picked.profile.name, vscode.Uri.file(project.rootPath));
    vscode.window.showInformationMessage(`Perfil "${picked.profile.name}" eliminado.`);
    return;
  }

  const selection: CompileSelection = {
    scope: picked.profile.scope === 'modules' ? 'modules' : (picked.profile.scope as CompileSelection['scope']),
    modules: picked.profile.modules,
    mavenProfile: picked.profile.mavenProfile,
    skipTests: picked.profile.skipTests,
    extraArgs: picked.profile.extraArgs
  };
  const { cwd, command } = buildCompileCommand(project, selection, config);
  runInTerminal(cwd, command);
  await context.workspaceState.update(LAST_COMPILE_KEY, { rootPath: project.rootPath, selection } as LastCompile);
}
