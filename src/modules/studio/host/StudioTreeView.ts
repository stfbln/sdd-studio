import * as vscode from 'vscode';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { toUri } from '../../../host/catalog/workspaceFiles';
import type { SpecSummary } from '../../../shared/catalog';
import { baseName, parentFolder } from '../../../shared/files';
import { groupKinds } from '../core/home';
import type { StudioKind } from '../core/protocol';
import { describeKinds } from './kinds';

/** Holds the "Open SDD Studio" button: the view stays empty so its welcome content is shown. */
export const STUDIO_HOME_VIEW_ID = 'sdd.studio.home';
export const STUDIO_DOCUMENTS_VIEW_ID = 'sdd.studio.documents';
export const STUDIO_MISC_VIEW_ID = 'sdd.studio.misc';

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

/** Registers the three views of the SDD Studio container: the button, the documents and the other pages. */
export function registerStudioViews(): vscode.Disposable[] {
  const documents = new DocumentsTreeProvider();
  const rows = (items: vscode.TreeItem[]): vscode.TreeDataProvider<vscode.TreeItem> => ({
    getTreeItem: (item) => item,
    getChildren: (element) => (element ? [] : items),
  });
  return [
    documents,
    vscode.window.registerTreeDataProvider(STUDIO_HOME_VIEW_ID, rows([])),
    vscode.window.registerTreeDataProvider(STUDIO_DOCUMENTS_VIEW_ID, documents),
    vscode.window.registerTreeDataProvider(
      STUDIO_MISC_VIEW_ID,
      rows([
        actionRow('Prompts', 'sparkle', 'Build a prompt for an AI assistant from the catalog', 'sdd.prompts.open'),
        actionRow('Consolidated Catalog', 'layers', 'Every catalog file of a workspace folder in one form', 'sdd.backstage.openConsolidatedCatalog'),
      ]),
    ),
  ];
}

/** A kind of spec: the row expands to its files, and its inline button opens the catalog page of the kind. */
export class KindItem extends vscode.TreeItem {
  constructor(readonly kind: StudioKind) {
    super(kind.title, kind.count ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(kind.icon);
    this.tooltip = kind.purpose;
    this.contextValue = 'sddKind';
    if (kind.count) this.description = kind.problems ? `${kind.count} · ${plural(kind.problems, 'problem')}` : `${kind.count}`;
  }
}

/** The **Documents** view: one row per kind of spec, expanding to its files. */
class DocumentsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  readonly onDidChangeTreeData = this.emitter.event;

  constructor() {
    this.disposables.push(
      ...registeredSpecIndexes().map((index) => index.onDidChange(() => this.scheduleRefresh())),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh()),
    );
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element instanceof KindItem) return this.specRows(element.kind.kind);
    // Without a workspace there is nothing to count: the welcome content of the view takes over.
    if (element || !vscode.workspace.workspaceFolders?.length) return [];
    const { catalog, specs } = groupKinds(await describeKinds());
    return [...(catalog ? [catalog] : []), ...specs].map((kind) => new KindItem(kind));
  }

  /** The files of one kind, by folder, opening in their form editor. */
  private async specRows(kind: string): Promise<vscode.TreeItem[]> {
    const index = registeredSpecIndexes().find((i) => i.kind.info.kind === kind);
    if (!index) return [];
    const specs = [...(await index.summaries())].sort((a, b) => a.workspace - b.workspace || a.path.localeCompare(b.path));
    return specs.map((spec) => specRow(spec, index));
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.emitter.fire(), 300);
  }

  dispose() {
    clearTimeout(this.refreshTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}

/** A page of the extension, opened by clicking the row. */
function actionRow(label: string, icon: string, tooltip: string, command: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label);
  item.iconPath = new vscode.ThemeIcon(icon);
  item.tooltip = tooltip;
  item.command = { command, title: label };
  return item;
}

function specRow(spec: SpecSummary, index: SpecIndex<unknown>): vscode.TreeItem {
  const uri = toUri(spec.workspace, spec.path);
  const folders = vscode.workspace.workspaceFolders ?? [];
  const location = (folders.length > 1 ? `${folders[spec.workspace]?.name ?? ''}/` : '') + spec.path;

  const item = new vscode.TreeItem(spec.name || baseName(spec.path));
  item.resourceUri = uri;
  item.description = parentFolder(location) || baseName(spec.path);
  item.tooltip = [location, spec.error, ...spec.details].filter(Boolean).join('\n');
  item.command = { command: 'vscode.openWith', title: 'Open', arguments: [uri, index.kind.editorViewType, { preview: false }] };
  if (spec.error) item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('list.errorForeground'));
  else if (spec.problems) item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
  return item;
}
