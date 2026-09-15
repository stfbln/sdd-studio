import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { looksLikeOtm } from './core/summary';
import { otmKind } from './host/otmKind';

const SPEC_CONTEXT_KEY = 'sdd.otm.activeEditorIsSpec';

export const otmModule: SddModule = {
  id: 'otm',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(otmKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: otmKind.editorViewType,
      bundle: 'otm',
      title: 'Threat Model Editor',
      catalogCommand: 'sdd.otm.openThreatModelsOverview',
      instructions: otmKind.instructions,
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isSpec = !!document && looksLikeOtm(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isSpec);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.otm.openThreatModelsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.otm.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, otmKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.otm.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.otm.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create threat models.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New threat model (OTM)',
          prompt: 'System or project name',
          placeHolder: 'e.g. Online shop',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          otmKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(otmKind)),
          `${slugify(title)}.otm.yaml`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, otmKind.editorViewType);
        }
      }),
    );
  },
};
