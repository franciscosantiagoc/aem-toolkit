import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findAemProjectForPath } from '../core/projectDetector';
import { getConfig } from '../config';
import { isValidJcrNodeName, scanComponentsFolder } from './componentDetector';
import { buildComponentPanelInitialState, renderComponentPanelHtml } from './componentPanel';
import { ComponentCreatePayload, computeAssetSubPaths, computeDefaultAssetsDir, planComponentCreate, registerWebpackEntry, writePlan } from './componentGenerator';
import { openDialogEditor } from '../dialog/dialogPanel';

function isValidStyleExt(v: unknown): v is 'css' | 'scss' | 'less' {
  return v === 'css' || v === 'scss' || v === 'less';
}

function validatePayload(payload: any): payload is ComponentCreatePayload {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.name !== 'string' || !isValidJcrNodeName(payload.name)) return false;
  if (typeof payload.title !== 'string' || typeof payload.componentGroup !== 'string') return false;
  if (typeof payload.versioned !== 'boolean') return false;
  if (typeof payload.generateStyles !== 'boolean' || typeof payload.generateJs !== 'boolean') return false;
  if (payload.generateStyles && !isValidStyleExt(payload.styleExt)) return false;
  if (typeof payload.addToFrontend !== 'boolean') return false;
  if (payload.assetsDir !== undefined && typeof payload.assetsDir !== 'string') return false;
  const adv = payload.advanced;
  if (!adv || typeof adv !== 'object') return false;
  for (const k of ['editConfig', 'designDialog', 'template', 'placeholder', 'openDialogAfterCreate']) {
    if (typeof adv[k] !== 'boolean') return false;
  }
  return true;
}

