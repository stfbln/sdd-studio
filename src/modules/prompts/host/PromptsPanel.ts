import * as vscode from 'vscode';
import { SddStudioService } from '../../../api/service';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import { webviewHtml, webviewMediaRoot } from '../../../host/webviewHtml';
import type { PromptsHostMessage, PromptsWebviewMessage } from '../core/protocol';

export const PROMPTS_VIEW_TYPE = 'sdd.prompts.panel';
const TITLE = 'SDD Prompts';

/** Page building prompts for LLM assistants: new system, spec updates, implementation. */
export class PromptsPanel {
  private static current: PromptsPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly service = new SddStudioService();
  private stateTimer: ReturnType<typeof setTimeout> | undefined;

  static show(context: vscode.ExtensionContext) {
    if (PromptsPanel.current) {
      PromptsPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(PROMPTS_VIEW_TYPE, TITLE, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewMediaRoot(context.extensionUri)],
    });
    new PromptsPanel(panel, context);
  }

  /** Restores the page after a window reload (the page keeps its drafts in its webview state). */
  static registerSerializer(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(PROMPTS_VIEW_TYPE, {
      async deserializeWebviewPanel(panel) {
        panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(context.extensionUri)] };
        PromptsPanel.current?.panel.dispose();
        new PromptsPanel(panel, context);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    PromptsPanel.current = this;
    panel.webview.html = webviewHtml(panel.webview, context.extensionUri, 'prompts', TITLE);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: PromptsWebviewMessage) => this.onMessage(m)),
      ...registeredSpecIndexes()
        .filter((i) => i.kind.info.kind === 'backstage')
        .map((i) => i.onDidChange(() => this.scheduleState())),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleState()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('sdd.mcp.enabled') && this.scheduleState()),
    );
    panel.onDidDispose(() => this.dispose());
  }

  private scheduleState() {
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => void this.sendState(), 150);
  }

  private async sendState() {
    const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    const entities = hasWorkspace ? await this.service.listCatalogEntities().catch(() => []) : [];
    const message: PromptsHostMessage = {
      type: 'state',
      hasWorkspace,
      entities: entities.map((e) => ({
        ref: e.ref,
        category: e.category,
        kind: e.kind,
        ...(e.type ? { type: e.type } : {}),
        ...(e.title ? { title: e.title } : {}),
        ...(e.description ? { description: e.description } : {}),
        ...(e.system ? { system: e.system } : {}),
        file: e.file,
        // The folder only tells entities apart when several are open.
        workspaceFolder: multiRoot ? e.workspaceFolder : '',
      })),
      mcpEnabled: vscode.workspace.getConfiguration('sdd.mcp').get<boolean>('enabled', true),
    };
    void this.panel.webview.postMessage(message);
  }

  private async onMessage(message: PromptsWebviewMessage) {
    switch (message.type) {
      case 'ready':
        return this.sendState();
      case 'copy':
        await vscode.env.clipboard.writeText(message.text);
        void vscode.window.showInformationMessage('Prompt copied: paste it in your AI assistant.');
        return;
      case 'openAsDocument': {
        const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: message.text });
        await vscode.window.showTextDocument(document, { preview: false });
        return;
      }
      case 'openEntity': {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const folder = folders.find((f) => f.name === message.entity.workspaceFolder) ?? folders[0];
        if (folder) await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(folder.uri, ...message.entity.file.split('/')), { preview: false });
        return;
      }
      case 'enableMcp':
        return vscode.workspace.getConfiguration('sdd.mcp').update('enabled', true, vscode.ConfigurationTarget.Global);
      case 'configureClaudeCode':
        return vscode.commands.executeCommand('sdd.mcp.configureClaudeCode');
    }
  }

  private dispose() {
    if (PromptsPanel.current === this) PromptsPanel.current = undefined;
    clearTimeout(this.stateTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
