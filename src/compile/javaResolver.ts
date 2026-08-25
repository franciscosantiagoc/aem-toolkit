import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export interface JavaResolution {
  requiredMajor: number | undefined;
  systemMajor: number | undefined;
  /** 'manual' = aemToolkit.javaHome configurado a mano (siempre gana, sin detección);
   * 'auto' = se encontró un JDK que coincide dentro de jdkSearchFolders;
   * 'none' = no hay override — se usa el JDK que resuelva el sistema tal cual. */
  resolvedFrom: 'manual' | 'auto' | 'none';
  resolvedHome: string | undefined;
  /** true solo cuando de verdad amerita preguntarle al usuario: se sabe qué requiere el proyecto,
   * se sabe qué tiene el sistema, son distintos, y no se encontró un JDK que coincida. */
  mismatch: boolean;
}

function parseJavaMajorFromVersionOutput(output: string): number | undefined {
  const m = /version\s+"(\d+)(?:\.(\d+))?/.exec(output);
  if (!m) return undefined;
  if (m[1] === '1' && m[2]) return parseInt(m[2], 10);
  return parseInt(m[1], 10);
}

/**
 * Corre '<bin> -version' con spawnSync (no execSync/execFileSync) a propósito: 'java -version'
 * escribe su salida en STDERR y sale con código 0, y spawnSync es la única de las tres que deja
 * leer stdout Y stderr juntos sin importar el código de salida ni depender de sintaxis de shell
 * como '2>&1' (que además no funcionaría con execFileSync, que no pasa por una shell). También
 * evita tener que escapar rutas con espacios (ej. 'C:\Program Files\Java\...') a mano.
 */
function runVersionCommand(bin: string): number | undefined {
  const result = spawnSync(bin, ['-version'], { timeout: 5000, encoding: 'utf8' });
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return parseJavaMajorFromVersionOutput(combined);
}

/** Qué versión de Java resolvería la shell del sistema ahora mismo (respeta JAVA_HOME si está
 * seteado en el entorno), sin ninguna configuración de la extensión de por medio. */
export function detectSystemJavaMajorVersion(): number | undefined {
  const javaHomeEnv = process.env.JAVA_HOME;
  if (javaHomeEnv) {
    const javaBin = path.join(javaHomeEnv, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(javaBin)) return runVersionCommand(javaBin);
  }
  return runVersionCommand('java');
}

function tryReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

function isJdkHome(candidatePath: string): boolean {
  const javaBin = path.join(candidatePath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  return fs.existsSync(javaBin);
}

/** Determina la versión mayor de un candidato a JDK: primero el archivo 'release' (JDK 9+, no
 * requiere lanzar ningún proceso), luego el nombre de la carpeta (ej. 'jdk-17', 'jdk1.8.0_301'),
 * y como último recurso invocando su propio 'java -version'. */
function readJdkMajorFromCandidate(candidatePath: string): number | undefined {
  const releaseRaw = tryReadFile(path.join(candidatePath, 'release'));
  if (releaseRaw) {
    const m = /JAVA_VERSION="(\d+)(?:\.(\d+))?/.exec(releaseRaw);
    if (m) return m[1] === '1' && m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
  }

  const name = path.basename(candidatePath);
  const nameMatch = /jdk-?(\d+)(?:\.(\d+))?/i.exec(name);
  if (nameMatch) {
    return nameMatch[1] === '1' && nameMatch[2] ? parseInt(nameMatch[2], 10) : parseInt(nameMatch[1], 10);
  }

  const javaBin = path.join(candidatePath, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!fs.existsSync(javaBin)) return undefined;
  return runVersionCommand(javaBin);
}

/**
 * Busca, dentro de hasta 2 carpetas "contenedoras" de JDKs (cada una con subcarpetas tipo
 * 'jdk-11', 'jdk-17', ...), una instalación cuya versión mayor coincida exactamente con la
 * requerida por el proyecto. Devuelve la ruta completa a la primera que coincida.
 */
export function findMatchingJdk(containerFolders: string[], requiredMajor: number): string | undefined {
  for (const folder of containerFolders.slice(0, 2)) {
    if (!folder || !folder.trim()) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(folder, entry.name);
      if (!isJdkHome(candidate)) continue;
      if (readJdkMajorFromCandidate(candidate) === requiredMajor) return candidate;
    }
  }
  return undefined;
}

