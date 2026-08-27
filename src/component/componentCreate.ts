import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findAemProjectForPath } from '../core/projectDetector';
import { getConfig } from '../config';
import { isValidJcrNodeName, scanComponentsFolder } from './componentDetector';
import { buildComponentPanelInitialState, renderComponentPanelHtml } from './componentPanel';
import { ComponentCreatePayload, computeAssetSubPaths, computeDefaultAssetsDir, planComponentCreate, registerWebpackEntry, writePlan } from './componentGenerator';
import { createNextVersion, getLatestVersionNumber, isAlreadyVersionedComponent, migrateComponentToVariant } from './componentVariant';
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

  // Si la carpeta sobre la que se hizo clic ya ES un componente (tiene su propio .content.xml):
  // - Si ya está versionado (tiene subcarpetas v1/v2... con su propio .content.xml), es un proxy: se
  //   ofrece crear directamente la siguiente versión (vN+1, duplicando tal cual la más alta existente
  //   como punto de partida) — ver `createNextVersion` (componentVariant.ts). Antes esto solo avisaba
  //   y redirigía al formulario; a pedido explícito (v2.1.11) se resuelve directo, sin formulario,
  //   igual que el caso de abajo.
  // - Si NO está versionado todavía (es un componente real sin versión, con su contenido directo en
  //   la carpeta), se ofrece convertirlo en una variante: el contenido actual pasa a v1, se duplica a
  //   v2, y la carpeta pasa a ser el proxy apuntando a v2 (ver componentVariant.ts).
  try {
    if (fs.statSync(target.fsPath).isDirectory() && fs.existsSync(path.join(target.fsPath, '.content.xml'))) {
      const componentName = path.basename(target.fsPath);

      if (isAlreadyVersionedComponent(target.fsPath)) {
        const latestVersion = getLatestVersionNumber(target.fsPath);
        const nextVersionLabel = latestVersion !== undefined ? `"v${latestVersion + 1}"` : 'la versión nueva';
        const fromLabel = latestVersion !== undefined ? ` a partir de "v${latestVersion}"` : '';

        const versionChoice = await vscode.window.showWarningMessage(
          `"${componentName}" ya es un componente versionado (proxy). ¿Deseas crear ${nextVersionLabel}${fromLabel}? Su contenido se duplicará tal cual como punto de partida, y el proxy pasará a apuntar a esa versión nueva.`,
          { modal: true },
          'Crear versión'
        );
        if (versionChoice !== 'Crear versión') return;

        try {
          const result = createNextVersion(target.fsPath, project.namespace ?? '<namespace>');
          const relNew = path.relative(project.rootPath, result.newVersionDir);
          vscode.window.showInformationMessage(
            `"${result.componentName}" tiene una versión nueva: "v${result.newVersionNumber}" ("${relNew}"), creada a partir de "v${result.previousVersionNumber}". El proxy ya apunta a "v${result.newVersionNumber}".`
          );

          // Abre el HTML y el diálogo de la versión nueva (si existen) — mismo criterio de apertura
          // automática que el resto de flujos de creación (ver v2.1.7/v2.1.8 y "Crear variante").
          const htmlPath = path.join(result.newVersionDir, `${result.componentName}.html`);
          if (fs.existsSync(htmlPath)) {
            await vscode.window.showTextDocument(vscode.Uri.file(htmlPath), { preview: false });
          }
          const dialogXmlPath = path.join(result.newVersionDir, '_cq_dialog', '.content.xml');
          if (fs.existsSync(dialogXmlPath)) {
            await openDialogEditor(context, vscode.Uri.file(dialogXmlPath));
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`No se pudo crear la versión nueva de "${componentName}": ${detail}`);
        }
        return;
      }

      const choice = await vscode.window.showWarningMessage(
        `"${componentName}" ya contiene un componente. ¿Deseas crear una variante (versión nueva)? El contenido actual pasará a ser "v1", se duplicará para crear "v2" como punto de partida de la variante, y "${componentName}" pasará a ser un proxy versionado apuntando a "v2".`,
        { modal: true },
        'Crear variante'
      );
      if (choice !== 'Crear variante') return;

      try {
        const result = migrateComponentToVariant(target.fsPath, project.namespace ?? '<namespace>');
        const relV2 = path.relative(project.rootPath, result.v2Dir);
        vscode.window.showInformationMessage(
          `"${result.componentName}" convertido a componente versionado. "v1" conserva el contenido original; "v2" ("${relV2}") es la variante nueva — ajústala a mano. El proxy en "${componentName}" ya apunta a "v2".`
        );

        // Abre el HTML y el diálogo de v2 (si existen), para encadenar directo con la edición de la
        // variante nueva — mismo criterio que al crear un componente desde cero (ver v2.1.7/v2.1.8).
        const htmlPath = path.join(result.v2Dir, `${result.componentName}.html`);
        if (fs.existsSync(htmlPath)) {
          await vscode.window.showTextDocument(vscode.Uri.file(htmlPath), { preview: false });
        }
        const dialogXmlPath = path.join(result.v2Dir, '_cq_dialog', '.content.xml');
        if (fs.existsSync(dialogXmlPath)) {
          await openDialogEditor(context, vscode.Uri.file(dialogXmlPath));
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`No se pudo convertir "${componentName}" en variante: ${detail}`);
      }
      return;
    }
  } catch {
    // La ruta no existe o no se pudo leer — se ignora acá, el resto del flujo ya maneja ese caso.
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
      if (plan.preservedExistingFiles.length) {
        const relPreserved = plan.preservedExistingFiles.map((p) => `"${path.relative(project.rootPath, p)}"`);
        message += ` ℹ Ya existían y no se sobrescribieron (misma clientlib compartida entre versiones): ${relPreserved.join(', ')}.`;
      }
      if (notes.length) message += ' ⚠ ' + notes.join(' ');
      vscode.window.showInformationMessage(message);

      if (payload.advanced.openDialogAfterCreate) {
        // Abre estilos + HTML como pestañas normales, y el diálogo al final en el editor visual —
        // así el diálogo queda como pestaña activa, que es lo más probable que el usuario quiera
        // seguir editando justo después de crear el componente.
        const styleFilePath = plan.classicAssets?.cssFile ?? plan.webpackAssets?.styleFile;
        if (styleFilePath && fs.existsSync(styleFilePath)) {
          await vscode.window.showTextDocument(vscode.Uri.file(styleFilePath), { preview: false });
        }
        const htmlPath = path.join(plan.realComponentDir, `${payload.name}.html`);
        if (fs.existsSync(htmlPath)) {
          await vscode.window.showTextDocument(vscode.Uri.file(htmlPath), { preview: false });
        }
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
