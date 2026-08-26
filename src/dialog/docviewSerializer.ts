import { DocViewNode, DocViewProperty } from '../sync/docview';

/**
 * Inverso de `docview.ts#parseDocView`: convierte un árbol `DocViewNode` de vuelta a texto XML
 * FileVault Document View, listo para escribirse tal cual en un `.content.xml`.
 *
 * Simplificaciones deliberadas frente al formato exacto que produce FileVault/`vlt`:
 *  - Cada nodo (etiqueta + atributos) se emite en una sola línea, en vez del ocasional
 *    "un atributo por línea" que usa FileVault para nodos con muchos atributos — funcionalmente
 *    idéntico (a XML no le importa), y más fácil de diffear en git.
 *  - Los namespaces `jcr`, `sling`, `cq`, `nt` se declaran siempre en la raíz, se usen o no — es
 *    inofensivo y evita tener que rastrear cuáles se usan de verdad en todo el árbol.
 */

const STANDARD_NAMESPACES: [string, string][] = [
  ['jcr', 'http://www.jcp.org/jcr/1.0'],
  ['sling', 'http://sling.apache.org/jcr/sling/1.0'],
  ['cq', 'http://www.day.com/jcr/cq/1.0'],
  ['nt', 'http://www.jcp.org/jcr/nt/1.0']
];

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inverso de la unión escape+split que hace `docview.ts` al leer un valor — dobla las barras
 * invertidas literales y, en un arreglo, además escapa las comas literales de cada elemento. */
function escapeDocViewScalar(raw: string, isArrayItem: boolean): string {
  let out = raw.replace(/\\/g, '\\\\');
  if (isArrayItem) out = out.replace(/,/g, '\\,');
  return out;
}

function serializePropertyValue(prop: DocViewProperty): string {
  const typePrefix = prop.type !== 'String' ? `{${prop.type}}` : '';
  if (prop.multi) {
    const joined = prop.values.map((v) => escapeDocViewScalar(v, true)).join(',');
    return `${typePrefix}[${joined}]`;
  }
  return `${typePrefix}${escapeDocViewScalar(prop.values[0] ?? '', false)}`;
}

function serializeAttributes(properties: DocViewProperty[], extraNamespaces: [string, string][] = []): string {
  const parts: string[] = [];
  for (const [prefix, uri] of extraNamespaces) parts.push(`xmlns:${prefix}="${uri}"`);
  for (const prop of properties) {
    parts.push(`${prop.name}="${escapeXmlAttr(serializePropertyValue(prop))}"`);
  }
  return parts.join(' ');
}

function serializeNode(node: DocViewNode, depth: number, extraNamespaces: [string, string][] = []): string {
  const indent = '  '.repeat(depth);
  const attrs = serializeAttributes(node.properties, extraNamespaces);
  const openTag = attrs ? `<${node.name} ${attrs}` : `<${node.name}`;
  if (node.children.length === 0) {
    return `${indent}${openTag}/>`;
  }
  const childrenXml = node.children.map((c) => serializeNode(c, depth + 1)).join('\n');
  return `${indent}${openTag}>\n${childrenXml}\n${indent}</${node.name}>`;
}

/** Serializa un árbol completo (la raíz que representa el nodo `jcr:root`) a texto XML listo para
 * escribirse en un `.content.xml`, con la declaración XML y las 4 namespaces estándar. */
export function serializeDocView(root: DocViewNode): string {
  const body = serializeNode(root, 0, STANDARD_NAMESPACES);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
}
