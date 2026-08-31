import { DocViewNode, DocViewProperty } from '../sync/docview';
import { FieldTypeDef, findFieldTypeById, findFieldTypeByResourceType, isFieldsetResourceType } from './fieldCatalog';

/**
 * Modelo simplificado que usa el editor visual de diálogos, construido a partir del árbol genérico
 * de `docview.ts` (el mismo que ya usa la sincronización). Simplificaciones deliberadas de esta
 * versión, documentadas también en FEATURES.md:
 *  - Un diálogo puede representarse SIN pestañas (`hasTabs: false`, campos planos en `items`) o CON
 *    pestañas (`hasTabs: true`, lista de pestañas en `tabs`) — a diferencia de v1.4.0, ya NO se
 *    envuelve forzosamente en una pestaña "General" sintética si el original no usaba pestañas. El
 *    editor solo pasa a modo pestañas cuando el usuario lo pide explícitamente ("Agregar pestañas"),
 *    y en ese momento los campos planos existentes se mueven automáticamente a la primera pestaña.
 *  - No se permite anidar una segunda estructura de pestañas dentro de una ya existente (ver
 *    dialogPanel.ts: "tab" se excluye del selector genérico de "Agregar..." en cualquier nivel — la
 *    única forma de crear pestañas adicionales es el botón dedicado de la tira de pestañas, que
 *    siempre agrega hermanas de las ya existentes, nunca anidadas).
 *  - Los layouts de columnas (`fixedcolumns`/`column`) se APLANAN a una sola lista por pestaña o
 *    agrupador al cargar, y NUNCA se reintroducen al guardar (siempre queda en una sola columna).
 *  - Solo los tipos de `fieldCatalog.ts` tienen edición dedicada. Cualquier otro tipo de campo ya
 *    presente en el diálogo se conserva como ítem "avanzado" (`kind: 'unknown'`) — se puede
 *    reordenar y eliminar, pero no editar en detalle todavía, y su nodo XML original se preserva
 *    tal cual al guardar (nunca se destruye por no tener editor propio).
 */

let uiIdCounter = 0;
function newUiId(): string {
  uiIdCounter += 1;
  return `item-${uiIdCounter}`;
}

export interface SelectOptionItem {
  text: string;
  value: string;
  selected: boolean;
}

export interface MultifieldInner {
  kind: string; // uno de los ids de campo de fieldCatalog (nunca 'multifield' — no se soporta anidar)
  propertyName: string; // el "name" (ej. "./tag") del campo repetido
  label: string;
}

export interface DialogItem {
  uiId: string;
  /** 'tab' | 'fieldset' | un id de fieldCatalog (textfield, select, ...) | 'unknown'. */
  kind: string;
  nodeName: string;
  /** Copia editable de los atributos propios del nodo (para 'tab'/'fieldset' excluye
   * jcr:primaryType/sling:resourceType, que se regeneran siempre al guardar). */
  properties: DocViewProperty[];
  /** Solo relevante para 'tab' y 'fieldset'. */
  children: DialogItem[];
  /** Nodo original completo (con sus hijos crudos tal cual) — fuente de verdad para lo que no se
   * edita con un formulario dedicado: opciones de 'select'/'radiogroup', campo interno de
   * 'multifield', y cualquier contenido de un ítem 'unknown'. Para ítems nuevos, es un nodo
   * sintético con los valores por defecto del tipo. */
  rawNode: DocViewNode;
}

export interface DialogTree {
  /** Propiedades del propio nodo cq:Dialog (jcr:primaryType, jcr:title, sling:resourceType...). */
  rootProperties: DocViewProperty[];
  /** true si el diálogo usa una estructura de pestañas (nodo `.../tabs` bajo `content`). */
  hasTabs: boolean;
  /** Relevante solo cuando hasTabs=true. */
  tabs: DialogItem[];
  /** Relevante solo cuando hasTabs=false: ítems planos directamente bajo `content`. */
  items: DialogItem[];
}

