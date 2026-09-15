import * as vscode from 'vscode';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { toUri } from '../../../host/catalog/workspaceFiles';
import { replaceText } from '../../../host/textEdits';
import { webviewHtml, webviewMediaRoot } from '../../../host/webviewHtml';
import { refreshInstructions } from '../../../shared/instructions';
import { applyEditsToValue, type JsonObject, type SpecEdit } from '../../../shared/structured/edits';
import type { StructuredHostMessage, StructuredWebviewMessage } from '../../../shared/structured/protocol';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import { mergeCatalogFiles, splitConsolidatedEdits, type ConsolidatedValue } from '../core/consolidated';
import { referencedPaths } from '../core/edits';
import { catalogInstructions } from '../core/instructions';
import type { CatalogContext } from '../core/model';
import type { NewSpecFileRequest } from '../core/brief';
import { existingFiles, onAnySpecChange, workspaceSpecs } from './context';
import { createSpecFileFromCatalog } from './newSpecFile';

export const CONSOLIDATED_VIEW_TYPE = 'sdd.backstage.consolidatedCatalog';

/**
 * Every catalog file of a workspace folder in one form. Edits are split per file and applied to
 * the text of each file (only the entities concerned are written again), then saved unless the
 * file already had unsaved changes.
 */
export class ConsolidatedCatalogPanel {
  private static readonly open = new Map<number, ConsolidatedCatalogPanel>();

