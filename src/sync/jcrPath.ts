import * as path from 'path';

const JCR_ROOT_SEGMENT = 'jcr_root';

/**
 * Decodifica un segmento de ruta con la convención de nombres "platform" de FileVault: un nombre
 * JCR con namespace (ej. "cq:dialog", "jcr:content") se guarda en disco como "_cq_dialog",
 * "_jcr_content". Aplica a cualquier segmento de la ruta, no solo al archivo final.
 */
export function decodeFileVaultSegment(segment: string): string {
  const match = segment.match(/^_([A-Za-z0-9]+)_(.+)$/);
  return match ? `${match[1]}:${match[2]}` : segment;
}

/**
 * Convierte una ruta de archivo local dentro de un módulo FileVault (ej.
 * ".../ui.apps/src/main/content/jcr_root/apps/x/components/foo/_cq_dialog/.content.xml") en su
 * ruta JCR real ("/apps/x/components/foo/cq:dialog/.content.xml"), decodificando cada segmento.
 * Devuelve undefined si la ruta no contiene "jcr_root" (no es sincronizable con este mecanismo).
 */
export function toJcrPath(fsPath: string): string | undefined {
  const normalized = fsPath.split(path.sep).join('/');
  const segments = normalized.split('/');
  const idx = segments.indexOf(JCR_ROOT_SEGMENT);
  if (idx === -1) return undefined;
  const rest = segments.slice(idx + 1).filter(Boolean);
  if (rest.length === 0) return undefined;
  return '/' + rest.map(decodeFileVaultSegment).join('/');
}

/** true si la ruta local vive dentro de un "jcr_root" (y por lo tanto se le puede calcular una ruta JCR). */
export function isUnderJcrRoot(fsPath: string): boolean {
  return toJcrPath(fsPath) !== undefined;
}
