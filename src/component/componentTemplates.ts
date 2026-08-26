import { StyleExt } from './componentDetector';

/** `.content.xml` del componente (o del proxy de un versionado). Un componente NO lleva su propio
 * `sling:resourceType` — el resourceType con el que se lo referencia desde otro lado es su propia
 * ruta bajo `/apps`. El proxy de un versionado sí lleva `sling:resourceSuperType` apuntando a la
 * versión vigente. */
export function componentContentXml(title: string, componentGroup: string, resourceSuperType?: string): string {
  const superTypeAttr = resourceSuperType ? `\n  sling:resourceSuperType="${resourceSuperType}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
  jcr:primaryType="cq:Component"
  jcr:title="${title}"
  componentGroup="${componentGroup}"${superTypeAttr}/>
`;
}

/** `_cq_editConfig.xml` — refresca la página tras editar/insertar/eliminar/mover el componente,
 * para que el autor no tenga que refrescar a mano después de guardar el diálogo. */
export function editConfigXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0"
  jcr:primaryType="cq:EditConfig">
  <cq:listeners
    jcr:primaryType="cq:EditListenersConfig"
    afteredit="REFRESH_PAGE"
    afterinsert="REFRESH_PAGE"
    afterdelete="REFRESH_PAGE"
    aftermove="REFRESH_PAGE"/>
</jcr:root>
`;
}

/** `_cq_template/.content.xml` — contenido inicial al arrastrar el componente "nuevo" a una página. */
export function templateContentXml(title: string, resourceType: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
  jcr:primaryType="nt:unstructured"
  jcr:title="${title}"
  sling:resourceType="${resourceType}"/>
`;
}

const STYLE_EXT_TO_CATEGORY_HINT: Record<StyleExt, string> = { css: 'CSS', scss: 'SCSS', less: 'LESS' };

/** Contenido inicial de la hoja de estilos: una clase raíz en BEM (`.<nombre>-cmp`), lista para
 * anidar elementos/modificadores (`&__elemento`/`&--modificador` en SCSS/LESS; clases planas en CSS). */
export function starterStyleContent(name: string, ext: StyleExt): string {
  const cls = `${name}-cmp`;
  const hint = STYLE_EXT_TO_CATEGORY_HINT[ext];
  if (ext === 'css') {
    return `/* ${hint} — estilos del componente "${name}". Arquitectura BEM: .${cls}, .${cls}__elemento, .${cls}--modificador */\n.${cls} {\n}\n`;
  }
  return `// ${hint} — estilos del componente "${name}". Arquitectura BEM: &__elemento, &--modificador\n.${cls} {\n  &__elemento {\n  }\n\n  &--modificador {\n  }\n}\n`;
}

/** Contenido inicial del JS del componente (patrón IIFE simple, sin dependencias de framework). */
export function starterJsContent(name: string): string {
  return `// JS del componente "${name}"\n(function () {\n  'use strict';\n\n  document.querySelectorAll('.${name}-cmp').forEach(function (el) {\n    // TODO: lógica del componente\n  });\n})();\n`;
}

/** `.content.xml` de una clientlib clásica propia del componente (`ui.apps`, sin `ui.frontend`). */
export function clientlibContentXml(category: string, embedsCss: boolean, embedsJs: boolean): string {
  const categoriesValue = `[${category}]`;
  const embedParts: string[] = [];
  if (embedsCss) embedParts.push('cssPath="css.txt"');
  if (embedsJs) embedParts.push('jsPath="js.txt"');
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0"
  jcr:primaryType="cq:ClientLibraryFolder"
  categories="${categoriesValue}"
  allowProxy="{Boolean}true"${embedParts.length ? '\n  ' + embedParts.join('\n  ') : ''}/>
`;
}

export function clientlibTxt(fileName: string): string {
  return `#base=.\n${fileName}\n`;
}

export interface HtlMarkupOptions {
  name: string;
  clientlibCategory: string | undefined;
  embedsCss: boolean;
  embedsJs: boolean;
  includePlaceholder: boolean;
  title: string;
}

/** HTL de arranque del componente: clase raíz BEM, placeholder de autoría opcional (visible solo en
 * modo edición, vía el template `wcmmode.html` de AEM Core Components), y el embed inline de la
 * clientlib del componente (patrón `clientlib.html` de AEM Core Components), si corresponde. */
export function htlMarkup(opts: HtlMarkupOptions): string {
  const { name, clientlibCategory, embedsCss, embedsJs, includePlaceholder, title } = opts;
  const rootClass = `${name}-cmp`;
  const useAttrs: string[] = [];
  if (clientlibCategory && (embedsCss || embedsJs)) {
    useAttrs.push('data-sly-use.clientlib="core/wcm/components/commons/v1/templates/clientlib.html"');
  }
  if (includePlaceholder) {
    useAttrs.push('data-sly-use.wcmmode="core/wcm/components/commons/v1/templates/wcmmode.html"');
  }
  const useAttrsStr = useAttrs.length ? ' ' + useAttrs.join(' ') : '';

  const lines: string[] = [];
  lines.push(`<div class="${rootClass}"${useAttrsStr}>`);
  if (clientlibCategory && embedsCss) {
    lines.push(`  <sly data-sly-call="\${clientlib.css @ categories='${clientlibCategory}'}"/>`);
  }
  if (includePlaceholder) {
    lines.push(`  <sly data-sly-test="\${wcmmode.edit}">`);
    lines.push(`    <div class="cq-placeholder" data-emptytext="${title}" data-sly-unwrap></div>`);
    lines.push('  </sly>');
    lines.push('  <!-- TODO: reemplaza este placeholder por una condición real una vez el diálogo tenga campos -->');
  }
  lines.push('  <!-- TODO: contenido del componente -->');
  if (clientlibCategory && embedsJs) {
    lines.push(`  <sly data-sly-call="\${clientlib.js @ categories='${clientlibCategory}'}"/>`);
  }
  lines.push('</div>');
  return lines.join('\n') + '\n';
}
