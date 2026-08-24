import { execFileSync } from 'child_process';

/**
 * true si hay cambios (modificados, agregados al stage o sin trackear) en alguna de las rutas
 * dadas respecto al último commit guardado (HEAD). Se usa para decidir, en "Test-coverage
 * backend", si hace falta recompilar todo el back o basta con re-correr los tests existentes.
 * Si la carpeta no es un repo git (o git no está disponible), se asume que sí hay cambios —
 * mejor compilar de más que quedarse con un reporte de coverage desactualizado en silencio.
 */
export function hasUncommittedChangesIn(rootPath: string, relativePaths: string[]): boolean {
  if (relativePaths.length === 0) return false;
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', ...relativePaths], {
      cwd: rootPath,
      encoding: 'utf8'
    });
    return out.trim().length > 0;
  } catch {
    return true;
  }
}
