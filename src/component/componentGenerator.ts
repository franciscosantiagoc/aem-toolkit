import * as fs from 'fs';
import * as path from 'path';
import { AemProjectInfo } from '../core/projectDetector';
import { buildEmptyDialogXml } from '../dialog/dialogPanel';
import { StyleExt } from './componentDetector';
import {
  clientlibContentXml,
  clientlibTxt,
  componentContentXml,
  editConfigXml,
  htlMarkup,
  starterJsContent,
  starterStyleContent,
  templateContentXml
} from './componentTemplates';

export interface ComponentCreatePayload {
  name: string;
  title: string;
  componentGroup: string;
  versioned: boolean;
  generateStyles: boolean;
  styleExt: StyleExt;
  generateJs: boolean;
  addToFrontend: boolean;
  /** Carpeta elegida por el usuario para los estilos/JS (absoluta), o undefined/vacío para usar la
   * calculada por defecto (`computeDefaultAssetsDir`) según `addToFrontend`. */
  assetsDir: string | undefined;
  advanced: {
    editConfig: boolean;
    designDialog: boolean;
    template: boolean;
    placeholder: boolean;
    openDialogAfterCreate: boolean;
  };
}

export interface PlannedFile {
  absPath: string;
  content: string;
}

export interface WebpackRegistrationResult {
  /** Ruta (relativa a la raíz del proyecto) del archivo donde se agregó el `@import` de estilos, o null si no se encontró ninguno reconocible. */
  styleEntryFile: string | null;
  /** Ruta (relativa a la raíz del proyecto) del archivo donde se agregó el `import`/`require` de JS, o null si no se encontró ninguno reconocible. */
  jsEntryFile: string | null;
}

export interface ComponentCreatePlan {
  /** Carpeta del componente "real" (donde van `.content.xml`, `.html`, `_cq_dialog`...): `components/<name>` si no es versionado, o `components/<name>/v<N>` si lo es. */
  realComponentDir: string;
  /** Ruta JCR relativa a `/apps` del componente tal como se referencia desde páginas/plantillas (el proxy si es versionado, o la ruta real si no). */
  resourceTypePath: string;
  versionNumber: number | undefined;
  files: PlannedFile[];
  /** Carpeta de la clientlib clásica creada (si `addToFrontend` es false o no hay `ui.frontend`), o undefined si no se generó ninguna. */
  classicClientlibDir: string | undefined;
  /** Contenido de estilos/JS a escribir en `ui.frontend` cuando corresponde, para que el que llama se encargue de registrarlos en el entrypoint de webpack (ver `registerWebpackEntry`). */
  webpackAssets: { styleFile: string | undefined; jsFile: string | undefined } | undefined;
}

/**
 * Carpeta por defecto donde van los estilos/JS de un componente, según si van a `ui.frontend`
 * (webpack) o a una clientlib clásica propia dentro del componente. Única fuente de verdad tanto
 * para la vista previa en vivo del formulario (`componentCreate.ts` responde a
 * `computeDefaultAssetsDir` con esto) como para el plan real de creación, para que nunca queden
 * desincronizados.
 */
export function computeDefaultAssetsDir(
  project: AemProjectInfo,
  name: string,
  useFrontend: boolean,
  versionNumber: number | undefined
): string {
  if (useFrontend) {
    return path.join(project.rootPath, 'ui.frontend', 'src', 'main', 'webpack', 'components', name);
  }
  const componentsPath = project.componentsPath!;
  const baseDir = path.join(componentsPath, name);
  const realComponentDir = versionNumber !== undefined ? path.join(baseDir, `v${versionNumber}`) : baseDir;
  return path.join(realComponentDir, 'clientlibs', name);
}

/**
 * Calcula el plan completo de creación (rutas + contenido de cada archivo) sin tocar el disco
 * todavía — separado de la escritura real para poder mostrar una vista previa y para poder testear
 * la lógica sin filesystem real.
 */
