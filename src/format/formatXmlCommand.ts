import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseDocView, extractRootNamespaces } from '../sync/docview';
import { serializeDocView, mergeNamespaces } from '../dialog/docviewSerializer';

/**
 * Comando "AEM: Formatear XML" — reformatea cualquier `.xml` de FileVault Document View (no solo
 * los `.content.xml` de diálogo que abre el editor visual) con el mismo estilo que usa
 * `docviewSerializer.ts`: abertura + primer atributo en la primera línea; si hay más de un
 * atributo, los siguientes van uno por línea indentados un nivel más que la abertura, con el `>`
 * pegado al último; con 0 o 1 atributo el `>` va en esa misma primera línea; la etiqueta de cierre
 * siempre en su propia línea, alineada con la abertura de su mismo nodo, con su contenido indentado
 * un nivel más — así todo el árbol queda con una indentación consistente y los cierres alineados,
 * sin importar cómo estuviera formateado (o desformateado) el archivo original.
 *
 * Reusa el mismo parser/serializador que ya usa la sincronización y el editor de diálogos — no hay
 * lógica de formateo nueva, solo se expone como una operación independiente aplicable a cualquier
 * `.xml` del proyecto, sin tener que pasar por el editor visual.
 *
 * Preserva las namespaces que ya declarara el archivo (`extractRootNamespaces` + `mergeNamespaces`)
 * en vez de asumir siempre las 4 estándar — un archivo que además declare namespaces propias (ej.
 * `granite`, `dam`, `wcmio`) no las pierde al reformatearse.
 */
export async function formatXmlFiles(candidates: vscode.Uri[]): Promise<void> {
  const targets = candidates.filter((u) => u.fsPath.toLowerCase().endsWith('.xml'));

  if (targets.length === 0) {
    vscode.window.showWarningMessage('Selecciona uno o más archivos .xml para formatear.');
    return;
  }

  let changedCount = 0;
  let unchangedCount = 0;
  const errors: string[] = [];

  for (const target of targets) {
    try {
      const original = fs.readFileSync(target.fsPath, 'utf8');
      const tree = parseDocView(original);
      const namespaces = mergeNamespaces(extractRootNamespaces(original));
      const formatted = serializeDocView(tree, namespaces);
      if (formatted !== original) {
        fs.writeFileSync(target.fsPath, formatted, 'utf8');
        changedCount += 1;
      } else {
        unchangedCount += 1;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`${vscode.workspace.asRelativePath(target)}: ${detail}`);
    }
  }

  if (errors.length > 0) {
    const summary =
      errors.length === targets.length
        ? `No se pudo formatear ningún archivo:\n${errors.join('\n')}`
        : `Formateados ${changedCount + unchangedCount} de ${targets.length}. Fallaron ${errors.length}:\n${errors.join('\n')}`;
    vscode.window.showErrorMessage(summary);
    return;
  }

  if (targets.length === 1) {
    vscode.window.showInformationMessage(changedCount === 1 ? 'Archivo XML formateado.' : 'El archivo ya tenía este formato — sin cambios.');
  } else {
    vscode.window.showInformationMessage(`${changedCount} archivo(s) reformateados, ${unchangedCount} ya estaban bien formateados (de ${targets.length} seleccionados).`);
  }
}
