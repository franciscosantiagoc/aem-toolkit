import * as fs from 'fs';
import * as path from 'path';

export interface FileCoverage {
  filePath: string;
  linesPct: number;
}

/** Lee ui.frontend/coverage/coverage-summary.json (formato estándar del reporter 'json-summary' de Istanbul/Jest). */
export function collectFrontendCoverage(rootPath: string): FileCoverage[] {
  const summaryPath = path.join(rootPath, 'ui.frontend', 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) return [];
  try {
    const raw = fs.readFileSync(summaryPath, 'utf8');
    const data = JSON.parse(raw) as Record<string, { lines?: { pct?: number } }>;
    const results: FileCoverage[] = [];
    const frontendRoot = path.join(rootPath, 'ui.frontend');
    for (const [key, value] of Object.entries(data)) {
      if (key === 'total') continue;
      const relative = path.isAbsolute(key) ? path.relative(frontendRoot, key) : key;
      results.push({ filePath: relative, linesPct: value.lines?.pct ?? 0 });
    }
    return results;
  } catch {
    return [];
  }
}