export async function createComponentWizard(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) {
    vscode.window.showWarningMessage('Haz clic derecho sobre la carpeta "components" (o una subcarpeta suya) para crear un componente.');
    return;
  }

  // Si la carpeta sobre la que se hizo clic ya ES un componente (proxy, versión real, o
  // componente sin versión — todos tienen su propio .content.xml), no tiene sentido ofrecer
  // "Crear nuevo" ahí: el caso de "agregar una versión nueva a este componente" queda para una
  // iteración siguiente. Se avisa y se redirige al flujo que ya funciona (mismo nombre, desde
  // "components", con el switch de versionado activado).
  try {
    if (fs.statSync(target.fsPath).isDirectory() && fs.existsSync(path.join(target.fsPath, '.content.xml'))) {
      const componentName = path.basename(target.fsPath);
      vscode.window.showWarningMessage(
        `"${componentName}" ya es un componente. Agregar una versión nueva haciendo clic derecho directamente sobre un componente existente todavía no está soportado — usa "Crear nuevo... → Componente" sobre "components" (o cualquier otra carpeta de ui.apps) con el mismo nombre "${componentName}" y "Componente versionado" activado; la extensión calcula sola la siguiente versión.`
      );
      return;
    }
  } catch {
    // La ruta no existe o no se pudo leer — se ignora acá, el resto del flujo ya maneja ese caso.
  }

  const project = findAemProjectForPath(target.fsPath);
  if (!project) {
    vscode.window.showErrorMessage('AEM Toolkit: no se pudo detectar el proyecto AEM (pom.xml con <modules>) que contiene esta carpeta.');
    return;
  }
  if (!project.componentsPath) {
    vscode.window.showErrorMessage(
      'AEM Toolkit: no se encontró la carpeta "components" del namespace bajo ui.apps. Configura "aemToolkit.namespace" si el namespace no se pudo autodetectar.'
    );
    return;
  }

  const utilsFolderName = path.basename(getConfig().componentsUtilsPath || 'utils');
  const componentsPath = project.componentsPath;

  const scan = scanComponentsFolder(componentsPath, project.hasFrontendModule, project.rootPath, utilsFolderName);

  const panel = vscode.window.createWebviewPanel('aemToolkitCreateComponent', 'Crear componente', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  });
  panel.webview.html = renderComponentPanelHtml(buildComponentPanelInitialState(project, scan));

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg?.type === 'computeDefaultAssetsDir') {
      if (typeof msg.name === 'string' && isValidJcrNodeName(msg.name)) {
        const versionNumber = typeof msg.versionNumber === 'number' ? msg.versionNumber : undefined;
        const dir = computeDefaultAssetsDir(project, msg.name, !!msg.useFrontend, versionNumber);
        panel.webview.postMessage({ type: 'defaultAssetsDir', path: dir });
      }
      return;
    }

    if (msg?.type === 'computeAssetPaths') {
      const assetsDir = typeof msg.assetsDir === 'string' ? msg.assetsDir.trim() : '';
      if (assetsDir) {
        const { cssDir, jsDir } = computeAssetSubPaths(assetsDir, !!msg.useFrontend);
        panel.webview.postMessage({ type: 'assetPaths', cssDir, jsDir });
      }
      return;
    }

    if (msg?.type === 'browseFolder') {
      const current = typeof msg.current === 'string' ? msg.current : '';
      const anchor = current && fs.existsSync(current) ? current : componentsPath;
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(anchor),
        openLabel: 'Elegir carpeta'
      });
      if (picked && picked[0]) {
        panel.webview.postMessage({ type: 'folderPicked', path: picked[0].fsPath });
      }
      return;
    }

    if (msg?.type !== 'create') return;
    const payload = msg.payload;
    if (!validatePayload(payload)) {
      panel.webview.postMessage({ type: 'created', ok: false, message: 'Datos del formulario inválidos.' });
      return;
    }

    // Re-escanea por si algo cambió en disco desde que se abrió el panel (otra creación en paralelo, etc.).
    const freshScan = scanComponentsFolder(componentsPath, project.hasFrontendModule, project.rootPath, utilsFolderName);
    const existingMatch = freshScan.existing.find((c) => c.name === payload.name);
    const existingVersioned = !!existingMatch && existingMatch.versions.length > 0;

    if (payload.versioned && existingMatch && !existingVersioned && existingMatch.hasOwnContentXml) {
      panel.webview.postMessage({ type: 'created', ok: false, message: `Ya existe un componente sin versión llamado "${payload.name}".` });
      return;
    }
    if (!payload.versioned && existingVersioned) {
      panel.webview.postMessage({ type: 'created', ok: false, message: `Ya existe un componente versionado llamado "${payload.name}".` });
      return;
    }

    const existingMaxVersion = existingMatch && existingMatch.versions.length > 0 ? Math.max(...existingMatch.versions) : undefined;

    try {
      const plan = planComponentCreate(project, payload, existingMaxVersion);
      writePlan(plan);

      const notes: string[] = [];
      if (plan.webpackAssets) {
        const reg = registerWebpackEntry(project, plan.webpackAssets.styleFile, plan.webpackAssets.jsFile);
        if (plan.webpackAssets.styleFile && !reg.styleEntryFile) {
          notes.push('No se encontró un punto de entrada de estilos reconocible en ui.frontend — agrega el @import del nuevo componente a mano.');
        }
        if (plan.webpackAssets.jsFile && !reg.jsEntryFile) {
          notes.push('No se encontró un punto de entrada de JS reconocible en ui.frontend — agrega el import del nuevo componente a mano.');
        }
      }

      panel.webview.postMessage({ type: 'created', ok: true });

      const relDir = path.relative(project.rootPath, plan.realComponentDir);
      let message = `Componente "${payload.name}" creado en "${relDir}".`;
      if (plan.classicClientlibDir) {
        const relClientlib = path.relative(project.rootPath, plan.classicClientlibDir);
        const parts: string[] = [];
        if (payload.generateStyles) parts.push(`CSS en "${path.join(relClientlib, 'css')}"`);
        if (payload.generateJs) parts.push(`JS en "${path.join(relClientlib, 'js')}"`);
        if (parts.length) message += ` ${parts.join(', ')}.`;
      } else if (plan.webpackAssets && (plan.webpackAssets.styleFile || plan.webpackAssets.jsFile)) {
        const assetsRelDir = path.dirname(plan.webpackAssets.styleFile ?? plan.webpackAssets.jsFile ?? '');
        message += ` Estilos/JS en "${path.relative(project.rootPath, assetsRelDir)}".`;
      }
      if (notes.length) message += ' ⚠ ' + notes.join(' ');
      vscode.window.showInformationMessage(message);

      if (payload.advanced.openDialogAfterCreate) {
        const dialogXmlPath = path.join(plan.realComponentDir, '_cq_dialog', '.content.xml');
        await openDialogEditor(context, vscode.Uri.file(dialogXmlPath));
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'created', ok: false, message: detail });
      vscode.window.showErrorMessage(`No se pudo crear el componente: ${detail}`);
    }
  });
}
