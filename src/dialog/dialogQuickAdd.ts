import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseDocView, extractRootNamespaces } from '../sync/docview';
import { serializeDocView, mergeNamespaces } from './docviewSerializer';
import { fromDocView, toDocView, createNewItem, DialogItem, DialogTree } from './dialogModel';
import { findFieldTypeById } from './fieldCatalog';
import { openDialogEditor } from './dialogPanel';
import { getSyncTarget } from '../sync/credentials';
import { syncUris } from '../sync/syncRunner';

/**
 * Comando "AEM: Diálogo" (v1.7.0) — a diferencia de "AEM: Editar diálogo..." (que solo aparece en el
 * Explorador y abre siempre el editor visual completo), este comando aparece también en el menú
 * contextual del EDITOR (clic derecho sobre el código XML de un diálogo abierto) y ofrece un atajo
 * rápido: un QuickPick con los 5 tipos de campo más usados más una opción "Edición avanzada" que cae
 * al editor completo de siempre. Pensado para el caso común de "quiero agregar un textfield más" sin
 * tener que abrir el panel completo.
 */
const QUICK_TYPE_IDS = ['textfield', 'pathfield', 'checkbox', 'select', 'multifield'];

export async function showDialogQuickAddMenu(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) {
    vscode.window.showWarningMessage('Abre un .content.xml de diálogo para usar "AEM: Diálogo".');
    return;
  }
  const fsPath = target.fsPath;

  const quickItems: Array<vscode.QuickPickItem & { typeId: string }> = QUICK_TYPE_IDS.map((id) => {
    const def = findFieldTypeById(id)!;
    return { label: def.label, description: quickAddHint(id), typeId: id };
  });
  quickItems.push({ label: 'Edición avanzada', description: 'Abrir el editor completo del diálogo', typeId: '__advanced__' });

  const picked = await vscode.window.showQuickPick(quickItems, {
    title: 'AEM: Diálogo — agregar campo',
    placeHolder: 'Elige un tipo de campo (o edición avanzada para el editor completo)'
  });
  if (!picked) return;

  if (picked.typeId === '__advanced__') {
    await openDialogEditor(context, vscode.Uri.file(fsPath));
    return;
  }

  await quickAddField(context, fsPath, picked.typeId);
}

function quickAddHint(id: string): string {
  switch (id) {
    case 'textfield':
      return 'Campo de texto simple';
    case 'pathfield':
      return 'Selector de ruta (ej. a un asset)';
    case 'checkbox':
      return 'Casilla de verificación';
    case 'select':
      return 'Lista desplegable con opciones';
    case 'multifield':
      return 'Campo repetible (lista de valores)';
    default:
      return '';
  }
}

async function quickAddField(context: vscode.ExtensionContext, fsPath: string, typeId: string): Promise<void> {
  const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === fsPath);
  if (openDoc?.isDirty) {
    await openDoc.save();
  }

  if (!fs.existsSync(fsPath)) {
    vscode.window.showErrorMessage(`No se encontró el archivo "${path.basename(fsPath)}".`);
    return;
  }

  let original: string;
  let tree: DialogTree;
  try {
    original = fs.readFileSync(fsPath, 'utf8');
    tree = fromDocView(parseDocView(original));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`No se pudo interpretar este diálogo: ${detail}`);
    return;
  }

  const label = await vscode.window.showInputBox({
    prompt: `Etiqueta del nuevo campo (${findFieldTypeById(typeId)!.label})`,
    placeHolder: 'Opcional — se puede completar después'
  });
  if (label === undefined) return; // cancelado

  let targetChildren: DialogItem[];
  if (!tree.hasTabs) {
    targetChildren = tree.items;
  } else if (tree.tabs.length <= 1) {
    targetChildren = tree.tabs.length === 1 ? tree.tabs[0].children : (tree.items.length > 0 ? tree.items : (tree.tabs[0]?.children ?? []));
    if (tree.tabs.length === 0) {
      vscode.window.showErrorMessage('Este diálogo está marcado con pestañas pero no tiene ninguna definida.');
      return;
    }
  } else {
    const tabPick = await vscode.window.showQuickPick(
      tree.tabs.map((t, i) => ({
        label: t.properties.find((p) => p.name === 'jcr:title')?.values[0] || t.nodeName,
        tabIndex: i
      })),
      { title: 'AEM: Diálogo — ¿en qué pestaña?', placeHolder: 'Elige la pestaña donde agregar el campo' }
    );
    if (!tabPick) return;
    targetChildren = tree.tabs[tabPick.tabIndex].children;
  }

  const siblingNames = targetChildren.map((c) => c.nodeName);
  const newItem = createNewItem(typeId, label, siblingNames);
  targetChildren.push(newItem);

  try {
    const namespaces = mergeNamespaces(extractRootNamespaces(original));
    const rebuilt = toDocView(tree);
    const xml = serializeDocView(rebuilt, namespaces);
    fs.writeFileSync(fsPath, xml, 'utf8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`No se pudo agregar el campo: ${detail}`);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Campo "${findFieldTypeById(typeId)!.label}" agregado a "${path.basename(fsPath)}". ¿Quieres subir este cambio ahora?`,
    'Subir a Author',
    'Subir a Publish',
    'Ahora no'
  );
  if (choice === 'Subir a Author' || choice === 'Subir a Publish') {
    const which: 'author' | 'publish' = choice === 'Subir a Author' ? 'author' : 'publish';
    const syncTarget = await getSyncTarget(context, which, vscode.Uri.file(fsPath));
    await syncUris([vscode.Uri.file(fsPath)], syncTarget, which === 'author' ? 'Author' : 'Publish');
  }
}