  private value: ConsolidatedValue = { documents: [], files: [] };
  private brokenFiles: NonNullable<CatalogContext['consolidated']>['brokenFiles'] = [];
  private catalogPaths: string[] = [];
  /** Text we wrote ourselves in each file, so the change events are not echoed back. */
  private readonly lastWritten = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];
  private pending = Promise.resolve();
  private reloadTimer: ReturnType<typeof setTimeout> | undefined;
  private contextTimer: ReturnType<typeof setTimeout> | undefined;
  private loaded = false;

  static async show(context: vscode.ExtensionContext, index: SpecIndex<JsonObject[]>, resource?: vscode.Uri) {
    const folders = vscode.workspace.workspaceFolders ?? [];
    let folder = resource ? vscode.workspace.getWorkspaceFolder(resource) : folders.length === 1 ? folders[0] : undefined;
    if (!folder && folders.length > 1) {
      const picked = await vscode.window.showQuickPick(
        folders.map((f) => ({ label: f.name, folder: f })),
        { title: 'Consolidated catalog of which workspace folder?' },
      );
      folder = picked?.folder;
    }
    if (!folder) {
      if (!folders.length) void vscode.window.showWarningMessage('Open a folder to see its software catalog.');
      return;
    }
    const existing = ConsolidatedCatalogPanel.open.get(folder.index);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(CONSOLIDATED_VIEW_TYPE, `Catalog: ${folder.name}`, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewMediaRoot(context.extensionUri)],
    });
    new ConsolidatedCatalogPanel(panel, context, index, folder.index);
  }

  /** Restores the view after a window reload (first workspace folder). */
  static registerSerializer(context: vscode.ExtensionContext, index: SpecIndex<JsonObject[]>): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(CONSOLIDATED_VIEW_TYPE, {
      async deserializeWebviewPanel(panel) {
        if (!vscode.workspace.workspaceFolders?.length) return panel.dispose();
        panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(context.extensionUri)] };
        ConsolidatedCatalogPanel.open.get(0)?.panel.dispose();
        new ConsolidatedCatalogPanel(panel, context, index, 0);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly index: SpecIndex<JsonObject[]>,
    private readonly workspace: number,
  ) {
    ConsolidatedCatalogPanel.open.set(workspace, this);
    panel.webview.html = webviewHtml(panel.webview, context.extensionUri, 'backstage', panel.title);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: StructuredWebviewMessage) => this.onMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const path = this.pathOf(e.document.uri);
        if (!path || e.contentChanges.length === 0 || e.document.getText() === this.lastWritten.get(path)) return;
        this.scheduleReload();
      }),
      index.onDidChange(() => this.scheduleReload()),
      onAnySpecChange()(() => this.scheduleContext()),
    );
    panel.onDidDispose(() => this.dispose());
  }

  private get folder() {
    return vscode.workspace.workspaceFolders?.[this.workspace];
  }

  private post(message: StructuredHostMessage<unknown>) {
    void this.panel.webview.postMessage(message);
  }

  private pathOf(uri: vscode.Uri): string | undefined {
    const root = this.folder?.uri;
    if (!root || uri.scheme !== root.scheme || !uri.path.startsWith(`${root.path.replace(/\/$/, '')}/`)) return undefined;
    const path = uri.path.slice(root.path.replace(/\/$/, '').length + 1);
    return this.catalogPaths.includes(path) ? path : undefined;
  }

  private async onMessage(message: StructuredWebviewMessage) {
    switch (message.type) {
      case 'ready':
        this.post({ type: 'init', fileName: `${this.folder?.name ?? 'Workspace'} — all catalog files`, format: 'yaml' });
        this.loaded = false;
        await this.reload();
        return;
      case 'edits':
        this.pending = this.pending.then(() => this.applyEdits(message.edits));
        return;
      case 'openCatalog':
        return vscode.commands.executeCommand('sdd.backstage.openCatalogOverview');
      case 'openFile':
        if (this.folder) return vscode.commands.executeCommand('vscode.open', toUri(this.workspace, message.path));
        return;
      case 'command':
        if (message.name === 'newCatalogFile') return vscode.commands.executeCommand('sdd.backstage.newCatalogFile');
        return;
      case 'request': {
        const { requestId } = message;
        try {
          if (message.name !== 'newSpecFile') throw new Error(`Unknown request "${message.name}".`);
          this.post({ type: 'response', requestId, value: await createSpecFileFromCatalog(this.workspace, message.payload as NewSpecFileRequest) });
        } catch (err) {
          this.post({ type: 'response', requestId, error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
    }
  }

  /** Reads every catalog file of the folder (open documents first, so unsaved changes show). */
  private async reload() {
    const entries = (await this.index.all()).filter((e) => e.summary.workspace === this.workspace).sort((a, b) => a.summary.path.localeCompare(b.summary.path));
    const files: { path: string; documents: never[] }[] = [];
    const broken: typeof this.brokenFiles = [];
    for (const entry of entries) {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === entry.uri.toString());
      let text: string;
      try {
        text = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(entry.uri));
      } catch {
        continue;
      }
      const parsed = parseYamlDocuments(text);
      if (parsed.ok) files.push({ path: entry.summary.path, documents: (parsed.value as { documents: never[] }).documents });
      else broken.push({ path: entry.summary.path, line: parsed.errors[0]?.line, message: parsed.errors[0]?.message ?? 'Syntax error' });
    }
    this.catalogPaths = entries.map((e) => e.summary.path);
    this.brokenFiles = broken;
    const next = mergeCatalogFiles(files, this.value.files);
    const changed = JSON.stringify(next) !== JSON.stringify(this.value);
    if (changed || !this.loaded) {
      this.value = next;
      this.post({ type: 'spec', value: this.value, external: this.loaded, formattingDrift: false });
      this.loaded = true;
    }
    this.scheduleContext(0);
  }

  private scheduleReload() {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => (this.pending = this.pending.then(() => this.reload())), 300);
  }

  private scheduleContext(delay = 500) {
    clearTimeout(this.contextTimer);
    this.contextTimer = setTimeout(() => void this.sendContext(), delay);
  }

  private async sendContext() {
    const { specFiles, threatModels } = await workspaceSpecs(this.workspace);
    const files = await existingFiles(this.workspace, referencedPaths(this.value, ''), [...specFiles.map((f) => f.path), ...this.catalogPaths]);
    const context: CatalogContext = {
      file: '',
      specFiles,
      entities: [],
      catalogFiles: this.catalogPaths,
      threatModels,
      files,
      consolidated: { folder: this.folder?.name ?? '', brokenFiles: this.brokenFiles },
    };
    this.post({ type: 'context', value: context });
  }

  private async applyEdits(edits: SpecEdit[]) {
    try {
      const byFile = splitConsolidatedEdits(this.value.files, edits);
      for (const [path, fileEdits] of byFile) {
        const document = await vscode.workspace.openTextDocument(toUri(this.workspace, path));
        const wasDirty = document.isDirty;
        const current = document.getText();
        let text = refreshInstructions(applyYamlDocumentEdits(current, fileEdits), catalogInstructions());
        if (current.includes('\r\n')) text = text.replace(/\r?\n/g, '\r\n');
        this.lastWritten.set(path, text);
        if (!(await replaceText(document, text))) throw new Error(`VS Code refused the change to ${path}.`);
        // Files changed only from this view are saved; files with other unsaved changes are left to the user.
        if (!wasDirty) await document.save();
      }
      this.value = applyEditsToValue(this.value, edits);
      this.scheduleContext();
    } catch (err) {
      this.post({ type: 'editFailed', message: err instanceof Error ? err.message : String(err) });
      this.loaded = true;
      this.value = { documents: [], files: this.value.files };
      await this.reload();
    }
  }

  private dispose() {
    if (ConsolidatedCatalogPanel.open.get(this.workspace) === this) ConsolidatedCatalogPanel.open.delete(this.workspace);
    clearTimeout(this.reloadTimer);
    clearTimeout(this.contextTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
