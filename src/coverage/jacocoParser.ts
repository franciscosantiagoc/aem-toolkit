import * as fs from 'fs';
import * as path from 'path';

export interface ClassCoverage {
  className: string;
  packageName: string;
  linesCovered: number;
  linesMissed: number;
  linePct: number;
}

function findJacocoReports(rootPath: string, modules: string[]): string[] {
  const found: string[] = [];
  for (const m of modules) {
    if (m === 'ui.frontend') continue;
    const candidate = path.join(rootPath, m, 'target', 'site', 'jacoco', 'jacoco.xml');
    if (fs.existsSync(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * Parser por regex del reporte XML de JaCoCo (no un parser XML completo — el reporte de JaCoCo
 * tiene una forma predecible y esto evita agregar una dependencia solo para esto). Extrae, por
 * cada <class>, el contador de tipo LINE (líneas cubiertas/no cubiertas).
 */
function parseJacocoXml(xml: string): ClassCoverage[] {
  const results: ClassCoverage[] = [];
  for (const packageMatch of xml.matchAll(/<package name="([^"]+)">([\s\S]*?)<\/package>/g)) {
    const [, packageName, packageBody] = packageMatch;
    for (const classMatch of packageBody.matchAll(/<class name="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
      const [, className, classBody] = classMatch;
      const lineCounter = /<counter type="LINE" missed="(\d+)" covered="(\d+)"\s*\/>/.exec(classBody);
      if (!lineCounter) continue;
      const missed = parseInt(lineCounter[1], 10);
      const covered = parseInt(lineCounter[2], 10);
      const total = missed + covered;
      const linePct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
      results.push({
        className: className.replace(/\//g, '.'),
        packageName: packageName.replace(/\//g, '.'),
        linesCovered: covered,
        linesMissed: missed,
        linePct
      });
    }
  }
  return results;
}

export function collectBackendCoverage(rootPath: string, modules: string[]): ClassCoverage[] {
  const all: ClassCoverage[] = [];
  for (const report of findJacocoReports(rootPath, modules)) {
    try {
      all.push(...parseJacocoXml(fs.readFileSync(report, 'utf8')));
    } catch {
      // reporte ilegible o corrupto; se ignora y se sigue con los demás módulos
    }
  }
  return all;
}
