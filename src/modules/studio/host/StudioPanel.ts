import * as vscode from 'vscode';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import { webviewHtml, webviewMediaRoot } from '../../../host/webviewHtml';
import type { StudioAction, StudioHostMessage, StudioWebviewMessage } from '../core/protocol';
import { describeKinds, openOverview } from './kinds';

export const STUDIO_VIEW_TYPE = 'sdd.studio.home';
const TITLE = 'SDD Studio';

/** The home page of the extension: every overview, the catalog and the AI assistant pages, one click away. */
export class StudioPanel {
  private static current: StudioPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private stateTimer: ReturnType<typeof setTimeout> | undefined;

  static show(context: vscode.ExtensionContext) {
    if (StudioPanel.current) {
      StudioPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(STUDIO_VIEW_TYPE, TITLE, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewMediaRoot(context.extensionUri)],
    });
    new StudioPanel(panel, context);
  }

  /** Restores the page after a window reload. */
  static registerSerializer(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(STUDIO_VIEW_TYPE, {
      async deserializeWebviewPanel(panel) {
        panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(context.extensionUri)] };
        StudioPanel.current?.panel.dispose();
        new StudioPanel(panel, context);
      },
    });
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    StudioPanel.current = this;
    panel.webview.html = webviewHtml(panel.webview, context.extensionUri, 'studio', TITLE);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: StudioWebviewMessage) => this.onMessage(m)),
      ...registeredSpecIndexes().map((i) => i.onDidChange(() => this.scheduleState())),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleState()),
    );
    panel.onDidDispose(() => this.dispose());
  }

  private scheduleState() {
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => void this.sendState(), 150);
  }

  private async sendState() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const kinds = folders.length ? await describeKinds() : [];
    const message: StudioHostMessage = {
      type: 'state',
      hasWorkspace: folders.length > 0,
      workspaces: folders.map((f) => f.name),
      kinds,
    };
    void this.panel.webview.postMessage(message);
  }

  private async onMessage(message: StudioWebviewMessage) {
    switch (message.type) {
      case 'ready':
        return this.sendState();
      case 'openOverview':
        return openOverview(this.context, message.kind);
      case 'run':
        return this.run(message.action);
    }
  }

  private run(action: StudioAction) {
    switch (action) {
      case 'consolidatedCatalog':
        return vscode.commands.executeCommand('sdd.backstage.openConsolidatedCatalog');
      case 'prompts':
        return vscode.commands.executeCommand('sdd.prompts.open');
      case 'instructions':
        return vscode.commands.executeCommand('sdd.addUpdateInstructionsToWorkspace');
      case 'configureClaudeCode':
        return vscode.commands.executeCommand('sdd.mcp.configureClaudeCode');
      case 'settings':
        return vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sdd.sdd-studio');
    }
  }

  private dispose() {
    if (StudioPanel.current === this) StudioPanel.current = undefined;
    clearTimeout(this.stateTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
