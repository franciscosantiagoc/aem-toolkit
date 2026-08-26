import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocView } from '../sync/docview';
import { serializeDocView } from './docviewSerializer';
import { fromDocView, toDocView, DialogTree, TOP_FIELD_TYPES } from './dialogModel';
import { getSyncTarget } from '../sync/credentials';
import { syncUris } from '../sync/syncRunner';

const EMPTY_DIALOG_SKELETON = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
  jcr:primaryType="cq:Dialog"
  jcr:title="Diálogo"
  sling:resourceType="cq/gui/components/authoring/dialog">
  <content jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/container">
    <items jcr:primaryType="nt:unstructured">
      <tabs jcr:primaryType="nt:unstructured" sling:resourceType="granite/ui/components/coral/foundation/tabs">
        <items jcr:primaryType="nt:unstructured">
          <general jcr:primaryType="nt:unstructured" jcr:title="General" sling:resourceType="granite/ui/components/coral/foundation/container">
            <items jcr:primaryType="nt:unstructured"/>
          </general>
        </items>
      </tabs>
    </items>
  </content>
</jcr:root>
`;

/** Resuelve, a partir de lo que el usuario seleccionó en el Explorador, la ruta al
 * `_cq_dialog/.content.xml` que hay que editar. Si seleccionó la carpeta `_cq_dialog`, se asume el
 * `.content.xml` dentro de ella. */
function resolveDialogFilePath(uri: vscode.Uri): string {
  const stat = fs.statSync(uri.fsPath);
  if (stat.isDirectory()) return path.join(uri.fsPath, '.content.xml');
  return uri.fsPath;
}

export async function openDialogEditor(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  if (!uri) {
    vscode.window.showWarningMessage('Selecciona la carpeta "_cq_dialog" (o su .content.xml) de un componente.');
    return;
  }

  let fsPath: string;
  try {
    fsPath = resolveDialogFilePath(uri);
  } catch {
    vscode.window.showErrorMessage('No se pudo acceder a la ruta seleccionada.');
    return;
  }

  if (!fs.existsSync(fsPath)) {
    const create = await vscode.window.showWarningMessage(
      `No se encontró "${path.basename(path.dirname(fsPath))}/.content.xml". ¿Crear un diálogo nuevo y vacío para empezar a editarlo?`,
      { modal: true },
      'Crear diálogo'
    );
    if (create !== 'Crear diálogo') return;
    fs.mkdirSync(path.dirname(fsPath), { recursive: true });
    fs.writeFileSync(fsPath, EMPTY_DIALOG_SKELETON, 'utf8');
  }

  let tree: DialogTree;
  let rawXml: string;
  try {
    rawXml = fs.readFileSync(fsPath, 'utf8');
    tree = fromDocView(parseDocView(rawXml));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`No se pudo interpretar este diálogo: ${detail}`);
    return;
  }

  const panel = vscode.window.createWebviewPanel('aemToolkitDialogEditor', `Diálogo: ${path.basename(path.dirname(fsPath))}`, vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true
  });

  panel.webview.html = renderDialogEditorHtml(tree);

  panel.webview.onDidReceiveMessage(async (msg: any) => {
    if (msg?.type !== 'save') return;
    try {
      const rebuilt = toDocView({ rootProperties: msg.rootProperties, tabs: msg.tabs });
      const xml = serializeDocView(rebuilt);
      fs.writeFileSync(fsPath, xml, 'utf8');
      panel.webview.postMessage({ type: 'saved', ok: true });

      const choice = await vscode.window.showInformationMessage(
        `Diálogo guardado en "${path.basename(fsPath)}". ¿Quieres subir estos cambios ahora?`,
        'Subir a Author',
        'Subir a Publish',
        'Ahora no'
      );
      if (choice === 'Subir a Author' || choice === 'Subir a Publish') {
        const which = choice === 'Subir a Author' ? 'author' : 'publish';
        const target = await getSyncTarget(context, which, vscode.Uri.file(fsPath));
        await syncUris([vscode.Uri.file(fsPath)], target, which === 'author' ? 'Author' : 'Publish');
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: 'saved', ok: false, message: detail });
      vscode.window.showErrorMessage(`No se pudo guardar el diálogo: ${detail}`);
    }
  });
}

function renderDialogEditorHtml(tree: DialogTree): string {
  const initialTreeJson = JSON.stringify(tree).replace(/</g, '\\u003c');
  const fieldTypesJson = JSON.stringify(TOP_FIELD_TYPES).replace(/</g, '\\u003c');

  return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; max-width: 900px; margin: 0 auto; }
  h2 { font-size: 15px; margin: 0 0 4px 0; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 14px; }
  label { display:block; font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); padding: 5px 8px; border-radius: 3px; font-size: 13px; margin-bottom: 8px;
  }
  button {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none;
    padding: 5px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.icon { background: transparent; color: var(--vscode-foreground); padding: 2px 6px; font-size: 13px; }
  button.icon:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.2)); }
  .tab-strip { display:flex; gap:4px; border-bottom: 1px solid var(--vscode-editorWidget-border, #3c3c3c); margin-bottom: 14px; flex-wrap: wrap; }
  .tab-btn { background: transparent; color: var(--vscode-foreground); border: none; border-bottom: 2px solid transparent; padding: 6px 10px; cursor:pointer; font-size:13px; }
  .tab-btn.active { border-bottom-color: var(--vscode-focusBorder, #007acc); font-weight: 600; }
  .tab-btn .x { margin-left:6px; opacity:.6; }
  .tab-btn .x:hover { opacity:1; color: var(--vscode-errorForeground); }
  .item-row {
    display:flex; align-items:center; gap:6px; padding:6px 8px; margin-bottom:4px;
    background: var(--vscode-editorWidget-background, rgba(128,128,128,0.08)); border-radius: 4px;
  }
  .item-row .badge { font-size:10px; text-transform:uppercase; letter-spacing:.03em; color: var(--vscode-descriptionForeground); border:1px solid var(--vscode-editorWidget-border,#3c3c3c); border-radius:3px; padding:1px 5px; }
  .item-row .label { flex:1; font-size:13px; }
  .item-row .label .sub { color: var(--vscode-descriptionForeground); font-size:11px; margin-left:6px; }
  .fieldset-block { border: 1px solid var(--vscode-editorWidget-border, #3c3c3c); border-radius: 6px; padding: 8px; margin: 6px 0 10px 22px; }
  .fieldset-title { font-size:12px; font-weight:600; margin-bottom:6px; color: var(--vscode-descriptionForeground); }
  .prop-editor { background: var(--vscode-editor-background); border: 1px dashed var(--vscode-editorWidget-border, #3c3c3c); border-radius:4px; padding:10px; margin: 4px 0 10px 0; }
  .prop-row { display:flex; gap:10px; }
  .prop-row > div { flex:1; }
  .add-row { display:flex; gap:6px; align-items:center; margin: 8px 0 14px 0; }
  .add-row select { width:auto; margin-bottom:0; }
  .add-row input { margin-bottom:0; }
  .option-row { display:flex; gap:6px; align-items:center; margin-bottom:6px; }
  .option-row input[type=text] { margin-bottom:0; }
  .note { color: var(--vscode-descriptionForeground); font-size:12px; font-style: italic; }
  .save-bar { position: sticky; bottom:0; background: var(--vscode-editor-background); padding: 10px 0; border-top: 1px solid var(--vscode-editorWidget-border, #3c3c3c); margin-top: 16px; display:flex; align-items:center; gap:10px; }
  .status { font-size:12px; color: var(--vscode-descriptionForeground); }
  .checkbox-row { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
  .checkbox-row input { width:auto; margin:0; }
</style>
</head>
<body>
  <h2>Editor de diálogo</h2>
  <div class="hint">
    Simplificación de esta versión: los layouts de columnas se aplanan a una sola columna al guardar, y solo hay edición
    dedicada para 10 tipos de campo — otros tipos ya presentes en el diálogo se conservan (se pueden reordenar/eliminar) pero
    sin editor propio todavía.
  </div>

  <label>Título del diálogo</label>
  <input type="text" id="dialogTitle" />

  <div class="tab-strip" id="tabStrip"></div>
  <div id="tabContent"></div>

  <div class="save-bar">
    <button id="saveBtn">💾 Guardar cambios</button>
    <span class="status" id="statusText"></span>
  </div>

<script>
(function () {
  const vscode = acquireVsCodeApi();
  const FIELD_TYPES = ${fieldTypesJson};
  const state = ${initialTreeJson};
  let activeTabIndex = 0;
  let uiIdCounter = 100000;

  function newUiId() { uiIdCounter += 1; return 'new-' + uiIdCounter; }

  function getRootTitle() {
    const p = state.rootProperties.find((p) => p.name === 'jcr:title');
    return p ? p.values[0] : '';
  }
  function setRootTitle(v) {
    const idx = state.rootProperties.findIndex((p) => p.name === 'jcr:title');
    if (idx >= 0) state.rootProperties[idx].values = [v];
    else state.rootProperties.push({ name: 'jcr:title', type: 'String', multi: false, values: [v] });
  }

  function getProp(item, name) {
    const p = item.properties.find((p) => p.name === name);
    return p ? p.values[0] : undefined;
  }
  function setProp(item, name, type, value) {
    const idx = item.properties.findIndex((p) => p.name === name);
    if (idx >= 0) item.properties[idx] = { name, type, multi: false, values: [value] };
    else item.properties.push({ name, type, multi: false, values: [value] });
  }
  function removeProp(item, name) {
    item.properties = item.properties.filter((p) => p.name !== name);
  }

  function sanitizeNodeName(label, siblingNames, fallbackPrefix) {
    const words = label.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\\s+/).filter(Boolean);
    let base = words.length === 0 ? '' : words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
    if (!base || /^[0-9]/.test(base)) base = fallbackPrefix + base;
    let candidate = base, suffix = 1;
    const taken = new Set(siblingNames);
    while (taken.has(candidate)) { suffix += 1; candidate = base + suffix; }
    return candidate;
  }

  function findTypeDef(id) { return FIELD_TYPES.find((t) => t.id === id); }

  function createNewItem(typeId, label, siblingNames) {
    const def = findTypeDef(typeId);
    const nodeName = sanitizeNodeName(label, siblingNames, (typeId === 'tab' || typeId === 'fieldset') ? 'grupo' : 'campo');
    if (typeId === 'tab' || typeId === 'fieldset') {
      return {
        uiId: newUiId(), kind: typeId, nodeName,
        properties: [{ name: 'jcr:title', type: 'String', multi: false, values: [label || (typeId === 'tab' ? 'Nueva pestaña' : 'Nuevo agrupador')] }],
        children: [], rawNode: { name: nodeName, properties: [], children: [] }
      };
    }
    const properties = [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
      { name: 'fieldLabel', type: 'String', multi: false, values: [label || def.label] },
      { name: 'name', type: 'String', multi: false, values: ['./' + nodeName] }
    ];
    if (typeId === 'pathfield') properties.push({ name: 'rootPath', type: 'String', multi: false, values: ['/content/dam'] });
    if (typeId === 'checkbox') {
      properties.push({ name: 'value', type: 'Boolean', multi: false, values: ['true'] });
      properties.push({ name: 'uncheckedValue', type: 'Boolean', multi: false, values: ['false'] });
    }
    const rawNode = { name: nodeName, properties: properties.slice(), children: [] };
    if (typeId === 'select') {
      rawNode.children.push({ name: 'items', properties: [{ name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] }],
        children: [{ name: 'item0', properties: [
          { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
          { name: 'text', type: 'String', multi: false, values: ['Opción 1'] },
          { name: 'value', type: 'String', multi: false, values: ['opcion1'] }
        ], children: [] }] });
    }
    if (typeId === 'multifield') {
      rawNode.children.push({ name: 'field', properties: [
        { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
        { name: 'sling:resourceType', type: 'String', multi: false, values: [findTypeDef('textfield').resourceType] },
        { name: 'fieldLabel', type: 'String', multi: false, values: ['Valor'] },
        { name: 'name', type: 'String', multi: false, values: ['./' + nodeName] }
      ], children: [] });
    }
    return { uiId: newUiId(), kind: typeId, nodeName, properties, children: [], rawNode };
  }

  function getSelectOptions(item) {
    const optsNode = item.rawNode.children.find((c) => c.name === 'items');
    if (!optsNode) return [];
    return optsNode.children.map((o) => ({
      text: (o.properties.find((p) => p.name === 'text') || {}).values ? o.properties.find((p) => p.name === 'text').values[0] : '',
      value: (o.properties.find((p) => p.name === 'value') || {}).values ? o.properties.find((p) => p.name === 'value').values[0] : '',
      selected: !!o.properties.find((p) => p.name === 'selected')
    }));
  }
  function setSelectOptions(item, options) {
    const children = options.map((opt, i) => ({
      name: 'item' + i,
      properties: [
        { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
        { name: 'text', type: 'String', multi: false, values: [opt.text] },
        { name: 'value', type: 'String', multi: false, values: [opt.value] },
        ...(opt.selected ? [{ name: 'selected', type: 'Boolean', multi: false, values: ['true'] }] : [])
      ],
      children: []
    }));
    const node = { name: 'items', properties: [{ name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] }], children };
    const idx = item.rawNode.children.findIndex((c) => c.name === 'items');
    if (idx >= 0) item.rawNode.children[idx] = node; else item.rawNode.children.push(node);
  }

  function getMultifieldInner(item) {
    const f = item.rawNode.children.find((c) => c.name === 'field');
    if (!f) return { kind: 'textfield', propertyName: './valor', label: 'Valor' };
    const rt = (f.properties.find((p) => p.name === 'sling:resourceType') || {}).values;
    const known = FIELD_TYPES.find((t) => t.category === 'field' && rt && rt[0] && rt[0].endsWith(t.resourceType.split('/').pop()));
    return {
      kind: known ? known.id : 'textfield',
      propertyName: (f.properties.find((p) => p.name === 'name') || {}).values ? f.properties.find((p) => p.name === 'name').values[0] : './valor',
      label: (f.properties.find((p) => p.name === 'fieldLabel') || {}).values ? f.properties.find((p) => p.name === 'fieldLabel').values[0] : 'Valor'
    };
  }
  function setMultifieldInner(item, inner) {
    const def = findTypeDef(inner.kind) || findTypeDef('textfield');
    const node = { name: 'field', properties: [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
      { name: 'fieldLabel', type: 'String', multi: false, values: [inner.label] },
      { name: 'name', type: 'String', multi: false, values: [inner.propertyName] }
    ], children: [] };
    const idx = item.rawNode.children.findIndex((c) => c.name === 'field');
    if (idx >= 0) item.rawNode.children[idx] = node; else item.rawNode.children.push(node);
  }

  // --- Búsqueda de un item + su lista contenedora por uiId (para reordenar/editar/eliminar) ---
  function findContainingList(uiId, list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].uiId === uiId) return { list, index: i };
      if (list[i].children && list[i].children.length) {
        const found = findContainingList(uiId, list[i].children);
        if (found) return found;
      }
    }
    return undefined;
  }
  function findItem(uiId) {
    for (const tab of state.tabs) {
      if (tab.uiId === uiId) return tab;
      const stack = [...tab.children];
      while (stack.length) {
        const it = stack.pop();
        if (it.uiId === uiId) return it;
        if (it.children) stack.push(...it.children);
      }
    }
    return undefined;
  }

  let expandedEditors = new Set();

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function typeLabel(kind) {
    const def = findTypeDef(kind);
    return def ? def.label : 'Avanzado (' + kind + ')';
  }

  function renderPropertyEditor(item) {
    const box = el('div', { class: 'prop-editor' });
    if (item.kind === 'tab' || item.kind === 'fieldset') {
      box.appendChild(el('label', {}, 'Título'));
      const input = el('input', { type: 'text', value: getProp(item, 'jcr:title') || '' });
      input.addEventListener('input', () => { setProp(item, 'jcr:title', 'String', input.value); renderActiveTab(); });
      box.appendChild(input);
      return box;
    }
    if (item.kind === 'unknown') {
      box.appendChild(el('div', { class: 'note' }, 'Este tipo de campo (', (item.rawNode.properties.find(p=>p.name==='sling:resourceType')||{values:['?']}).values[0], ') todavía no tiene edición dedicada — se conserva tal cual al guardar.'));
      return box;
    }

    const row1 = el('div', { class: 'prop-row' });
    const labelDiv = el('div', {}, el('label', {}, 'Etiqueta'), (() => {
      const i = el('input', { type: 'text', value: getProp(item, 'fieldLabel') || '' });
      i.addEventListener('input', () => { setProp(item, 'fieldLabel', 'String', i.value); render(); });
      return i;
    })());
    const nameDiv = el('div', {}, el('label', {}, 'Nombre de propiedad (name)'), (() => {
      const i = el('input', { type: 'text', value: getProp(item, 'name') || '' });
      i.addEventListener('input', () => setProp(item, 'name', 'String', i.value));
      return i;
    })());
    row1.appendChild(labelDiv); row1.appendChild(nameDiv);
    box.appendChild(row1);

    box.appendChild(el('label', {}, 'Descripción'));
    const descInput = el('input', { type: 'text', value: getProp(item, 'fieldDescription') || '' });
    descInput.addEventListener('input', () => setProp(item, 'fieldDescription', 'String', descInput.value));
    box.appendChild(descInput);

    if (item.kind === 'textfield' || item.kind === 'textarea' || item.kind === 'richtext' || item.kind === 'numberfield') {
      box.appendChild(el('label', {}, 'Valor por defecto'));
      const v = el('input', { type: item.kind === 'numberfield' ? 'number' : 'text', value: getProp(item, 'value') || '' });
      v.addEventListener('input', () => setProp(item, 'value', 'String', v.value));
      box.appendChild(v);
    }

    if (item.kind === 'pathfield') {
      box.appendChild(el('label', {}, 'Ruta raíz (rootPath)'));
      const v = el('input', { type: 'text', value: getProp(item, 'rootPath') || '/content/dam' });
      v.addEventListener('input', () => setProp(item, 'rootPath', 'String', v.value));
      box.appendChild(v);
    }

    const reqRow = el('div', { class: 'checkbox-row' });
    const reqCheck = el('input', { type: 'checkbox' });
    reqCheck.checked = getProp(item, 'required') === 'true';
    reqCheck.addEventListener('change', () => {
      if (reqCheck.checked) setProp(item, 'required', 'Boolean', 'true'); else removeProp(item, 'required');
    });
    reqRow.appendChild(reqCheck); reqRow.appendChild(el('span', {}, 'Obligatorio'));
    box.appendChild(reqRow);

    if (item.kind === 'select') {
      box.appendChild(el('label', {}, 'Opciones'));
      const optsWrap = el('div', {});
      function renderOptions() {
        optsWrap.innerHTML = '';
        const opts = getSelectOptions(item);
        opts.forEach((opt, i) => {
          const row = el('div', { class: 'option-row' });
          const textIn = el('input', { type: 'text', placeholder: 'Texto visible' }); textIn.value = opt.text;
          const valIn = el('input', { type: 'text', placeholder: 'Valor' }); valIn.value = opt.value;
          const selIn = el('input', { type: 'checkbox' }); selIn.checked = opt.selected;
          const del = el('button', { class: 'icon' }, '🗑️');
          textIn.addEventListener('input', () => { opts[i].text = textIn.value; setSelectOptions(item, opts); });
          valIn.addEventListener('input', () => { opts[i].value = valIn.value; setSelectOptions(item, opts); });
          selIn.addEventListener('change', () => { opts[i].selected = selIn.checked; setSelectOptions(item, opts); });
          del.addEventListener('click', () => { opts.splice(i, 1); setSelectOptions(item, opts); renderOptions(); });
          row.appendChild(textIn); row.appendChild(valIn); row.appendChild(el('span', {}, 'predet.')); row.appendChild(selIn); row.appendChild(del);
          optsWrap.appendChild(row);
        });
      }
      renderOptions();
      box.appendChild(optsWrap);
      const addOpt = el('button', { class: 'secondary' }, '+ Agregar opción');
      addOpt.addEventListener('click', () => {
        const opts = getSelectOptions(item);
        opts.push({ text: 'Opción', value: 'opcion' + (opts.length + 1), selected: false });
        setSelectOptions(item, opts);
        renderOptions();
      });
      box.appendChild(addOpt);
    }

    if (item.kind === 'multifield') {
      const inner = getMultifieldInner(item);
      box.appendChild(el('label', {}, 'Tipo de campo repetido'));
      const innerSelect = el('select', {});
      FIELD_TYPES.filter((t) => t.category === 'field' && t.id !== 'multifield').forEach((t) => {
        const o = el('option', { value: t.id }, t.label);
        if (t.id === inner.kind) o.setAttribute('selected', 'selected');
        innerSelect.appendChild(o);
      });
      innerSelect.addEventListener('change', () => { inner.kind = innerSelect.value; setMultifieldInner(item, inner); });
      box.appendChild(innerSelect);

      box.appendChild(el('label', {}, 'Etiqueta del campo repetido'));
      const innerLabel = el('input', { type: 'text', value: inner.label });
      innerLabel.addEventListener('input', () => { inner.label = innerLabel.value; setMultifieldInner(item, inner); });
      box.appendChild(innerLabel);

      box.appendChild(el('label', {}, 'Nombre de propiedad del campo repetido'));
      const innerName = el('input', { type: 'text', value: inner.propertyName });
      innerName.addEventListener('input', () => { inner.propertyName = innerName.value; setMultifieldInner(item, inner); });
      box.appendChild(innerName);
    }

    return box;
  }

  function renderAddRow(targetChildren, siblingNamesFn) {
    const row = el('div', { class: 'add-row' });
    const select = el('select', {});
    FIELD_TYPES.forEach((t) => select.appendChild(el('option', { value: t.id }, t.label)));
    const labelInput = el('input', { type: 'text', placeholder: 'Etiqueta (opcional)' });
    const addBtn = el('button', {}, '+ Agregar');
    addBtn.addEventListener('click', () => {
      const item = createNewItem(select.value, labelInput.value.trim(), siblingNamesFn());
      targetChildren.push(item);
      labelInput.value = '';
      render();
    });
    row.appendChild(select); row.appendChild(labelInput); row.appendChild(addBtn);
    return row;
  }

  function renderItemList(container, items) {
    items.forEach((item, idx) => {
      const row = el('div', { class: 'item-row' });
      const up = el('button', { class: 'icon', title: 'Subir' }, '▲');
      up.disabled = idx === 0;
      up.addEventListener('click', () => { [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; render(); });
      const down = el('button', { class: 'icon', title: 'Bajar' }, '▼');
      down.disabled = idx === items.length - 1;
      down.addEventListener('click', () => { [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; render(); });

      const badge = el('span', { class: 'badge' }, typeLabel(item.kind));
      const label = el('span', { class: 'label' },
        (getProp(item, 'fieldLabel') || getProp(item, 'jcr:title') || item.nodeName),
        el('span', { class: 'sub' }, item.nodeName)
      );

      const editBtn = el('button', { class: 'icon', title: 'Editar propiedades' }, '✏️');
      editBtn.addEventListener('click', () => {
        if (expandedEditors.has(item.uiId)) expandedEditors.delete(item.uiId); else expandedEditors.add(item.uiId);
        render();
      });
      const delBtn = el('button', { class: 'icon', title: 'Eliminar' }, '🗑️');
      delBtn.addEventListener('click', () => {
        const i = items.indexOf(item);
        if (i >= 0) items.splice(i, 1);
        render();
      });

      row.appendChild(up); row.appendChild(down); row.appendChild(badge); row.appendChild(label); row.appendChild(editBtn); row.appendChild(delBtn);
      container.appendChild(row);

      if (expandedEditors.has(item.uiId)) {
        container.appendChild(renderPropertyEditor(item));
      }

      if (item.kind === 'fieldset') {
        const block = el('div', { class: 'fieldset-block' });
        block.appendChild(el('div', { class: 'fieldset-title' }, '📦 ' + (getProp(item, 'jcr:title') || 'Agrupador')));
        renderItemList(block, item.children);
        block.appendChild(renderAddRow(item.children, () => item.children.map((c) => c.nodeName)));
        container.appendChild(block);
      }
    });
  }

  function renderTabStrip() {
    const strip = document.getElementById('tabStrip');
    strip.innerHTML = '';
    state.tabs.forEach((tab, i) => {
      const btn = el('button', { class: 'tab-btn' + (i === activeTabIndex ? ' active' : '') },
        (getProp(tab, 'jcr:title') || tab.nodeName),
        (() => {
          const x = el('span', { class: 'x' }, '✕');
          x.addEventListener('click', (e) => {
            e.stopPropagation();
            state.tabs.splice(i, 1);
            if (activeTabIndex >= state.tabs.length) activeTabIndex = Math.max(0, state.tabs.length - 1);
            render();
          });
          return x;
        })()
      );
      btn.addEventListener('click', () => { activeTabIndex = i; render(); });
      strip.appendChild(btn);
    });
    const addTabBtn = el('button', { class: 'tab-btn' }, '+ Pestaña');
    addTabBtn.addEventListener('click', () => {
      const item = createNewItem('tab', 'Nueva pestaña', state.tabs.map((t) => t.nodeName));
      state.tabs.push(item);
      activeTabIndex = state.tabs.length - 1;
      render();
    });
    strip.appendChild(addTabBtn);
  }

  function renderActiveTab() {
    const content = document.getElementById('tabContent');
    content.innerHTML = '';
    const tab = state.tabs[activeTabIndex];
    if (!tab) { content.appendChild(el('div', { class: 'note' }, 'No hay pestañas — agrega una arriba.')); return; }
    renderItemList(content, tab.children);
    content.appendChild(renderAddRow(tab.children, () => tab.children.map((c) => c.nodeName)));
  }

  function render() {
    renderTabStrip();
    renderActiveTab();
  }

  document.getElementById('dialogTitle').value = getRootTitle();
  document.getElementById('dialogTitle').addEventListener('input', (e) => setRootTitle(e.target.value));

  document.getElementById('saveBtn').addEventListener('click', () => {
    document.getElementById('statusText').textContent = 'Guardando...';
    vscode.postMessage({ type: 'save', rootProperties: state.rootProperties, tabs: state.tabs });
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'saved') {
      document.getElementById('statusText').textContent = msg.ok ? '✔ Guardado' : ('✘ ' + msg.message);
    }
  });

  render();
})();
</script>
</body>
</html>`;
}
