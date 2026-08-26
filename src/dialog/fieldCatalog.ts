/**
 * Catálogo de "tipos de ítem" que el editor visual de diálogos permite agregar — tanto
 * estructurales (pestaña, agrupador con borde) como campos de formulario de Granite UI.
 *
 * v1.5.0: catálogo ampliado respecto a v1.4.0 (que traía solo 10 tipos). Se agregaron: selector de
 * fecha (datepicker), grupo de opciones tipo radio (radiogroup), selector de ruta alternativo
 * (pathbrowser), carga de archivo (fileupload), campo oculto (hidden), contraseña (password),
 * selector de color (colorfield), interruptor (switch), encabezado estático (heading) y selector
 * de tags. El modo "avanzado" con el catálogo COMPLETO de Granite UI (más tipos, de uso más raro)
 * sigue pendiente para una versión posterior — ver FEATURES.md 3.10/3.11. Los tipos de campo que
 * aún no estén aquí, si ya existen en un diálogo (creados a mano o por otra herramienta), igual se
 * leen, conservan y pueden reordenarse/eliminarse — nunca se destruyen por no tener editor propio
 * todavía (ver `FieldKind.unknown` en `dialogModel.ts`).
 */

export type FieldCategory = 'structural' | 'field';

/** Qué tipo de "editor de propiedades" mostrar para este tipo en el panel — controla qué
 * controles de formulario se renderizan además de nombre técnico/label/descripción.
 *  - 'textvalue': un input de "valor por defecto" (textfield, textarea, richtext, numberfield,
 *    password, colorfield).
 *  - 'pathfield': un input de "ruta raíz" (pathfield, pathbrowser, tags).
 *  - 'options': editor de lista de opciones text/value/predeterminada (select, radiogroup).
 *  - 'datepicker': selector de tipo (date/datetime/time) + formato mostrado.
 *  - 'fileupload': lista de tipos MIME permitidos.
 *  - 'heading': un único input para el texto estático (sin name/label/descripción genéricos).
 *  - 'multifield-inner': selector del tipo de campo repetido interno.
 *  - 'none': sin controles adicionales más allá del bloque genérico (checkbox, switch, hidden ya
 *    tiene su propio bloque reducido, tab/fieldset solo título). */
export type PropertyEditorKind =
  | 'none'
  | 'pathfield'
  | 'options'
  | 'multifield-inner'
  | 'textvalue'
  | 'datepicker'
  | 'fileupload'
  | 'heading';

export interface FieldTypeDef {
  /** Identificador interno estable (no cambia aunque cambie el label visible). */
  id: string;
  category: FieldCategory;
  /** Texto mostrado en el selector "Agregar...". */
  label: string;
  /**
   * sling:resourceType de Granite UI que identifica a este tipo (sin la barra inicial).
   * CASO ESPECIAL "tab": en el markup real de Granite, una pestaña individual NO tiene un
   * resourceType propio y distintivo — usa el mismo `.../foundation/container` que un agrupador
   * sin borde. Lo que la distingue es ser hijo directo del contenedor `.../foundation/tabs`. Por
   * eso "tab" nunca se detecta por resourceType (`findFieldTypeByResourceType` lo excluye a
   * propósito, vía el filtro `category === 'field'`) — `dialogModel.ts` lo resuelve por posición
   * en el árbol, no por este campo.
   */
  resourceType: string;
  propertyEditor: PropertyEditorKind;
  /** true si puede contener hijos (pestaña, agrupador). */
  isContainer: boolean;
}

