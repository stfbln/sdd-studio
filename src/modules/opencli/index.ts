import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { looksLikeOpenCli } from './core/summary';
import { cliSpecKind } from './host/cliSpecKind';

const SPEC_CONTEXT_KEY = 'sdd.opencli.activeEditorIsSpec';

export const openCliModule: SddModule = {
  id: 'opencli',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(cliSpecKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: cliSpecKind.editorViewType,
      bundle: 'opencli',
      title: 'OpenCLI Editor',
      catalogCommand: 'sdd.opencli.openSpecsOverview',
      instructions: cliSpecKind.instructions,
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isSpec = !!document && looksLikeOpenCli(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isSpec);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.opencli.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.opencli.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, cliSpecKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.opencli.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.opencli.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create CLI specifications.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New CLI specification (OpenCLI)',
          prompt: 'Name of the command line tool',
          placeHolder: 'e.g. Acme deploy tool',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          cliSpecKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(cliSpecKind)),
          `${slugify(title)}.opencli.json`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, cliSpecKind.editorViewType);
        }
      }),
    );
  },
};
