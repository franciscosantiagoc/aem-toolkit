import * as fs from 'fs';
import * as path from 'path';
import { AemProjectInfo } from '../core/projectDetector';
import { buildEmptyDialogXml } from '../dialog/dialogPanel';
import { reformatXml } from '../dialog/docviewSerializer';
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
   * calculada por defecto (`computeDefaultAssetsDir`) según `addToFrontend`. Con `ui.frontend` y
   * `jsAssetsDir` personalizado (ver abajo), esta pasa a representar solo la carpeta de estilos. */
  assetsDir: string | undefined;
  /** Solo aplica con `ui.frontend` activo: carpeta distinta para el JS cuando el usuario activó
   * "Personalizar carpetas de estilos y JS por separado" en el formulario — undefined (el caso
   * normal) significa que JS comparte la misma carpeta que `assetsDir`. Se ignora por completo en
   * clientlib clásica, donde CSS/JS ya van cada uno en su propia subcarpeta (`css/`/`js/`) dentro de
   * una única carpeta base — no hay necesidad de una carpeta base distinta ahí. */
  jsAssetsDir: string | undefined;
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
  /** Rutas absolutas del CSS/JS de la clientlib clásica (dentro de sus subcarpetas `css/`/`js/`), presentes solo cuando `classicClientlibDir` aplica y el switch correspondiente estaba activo. */
  classicAssets: { cssFile: string | undefined; jsFile: string | undefined } | undefined;
  /** Contenido de estilos/JS a escribir en `ui.frontend` cuando corresponde, para que el que llama se encargue de registrarlos en el entrypoint de webpack (ver `registerWebpackEntry`). */
  webpackAssets: { styleFile: string | undefined; jsFile: string | undefined } | undefined;
  /** Rutas absolutas de CSS/JS que YA existían en destino y por eso NO se sobreescribieron (se
   * preservó su contenido tal cual estaba) — pasa típicamente al crear una versión nueva de un
   * componente versionado, cuya clientlib clásica es compartida entre versiones (ver
   * `computeDefaultAssetsDir`), o al re-generar sobre una carpeta de `ui.frontend` ya usada. Sirve
   * para avisar al usuario en vez de pisar en silencio un CSS/JS que ya tenía código real. */
  preservedExistingFiles: string[];
}

/**
 * Carpeta por defecto donde van los estilos/JS de un componente, según si van a `ui.frontend`
 * (webpack) o a una clientlib clásica propia. Única fuente de verdad tanto para la vista previa en
 * vivo del formulario (`componentCreate.ts` responde a `computeDefaultAssetsDir` con esto) como para
 * el plan real de creación, para que nunca queden desincronizados.
 *
 * `versionNumber` se conserva en la firma para versiones futuras (ej. si algún proyecto quisiera
 * clientlibs aisladas por versión) pero no se usa todavía: la clientlib clásica de un componente
 * versionado es una sola, compartida entre sus versiones (misma categoría `<namespace>.<nombre>`),
 * consistente con que solo una versión está "activa" a la vez vía el proxy.
 */
export function computeDefaultAssetsDir(
  project: AemProjectInfo,
  name: string,
  useFrontend: boolean,
  _versionNumber: number | undefined
): string {
  if (useFrontend) {
    return path.join(project.rootPath, 'ui.frontend', 'src', 'main', 'webpack', 'components', name);
  }
  // Convención confirmada: NO se anida dentro de la carpeta del componente — se centraliza a nivel
  // del namespace, en una carpeta contenedora "clientlib-components" (sin .content.xml propio, solo
  // agrupa) hermana de "components", con una subcarpeta-clientlib real e independiente por
  // componente (su propia categoría `<namespace>.<nombre>`).
  const namespaceRoot = path.dirname(project.componentsPath!); // .../apps/<namespace>
  return path.join(namespaceRoot, 'clientlibs', 'clientlib-components', name);
}

/**
 * Rutas concretas donde terminan los archivos de CSS/JS a partir de la carpeta base (`assetsDir`,
 * ya sea la calculada por `computeDefaultAssetsDir` o una elegida a mano por el usuario). Única
 * fuente de verdad tanto para escribir los archivos de verdad (`planComponentCreate`) como para la
 * vista previa del formulario (`componentCreate.ts` responde al mensaje `computeAssetPaths` con
 * esto), para que nunca queden desincronizadas.
 *
 * Con `ui.frontend`, CSS y JS van por defecto juntos en la misma carpeta del componente (convención
 * webpack ya existente — no es una clientlib, no hay problema de aglomeración de archivos de otro
 * tipo) — salvo que `jsAssetsDir` venga con un valor propio (a pedido explícito, v2.1.12: el usuario
 * activó "Personalizar carpetas de estilos y JS por separado" en el formulario), en cuyo caso el JS
 * va a esa carpeta distinta en vez de compartir la de `assetsDir`. Con clientlib clásica, cada uno va
 * siempre en su propia subcarpeta (`css/`, `js/`) dentro de la carpeta base — `jsAssetsDir` se ignora
 * ahí por completo, no aplica (ver comentario en `ComponentCreatePayload.jsAssetsDir`).
 */
