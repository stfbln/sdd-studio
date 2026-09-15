import * as vscode from 'vscode';
import { refreshInstructions, type FileInstructions } from '../shared/instructions';
import { reworkPrompt } from '../shared/reworkPrompt';
import type { SpecEdit } from '../shared/structured/edits';
import type { StructuredHostMessage, StructuredWebviewMessage } from '../shared/structured/protocol';
import { applySpecEdits, detectFormat, parseSpec, type SpecProblem } from '../shared/structured/specText';
import { replaceText } from './textEdits';
import { webviewHtml, webviewMediaRoot } from './webviewHtml';

/** "Rework with AI": every kind of spec file already carries update instructions describing its format and structure; reuse them as the prompt's rules instead of restating them. */
async function reworkRequest(document: vscode.TextDocument, instructions: (fileName: string, text: string) => FileInstructions, action: 'copyPrompt' | 'openAsDocument'): Promise<void> {
  const prompt = reworkPrompt(vscode.workspace.asRelativePath(document.uri), instructions(document.fileName, document.getText()));
  if (action === 'copyPrompt') {
    await vscode.env.clipboard.writeText(prompt);
    void vscode.window.showInformationMessage('Prompt copied: paste it in your AI assistant.');
  } else {
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: prompt });
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}

/** How a kind of file is parsed for the form and how form edits are written back to its text. */
export interface SpecTextEngine {
  format(fileName: string, text: string): string;
  parse(text: string, format: string): { ok: true; value: unknown; formattingDrift: boolean } | { ok: false; errors: SpecProblem[] };
  apply(text: string, format: string, edits: unknown[]): string;
}

/** YAML and JSON documents edited through `SpecEdit`s (OpenAPI, AsyncAPI). */
export const yamlJsonEngine: SpecTextEngine = {
  format: detectFormat,
  parse: (text, format) => parseSpec(text, format as 'yaml' | 'json'),
  apply: (text, format, edits) => applySpecEdits(text, format as 'yaml' | 'json', edits as SpecEdit[]),
};

export interface StructuredEditorOptions {
  viewType: string;
  /** Name of the webview bundle in dist/webview. */
  bundle: string;
  title: string;
  /** Command opening the catalog page of this kind of spec. */
  catalogCommand: string;
  /** Defaults to YAML/JSON. */
  engine?: SpecTextEngine;
  /** Update instructions of the file: a header already written is kept up to date as the form edits the file. */
  instructions?: (fileName: string, text: string) => FileInstructions;
  /** Commands the form may run by name (`{ type: 'command' }` messages), called with the document URI. */
  commands?: Record<string, string>;
  /** Work the form may ask for by name (`{ type: 'request' }` messages); the result or error is sent back. */
  requests?: Record<string, (document: vscode.TextDocument, payload: unknown) => Promise<unknown>>;
  /** Extra data sent to the form, recomputed when the document or `onDidChange` changes. */
  context?: {
    compute(document: vscode.TextDocument): Promise<unknown>;
    onDidChange?: vscode.Event<unknown>;
  };
}

/**
 * Form editor for specification files (OpenAPI, AsyncAPI, Protocol Buffers). The text stays the
 * source of truth: the form sends targeted edits that are applied to the text, so comments,
 * ordering and anything unknown to the form are preserved.
 */