const TABS_RESOURCE_TYPE = 'granite/ui/components/coral/foundation/tabs';
const CONTAINER_RESOURCE_TYPE = 'granite/ui/components/coral/foundation/container';

function getPropValue(node: DocViewNode, name: string): string | undefined {
  return node.properties.find((p) => p.name === name)?.values[0];
}

function normalizedResourceType(node: DocViewNode): string | undefined {
  return getPropValue(node, 'sling:resourceType')?.replace(/^\/+/, '');
}

function itemsChild(node: DocViewNode): DocViewNode | undefined {
  return node.children.find((c) => c.name === 'items');
}

function findNodeByResourceTypeSuffix(node: DocViewNode, suffix: string): DocViewNode | undefined {
  if (normalizedResourceType(node)?.endsWith(suffix)) return node;
  for (const child of node.children) {
    const found = findNodeByResourceTypeSuffix(child, suffix);
    if (found) return found;
  }
  return undefined;
}

/** Dado un nodo "contenedor" (pestaña, agrupador, o el propio `content`), devuelve la lista plana
 * de sus ítems reales — descendiendo automáticamente a través de un layout de columnas
 * (`fixedcolumns`/`column`) si lo hay, concatenando el contenido de todas las columnas en orden. */
function collectFlatItems(containerNode: DocViewNode): DocViewNode[] {
  const items = itemsChild(containerNode);
  if (!items) return [];
  const out: DocViewNode[] = [];
  for (const child of items.children) {
    const rt = normalizedResourceType(child);
    if (rt?.endsWith('/fixedcolumns')) {
      const colsItems = itemsChild(child);
      for (const col of colsItems?.children ?? []) {
        out.push(...collectFlatItems(col));
      }
    } else {
      out.push(child);
    }
  }
  return out;
}

function classifyItem(node: DocViewNode): DialogItem {
  const rt = getPropValue(node, 'sling:resourceType');
  if (isFieldsetResourceType(rt)) {
    return {
      uiId: newUiId(),
      kind: 'fieldset',
      nodeName: node.name,
      properties: node.properties.filter((p) => p.name !== 'sling:resourceType' && p.name !== 'jcr:primaryType'),
      children: collectFlatItems(node).map(classifyItem),
      rawNode: node
    };
  }
  const known = findFieldTypeByResourceType(rt);
  return {
    uiId: newUiId(),
    kind: known ? known.id : 'unknown',
    nodeName: node.name,
    properties: node.properties,
    children: [],
    rawNode: node
  };
}

function nodeToTab(node: DocViewNode): DialogItem {
  return {
    uiId: newUiId(),
    kind: 'tab',
    nodeName: node.name,
    properties: node.properties.filter((p) => p.name !== 'sling:resourceType' && p.name !== 'jcr:primaryType'),
    children: collectFlatItems(node).map(classifyItem),
    rawNode: node
  };
}

/** Interpreta el árbol crudo (la raíz del `_cq_dialog/.content.xml`, es decir el propio `cq:Dialog`)
 * en el modelo simplificado que usa el editor visual. Si el diálogo no tiene una estructura de
 * pestañas, se representa con `hasTabs: false` y sus campos planos en `items` — ya NO se envuelve
 * en una pestaña "General" sintética (cambio de v1.5.0). */
export function fromDocView(root: DocViewNode): DialogTree {
  const contentNode = root.children.find((c) => c.name === 'content') ?? root;
  const tabsNode = findNodeByResourceTypeSuffix(contentNode, '/tabs');

  if (tabsNode) {
    const tabItemsNode = itemsChild(tabsNode);
    const tabs = (tabItemsNode?.children ?? []).map(nodeToTab);
    return { rootProperties: root.properties, hasTabs: true, tabs, items: [] };
  }

  const flat = collectFlatItems(contentNode);
  return { rootProperties: root.properties, hasTabs: false, tabs: [], items: flat.map(classifyItem) };
}

