import * as vscode from 'vscode';
import type { CatalogHostMessage, CatalogWebviewMessage } from '../../shared/catalog';
import { baseName, joinPath, parentFolder } from '../../shared/files';
import { webviewHtml, webviewMediaRoot } from '../webviewHtml';
import type { SpecIndex } from './SpecIndex';
import type { SpecKind } from './SpecKind';
import { createFolder, createSpecFile, defaultFolder, listFolders, moveFile, toUri, toWorkspacePath } from './workspaceFiles';

/** The page listing every spec of one kind, with create / move / delete actions. One page per kind. */
export class CatalogPanel {
  private static readonly open = new Map<string, CatalogPanel>();

  private readonly disposables: vscode.Disposable[] = [];
  private stateTimer: ReturnType<typeof setTimeout> | undefined;
  private ready = false;
  private pendingPrepare: { workspace: number; folder: string } | undefined;

  static show(context: vscode.ExtensionContext, index: SpecIndex<unknown>, prepareIn?: vscode.Uri) {
    const { kind } = index;
    let page = CatalogPanel.open.get(kind.info.kind);
    if (!page) {
      const panel = vscode.window.createWebviewPanel(kind.panelViewType, kind.info.title, vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [webviewMediaRoot(context.extensionUri)],
      });
      page = new CatalogPanel(panel, context, index);
    } else {
      page.panel.reveal();
    }
    if (prepareIn) {
      const location = toWorkspacePath(prepareIn) ?? { workspace: vscode.workspace.getWorkspaceFolder(prepareIn)?.index ?? 0, path: '' };
      page.prepareCreate(location.workspace, location.path);
    }
  }

  /** Restores the page after a window reload. */
  static registerSerializer(context: vscode.ExtensionContext, index: SpecIndex<unknown>): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(index.kind.panelViewType, {
      async deserializeWebviewPanel(panel) {
        panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(context.extensionUri)] };
        CatalogPanel.open.get(index.kind.info.kind)?.panel.dispose();
        new CatalogPanel(panel, context, index);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly index: SpecIndex<unknown>,
  ) {
    const { kind } = index;
    CatalogPanel.open.set(kind.info.kind, this);
    panel.webview.html = webviewHtml(panel.webview, context.extensionUri, 'catalog', kind.info.title);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: CatalogWebviewMessage) => this.onMessage(m)),
      index.onDidChange(() => this.scheduleState()),
      vscode.workspace.onDidCreateFiles(() => this.scheduleState()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration(kind.folderSetting) && this.scheduleState()),
      panel.onDidChangeViewState(() => panel.visible && this.scheduleState()),
    );
    panel.onDidDispose(() => this.dispose());
  }

  private get kind(): SpecKind<unknown> {
    return this.index.kind;
  }

  private post(message: CatalogHostMessage) {
    void this.panel.webview.postMessage(message);
  }

  private prepareCreate(workspace: number, folder: string) {
    if (this.ready) this.post({ type: 'prepareCreate', workspace, folder });
    else this.pendingPrepare = { workspace, folder };
  }

  private scheduleState() {
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => void this.sendState(), 150);
  }

  private async sendState() {
    const specs = await this.index.summaries();
    const root = defaultFolder(this.kind);
    this.post({
      type: 'state',
      info: this.kind.info,
      workspaces: (vscode.workspace.workspaceFolders ?? []).map((f) => ({ index: f.index, name: f.name })),
      defaultFolder: root,
      folders: await listFolders(root, specs),
      specs,
    });
  }

  private async onMessage(message: CatalogWebviewMessage) {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        await this.sendState();
        if (this.pendingPrepare) this.post({ type: 'prepareCreate', ...this.pendingPrepare });
        this.pendingPrepare = undefined;
        return;
      case 'refresh':
        return this.sendState();
      case 'open':
        return vscode.commands.executeCommand(
          'vscode.openWith',
          toUri(message.workspace, message.path),
          message.asText ? 'default' : this.kind.editorViewType,
          { preview: false },
        );
      case 'reveal':
        return vscode.commands.executeCommand('revealInExplorer', toUri(message.workspace, message.path));
      case 'createSpec':
        return this.run(message.requestId, async () => {
          const uri = await createSpecFile(this.kind, message.workspace, message.folder, message.fileName, message.name);
          await this.index.refresh(uri);
          if (message.open) await vscode.commands.executeCommand('vscode.openWith', uri, this.kind.editorViewType, { preview: false });
        });
      case 'createFolder':
        return this.run(message.requestId, () => createFolder(message.workspace, message.path));
      case 'moveSpec':
        return this.run(message.requestId, async () => {
          const source = toUri(message.workspace, message.path);
          const target = message.target ?? (await this.pickDestination(message.workspace, message.path));
          if (!target) return;
          const entry = this.index.get(source);
          const warning = entry && this.kind.moveWarning?.(entry.extra);
          if (warning) {
            const choice = await vscode.window.showWarningMessage(`Move "${baseName(message.path)}"?`, { modal: true, detail: warning }, 'Move');
            if (choice !== 'Move') return;
          }
          const moved = await moveFile(source, target.workspace, target.folder);
          await this.index.refresh(moved);
        });
      case 'deleteSpec':
        return this.run(message.requestId, async () => {
          const choice = await vscode.window.showWarningMessage(
            `Delete "${baseName(message.path)}"?`,
            { modal: true, detail: 'The file is moved to the trash when your system supports it.' },
            'Delete',
          );
          if (choice !== 'Delete') return;
          const edit = new vscode.WorkspaceEdit();
          edit.deleteFile(toUri(message.workspace, message.path), { ignoreIfNotExists: true });
          if (!(await vscode.workspace.applyEdit(edit))) throw new Error('The file could not be deleted.');
        });
    }
  }

  /** Runs a file operation and reports its outcome to the page. */
  private async run(requestId: number, operation: () => Promise<unknown>) {
    try {
      await operation();
      this.post({ type: 'result', requestId });
    } catch (err) {
      this.post({ type: 'result', requestId, error: err instanceof Error ? err.message : String(err) });
    }
    await this.sendState();
  }

  private async pickDestination(workspace: number, path: string) {
    const current = parentFolder(path);
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const folders = (await listFolders(defaultFolder(this.kind), await this.index.summaries()))
      .filter((f) => !(f.workspace === workspace && f.path === current))
      .sort((a, b) => a.workspace - b.workspace || a.path.localeCompare(b.path));
    const label = (f: { workspace: number; path: string }) =>
      (multiRoot ? `${vscode.workspace.workspaceFolders![f.workspace].name}/` : '') + (f.path || '(workspace root)');

    type Item = vscode.QuickPickItem & { target?: { workspace: number; folder: string } };
    const picked = await vscode.window.showQuickPick<Item>(
      [
        { label: '$(new-folder) New folder…', alwaysShow: true },
        ...folders.map((f) => ({ label: `$(folder) ${label(f)}`, target: { workspace: f.workspace, folder: f.path } })),
      ],
      { title: `Move ${baseName(path)} to…`, placeHolder: 'Choose a destination folder' },
    );
    if (!picked) return undefined;
    if (picked.target) return picked.target;

    const typed = await vscode.window.showInputBox({
      title: `Move ${baseName(path)} to a new folder`,
      prompt: 'Folder path relative to the workspace (created if needed)',
      value: joinPath(defaultFolder(this.kind), ''),
    });
    return typed === undefined ? undefined : { workspace, folder: typed };
  }

  private dispose() {
    if (CatalogPanel.open.get(this.kind.info.kind) === this) CatalogPanel.open.delete(this.kind.info.kind);
    clearTimeout(this.stateTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
