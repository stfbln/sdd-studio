import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { looksLikeAsyncApi } from './core/summary';
import { asyncSpecKind } from './host/asyncSpecKind';

const SPEC_CONTEXT_KEY = 'sdd.asyncapi.activeEditorIsSpec';

export const asyncApiModule: SddModule = {
  id: 'asyncapi',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(asyncSpecKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: asyncSpecKind.editorViewType,
      bundle: 'asyncapi',
      title: 'AsyncAPI Editor',
      catalogCommand: 'sdd.asyncapi.openSpecsOverview',
      instructions: asyncSpecKind.instructions,
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isSpec = !!document && looksLikeAsyncApi(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isSpec);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.asyncapi.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.asyncapi.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, asyncSpecKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.asyncapi.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.asyncapi.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create AsyncAPI specifications.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New AsyncAPI specification',
          prompt: 'Application or API name',
          placeHolder: 'e.g. Order events',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          asyncSpecKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(asyncSpecKind)),
          `${slugify(title)}.asyncapi.yaml`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, asyncSpecKind.editorViewType);
        }
      }),
    );
  },
};