/** Tipos disponibles en el selector "Agregar...", en el orden en que aparecen ahí. */
export const FIELD_TYPES: FieldTypeDef[] = [
  { id: 'tab', category: 'structural', label: 'Pestaña', resourceType: 'granite/ui/components/coral/foundation/container', propertyEditor: 'none', isContainer: true },
  { id: 'fieldset', category: 'structural', label: 'Agrupador (con borde)', resourceType: 'granite/ui/components/coral/foundation/form/fieldset', propertyEditor: 'none', isContainer: true },
  { id: 'textfield', category: 'field', label: 'Campo de texto', resourceType: 'granite/ui/components/coral/foundation/form/textfield', propertyEditor: 'textvalue', isContainer: false },
  { id: 'textarea', category: 'field', label: 'Área de texto', resourceType: 'granite/ui/components/coral/foundation/form/textarea', propertyEditor: 'textvalue', isContainer: false },
  { id: 'richtext', category: 'field', label: 'Texto enriquecido (RTE)', resourceType: 'cq/gui/components/authoring/dialog/richtext', propertyEditor: 'textvalue', isContainer: false },
  { id: 'numberfield', category: 'field', label: 'Campo numérico', resourceType: 'granite/ui/components/coral/foundation/form/numberfield', propertyEditor: 'textvalue', isContainer: false },
  { id: 'pathfield', category: 'field', label: 'Selector de ruta', resourceType: 'granite/ui/components/coral/foundation/form/pathfield', propertyEditor: 'pathfield', isContainer: false },
  { id: 'pathbrowser', category: 'field', label: 'Selector de ruta (navegador)', resourceType: 'granite/ui/components/coral/foundation/form/pathbrowser', propertyEditor: 'pathfield', isContainer: false },
  { id: 'select', category: 'field', label: 'Lista desplegable', resourceType: 'granite/ui/components/coral/foundation/form/select', propertyEditor: 'options', isContainer: false },
  { id: 'radiogroup', category: 'field', label: 'Grupo de opciones (radio)', resourceType: 'granite/ui/components/coral/foundation/form/radiogroup', propertyEditor: 'options', isContainer: false },
  { id: 'checkbox', category: 'field', label: 'Casilla', resourceType: 'granite/ui/components/coral/foundation/form/checkbox', propertyEditor: 'none', isContainer: false },
  { id: 'switch', category: 'field', label: 'Interruptor (switch)', resourceType: 'granite/ui/components/coral/foundation/form/switch', propertyEditor: 'none', isContainer: false },
  { id: 'multifield', category: 'field', label: 'Multicampo', resourceType: 'granite/ui/components/coral/foundation/form/multifield', propertyEditor: 'multifield-inner', isContainer: false },
  { id: 'datepicker', category: 'field', label: 'Selector de fecha', resourceType: 'granite/ui/components/coral/foundation/form/datepicker', propertyEditor: 'datepicker', isContainer: false },
  { id: 'fileupload', category: 'field', label: 'Carga de archivo', resourceType: 'cq/gui/components/authoring/dialog/fileupload', propertyEditor: 'fileupload', isContainer: false },
  { id: 'colorfield', category: 'field', label: 'Selector de color', resourceType: 'granite/ui/components/coral/foundation/form/colorfield', propertyEditor: 'textvalue', isContainer: false },
  { id: 'password', category: 'field', label: 'Contraseña', resourceType: 'granite/ui/components/coral/foundation/form/password', propertyEditor: 'textvalue', isContainer: false },
  { id: 'hidden', category: 'field', label: 'Campo oculto', resourceType: 'granite/ui/components/coral/foundation/form/hidden', propertyEditor: 'none', isContainer: false },
  { id: 'tags', category: 'field', label: 'Selector de tags', resourceType: 'cq/gui/components/authoring/dialog/tags', propertyEditor: 'pathfield', isContainer: false },
  { id: 'heading', category: 'field', label: 'Encabezado (texto estático)', resourceType: 'granite/ui/components/coral/foundation/heading', propertyEditor: 'heading', isContainer: false }
];

/** Alias retrocompatible: v1.4.0 exportaba este catálogo bajo este nombre ("los 10 tipos top").
 * Se mantiene apuntando al mismo arreglo, ya ampliado, para no romper importaciones existentes. */
export const TOP_FIELD_TYPES = FIELD_TYPES;

/** Tipos que un multicampo simple (un solo campo interno repetible, sin composite) puede envolver
 * — se excluyen los estructurales y otros multifields (anidar multifield no es un caso soportado
 * en esta versión). */
export const MULTIFIELD_INNER_TYPES = FIELD_TYPES.filter((t) => t.category === 'field' && t.id !== 'multifield');

export function findFieldTypeById(id: string): FieldTypeDef | undefined {
  return FIELD_TYPES.find((t) => t.id === id);
}

/**
 * Encuentra el tipo de CAMPO conocido a partir de un sling:resourceType leído de un .content.xml
 * existente — coincidencia exacta primero, y si no, comparando solo el último segmento de la ruta
 * (tolerante a que AEM Cloud/6.5 varíen el prefijo). NUNCA devuelve "tab" ni "fieldset" — "tab" no
 * tiene resourceType propio (ver la nota en `FieldTypeDef.resourceType`) y ambos quedan afuera por
 * el filtro `category === 'field'`. Devuelve undefined si es un tipo de CAMPO fuera de este
 * catálogo (se preserva igual como campo "avanzado" — ver dialogModel.ts).
 */
export function findFieldTypeByResourceType(resourceType: string | undefined): FieldTypeDef | undefined {
  if (!resourceType) return undefined;
  const trimmed = resourceType.replace(/^\/+/, '');
  const candidates = FIELD_TYPES.filter((t) => t.category === 'field');
  const exact = candidates.find((t) => t.resourceType === trimmed);
  if (exact) return exact;
  const lastSegment = trimmed.split('/').pop();
  return candidates.find((t) => t.resourceType.split('/').pop() === lastSegment);
}

/** true si el resourceType corresponde específicamente a un agrupador con borde (fieldset). */
export function isFieldsetResourceType(resourceType: string | undefined): boolean {
  if (!resourceType) return false;
  const fieldset = FIELD_TYPES.find((t) => t.id === 'fieldset')!;
  return resourceType.replace(/^\/+/, '') === fieldset.resourceType;
}