export class StructuredSpecEditorProvider implements vscode.CustomTextEditorProvider {
  private activeUri: vscode.Uri | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly options: StructuredEditorOptions,
  ) {}

  register(): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(this.options.viewType, this, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    });
  }

  activeDocumentUri(): vscode.Uri | undefined {
    return this.activeUri;
  }

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(this.context.extensionUri)] };
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, this.options.bundle, this.options.title);

    const engine = this.options.engine ?? yamlJsonEngine;
    const format = engine.format(document.fileName, document.getText());
    const post = (message: StructuredHostMessage<unknown>) => panel.webview.postMessage(message);
    /** Text we wrote ourselves, so the resulting change event is not echoed back. */
    let lastWritten: string | undefined;
    let pendingEdits = Promise.resolve();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let contextTimer: ReturnType<typeof setTimeout> | undefined;
    let lastContext: string | undefined;
    let disposed = false;

    const sendSpec = (external: boolean) => {
      const result = engine.parse(document.getText(), format);
      if (result.ok) post({ type: 'spec', value: result.value, external, formattingDrift: result.formattingDrift });
      else post({ type: 'parseErrors', errors: result.errors });
    };
    const { context } = this.options;
    const sendContext = (delay = 0) => {
      if (!context) return;
      clearTimeout(contextTimer);
      contextTimer = setTimeout(async () => {
        const value = await context.compute(document).catch(() => undefined);
        const json = JSON.stringify(value);
        if (disposed || json === lastContext) return;
        lastContext = json;
        post({ type: 'context', value });
      }, delay);
    };

    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((message: StructuredWebviewMessage<unknown>) => {
        switch (message.type) {
          case 'ready':
            post({ type: 'init', fileName: vscode.workspace.asRelativePath(document.uri), format });
            sendSpec(false);
            lastContext = undefined;
            sendContext();
            break;
          case 'edits':
            pendingEdits = pendingEdits.then(async () => {
              try {
                const current = document.getText();
                let text = engine.apply(current, format, message.edits);
                if (this.options.instructions) text = refreshInstructions(text, this.options.instructions(document.fileName, text));
                if (current.includes('\r\n')) text = text.replace(/\r?\n/g, '\r\n');
                lastWritten = text;
                if (!(await replaceText(document, text))) throw new Error('VS Code refused the edit.');
              } catch (err) {
                post({ type: 'editFailed', message: err instanceof Error ? err.message : String(err) });
                sendSpec(true);
              }
            });
            break;
          case 'openAsText':
            void vscode.window.showTextDocument(document, {
              viewColumn: panel.viewColumn,
              selection: message.line ? new vscode.Range(message.line - 1, 0, message.line - 1, 0) : undefined,
            });
            break;
          case 'openCatalog':
            void vscode.commands.executeCommand(this.options.catalogCommand);
            break;
          case 'command': {
            const command = this.options.commands?.[message.name];
            if (command) void vscode.commands.executeCommand(command, document.uri);
            break;
          }
          case 'request': {
            const handler = this.options.requests?.[message.name];
            const { instructions } = this.options;
            const builtIn = !handler && instructions && (message.name === 'copyPrompt' || message.name === 'openAsDocument') ? () => reworkRequest(document, instructions, message.name as 'copyPrompt' | 'openAsDocument') : undefined;
            const { requestId } = message;
            Promise.resolve()
              .then(() => (handler ? handler(document, message.payload) : builtIn ? builtIn() : Promise.reject(new Error(`Unknown request "${message.name}".`))))
              .then(
                (value) => post({ type: 'response', requestId, value }),
                (err) => post({ type: 'response', requestId, error: err instanceof Error ? err.message : String(err) }),
              );
            break;
          }
          case 'openFile': {
            const folder = vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0];
            if (folder) void vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(folder.uri, ...message.path.split('/')));
            break;
          }
        }
      }),

      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString() || e.contentChanges.length === 0) return;
        sendContext(500);
        if (document.getText() === lastWritten) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => sendSpec(true), 200);
      }),

      panel.onDidChangeViewState(() => {
        if (panel.active) this.activeUri = document.uri;
      }),
    ];
    if (context?.onDidChange) disposables.push(context.onDidChange(() => sendContext(300)));

    if (panel.active) this.activeUri = document.uri;
    panel.onDidDispose(() => {
      disposed = true;
      clearTimeout(refreshTimer);
      clearTimeout(contextTimer);
      disposables.forEach((d) => d.dispose());
    });
  }
}
