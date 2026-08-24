import * as vscode from 'vscode';

export interface SavedBuildProfile {
  name: string;
  scope: 'all' | 'front' | 'back' | 'modules';
  modules?: string[];
  mavenProfile: string;
  skipTests: boolean;
  extraArgs: string;
}

export interface ExtensionConfig {
  defaultBuildScope: 'all' | 'front' | 'back';
  defaultInstallProfile: string;
  defaultSkipTests: boolean;
  mavenExecutable: 'auto' | 'mvn' | 'mvnw';
  frontBuildCommand: string;
  savedBuildProfiles: SavedBuildProfile[];
  componentsCreateCssJsByDefault: boolean;
  maxDialogTabs: number;
  defaultLocales: string[];
  namespace: string;
  componentsUtilsPath: string;
}

export function getConfig(scope?: vscode.Uri): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  return {
    defaultBuildScope: cfg.get<ExtensionConfig['defaultBuildScope']>('defaultBuildScope', 'all'),
    defaultInstallProfile: cfg.get<string>('defaultInstallProfile', ''),
    defaultSkipTests: cfg.get<boolean>('defaultSkipTests', false),
    mavenExecutable: cfg.get<ExtensionConfig['mavenExecutable']>('mavenExecutable', 'auto'),
    frontBuildCommand: cfg.get<string>('frontBuildCommand', 'npm run prod'),
    savedBuildProfiles: cfg.get<SavedBuildProfile[]>('savedBuildProfiles', []),
    componentsCreateCssJsByDefault: cfg.get<boolean>('componentsCreateCssJsByDefault', true),
    maxDialogTabs: cfg.get<number>('maxDialogTabs', 10),
    defaultLocales: cfg.get<string[]>('defaultLocales', []),
    namespace: cfg.get<string>('namespace', ''),
    componentsUtilsPath: cfg.get<string>('componentsUtilsPath', '')
  };
}

/** Persiste un nuevo perfil de compilación guardado (o lo reemplaza si ya existía uno con el mismo nombre). */
export async function saveBuildProfile(profile: SavedBuildProfile, scope?: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  const current = cfg.get<SavedBuildProfile[]>('savedBuildProfiles', []);
  const withoutSameName = current.filter((p) => p.name !== profile.name);
  await cfg.update(
    'savedBuildProfiles',
    [...withoutSameName, profile],
    vscode.ConfigurationTarget.Workspace
  );
}

export async function deleteBuildProfile(name: string, scope?: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  const current = cfg.get<SavedBuildProfile[]>('savedBuildProfiles', []);
  await cfg.update(
    'savedBuildProfiles',
    current.filter((p) => p.name !== name),
    vscode.ConfigurationTarget.Workspace
  );
}