export function planComponentCreate(project: AemProjectInfo, payload: ComponentCreatePayload, existingMaxVersion: number | undefined): ComponentCreatePlan {
  const { name, title, componentGroup } = payload;
  const namespace = project.namespace ?? '<namespace>';
  const componentsPath = project.componentsPath!;
  const baseDir = path.join(componentsPath, name);

  const nextVersion = payload.versioned ? (existingMaxVersion !== undefined ? existingMaxVersion + 1 : 1) : undefined;
  const realComponentDir = nextVersion !== undefined ? path.join(baseDir, `v${nextVersion}`) : baseDir;
  const resourceTypePath = `${namespace}/components/${name}`;
  const realResourceTypePath = nextVersion !== undefined ? `${resourceTypePath}/v${nextVersion}` : resourceTypePath;

  const files: PlannedFile[] = [];

  // Proxy (solo si versionado) — .content.xml mínimo con sling:resourceSuperType apuntando a la versión que se está creando.
  if (nextVersion !== undefined) {
    files.push({
      absPath: path.join(baseDir, '.content.xml'),
      content: componentContentXml(title, componentGroup, realResourceTypePath)
    });
  }

  // Componente real (versión, o el propio si no es versionado).
  files.push({ absPath: path.join(realComponentDir, '.content.xml'), content: componentContentXml(title, componentGroup) });

  const clientlibCategory = `${namespace}.${name}`;
  const useFrontend = project.hasFrontendModule && payload.addToFrontend && (payload.generateStyles || payload.generateJs);
  const useClassicClientlib = !useFrontend && (payload.generateStyles || payload.generateJs);
  const assetsDir =
    payload.assetsDir && payload.assetsDir.trim()
      ? payload.assetsDir.trim()
      : computeDefaultAssetsDir(project, name, useFrontend, nextVersion);

  files.push({
    absPath: path.join(realComponentDir, `${name}.html`),
    content: htlMarkup({
      name,
      title,
      includePlaceholder: payload.advanced.placeholder,
      clientlib: useClassicClientlib ? { category: clientlibCategory, embedsCss: payload.generateStyles, embedsJs: payload.generateJs } : undefined,
      frontendBundled: useFrontend
    })
  });

  files.push({ absPath: path.join(realComponentDir, '_cq_dialog', '.content.xml'), content: buildEmptyDialogXml(title) });

  if (payload.advanced.editConfig) {
    files.push({ absPath: path.join(realComponentDir, '_cq_editConfig.xml'), content: editConfigXml() });
  }
  if (payload.advanced.designDialog) {
    files.push({ absPath: path.join(realComponentDir, '_cq_design_dialog', '.content.xml'), content: buildEmptyDialogXml(`${title} — Diseño`) });
  }
  if (payload.advanced.template) {
    files.push({ absPath: path.join(realComponentDir, '_cq_template', '.content.xml'), content: templateContentXml(title, resourceTypePath) });
  }

  let classicClientlibDir: string | undefined;
  if (useClassicClientlib) {
    classicClientlibDir = assetsDir;
    const cssFileName = `${name}.${payload.styleExt}`;
    const jsFileName = `${name}.js`;
    files.push({
      absPath: path.join(classicClientlibDir, '.content.xml'),
      content: clientlibContentXml(clientlibCategory, payload.generateStyles, payload.generateJs)
    });
    if (payload.generateStyles) {
      files.push({ absPath: path.join(classicClientlibDir, 'css.txt'), content: clientlibTxt(cssFileName) });
      files.push({ absPath: path.join(classicClientlibDir, cssFileName), content: starterStyleContent(name, payload.styleExt) });
    }
    if (payload.generateJs) {
      files.push({ absPath: path.join(classicClientlibDir, 'js.txt'), content: clientlibTxt(jsFileName) });
      files.push({ absPath: path.join(classicClientlibDir, jsFileName), content: starterJsContent(name) });
    }
  }

  let webpackAssets: ComponentCreatePlan['webpackAssets'];
  if (useFrontend) {
    let styleFile: string | undefined;
    let jsFile: string | undefined;
    if (payload.generateStyles) {
      styleFile = path.join(assetsDir, `_${name}.${payload.styleExt}`);
      files.push({ absPath: styleFile, content: starterStyleContent(name, payload.styleExt) });
    }
    if (payload.generateJs) {
      jsFile = path.join(assetsDir, `${name}.js`);
      files.push({ absPath: jsFile, content: starterJsContent(name) });
    }
    webpackAssets = { styleFile, jsFile };
  }

  return { realComponentDir, resourceTypePath, versionNumber: nextVersion, files, classicClientlibDir, webpackAssets };
}

