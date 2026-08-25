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
 * Importa un `.content.xml` (FileVault Document View XML) directamente sobre el nodo que
 * describe — `:operation=import` con `:contentType=xml`, `:replace`/`:replaceProperties=true` para
 * que reemplace el nodo y sus propiedades existentes en vez de solo agregar las nuevas.
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
