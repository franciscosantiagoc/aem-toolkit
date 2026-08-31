import * as http from 'http';

export interface SyncTarget {
  host: string;
  port: string;
  username: string;
  password: string;
}

export interface SyncResult {
  ok: boolean;
  status?: number;
  message: string;
}

interface MultipartField {
  name: string;
  filename?: string;
  contentType?: string;
  value: Buffer | string;
}

function buildBoundary(): string {
  return '----AemToolkitBoundary' + Date.now().toString(16) + Math.random().toString(16).slice(2);
}

function buildMultipartBody(fields: MultipartField[], boundary: string): Buffer {
  const parts: Buffer[] = [];
  for (const f of fields) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"`;
    if (f.filename) head += `; filename="${f.filename}"`;
    head += '\r\n';
    if (f.contentType) head += `Content-Type: ${f.contentType}\r\n`;
    head += '\r\n';
    parts.push(Buffer.from(head, 'utf8'));
    parts.push(typeof f.value === 'string' ? Buffer.from(f.value, 'utf8') : f.value);
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(parts);
}

function encodeJcrPath(jcrPath: string): string {
  return jcrPath
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join('/');
}

function describeNetworkError(err: NodeJS.ErrnoException, target: SyncTarget): string {
  if (err.code === 'ECONNREFUSED') {
    return `No se pudo conectar a ${target.host}:${target.port} — ¿está corriendo la instancia AEM?`;
  }
  if (err.code === 'ENOTFOUND') {
    return `No se pudo resolver el host "${target.host}".`;
  }
  return err.message || 'Error de red desconocido.';
}

function summarizeHttpError(status: number | undefined, body: string): string {
  if (status === 401 || status === 403) {
    return `Credenciales inválidas o sin permiso (HTTP ${status}). Revisa el usuario/contraseña con "AEM: Configurar credenciales de sincronización...".`;
  }
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 200);
  return `HTTP ${status ?? '(sin respuesta)'}${snippet ? ` — ${snippet}` : ''}`;
}

function postMultipart(target: SyncTarget, jcrTargetPath: string, fields: MultipartField[]): Promise<SyncResult> {
  return new Promise((resolve) => {
    const boundary = buildBoundary();
    const body = buildMultipartBody(fields, boundary);
    const auth = Buffer.from(`${target.username}:${target.password}`, 'utf8').toString('base64');
    const requestPath = encodeJcrPath(jcrTargetPath) || '/';

    const req = http.request(
      {
        hostname: target.host,
        port: Number(target.port),
        path: requestPath,
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        },
        timeout: 15000
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          const ok = status >= 200 && status < 300;
          resolve({ ok, status, message: ok ? 'OK' : summarizeHttpError(status, data) });
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, message: describeNetworkError(err as NodeJS.ErrnoException, target) }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, message: `Tiempo de espera agotado conectando a ${target.host}:${target.port}.` });
    });
    req.write(body);
    req.end();
  });
}

function guessContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    eot: 'application/vnd.ms-fontobject'
  };
  return (ext && map[ext]) || 'application/octet-stream';
}

/**
 * Sube un archivo "plano" (HTML, CSS, JS, imágenes, etc.) al JCR como nt:file, bajo el nodo
 * padre — técnica estándar de la Sling POST Servlet: un campo de formulario con nombre "*" toma
 * su nombre de nodo del archivo subido, y "*@TypeHint=nt:file" fuerza el tipo primario.
 */
export function uploadFile(target: SyncTarget, jcrParentPath: string, fileName: string, content: Buffer): Promise<SyncResult> {
  return postMultipart(target, jcrParentPath, [
    { name: '*', filename: fileName, contentType: guessContentType(fileName), value: content },
    { name: '*@TypeHint', value: 'nt:file' }
  ]);
}

/**
 * NOTA HISTÓRICA (hasta v1.2.0 se usaba esta función para subir `.content.xml`): el
 * `:contentType=xml` del Import Operation del Sling POST Servlet NO entiende el formato "Document
 * View" de FileVault (el que usan los `.content.xml` reales, con `jcr:root`/`jcr:primaryType` como
 * atributos) — espera un formato distinto y más verboso heredado del bundle `jcr.contentloader`
 * (`<node><name>.../<name></node>`). Por eso las subidas de diálogos con esta función parecían
 * "funcionar" (HTTP 200) pero no aplicaban de verdad los cambios. Reemplazada por
 * `createOrUpdateNode`/`deleteNode` + el recorrido de árbol en `contentXmlSync.ts`, que reconstruye
 * la subida como POSTs normales de Sling (que sí entienden `jcr:primaryType` como una propiedad
 * más). Se deja sin usar por si algún día se necesita para otro `:contentType`.
 */
export function importContentXml(target: SyncTarget, jcrNodePath: string, xmlContent: Buffer): Promise<SyncResult> {
  return postMultipart(target, jcrNodePath, [
    { name: ':operation', value: 'import' },
    { name: ':contentType', value: 'xml' },
    { name: ':replace', value: 'true' },
    { name: ':replaceProperties', value: 'true' },
    { name: ':contentFile', filename: '.content.xml', contentType: 'application/xml', value: xmlContent }
  ]);
}

/** Una propiedad JCR ya lista para mandarse como campos de formulario de Sling (ver `docview.ts`). */
export interface SlingProperty {
  name: string;
  type: string;
  multi: boolean;
  values: string[];
}

function propertyToFormFields(prop: SlingProperty): MultipartField[] {
  const fields: MultipartField[] = [{ name: `${prop.name}@TypeHint`, value: prop.multi ? `${prop.type}[]` : prop.type }];
  if (prop.multi && prop.values.length === 0) {
    // Una propiedad multivalor vacía necesita al menos un campo presente para que Sling la
    // reconozca como "existe pero está vacía" en vez de simplemente no enviarla.
    fields.push({ name: prop.name, value: '' });
  } else {
    for (const v of prop.values) fields.push({ name: prop.name, value: v });
  }
  return fields;
}

/**
 * Crea (si no existe) o actualiza (si ya existe) un nodo JCR con sus propiedades propias, usando
 * el comportamiento normal — no especial — del Sling POST Servlet: cada campo de formulario es
 * una propiedad, y `jcr:primaryType` como campo normal fija el tipo del nodo nuevo. A diferencia de
 * `importContentXml`, esto SÍ entiende correctamente cada propiedad porque no depende de que Sling
 * interprete el XML — el XML ya se interpretó de antemano en `docview.ts`.
 */
export function createOrUpdateNode(target: SyncTarget, jcrPath: string, properties: SlingProperty[]): Promise<SyncResult> {
  const fields = properties.length > 0 ? properties.flatMap(propertyToFormFields) : [{ name: 'jcr:primaryType', value: 'nt:unstructured' }];
  return postMultipart(target, jcrPath, fields);
}

/**
 * Borra un nodo (y todo su subárbol) con `:operation=delete`. Si el nodo no existía (404/410), se
 * trata como éxito — no hay nada que borrar, típicamente porque es la primera vez que se sincroniza
 * ese diálogo/nodo.
 */
export async function deleteNode(target: SyncTarget, jcrPath: string): Promise<SyncResult> {
  const result = await postMultipart(target, jcrPath, [{ name: ':operation', value: 'delete' }]);
  if (result.ok || result.status === 404 || result.status === 410) {
    return { ok: true, status: result.status, message: result.ok ? 'OK' : 'No existía previamente — nada que borrar.' };
  }
  return result;
}