function wrapItems(children: DocViewNode[]): DocViewNode {
  return {
    name: 'items',
    properties: [{ name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] }],
    children
  };
}

function containerNode(name: string, resourceType: string, extraProps: DocViewProperty[], children: DialogItem[]): DocViewNode {
  return {
    name,
    properties: [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [resourceType] },
      ...extraProps
    ],
    children: [wrapItems(children.map(dialogItemToNode))]
  };
}

function dialogItemToNode(item: DialogItem): DocViewNode {
  if (item.kind === 'tab') return containerNode(item.nodeName, CONTAINER_RESOURCE_TYPE, item.properties, item.children);
  if (item.kind === 'fieldset') {
    const fieldset = findFieldTypeById('fieldset')!;
    return containerNode(item.nodeName, fieldset.resourceType, item.properties, item.children);
  }
  // Campo hoja (conocido o 'unknown'): las propiedades editables son la fuente de verdad para los
  // atributos, pero los hijos crudos (opciones de select/radiogroup, campo interno de multifield,
  // cualquier cosa de un 'unknown') se preservan de rawNode sin tocar.
  return { name: item.nodeName, properties: item.properties, children: item.rawNode.children };
}

/** Reconstruye el árbol completo `docview` (listo para `serializeDocView`) a partir del modelo
 * simplificado — inversa de `fromDocView`. Si `hasTabs` es false, `content` contiene los ítems
 * planos directamente (sin ningún nodo `tabs` de por medio) — un diálogo editado sin pestañas se
 * guarda sin pestañas. Si es true, reconstruye tabs desde cero (por eso el layout de columnas
 * nunca se reintroduce). */
export function toDocView(tree: DialogTree): DocViewNode {
  let contentChildren: DocViewNode[];
  if (tree.hasTabs) {
    const tabsNode = containerNode('tabs', TABS_RESOURCE_TYPE, [], []);
    tabsNode.children = [wrapItems(tree.tabs.map(dialogItemToNode))];
    contentChildren = [tabsNode];
  } else {
    contentChildren = tree.items.map(dialogItemToNode);
  }

  const content = containerNode('content', CONTAINER_RESOURCE_TYPE, [], []);
  content.children = [wrapItems(contentChildren)];

  return { name: 'jcr:root', properties: tree.rootProperties, children: [content] };
}

// ---------------------------------------------------------------------------------------------
// Accesores para los datos anidados de 'select'/'radiogroup' (opciones) y 'multifield' (campo
// interno) — leen y escriben directamente sobre item.rawNode.children, que es lo que
// dialogItemToNode reutiliza.
// ---------------------------------------------------------------------------------------------

export function getSelectOptions(item: DialogItem): SelectOptionItem[] {
  const optionsNode = item.rawNode.children.find((c) => c.name === 'items');
  if (!optionsNode) return [];
  return optionsNode.children.map((opt) => ({
    text: getPropValue(opt, 'text') ?? '',
    value: getPropValue(opt, 'value') ?? '',
    selected: getPropValue(opt, 'selected') === 'true'
  }));
}

export function setSelectOptions(item: DialogItem, options: SelectOptionItem[]): void {
  const children: DocViewNode[] = options.map((opt, i) => ({
    name: `item${i}`,
    properties: [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'text', type: 'String', multi: false, values: [opt.text] },
      { name: 'value', type: 'String', multi: false, values: [opt.value] },
      ...(opt.selected ? [{ name: 'selected', type: 'Boolean', multi: false, values: ['true'] }] : [])
    ],
    children: []
  }));
  const optionsNode: DocViewNode = { name: 'items', properties: [{ name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] }], children };
  const idx = item.rawNode.children.findIndex((c) => c.name === 'items');
  if (idx >= 0) item.rawNode.children[idx] = optionsNode;
  else item.rawNode.children.push(optionsNode);
}

