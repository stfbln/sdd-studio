import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { applySpecEdits, type SpecEdit } from './core/edits';
import { parseSpecFile } from './core/parse';
import { looksLikeSpec, SPEC_EXTENSION } from './core/summary';
import { computeSpecContext } from './host/context';
import { specKind } from './host/specKind';

/** Other markdown files get the "Open in Form Editor" button when they look like a spec. */
const SPEC_CONTEXT_KEY = 'sdd.spec.activeEditorIsSpec';

export const specModule: SddModule = {
  id: 'spec',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(specKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: specKind.editorViewType,
      bundle: 'spec',
      title: 'Spec Editor',
      catalogCommand: 'sdd.spec.openSpecsOverview',
      instructions: specKind.instructions,
      engine: {
        format: () => 'markdown',
        parse: (text) => ({ ok: true, value: parseSpecFile(text), formattingDrift: false }),
        apply: (text, _format, edits) => applySpecEdits(text, edits as SpecEdit[]),
      },
      context: {
        compute: (document) => computeSpecContext(document, index),
        onDidChange: index.onDidChange,
      },
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isSpec = !!document && looksLikeSpec(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isSpec);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.spec.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.spec.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, specKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.spec.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.spec.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create specs.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New spec',
          prompt: 'Name of the system or component the spec presents',
          placeHolder: 'e.g. Payment service',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          specKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(specKind)),
          `${slugify(title)}${SPEC_EXTENSION}`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, specKind.editorViewType);
        }
      }),
    );
  },
};
