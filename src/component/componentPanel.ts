import * as vscode from 'vscode';
import { AemProjectInfo } from '../core/projectDetector';
import { ComponentsFolderScan } from './componentDetector';
import { getConfig } from '../config';

export interface ComponentPanelInitialState {
  namespace: string;
  hasFrontendModule: boolean;
  scan: ComponentsFolderScan;
  cssJsDefault: boolean;
  /** Raíz del proyecto Maven — usada por el explorador interno de carpetas (v2.1.12) para confinar
   * la navegación a la carpeta del proyecto actual en vez de abrir el selector nativo del sistema
   * operativo (que permite ir a cualquier parte del disco). */
  projectRootPath: string;
}

export function buildComponentPanelInitialState(project: AemProjectInfo, scan: ComponentsFolderScan): ComponentPanelInitialState {
  return {
    namespace: project.namespace ?? '<namespace>',
    hasFrontendModule: project.hasFrontendModule,
    scan,
    cssJsDefault: getConfig().componentsCreateCssJsByDefault,
    projectRootPath: project.rootPath
  };
}

export function renderComponentPanelHtml(state: ComponentPanelInitialState): string {
  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');

  return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; max-width: 720px; margin: 0 auto; }
  h2 { font-size: 15px; margin: 0 0 4px 0; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 16px; }
  label { display:block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; margin-top: 10px; }
  input[type=text], select {
    width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); padding: 5px 8px; border-radius: 3px; font-size: 13px;
  }
  .path-preview { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; word-break: break-all; }
  .switch-row { display:flex; align-items:center; gap:8px; margin-top: 12px; }
  .switch-row input { width:auto; margin:0; }
  .switch-row .switch-label { font-size: 13px; color: var(--vscode-foreground); }
  .switch-row .switch-desc { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .inline-select { margin-top: 6px; margin-left: 24px; max-width: 220px; }
  .warning-banner {
    background: var(--vscode-inputValidation-warningBackground, rgba(255,180,0,0.12));
    border: 1px solid var(--vscode-inputValidation-warningBorder, #cca700);
    color: var(--vscode-foreground); padding: 8px 10px; border-radius: 4px; font-size: 12px; margin-top: 10px; display:none;
  }
  .warning-banner.visible { display:block; }
  details { margin-top: 16px; border: 1px solid var(--vscode-editorWidget-border, #3c3c3c); border-radius: 4px; padding: 8px 10px; }
  summary { cursor: pointer; font-size: 13px; font-weight: 600; }
  .adv-item { margin-top: 8px; }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
    padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 13px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .save-bar { position: sticky; bottom:0; background: var(--vscode-editor-background); padding: 12px 0; border-top: 1px solid var(--vscode-editorWidget-border, #3c3c3c); margin-top: 18px; display:flex; align-items:center; gap:10px; }
  .status { font-size:12px; color: var(--vscode-descriptionForeground); }
  .status.error { color: var(--vscode-errorForeground, #f14c4c); font-weight: 600; }
  .status.success { color: var(--vscode-testing-iconPassed, #3fb950); font-weight: 600; }
  .field-error { color: var(--vscode-errorForeground, #f14c4c); font-size: 11px; margin-top: 3px; display:none; }
  .field-error.visible { display:block; }
  .assets-dir-row { display:flex; gap:6px; align-items:center; }
  .assets-dir-row input { flex:1; margin:0; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); white-space: nowrap; }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .folder-explorer-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; z-index: 1000;
  }
  .folder-explorer-modal {
    background: var(--vscode-editor-background); border: 1px solid var(--vscode-editorWidget-border, #3c3c3c);
    border-radius: 6px; width: 480px; max-width: 90vw; max-height: 70vh; display:flex; flex-direction:column; padding: 12px;
  }
  .folder-explorer-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px; }
  .folder-explorer-header strong { font-size: 13px; }
  .folder-explorer-header button { padding: 2px 8px; }
  .folder-explorer-path { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; word-break: break-all; }
  .folder-explorer-list { flex:1; overflow-y:auto; border: 1px solid var(--vscode-editorWidget-border, #3c3c3c); border-radius:4px; padding: 4px; min-height: 160px; }
  .folder-explorer-item { padding: 5px 8px; cursor:pointer; border-radius: 3px; font-size: 13px; }
  .folder-explorer-item:hover { background: var(--vscode-list-hoverBackground); }
  .folder-explorer-empty { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 8px; }
  .folder-explorer-actions { display:flex; gap:8px; margin-top: 10px; align-items:center; }
</style>
</head>
<body>
  <h2>Crear componente</h2>
  <div class="hint">Bloque 17 — primera iteración: estructura, diálogo vacío y clientlib de estilos/JS. El modelo Sling queda para una iteración siguiente.</div>

  <label>Nombre técnico del componente</label>
  <input type="text" id="name" placeholder="ej. hero-banner" />
  <div class="field-error" id="nameError"></div>
  <div class="path-preview" id="pathPreview"></div>
  <div class="warning-banner" id="conflictBanner"></div>

  <label>Título</label>
  <input type="text" id="title" />

  <label>Grupo de componentes</label>
  <input type="text" id="componentGroup" list="groupOptions" />
  <datalist id="groupOptions"></datalist>

  <div class="switch-row">
    <input type="checkbox" id="versioned" />
    <span class="switch-label">Componente versionado</span>
  </div>
  <div class="switch-desc">Desactivado: componente normal. Activado: crea v1 (o la siguiente versión disponible) con un proxy sin versión.</div>

  <div class="switch-row">
    <input type="checkbox" id="generateStyles" />
    <span class="switch-label">Generar hoja de estilos</span>
  </div>
  <select class="inline-select" id="styleExt"></select>

  <div class="switch-row">
    <input type="checkbox" id="generateJs" />
    <span class="switch-label">Generar JS</span>
  </div>

  <div class="switch-row" id="frontendRow" style="display:none">
    <input type="checkbox" id="addToFrontend" />
    <span class="switch-label">Añadir al módulo frontend (ui.frontend)</span>
  </div>
  <div class="switch-desc" id="frontendDesc" style="display:none">Desactivado: se crea una clientlib clásica propia del componente en su lugar.</div>

  <div id="assetsDirBlock" style="display:none">
    <div id="baseAssetsDirRow">
      <label>Carpeta base donde se generarán los estilos/JS</label>
      <div class="assets-dir-row">
        <input type="text" id="assetsDir" />
        <button type="button" class="secondary" id="browseAssetsDir">📁 Elegir...</button>
      </div>
      <div class="switch-desc">Se precarga sola según nombre/versión y si usas el módulo frontend o una clientlib — puedes cambiarla a mano o con "Elegir...". Con clientlib clásica, CSS y JS se generan cada uno en su propia subcarpeta dentro de esta, para no aglomerarlos si luego agregas más ficheros.</div>
    </div>

    <!-- Clientlib clásica: vista previa de las 2 rutas resultantes (sin edición aparte, sin cambios desde v2.1.5). -->
    <div class="path-preview" id="cssDirPreview" style="display:none"></div>
    <div class="path-preview" id="jsDirPreview" style="display:none"></div>

    <!-- ui.frontend con estilos Y JS activos (agregado en v2.1.12, a pedido explícito): permite ver
         (siempre, como referencia) y opcionalmente personalizar cada ruta por separado. -->
    <div class="switch-row" id="splitAssetsDirsRow" style="display:none">
      <input type="checkbox" id="splitAssetsDirs" />
      <span class="switch-label">Personalizar carpetas de estilos y JS por separado</span>
    </div>
    <div class="switch-desc" id="splitAssetsDirsDesc" style="display:none">Desactivado: estilos y JS comparten la carpeta de arriba (los 2 campos de abajo son solo de referencia, bloqueados). Actívalo para elegir una carpeta distinta para cada uno.</div>

    <div id="cssAssetsDirRow" style="display:none">
      <label>Carpeta de estilos</label>
      <div class="assets-dir-row">
        <input type="text" id="cssAssetsDir" disabled />
        <button type="button" class="secondary" id="browseCssAssetsDir" disabled>📁 Elegir...</button>
      </div>
    </div>
    <div id="jsAssetsDirRow" style="display:none">
      <label>Carpeta de JS</label>
      <div class="assets-dir-row">
        <input type="text" id="jsAssetsDir" disabled />
        <button type="button" class="secondary" id="browseJsAssetsDir" disabled>📁 Elegir...</button>
      </div>
    </div>
  </div>

  <details>
    <summary>Opciones avanzadas</summary>
    <div class="adv-item switch-row">
      <input type="checkbox" id="advEditConfig" checked />
      <span class="switch-label">_cq_editConfig.xml (refresca la página tras editar el diálogo)</span>
    </div>
    <div class="adv-item switch-row">
      <input type="checkbox" id="advDesignDialog" />
      <span class="switch-label">_cq_design_dialog (configuración de diseño/estilo)</span>
    </div>
    <div class="adv-item switch-row">
      <input type="checkbox" id="advTemplate" />
      <span class="switch-label">_cq_template (contenido inicial al arrastrar el componente "nuevo")</span>
    </div>
    <div class="adv-item switch-row">
      <input type="checkbox" id="advPlaceholder" checked />
      <span class="switch-label">Placeholder de "componente sin configurar" en modo edición</span>
    </div>
    <div class="adv-item switch-row">
      <input type="checkbox" id="advOpenDialog" checked />
      <span class="switch-label">Abrir la hoja de estilos, el HTML y el diálogo (en el editor visual) apenas se cree el componente</span>
    </div>
  </details>

  <div class="save-bar">
    <button id="createBtn">✅ Crear componente</button>
    <span class="status" id="statusText"></span>
  </div>

  <!-- Explorador interno de carpetas del proyecto (v2.1.12) — reemplaza al selector nativo del SO
       para los botones "Elegir..." de arriba: solo muestra rutas dentro de la carpeta del proyecto. -->
  <div class="folder-explorer-overlay" id="folderExplorerOverlay" style="display:none">
    <div class="folder-explorer-modal">
      <div class="folder-explorer-header">
        <strong>Elegir carpeta del proyecto</strong>
        <button type="button" class="secondary" id="folderExplorerClose">✕</button>
      </div>
      <div class="folder-explorer-path" id="folderExplorerPath"></div>
      <div class="folder-explorer-list" id="folderExplorerList"></div>
      <div class="folder-explorer-actions">
        <button type="button" class="secondary" id="folderExplorerUp">⬆ Subir</button>
        <span style="flex:1"></span>
        <button type="button" class="secondary" id="folderExplorerCancel">Cancelar</button>
        <button type="button" id="folderExplorerUse">Usar esta carpeta</button>
      </div>
    </div>
  </div>

<script>
(function () {
  const vscode = acquireVsCodeApi();
  const state = ${stateJson};
  const scan = state.scan;

  const nameInput = document.getElementById('name');
  const nameError = document.getElementById('nameError');
  const pathPreview = document.getElementById('pathPreview');
  const conflictBanner = document.getElementById('conflictBanner');
  const titleInput = document.getElementById('title');
  const groupInput = document.getElementById('componentGroup');
  const groupOptions = document.getElementById('groupOptions');
  const versionedInput = document.getElementById('versioned');
  const generateStylesInput = document.getElementById('generateStyles');
  const styleExtSelect = document.getElementById('styleExt');
  const generateJsInput = document.getElementById('generateJs');
  const frontendRow = document.getElementById('frontendRow');
  const frontendDesc = document.getElementById('frontendDesc');
  const addToFrontendInput = document.getElementById('addToFrontend');
  const assetsDirBlock = document.getElementById('assetsDirBlock');
  const baseAssetsDirRow = document.getElementById('baseAssetsDirRow');
  const assetsDirInput = document.getElementById('assetsDir');
  const browseAssetsDirBtn = document.getElementById('browseAssetsDir');
  const cssDirPreview = document.getElementById('cssDirPreview');
  const jsDirPreview = document.getElementById('jsDirPreview');
  const splitAssetsDirsRow = document.getElementById('splitAssetsDirsRow');
  const splitAssetsDirsDesc = document.getElementById('splitAssetsDirsDesc');
  const splitAssetsDirsInput = document.getElementById('splitAssetsDirs');
  const cssAssetsDirRow = document.getElementById('cssAssetsDirRow');
  const cssAssetsDirInput = document.getElementById('cssAssetsDir');
  const browseCssAssetsDirBtn = document.getElementById('browseCssAssetsDir');
  const jsAssetsDirRow = document.getElementById('jsAssetsDirRow');
  const jsAssetsDirInput = document.getElementById('jsAssetsDir');
  const browseJsAssetsDirBtn = document.getElementById('browseJsAssetsDir');
  const createBtn = document.getElementById('createBtn');
  const statusText = document.getElementById('statusText');

  const folderExplorerOverlay = document.getElementById('folderExplorerOverlay');
  const folderExplorerPath = document.getElementById('folderExplorerPath');
  const folderExplorerList = document.getElementById('folderExplorerList');
  const folderExplorerUpBtn = document.getElementById('folderExplorerUp');
  const folderExplorerCloseBtn = document.getElementById('folderExplorerClose');
  const folderExplorerCancelBtn = document.getElementById('folderExplorerCancel');
  const folderExplorerUseBtn = document.getElementById('folderExplorerUse');

  generateStylesInput.checked = state.cssJsDefault;
  generateJsInput.checked = state.cssJsDefault;
  addToFrontendInput.checked = true;

  (scan.existingGroups || []).forEach(function (g) {
    const opt = document.createElement('option');
    opt.value = g;
    groupOptions.appendChild(opt);
  });

  const STYLE_EXTS = ['css', 'scss', 'less'];
  const detected = scan.detectedStyleExts && scan.detectedStyleExts.length ? scan.detectedStyleExts : STYLE_EXTS;
  detected.forEach(function (ext) {
    const opt = document.createElement('option');
    opt.value = ext;
    opt.textContent = ext.toUpperCase();
    styleExtSelect.appendChild(opt);
  });

  // Por defecto: con ui.frontend se respeta la extensión dominante/detectada del proyecto (ya usa
  // un preprocesador vía webpack); con clientlib clásica se prefiere CSS (sin paso de compilación
  // en ui.apps) — el usuario puede cambiarlo igual, y a partir de ahí deja de recalcularse solo.
  function updateStyleExtDefault() {
    if (styleExtSelect.dataset.userEdited) return;
    const useFrontend = state.hasFrontendModule && addToFrontendInput.checked;
    if (useFrontend) {
      styleExtSelect.value = scan.dominantStyleExt || detected[0] || 'css';
      return;
    }
    const hasCssOption = Array.prototype.some.call(styleExtSelect.options, function (o) { return o.value === 'css'; });
    styleExtSelect.value = hasCssOption ? 'css' : (scan.dominantStyleExt || detected[0] || 'css');
  }
  styleExtSelect.addEventListener('change', function () { styleExtSelect.dataset.userEdited = '1'; });
  updateStyleExtDefault();

  function titleFromName(name) {
    return name.split(/[-_]+/).filter(Boolean).map(function (w) {
      return /[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function findExisting(name) {
    return (scan.existing || []).find(function (c) { return c.name === name; });
  }

  function computeConflict(name, versioned) {
    const match = findExisting(name);
    if (!match) return { conflict: false, nextVersion: versioned ? 1 : undefined };
    const existingVersioned = match.versions && match.versions.length > 0;
    if (versioned && !existingVersioned && match.hasOwnContentXml) {
      return { conflict: true, message: 'Ya existe un componente SIN versión llamado "' + name + '". Elige otro nombre, o desactiva "Componente versionado" para este.' };
    }
    if (!versioned && existingVersioned) {
      return { conflict: true, message: 'Ya existe un componente VERSIONADO llamado "' + name + '". Elige otro nombre, o activa "Componente versionado" para este.' };
    }
    const nextVersion = versioned ? (existingVersioned ? Math.max.apply(null, match.versions) + 1 : 1) : undefined;
    return { conflict: false, nextVersion: nextVersion };
  }

  function updatePreview() {
    const name = nameInput.value.trim();
    const versioned = versionedInput.checked;
    const validName = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);

    nameError.textContent = name && !validName ? 'Nombre inválido: usa letras, números, guion o guion bajo, sin empezar por número.' : '';
    nameError.classList.toggle('visible', !!name && !validName);

    if (!name || !validName) {
      pathPreview.textContent = '';
      conflictBanner.classList.remove('visible');
      createBtn.disabled = !!name;
      return;
    }

    const result = computeConflict(name, versioned);
    const basePath = 'components/' + name;
    pathPreview.textContent = result.nextVersion !== undefined
      ? basePath + ' (proxy) + ' + basePath + '/v' + result.nextVersion + ' (componente real)'
      : basePath;

    if (result.conflict) {
      conflictBanner.textContent = '⚠ ' + result.message;
      conflictBanner.classList.add('visible');
      createBtn.disabled = true;
    } else {
      conflictBanner.classList.remove('visible');
      createBtn.disabled = false;
    }

    if (!titleInput.dataset.userEdited) titleInput.value = titleFromName(name);
  }

  function useFrontendMode() {
    return state.hasFrontendModule && addToFrontendInput.checked;
  }

  function splitAssetsDirsActive() {
    return splitAssetsDirsRow.style.display !== 'none' && splitAssetsDirsInput.checked;
  }

  // Con ui.frontend, CSS y JS van siempre a la misma carpeta salvo "Personalizar..." (v2.1.12) — en
  // ese caso no hace falta ida y vuelta al lado de la extensión (no hay ninguna subcarpeta que
  // calcular, es la carpeta base tal cual), así que se refleja directo del lado del cliente.
  function syncFrontendAssetInputs() {
    if (!useFrontendMode() || splitAssetsDirsActive()) return;
    const dir = assetsDirInput.value;
    cssAssetsDirInput.value = dir;
    jsAssetsDirInput.value = dir;
  }

  function updateAssetsDirVisibility() {
    const anyAsset = generateStylesInput.checked || generateJsInput.checked;
    assetsDirBlock.style.display = anyAsset ? 'block' : 'none';
    if (!anyAsset) return;

    const frontend = useFrontendMode();
    const bothActive = generateStylesInput.checked && generateJsInput.checked;
    const showSplit = frontend && bothActive;

    splitAssetsDirsRow.style.display = showSplit ? 'flex' : 'none';
    splitAssetsDirsDesc.style.display = showSplit ? 'block' : 'none';
    if (!showSplit) splitAssetsDirsInput.checked = false;

    const splitActive = showSplit && splitAssetsDirsInput.checked;

    // Carpeta base: siempre visible en clientlib clásica; en ui.frontend se oculta cuando se
    // personaliza por separado, porque deja de ser la fuente de la que derivan CSS y JS.
    baseAssetsDirRow.style.display = !frontend || !splitActive ? 'block' : 'none';

    // Vista previa de 2 rutas de clientlib clásica (sin cambios desde v2.1.5 — no aplica a ui.frontend).
    cssDirPreview.style.display = !frontend && generateStylesInput.checked && assetsDirInput.value.trim() ? 'block' : 'none';
    jsDirPreview.style.display = !frontend && generateJsInput.checked && assetsDirInput.value.trim() ? 'block' : 'none';

    // ui.frontend: filas de estilos/JS por separado — visibles según cuál esté activo; editables
    // solo si "Personalizar..." está encendido, si no, de solo referencia (mismo valor que la base).
    cssAssetsDirRow.style.display = frontend && generateStylesInput.checked ? 'block' : 'none';
    jsAssetsDirRow.style.display = frontend && generateJsInput.checked ? 'block' : 'none';
    cssAssetsDirInput.disabled = !splitActive;
    jsAssetsDirInput.disabled = !splitActive;
    browseCssAssetsDirBtn.disabled = !splitActive;
    browseJsAssetsDirBtn.disabled = !splitActive;

    syncFrontendAssetInputs();
  }

  function requestAssetPaths() {
    if (useFrontendMode()) {
      syncFrontendAssetInputs();
      return;
    }
    const dir = assetsDirInput.value.trim();
    if (!dir) { cssDirPreview.textContent = ''; jsDirPreview.textContent = ''; updateAssetsDirVisibility(); return; }
    vscode.postMessage({ type: 'computeAssetPaths', assetsDir: dir, useFrontend: false });
  }

  function requestDefaultAssetsDir() {
    const name = nameInput.value.trim();
    if (!name || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) return;
    if (assetsDirInput.dataset.userEdited) return;
    if (!generateStylesInput.checked && !generateJsInput.checked) return;
    const versioned = versionedInput.checked;
    const conflictInfo = computeConflict(name, versioned);
    const useFrontend = state.hasFrontendModule && addToFrontendInput.checked;
    vscode.postMessage({
      type: 'computeDefaultAssetsDir',
      name: name,
      useFrontend: useFrontend,
      versionNumber: conflictInfo.nextVersion
    });
  }

  nameInput.addEventListener('input', function () { updatePreview(); requestDefaultAssetsDir(); });
  versionedInput.addEventListener('change', function () { updatePreview(); requestDefaultAssetsDir(); });
  titleInput.addEventListener('input', function () { titleInput.dataset.userEdited = '1'; });

  function updateFrontendVisibility() {
    const show = state.hasFrontendModule && (generateStylesInput.checked || generateJsInput.checked);
    frontendRow.style.display = show ? 'flex' : 'none';
    frontendDesc.style.display = show ? 'block' : 'none';
  }
  generateStylesInput.addEventListener('change', function () { updateFrontendVisibility(); updateAssetsDirVisibility(); requestDefaultAssetsDir(); requestAssetPaths(); updateStyleExtDefault(); });
  generateJsInput.addEventListener('change', function () { updateFrontendVisibility(); updateAssetsDirVisibility(); requestDefaultAssetsDir(); requestAssetPaths(); });
  addToFrontendInput.addEventListener('change', function () { updateAssetsDirVisibility(); requestDefaultAssetsDir(); requestAssetPaths(); updateStyleExtDefault(); });
  updateFrontendVisibility();
  updateAssetsDirVisibility();

  assetsDirInput.addEventListener('input', function () { assetsDirInput.dataset.userEdited = '1'; requestAssetPaths(); });
  browseAssetsDirBtn.addEventListener('click', function () { openFolderExplorer(assetsDirInput); });

  // "Personalizar carpetas de estilos y JS por separado" (ui.frontend, v2.1.12): al activarlo, los
  // 2 campos arrancan editables desde el valor compartido actual (si el usuario aún no los tocó a
  // mano); al desactivarlo, se olvida cualquier edición manual y vuelven a reflejar la carpeta base.
  splitAssetsDirsInput.addEventListener('change', function () {
    if (splitAssetsDirsInput.checked) {
      if (!cssAssetsDirInput.dataset.userEdited) cssAssetsDirInput.value = assetsDirInput.value;
      if (!jsAssetsDirInput.dataset.userEdited) jsAssetsDirInput.value = assetsDirInput.value;
    } else {
      delete cssAssetsDirInput.dataset.userEdited;
      delete jsAssetsDirInput.dataset.userEdited;
    }
    updateAssetsDirVisibility();
  });
  cssAssetsDirInput.addEventListener('input', function () { cssAssetsDirInput.dataset.userEdited = '1'; });
  jsAssetsDirInput.addEventListener('input', function () { jsAssetsDirInput.dataset.userEdited = '1'; });
  browseCssAssetsDirBtn.addEventListener('click', function () { openFolderExplorer(cssAssetsDirInput); });
  browseJsAssetsDirBtn.addEventListener('click', function () { openFolderExplorer(jsAssetsDirInput); });

  // Explorador interno de carpetas del proyecto (v2.1.12) — reemplaza al selector nativo del SO:
  // solo navega dentro de la raíz del proyecto (confinado también del lado de la extensión, ver
  // listProjectDir en componentCreate.ts), así el usuario no puede irse a cualquier parte del disco.
  let explorerTargetInput = null;
  let explorerCurrentPath = null;
  let explorerParentPath = null;

  function openFolderExplorer(targetInput) {
    explorerTargetInput = targetInput;
    const start = targetInput.value.trim() || state.projectRootPath;
    folderExplorerOverlay.style.display = 'flex';
    vscode.postMessage({ type: 'listDir', path: start });
  }

  function closeFolderExplorer() {
    folderExplorerOverlay.style.display = 'none';
    explorerTargetInput = null;
  }

  function renderDirListing(data) {
    explorerCurrentPath = data.path;
    explorerParentPath = data.parentPath;
    folderExplorerPath.textContent = data.relativePath || '.';
    folderExplorerUpBtn.disabled = !data.parentPath;
    folderExplorerList.innerHTML = '';
    if (!data.entries.length) {
      const empty = document.createElement('div');
      empty.className = 'folder-explorer-empty';
      empty.textContent = 'No hay subcarpetas aquí.';
      folderExplorerList.appendChild(empty);
      return;
    }
    data.entries.forEach(function (entry) {
      const item = document.createElement('div');
      item.className = 'folder-explorer-item';
      item.textContent = '📁 ' + entry.name;
      item.addEventListener('click', function () { vscode.postMessage({ type: 'listDir', path: entry.path }); });
      folderExplorerList.appendChild(item);
    });
  }

  folderExplorerUpBtn.addEventListener('click', function () {
    if (explorerParentPath) vscode.postMessage({ type: 'listDir', path: explorerParentPath });
  });
  folderExplorerCloseBtn.addEventListener('click', closeFolderExplorer);
  folderExplorerCancelBtn.addEventListener('click', closeFolderExplorer);
  folderExplorerUseBtn.addEventListener('click', function () {
    if (explorerTargetInput && explorerCurrentPath) {
      explorerTargetInput.value = explorerCurrentPath;
      explorerTargetInput.dataset.userEdited = '1';
      requestAssetPaths();
    }
    closeFolderExplorer();
  });

  createBtn.addEventListener('click', function () {
    const name = nameInput.value.trim();
    if (!name) return;
    const versioned = versionedInput.checked;
    const conflictInfo = computeConflict(name, versioned);
    if (conflictInfo.conflict) return;

    createBtn.disabled = true;
    statusText.textContent = 'Creando…';
    statusText.className = 'status';

    vscode.postMessage({
      type: 'create',
      payload: {
        name: name,
        title: titleInput.value.trim() || titleFromName(name),
        componentGroup: groupInput.value.trim() || (state.namespace || 'general'),
        versioned: versioned,
        generateStyles: generateStylesInput.checked,
        styleExt: styleExtSelect.value,
        generateJs: generateJsInput.checked,
        addToFrontend: state.hasFrontendModule ? addToFrontendInput.checked : false,
        assetsDir: (generateStylesInput.checked || generateJsInput.checked)
          ? ((splitAssetsDirsActive() ? cssAssetsDirInput.value.trim() : assetsDirInput.value.trim()) || undefined)
          : undefined,
        jsAssetsDir: splitAssetsDirsActive() ? (jsAssetsDirInput.value.trim() || undefined) : undefined,
        advanced: {
          editConfig: document.getElementById('advEditConfig').checked,
          designDialog: document.getElementById('advDesignDialog').checked,
          template: document.getElementById('advTemplate').checked,
          placeholder: document.getElementById('advPlaceholder').checked,
          openDialogAfterCreate: document.getElementById('advOpenDialog').checked
        }
      }
    });
  });

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.type === 'created') {
      if (msg.ok) {
        statusText.textContent = '✅ Componente creado.';
        statusText.className = 'status success';
      } else {
        statusText.textContent = '✘ ' + msg.message;
        statusText.className = 'status error';
        createBtn.disabled = false;
      }
    }
    if (msg.type === 'defaultAssetsDir') {
      if (!assetsDirInput.dataset.userEdited) assetsDirInput.value = msg.path;
      // Los campos separados de ui.frontend arrancan del mismo valor por defecto mientras el
      // usuario no los haya editado a mano por separado (ver "Personalizar...", v2.1.12).
      if (!cssAssetsDirInput.dataset.userEdited) cssAssetsDirInput.value = msg.path;
      if (!jsAssetsDirInput.dataset.userEdited) jsAssetsDirInput.value = msg.path;
      requestAssetPaths();
    }
    if (msg.type === 'assetPaths') {
      cssDirPreview.textContent = '📄 CSS: ' + msg.cssDir;
      jsDirPreview.textContent = '📄 JS: ' + msg.jsDir;
      updateAssetsDirVisibility();
    }
    if (msg.type === 'dirListing') {
      renderDirListing(msg);
    }
  });

  createBtn.disabled = true;
})();
</script>
</body>
</html>`;
}