export function getMultifieldInner(item: DialogItem): MultifieldInner | undefined {
  const fieldNode = item.rawNode.children.find((c) => c.name === 'field');
  if (!fieldNode) return undefined;
  const known = findFieldTypeByResourceType(getPropValue(fieldNode, 'sling:resourceType'));
  return {
    kind: known?.id ?? 'textfield',
    propertyName: getPropValue(fieldNode, 'name') ?? './item',
    label: getPropValue(fieldNode, 'fieldLabel') ?? ''
  };
}

export function setMultifieldInner(item: DialogItem, inner: MultifieldInner): void {
  const typeDef = findFieldTypeById(inner.kind) ?? findFieldTypeById('textfield')!;
  const fieldNode: DocViewNode = {
    name: 'field',
    properties: [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [typeDef.resourceType] },
      { name: 'fieldLabel', type: 'String', multi: false, values: [inner.label] },
      { name: 'name', type: 'String', multi: false, values: [inner.propertyName] }
    ],
    children: []
  };
  const idx = item.rawNode.children.findIndex((c) => c.name === 'field');
  if (idx >= 0) item.rawNode.children[idx] = fieldNode;
  else item.rawNode.children.push(fieldNode);
}

// ---------------------------------------------------------------------------------------------
// Utilidades varias usadas por el panel (nombres de nodo, valores por defecto de ítems nuevos).
// ---------------------------------------------------------------------------------------------

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Deriva un nombre de nodo JCR válido a partir de una etiqueta libre (ej. "Texto extra" ->
 * "textoExtra"), evitando choques con los nombres de los hermanos ya existentes. */
