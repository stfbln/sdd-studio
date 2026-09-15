import * as vscode from 'vscode';
import { replaceText } from '../../../host/textEdits';
import { webviewHtml, webviewMediaRoot } from '../../../host/webviewHtml';
import { reworkPrompt } from '../../../shared/reworkPrompt';
import { getDialect, listLanguages, translateDocument } from '../core/dialects';
import { featureInstructions } from '../core/instructions';
import type { GherkinDocumentModel } from '../core/model';
import { parseGherkin } from '../core/parse';
import type { HostMessage, WebviewMessage } from '../core/protocol';
import { serializeGherkin } from '../core/serialize';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { stepSuggestions } from './featureKind';

/**
 * Visual editor for .feature files. The TextDocument stays the single source of truth:
 * webview edits are serialized and applied as text edits (so dirty state, undo, save
 * and hot exit behave like any text file), and text changes are parsed and pushed back.
 */
export class GherkinEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'sdd.gherkin.editor';
  private static activeUri: vscode.Uri | undefined;

  static register(context: vscode.ExtensionContext, index: SpecIndex<string[]>): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      GherkinEditorProvider.viewType,
      new GherkinEditorProvider(context, index),
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true },
    );
  }

  static activeDocumentUri(): vscode.Uri | undefined {
    return GherkinEditorProvider.activeUri;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly index: SpecIndex<string[]>,
  ) {}

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    panel.webview.options = { enableScripts: true, localResourceRoots: [webviewMediaRoot(this.context.extensionUri)] };
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, 'gherkin', 'Gherkin Visual Editor');

    const post = (message: HostMessage) => panel.webview.postMessage(message);
    /** Text we wrote ourselves, so the resulting change event is not echoed back. */
    let lastWritten: string | undefined;
    let pendingEdits = Promise.resolve();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const sendDocument = (external: boolean, parsed?: GherkinDocumentModel) => {
      if (parsed) {
        post({ type: 'document', document: parsed, dialect: getDialect(parsed.language), external });
        return;
      }
      const result = parseGherkin(document.getText());
      if (result.ok) sendDocument(external, result.document);
      else post({ type: 'parseErrors', errors: result.errors });
    };

    const sendSuggestions = async () => post({ type: 'stepSuggestions', steps: await stepSuggestions(this.index) });

    const write = (model: GherkinDocumentModel) => {
      pendingEdits = pendingEdits.then(async () => {
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const text = serializeGherkin(model).replace(/\n/g, eol);
        lastWritten = text;
        const applied = await replaceText(document, text);
        if (!applied) {
          void vscode.window.showErrorMessage(`SDD: could not update ${vscode.workspace.asRelativePath(document.uri)}.`);
          sendDocument(true);
        }
      });
      return pendingEdits;
    };

    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
        switch (message.type) {
          case 'ready':
            post({ type: 'init', fileName: vscode.workspace.asRelativePath(document.uri), languages: listLanguages() });
            sendDocument(false);
            void sendSuggestions();
            break;
          case 'edit':
            await write(message.document);
            break;
          case 'changeLanguage': {
            const translated = translateDocument(message.document, message.language);
            await write(translated);
            sendDocument(true, translated);
            break;
          }
          case 'openAsText':
            await vscode.window.showTextDocument(document, {
              viewColumn: panel.viewColumn,
              selection: message.line ? new vscode.Range(message.line - 1, 0, message.line - 1, 0) : undefined,
            });
            break;
          case 'openOverview':
            await vscode.commands.executeCommand('sdd.gherkin.openFeaturesOverview');
            break;
          case 'copyPrompt':
          case 'openAsDocument': {
            const prompt = reworkPrompt(vscode.workspace.asRelativePath(document.uri), featureInstructions());
            if (message.type === 'copyPrompt') {
              await vscode.env.clipboard.writeText(prompt);
              void vscode.window.showInformationMessage('Prompt copied: paste it in your AI assistant.');
            } else {
              const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: prompt });
              await vscode.window.showTextDocument(doc, { preview: false });
            }
            break;
          }
        }
      }),

      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString() || e.contentChanges.length === 0) return;
        if (document.getText() === lastWritten) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => sendDocument(true), 150);
      }),

      panel.onDidChangeViewState(() => {
        if (panel.active) GherkinEditorProvider.activeUri = document.uri;
      }),

      this.index.onDidChange(() => void sendSuggestions()),

      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('sdd.gherkin.stepSuggestions')) void sendSuggestions();
      }),
    ];

    if (panel.active) GherkinEditorProvider.activeUri = document.uri;

    panel.onDidDispose(() => {
      clearTimeout(refreshTimer);
      disposables.forEach((d) => d.dispose());
    });
  }
}
