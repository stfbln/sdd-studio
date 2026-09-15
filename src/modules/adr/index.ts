import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { baseName, normalizeFolder, parentFolder } from '../../shared/files';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { applyAdrEdits, type AdrEdit } from './core/edits';
import { parseAdrFile } from './core/parse';
import { ADR_NUMBER_RE, looksLikeAdr } from './core/summary';
import { adrKind } from './host/adrKind';

/** Other markdown files get the "Open in Form Editor" button when they look like an ADR. */
const ADR_CONTEXT_KEY = 'sdd.adr.activeEditorIsSpec';

async function nextAdrNumber(index: SpecIndex<undefined>, workspace: number, folder: string): Promise<string> {
  const target = normalizeFolder(folder);
  const numbers = (await index.summaries())
    .filter((s) => s.workspace === workspace && parentFolder(s.path) === target)
    .map((s) => Number(ADR_NUMBER_RE.exec(baseName(s.path))?.[1]))
    .filter((n) => !Number.isNaN(n));
  return String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0');
}

export const adrModule: SddModule = {
  id: 'adr',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(adrKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: adrKind.editorViewType,
      bundle: 'adr',
      title: 'ADR Editor',
      catalogCommand: 'sdd.adr.openDecisionsOverview',
      instructions: adrKind.instructions,
      engine: {
        format: () => 'markdown',
        parse: (text) => ({ ok: true, value: parseAdrFile(text), formattingDrift: false }),
        apply: (text, _format, edits) => applyAdrEdits(text, edits as AdrEdit[]),
      },
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isAdr = !!document && looksLikeAdr(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', ADR_CONTEXT_KEY, isAdr);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.adr.openDecisionsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.adr.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, adrKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.adr.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.adr.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create ADRs.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New ADR',
          prompt: 'Short title of the decision (the problem solved and the option found)',
          placeHolder: 'e.g. Use PostgreSQL for the order store',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a title'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const targetFolder = location?.path ?? (folder ? '' : defaultFolder(adrKind));
        const number = await nextAdrNumber(index, workspaceFolder.index, targetFolder);
        const uri = await createSpecFile(adrKind, workspaceFolder.index, targetFolder, `${number}-${slugify(title)}.md`, title).catch(
          (err: Error) => void vscode.window.showErrorMessage(err.message),
        );
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, adrKind.editorViewType);
        }
      }),
    );
  },
};
