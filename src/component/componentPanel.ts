import * as vscode from 'vscode';
import { AemProjectInfo } from '../core/projectDetector';
import { ComponentsFolderScan } from './componentDetector';
import { getConfig } from '../config';

export interface ComponentPanelInitialState {
  namespace: string;
  hasFrontendModule: boolean;
  scan: ComponentsFolderScan;
  cssJsDefault: boolean;
}

export function buildComponentPanelInitialState(project: AemProjectInfo, scan: ComponentsFolderScan): ComponentPanelInitialState {
  return {
    namespace: project.namespace ?? '<namespace>',
    hasFrontendModule: project.hasFrontendModule,
    scan,
    cssJsDefault: getConfig().componentsCreateCssJsByDefault
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
      <span class="switch-label">Abrir el diálogo en el editor visual apenas se cree el componente</span>
    </div>
  </details>

  <div class="save-bar">
    <button id="createBtn">✅ Crear componente</button>
    <span class="status" id="statusText"></span>
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
  const createBtn = document.getElementById('createBtn');
  const statusText = document.getElementById('statusText');

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
  styleExtSelect.value = scan.dominantStyleExt || detected[0] || 'css';

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

  nameInput.addEventListener('input', updatePreview);
  versionedInput.addEventListener('change', updatePreview);
  titleInput.addEventListener('input', function () { titleInput.dataset.userEdited = '1'; });

  function updateFrontendVisibility() {
    const show = state.hasFrontendModule && (generateStylesInput.checked || generateJsInput.checked);
    frontendRow.style.display = show ? 'flex' : 'none';
    frontendDesc.style.display = show ? 'block' : 'none';
  }
  generateStylesInput.addEventListener('change', updateFrontendVisibility);
  generateJsInput.addEventListener('change', updateFrontendVisibility);
  updateFrontendVisibility();

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
  });

  createBtn.disabled = true;
})();
</script>
</body>
</html>`;
}