export function sanitizeNodeName(label: string, siblingNames: string[], fallbackPrefix = 'item'): string {
  const words = stripDiacritics(label)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words.length === 0 ? '' : words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  if (!base || /^[0-9]/.test(base)) base = `${fallbackPrefix}${base}`;
  let candidate = base;
  let suffix = 1;
  const taken = new Set(siblingNames);
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

const DEFAULT_PROPS_BY_TYPE: Record<string, DocViewProperty[]> = {
  pathfield: [{ name: 'rootPath', type: 'String', multi: false, values: ['/content/dam'] }],
  pathbrowser: [{ name: 'rootPath', type: 'String', multi: false, values: ['/content/dam'] }],
  tags: [{ name: 'rootPath', type: 'String', multi: false, values: ['/content/cq:tags'] }],
  checkbox: [
    { name: 'value', type: 'Boolean', multi: false, values: ['true'] },
    { name: 'uncheckedValue', type: 'Boolean', multi: false, values: ['false'] }
  ],
  switch: [
    { name: 'value', type: 'Boolean', multi: false, values: ['true'] },
    { name: 'uncheckedValue', type: 'Boolean', multi: false, values: ['false'] }
  ],
  datepicker: [
    { name: 'type', type: 'String', multi: false, values: ['date'] },
    { name: 'displayedFormat', type: 'String', multi: false, values: ['YYYY-MM-DD'] }
  ],
  fileupload: [
    { name: 'mimeTypes', type: 'String', multi: true, values: ['image/gif', 'image/jpeg', 'image/png'] },
    { name: 'useHTML5', type: 'Boolean', multi: false, values: ['true'] }
  ]
};

/** Crea un DialogItem nuevo (recién agregado desde el selector "Agregar...") con valores por
 * defecto razonables para su tipo. `label` es lo que el usuario escribió al agregarlo. */
export function createNewItem(typeId: string, label: string, siblingNodeNames: string[]): DialogItem {
  const typeDef = findFieldTypeById(typeId);
  const nodeName = sanitizeNodeName(label, siblingNodeNames, typeId === 'tab' || typeId === 'fieldset' ? 'grupo' : 'campo');

  if (typeId === 'tab' || typeId === 'fieldset') {
    return {
      uiId: newUiId(),
      kind: typeId,
      nodeName,
      properties: [{ name: 'jcr:title', type: 'String', multi: false, values: [label || (typeId === 'tab' ? 'Nueva pestaña' : 'Nuevo agrupador')] }],
      children: [],
      rawNode: { name: nodeName, properties: [], children: [] }
    };
  }

  const def: FieldTypeDef = typeDef ?? findFieldTypeById('textfield')!;

  // "heading" no se enlaza a ninguna propiedad JCR: no lleva fieldLabel/name, solo un texto estático.
  if (def.id === 'heading') {
    const properties: DocViewProperty[] = [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
      { name: 'text', type: 'String', multi: false, values: [label || 'Encabezado'] }
    ];
    const rawNode: DocViewNode = { name: nodeName, properties, children: [] };
    return { uiId: newUiId(), kind: def.id, nodeName, properties, children: [], rawNode };
  }

  // "hidden" solo necesita nombre técnico + valor, sin fieldLabel (no se muestra al autor).
  if (def.id === 'hidden') {
    const properties: DocViewProperty[] = [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
      { name: 'name', type: 'String', multi: false, values: [`./${nodeName}`] }
    ];
    const rawNode: DocViewNode = { name: nodeName, properties, children: [] };
    return { uiId: newUiId(), kind: def.id, nodeName, properties, children: [], rawNode };
  }

  // "multifield" NO lleva 'name' en el nodo contenedor — en Granite UI real esa propiedad JCR la
  // especifica únicamente el campo interno repetido (el nodo 'field' de abajo), nunca el propio
  // multifield. Tenerla en los dos a la vez (bug real de una versión anterior: ambos terminaban con
  // el mismo valor, ej. "./tags") hacía que Granite viera dos campos del formulario enlazados a la
  // misma ruta al abrir el diálogo real en AEM — es lo que probablemente causaba el aviso de "valor
  // repetido" al usarlo.
  if (def.id === 'multifield') {
    const properties: DocViewProperty[] = [
      { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
      { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
      { name: 'fieldLabel', type: 'String', multi: false, values: [label || def.label] }
    ];
    const rawNode: DocViewNode = {
      name: nodeName,
      properties,
      children: [
        {
          name: 'field',
          properties: [
            { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
            { name: 'sling:resourceType', type: 'String', multi: false, values: [findFieldTypeById('textfield')!.resourceType] },
            { name: 'fieldLabel', type: 'String', multi: false, values: ['Valor'] },
            { name: 'name', type: 'String', multi: false, values: [`./${nodeName}`] }
          ],
          children: []
        }
      ]
    };
    return { uiId: newUiId(), kind: def.id, nodeName, properties, children: [], rawNode };
  }

  const properties: DocViewProperty[] = [
    { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
    { name: 'sling:resourceType', type: 'String', multi: false, values: [def.resourceType] },
    { name: 'fieldLabel', type: 'String', multi: false, values: [label || def.label] },
    { name: 'name', type: 'String', multi: false, values: [`./${nodeName}`] },
    ...(DEFAULT_PROPS_BY_TYPE[def.id] ?? [])
  ];
  const rawNode: DocViewNode = { name: nodeName, properties, children: [] };
  if (def.id === 'select' || def.id === 'radiogroup') {
    setSelectOptionsOnRaw(rawNode, [{ text: 'Opción 1', value: 'opcion1', selected: false }]);
  }
  return { uiId: newUiId(), kind: def.id, nodeName, properties, children: [], rawNode };
}

function setSelectOptionsOnRaw(rawNode: DocViewNode, options: SelectOptionItem[]): void {
  rawNode.children.push({
    name: 'items',
    properties: [{ name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] }],
    children: options.map((opt, i) => ({
      name: `item${i}`,
      properties: [
        { name: 'jcr:primaryType', type: 'String', multi: false, values: ['nt:unstructured'] },
        { name: 'text', type: 'String', multi: false, values: [opt.text] },
        { name: 'value', type: 'String', multi: false, values: [opt.value] }
      ],
      children: []
    }))
  });
}

