import * as vscode from 'vscode';

export type BaseCompileMode = 'full' | 'front' | 'back' | 'coverage-front' | 'coverage-back';

export interface CompilePreset {
  name: string;
  baseMode: BaseCompileMode;
  profiles: string[];
  skipFrontendTests: boolean;
  skipBackendTests: boolean;
  deployTarget: 'author' | 'publish' | 'none';
  deployHost: string;
  deployPort: string;
  extraArgs: string;
}

export interface ExtensionConfig {
  mavenExecutable: 'auto' | 'mvn' | 'mvnw';
  frontBuildCommand: string;
  compilePresets: CompilePreset[];
  componentsCreateCssJsByDefault: boolean;
  maxDialogTabs: number;
  defaultLocales: string[];
  namespace: string;
  componentsUtilsPath: string;
  javaHome: string;
  syncAuthorHost: string;
  syncAuthorPort: string;
  syncPublishHost: string;
  syncPublishPort: string;
  syncUsername: string;
}

export function getConfig(scope?: vscode.Uri): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  return {
    mavenExecutable: cfg.get<ExtensionConfig['mavenExecutable']>('mavenExecutable', 'auto'),
    frontBuildCommand: cfg.get<string>('frontBuildCommand', 'npm run dev'),
    compilePresets: cfg.get<CompilePreset[]>('compilePresets', []),
    componentsCreateCssJsByDefault: cfg.get<boolean>('componentsCreateCssJsByDefault', true),
    maxDialogTabs: cfg.get<number>('maxDialogTabs', 10),
    defaultLocales: cfg.get<string[]>('defaultLocales', []),
    namespace: cfg.get<string>('namespace', ''),
    componentsUtilsPath: cfg.get<string>('componentsUtilsPath', ''),
    javaHome: cfg.get<string>('javaHome', ''),
    syncAuthorHost: cfg.get<string>('sync.authorHost', 'localhost'),
    syncAuthorPort: cfg.get<string>('sync.authorPort', '4502'),
    syncPublishHost: cfg.get<string>('sync.publishHost', 'localhost'),
    syncPublishPort: cfg.get<string>('sync.publishPort', '4503'),
    syncUsername: cfg.get<string>('sync.username', 'admin')
  };
}

export async function saveCompilePreset(preset: CompilePreset, scope?: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  const current = cfg.get<CompilePreset[]>('compilePresets', []);
  const withoutSameName = current.filter((p) => p.name !== preset.name);
  await cfg.update('compilePresets', [...withoutSameName, preset], vscode.ConfigurationTarget.Workspace);
}

export async function deleteCompilePreset(name: string, scope?: vscode.Uri): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('aemToolkit', scope);
  const current = cfg.get<CompilePreset[]>('compilePresets', []);
  await cfg.update(
    'compilePresets',
    current.filter((p) => p.name !== name),
    vscode.ConfigurationTarget.Workspace
  );
}