/**
 * Resuelve qué JDK debería usar Maven para este proyecto. Si `aemToolkit.javaHome` está
 * configurado a mano, esa gana siempre — no se hace ninguna detección. Si no, se detecta la
 * versión de Java del sistema y se compara con la que requiere el proyecto; si no coinciden, se
 * busca en `jdkSearchFolders` (máx. 2) una instalación que sí coincida.
 */
export function resolveJavaForProject(opts: {
  requiredMajor: number | undefined;
  manualJavaHome: string;
  jdkSearchFolders: string[];
}): JavaResolution {
  if (opts.manualJavaHome.trim()) {
    return {
      requiredMajor: opts.requiredMajor,
      systemMajor: undefined,
      resolvedFrom: 'manual',
      resolvedHome: opts.manualJavaHome.trim(),
      mismatch: false
    };
  }

  const systemMajor = detectSystemJavaMajorVersion();
  if (opts.requiredMajor === undefined || systemMajor === undefined || systemMajor === opts.requiredMajor) {
    return { requiredMajor: opts.requiredMajor, systemMajor, resolvedFrom: 'none', resolvedHome: undefined, mismatch: false };
  }

  const found = findMatchingJdk(opts.jdkSearchFolders, opts.requiredMajor);
  if (found) {
    return { requiredMajor: opts.requiredMajor, systemMajor, resolvedFrom: 'auto', resolvedHome: found, mismatch: false };
  }

  return { requiredMajor: opts.requiredMajor, systemMajor, resolvedFrom: 'none', resolvedHome: undefined, mismatch: true };
}

/** Línea de estado legible para mostrar en el panel o en el menú del ⚙️. */
export function describeJavaStatus(resolution: JavaResolution): string {
  const { requiredMajor, systemMajor, resolvedFrom, resolvedHome } = resolution;
  if (requiredMajor === undefined) {
    return 'No se pudo determinar qué versión de Java requiere este proyecto (revisa el pom.xml).';
  }
  if (resolvedFrom === 'manual') {
    return `JDK configurado manualmente: ${resolvedHome}.`;
  }
  if (systemMajor === undefined) {
    return `El proyecto requiere Java ${requiredMajor}, pero no se pudo detectar la versión de Java del sistema.`;
  }
  if (systemMajor === requiredMajor) {
    return `✔ El sistema ya tiene Java ${requiredMajor}, que es lo que requiere el proyecto.`;
  }
  if (resolvedFrom === 'auto') {
    return `✔ Java ${requiredMajor} encontrado automáticamente en "${resolvedHome}" (el sistema tiene Java ${systemMajor}).`;
  }
  return `⚠ El proyecto requiere Java ${requiredMajor} pero el sistema tiene Java ${systemMajor} — configura carpetas de búsqueda de JDKs o el JDK manualmente.`;
}

/** Texto del banner de advertencia del panel — undefined cuando todo está bien (o no se sabe lo
 * suficiente como para molestar al usuario sin necesidad). */
export function getJavaWarningBanner(resolution: JavaResolution): string | undefined {
  if (resolution.resolvedFrom !== 'none' || resolution.requiredMajor === undefined) return undefined;
  if (resolution.systemMajor === undefined) return undefined; // no se pudo verificar; no molestar
  if (resolution.systemMajor === resolution.requiredMajor) return undefined;
  return `⚠ El proyecto requiere Java ${resolution.requiredMajor} pero el sistema tiene Java ${resolution.systemMajor}. Usa el ⚙️ de abajo para configurar carpetas de búsqueda de JDKs (o el JDK manualmente).`;
}