export function computeAssetSubPaths(assetsDir: string, useFrontend: boolean, jsAssetsDir?: string): { cssDir: string; jsDir: string } {
  if (useFrontend) {
    const jsDir = jsAssetsDir && jsAssetsDir.trim() ? jsAssetsDir.trim() : assetsDir;
    return { cssDir: assetsDir, jsDir };
  }
  return { cssDir: path.join(assetsDir, 'css'), jsDir: path.join(assetsDir, 'js') };
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

  const preservedExistingFiles: string[] = [];

  let classicClientlibDir: string | undefined;
  let classicAssets: ComponentCreatePlan['classicAssets'];
  if (useClassicClientlib) {
    classicClientlibDir = assetsDir;
    const { cssDir: cssSubDir, jsDir: jsSubDir } = computeAssetSubPaths(assetsDir, false);
    const cssFileName = `${name}.${payload.styleExt}`;
    const jsFileName = `${name}.js`;
    const cssFilePath = path.join(cssSubDir, cssFileName);
    const jsFilePath = path.join(jsSubDir, jsFileName);

    // .content.xml/css.txt/js.txt son metadatos declarativos — se regeneran siempre (para que
    // reflejen el switch de estilos/JS vigente, ej. si una versión nueva agrega JS a una clientlib
    // que antes solo tenía CSS). El CSS/JS de verdad NO: si ya existe (típicamente porque esta
    // clientlib es compartida con una versión anterior del mismo componente — ver
    // `computeDefaultAssetsDir` — o porque se está re-generando sobre una carpeta ya usada), se
    // preserva tal cual en vez de pisarlo con el contenido de arranque.
    files.push({
      absPath: path.join(classicClientlibDir, '.content.xml'),
      content: clientlibContentXml(clientlibCategory, payload.generateStyles, payload.generateJs)
    });
    let cssFile: string | undefined;
    let jsFile: string | undefined;
    if (payload.generateStyles) {
      cssFile = cssFilePath;
      files.push({ absPath: path.join(classicClientlibDir, 'css.txt'), content: clientlibTxt('css', cssFileName) });
      if (fs.existsSync(cssFilePath)) {
        preservedExistingFiles.push(cssFilePath);
      } else {
        files.push({ absPath: cssFilePath, content: starterStyleContent(name, payload.styleExt) });
      }
    }
    if (payload.generateJs) {
      jsFile = jsFilePath;
      files.push({ absPath: path.join(classicClientlibDir, 'js.txt'), content: clientlibTxt('js', jsFileName) });
      if (fs.existsSync(jsFilePath)) {
        preservedExistingFiles.push(jsFilePath);
      } else {
        files.push({ absPath: jsFilePath, content: starterJsContent(name) });
      }
    }
    classicAssets = { cssFile, jsFile };
  }

  let webpackAssets: ComponentCreatePlan['webpackAssets'];
  if (useFrontend) {
    // Ambas === assetsDir salvo que el usuario haya personalizado jsAssetsDir por separado (v2.1.12).
    const { cssDir, jsDir } = computeAssetSubPaths(assetsDir, true, payload.jsAssetsDir);
    let styleFile: string | undefined;
    let jsFile: string | undefined;
    if (payload.generateStyles) {
      styleFile = path.join(cssDir, `_${name}.${payload.styleExt}`);
      if (fs.existsSync(styleFile)) {
        preservedExistingFiles.push(styleFile);
      } else {
        files.push({ absPath: styleFile, content: starterStyleContent(name, payload.styleExt) });
      }
    }
    if (payload.generateJs) {
      jsFile = path.join(jsDir, `${name}.js`);
      if (fs.existsSync(jsFile)) {
        preservedExistingFiles.push(jsFile);
      } else {
        files.push({ absPath: jsFile, content: starterJsContent(name) });
      }
    }
    webpackAssets = { styleFile, jsFile };
  }

  // Todo `.xml` generado (proxy, componente, diálogos, editConfig, template, clientlib) se reformatea
  // con el mismo estilo que usa "AEM: Formatear XML" (`reformatXml`, `docviewSerializer.ts`) antes de
  // escribirse — a pedido explícito, para que ya salga formateado en vez de con el string crudo de
  // cada plantilla. Si algún archivo no fuera XML de Document View válido, se deja tal cual en vez de
  // romper la creación del componente por un problema de formato.
  const formattedFiles = files.map((file) => {
    if (!file.absPath.toLowerCase().endsWith('.xml')) return file;
    try {
      return { absPath: file.absPath, content: reformatXml(file.content) };
    } catch {
      return file;
    }
  });

  return {
    realComponentDir,
    resourceTypePath,
    versionNumber: nextVersion,
    files: formattedFiles,
    classicClientlibDir,
    classicAssets,
    webpackAssets,
    preservedExistingFiles
  };
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
