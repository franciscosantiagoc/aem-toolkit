import * as vscode from 'vscode';

interface Entry {
  label: string;
  commandId?: string;
  icon?: string;
  children?: Entry[];
}

// A medida que se completen los siguientes bloques (ver FEATURES.md), sus comandos se agregan
// aquí como nuevas entradas/categorías — el árbol es el índice visual de todo lo que ofrece la
// extensión, igual que en angular-schematics-free.
const TREE: Entry[] = [
  {
    label: 'Compilar',
    icon: 'tools',
    children: [
      { label: 'Compilar proyecto...', commandId: 'aemToolkit.compile', icon: 'play' },
      { label: 'Repetir última compilación', commandId: 'aemToolkit.compileRepeatLast', icon: 'debug-rerun' }
    ]
  },
  {
    label: 'Proyecto',
    icon: 'info',
    children: [
      { label: 'Mostrar información detectada', commandId: 'aemToolkit.showProjectInfo', icon: 'info' },
      { label: 'Actualizar detección', commandId: 'aemToolkit.refreshProjectInfo', icon: 'refresh' }
    ]
  }
  // Próximos bloques: "Sincronizar" (subir sin compilar), "Crear" (componente, XF, template,
  // content fragment, tag, modelo, servlet, diálogo, data-sly-template), "Editar" (renombrar,
  // diálogos, templates, i18n, cache).
];

class AemToolkitTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: Entry) {
    super(entry.label, entry.children ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    if (entry.icon) this.iconPath = new vscode.ThemeIcon(entry.icon);
    if (entry.commandId) {
      this.command = { command: entry.commandId, title: entry.label };
    }
  }
}

export class AemToolkitTreeProvider implements vscode.TreeDataProvider<Entry> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<Entry | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Fuerza un refresco del árbol (ej. tras re-detectar el proyecto). Hoy el árbol es estático,
   * pero bloques futuros lo alimentarán con datos dinámicos (perfiles guardados, namespace detectado). */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Entry): vscode.TreeItem {
    return new AemToolkitTreeItem(element);
  }

  getChildren(element?: Entry): Entry[] {
    if (!element) return TREE;
    return element.children ?? [];
  }
}
