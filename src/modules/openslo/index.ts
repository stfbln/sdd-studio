import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SpecEdit } from '../../shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../shared/structured/yamlDocuments';
import type { SddModule } from '../types';
import { looksLikeOpenSlo } from './core/summary';
import { openSloKind } from './host/openSloKind';

const SPEC_CONTEXT_KEY = 'sdd.openslo.activeEditorIsSpec';

export const openSloModule: SddModule = {
  id: 'openslo',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(openSloKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: openSloKind.editorViewType,
      bundle: 'openslo',
      title: 'OpenSLO Editor',
      catalogCommand: 'sdd.openslo.openSpecsOverview',
      instructions: openSloKind.instructions,
      engine: {
        format: () => 'yaml',
        parse: (text) => parseYamlDocuments(text),
        apply: (text, _format, edits) => applyYamlDocumentEdits(text, edits as SpecEdit[]),
      },
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isSpec = !!document && looksLikeOpenSlo(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isSpec);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.openslo.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.openslo.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, openSloKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.openslo.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.openslo.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create OpenSLO files.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New OpenSLO file',
          prompt: 'Name of the service the SLOs describe',
          placeHolder: 'e.g. Checkout service',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          openSloKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(openSloKind)),
          `${slugify(title)}.openslo.yaml`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, openSloKind.editorViewType);
        }
      }),
    );
  },
};
