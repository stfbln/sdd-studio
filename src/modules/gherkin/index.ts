import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import type { SddModule } from '../types';
import { featureFileName } from './core/files';
import { featureKind } from './host/featureKind';
import { GherkinEditorProvider } from './host/GherkinEditorProvider';

export const gherkinModule: SddModule = {
  id: 'gherkin',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(featureKind));
    context.subscriptions.push(index, GherkinEditorProvider.register(context, index), CatalogPanel.registerSerializer(context, index));

    context.subscriptions.push(
      vscode.commands.registerCommand('sdd.gherkin.openFeaturesOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.gherkin.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, GherkinEditorProvider.viewType);
      }),

      vscode.commands.registerCommand('sdd.gherkin.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? GherkinEditorProvider.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.gherkin.newFeature', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create feature files.');
          return;
        }
        const name = await vscode.window.showInputBox({
          title: 'New Gherkin feature',
          prompt: 'Feature name',
          placeHolder: 'e.g. Shopping cart checkout',
          validateInput: (v) => (v.trim() ? undefined : 'Please enter a name'),
        });
        if (!name) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          featureKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(featureKind)),
          featureFileName(name) || 'new-feature.feature',
          name,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, GherkinEditorProvider.viewType);
        }
      }),
    );
  },
};
