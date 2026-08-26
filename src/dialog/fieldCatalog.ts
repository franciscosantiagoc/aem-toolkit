/**
 * Catálogo de "tipos de ítem" que el editor visual de diálogos permite agregar — tanto
 * estructurales (pestaña, agrupador con borde) como campos de formulario de Granite UI.
 *
 * v1.4.0 (MVP): solo el "top 10" de abajo está disponible — es intencional, no un recorte por
 * error. El modo "avanzado" con el catálogo completo (radiogroup, switch, colorfield, datepicker,
 * fileupload/imagen, hidden, heading...) queda para una versión siguiente. Los campos de estos
 * tipos que YA existan en un diálogo (creados a mano o por otra herramienta) igual se leen,
 * conservan y pueden reordenarse/eliminarse — nunca se destruyen por no tener editor propio
 * todavía (ver `FieldKind.unknown` en `dialogModel.ts`).
 */

export type FieldCategory = 'structural' | 'field';

/** Qué tipo de "editor de propiedades" mostrar para este tipo en el panel — controla qué
 * controles de formulario se renderizan además de nombre técnico/label/descripción. */
export type PropertyEditorKind = 'none' | 'pathfield' | 'options' | 'multifield-inner' | 'textvalue';

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
   * propósito) — `dialogModel.ts` lo resuelve por posición en el árbol, no por este campo.
   */
  resourceType: string;
  propertyEditor: PropertyEditorKind;
  /** true si puede contener hijos (pestaña, agrupador). */
  isContainer: boolean;
}

/** Los 10 tipos disponibles en v1.4.0, en el orden en que aparecen en el selector "Agregar". */
export const TOP_FIELD_TYPES: FieldTypeDef[] = [
  { id: 'tab', category: 'structural', label: 'Pestaña', resourceType: 'granite/ui/components/coral/foundation/container', propertyEditor: 'none', isContainer: true },
  { id: 'fieldset', category: 'structural', label: 'Agrupador (con borde)', resourceType: 'granite/ui/components/coral/foundation/form/fieldset', propertyEditor: 'none', isContainer: true },
  { id: 'textfield', category: 'field', label: 'Campo de texto', resourceType: 'granite/ui/components/coral/foundation/form/textfield', propertyEditor: 'textvalue', isContainer: false },
  { id: 'textarea', category: 'field', label: 'Área de texto', resourceType: 'granite/ui/components/coral/foundation/form/textarea', propertyEditor: 'textvalue', isContainer: false },
  { id: 'richtext', category: 'field', label: 'Texto enriquecido (RTE)', resourceType: 'cq/gui/components/authoring/dialog/richtext', propertyEditor: 'textvalue', isContainer: false },
  { id: 'numberfield', category: 'field', label: 'Campo numérico', resourceType: 'granite/ui/components/coral/foundation/form/numberfield', propertyEditor: 'textvalue', isContainer: false },
  { id: 'pathfield', category: 'field', label: 'Selector de ruta', resourceType: 'granite/ui/components/coral/foundation/form/pathfield', propertyEditor: 'pathfield', isContainer: false },
  { id: 'select', category: 'field', label: 'Lista desplegable', resourceType: 'granite/ui/components/coral/foundation/form/select', propertyEditor: 'options', isContainer: false },
  { id: 'checkbox', category: 'field', label: 'Casilla', resourceType: 'granite/ui/components/coral/foundation/form/checkbox', propertyEditor: 'none', isContainer: false },
  { id: 'multifield', category: 'field', label: 'Multicampo', resourceType: 'granite/ui/components/coral/foundation/form/multifield', propertyEditor: 'multifield-inner', isContainer: false }
];

/** Tipos que un multicampo simple (v1.4.0: un solo campo interno repetible, sin composite) puede
 * envolver — se excluyen los estructurales y otros multifields (anidar multifield no es un caso
 * soportado en esta versión). */
export const MULTIFIELD_INNER_TYPES = TOP_FIELD_TYPES.filter((t) => t.category === 'field' && t.id !== 'multifield');

export function findFieldTypeById(id: string): FieldTypeDef | undefined {
  return TOP_FIELD_TYPES.find((t) => t.id === id);
}

/**
 * Encuentra el tipo de CAMPO conocido a partir de un sling:resourceType leído de un .content.xml
 * existente — coincidencia exacta primero, y si no, comparando solo el último segmento de la ruta
 * (tolerante a que AEM Cloud/6.5 varíen el prefijo, ej. "granite/ui/components/coral/..." vs una
 * variante futura). NUNCA devuelve "tab" ni "fieldset" — "tab" no se detecta por resourceType (ver
 * la nota en `FieldTypeDef.resourceType`) y "fieldset" sí tiene resourceType propio pero se
 * resuelve aparte en `dialogModel.ts` porque "container" (el resourceType de "tab") y "fieldset"
 * pueden confundirse si se buscan juntos. Devuelve undefined si es un tipo de CAMPO fuera del
 * top 10 (se preserva igual como campo "avanzado" — ver dialogModel.ts).
 */
export function findFieldTypeByResourceType(resourceType: string | undefined): FieldTypeDef | undefined {
  if (!resourceType) return undefined;
  const trimmed = resourceType.replace(/^\/+/, '');
  const candidates = TOP_FIELD_TYPES.filter((t) => t.category === 'field');
  const exact = candidates.find((t) => t.resourceType === trimmed);
  if (exact) return exact;
  const lastSegment = trimmed.split('/').pop();
  return candidates.find((t) => t.resourceType.split('/').pop() === lastSegment);
}

/** true si el resourceType corresponde específicamente a un agrupador con borde (fieldset). */
export function isFieldsetResourceType(resourceType: string | undefined): boolean {
  if (!resourceType) return false;
  const fieldset = TOP_FIELD_TYPES.find((t) => t.id === 'fieldset')!;
  return resourceType.replace(/^\/+/, '') === fieldset.resourceType;
}