export function writePlan(plan: ComponentCreatePlan): void {
  for (const file of plan.files) {
    fs.mkdirSync(path.dirname(file.absPath), { recursive: true });
    fs.writeFileSync(file.absPath, file.content, 'utf8');
  }
}

const STYLE_ENTRY_CANDIDATES = ['main.scss', 'main.less', 'main.css', 'site.scss', 'site.less', 'index.scss', 'index.less'];
const JS_ENTRY_CANDIDATES = ['main.js', 'index.js', 'site.js'];
const STYLE_AGGREGATOR_CANDIDATES = ['components/_index.scss', 'components/_index.less', 'components/index.scss', 'components/index.less'];
const JS_AGGREGATOR_CANDIDATES = ['components/index.js', 'components/_index.js'];

function findFirstExisting(baseDir: string, candidates: string[]): string | undefined {
  for (const c of candidates) {
    const full = path.join(baseDir, c);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

/** Ruta de import relativa DESDE la carpeta de `fromFile` HACIA `toFile`, con separadores "/" (los
 * que entienden webpack/sass/less sin importar el SO), con extensión recortada cuando corresponde
 * (los `@import` de Sass/Less no llevan extensión), y con el prefijo "./" que exige un import
 * relativo. Se calcula así (en vez de asumir la convención `components/<nombre>/...`) porque el
 * usuario puede haber elegido cualquier carpeta para los estilos/JS del componente. */
function relativeImportPath(fromFile: string, toFile: string, stripExt?: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');
  if (stripExt && rel.endsWith(stripExt)) rel = rel.slice(0, -stripExt.length);
  return rel.startsWith('.') ? rel : './' + rel;
}

/**
 * Intenta registrar el nuevo componente en el punto de entrada de webpack que el proyecto ya
 * compila (`@import`/`import` en el archivo agregador de estilos/JS de `components`, o si no existe
 * ninguno, en el entrypoint principal de `ui.frontend/src/main/webpack`) — sin esto, los archivos
 * generados quedarían huérfanos y nunca se compilarían. Best-effort: si no encuentra ningún archivo
 * reconocible, no rompe la creación del componente — deja `styleEntryFile`/`jsEntryFile` en null
 * para que quien llama avise al usuario que debe agregar el import a mano.
 */
export function registerWebpackEntry(project: AemProjectInfo, styleFile: string | undefined, jsFile: string | undefined): WebpackRegistrationResult {
  const webpackRoot = path.join(project.rootPath, 'ui.frontend', 'src', 'main', 'webpack');
  const result: WebpackRegistrationResult = { styleEntryFile: null, jsEntryFile: null };

  if (styleFile) {
    const ext = path.extname(styleFile); // ".scss" | ".less" | ".css"
    const aggregator = findFirstExisting(webpackRoot, STYLE_AGGREGATOR_CANDIDATES.filter((c) => c.endsWith(ext)));
    const target = aggregator ?? findFirstExisting(webpackRoot, STYLE_ENTRY_CANDIDATES.filter((c) => c.endsWith(ext)));
    if (target) {
      const importLine = `@import '${relativeImportPath(target, styleFile, ext)}';\n`;
      appendIfMissing(target, importLine);
      result.styleEntryFile = path.relative(project.rootPath, target);
    }
  }

  if (jsFile) {
    const aggregator = findFirstExisting(webpackRoot, JS_AGGREGATOR_CANDIDATES);
    const target = aggregator ?? findFirstExisting(webpackRoot, JS_ENTRY_CANDIDATES);
    if (target) {
      const importLine = `import '${relativeImportPath(target, jsFile)}';\n`;
      appendIfMissing(target, importLine);
      result.jsEntryFile = path.relative(project.rootPath, target);
    }
  }

  return result;
}

function appendIfMissing(filePath: string, line: string): void {
  const current = fs.readFileSync(filePath, 'utf8');
  if (current.includes(line.trim())) return;
  const withNewline = current.endsWith('\n') ? current : current + '\n';
  fs.writeFileSync(filePath, withNewline + line, 'utf8');
}
