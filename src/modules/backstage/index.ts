import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../shared/structured/yamlDocuments';
import type { SpecEdit } from '../../shared/structured/edits';
import type { SddModule } from '../types';
import { looksLikeCatalog } from './core/summary';
import { catalogKind } from './host/catalogKind';
import { ConsolidatedCatalogPanel } from './host/ConsolidatedCatalogPanel';
import { computeCatalogContext, onAnySpecChange } from './host/context';
import { createSpecFileFromCatalog, workspaceIndexOf } from './host/newSpecFile';
import type { NewSpecFileRequest } from './core/brief';

const SPEC_CONTEXT_KEY = 'sdd.backstage.activeEditorIsCatalog';

export const backstageModule: SddModule = {
  id: 'backstage',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(catalogKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: catalogKind.editorViewType,
      bundle: 'backstage',
      title: 'Software Catalog Editor',
      catalogCommand: 'sdd.backstage.openCatalogOverview',
      instructions: catalogKind.instructions,
      engine: {
        format: () => 'yaml',
        parse: (text) => parseYamlDocuments(text),
        apply: (text, _format, edits) => applyYamlDocumentEdits(text, edits as SpecEdit[]),
      },
      commands: { consolidated: 'sdd.backstage.openConsolidatedCatalog', newCatalogFile: 'sdd.backstage.newCatalogFile' },
      requests: { newSpecFile: (document, payload) => createSpecFileFromCatalog(workspaceIndexOf(document), payload as NewSpecFileRequest) },
      context: {
        compute: (document) => computeCatalogContext(document, index),
        onDidChange: onAnySpecChange(),
      },
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index), ConsolidatedCatalogPanel.registerSerializer(context, index));

    const updateContext = () => {
      const document = vscode.window.activeTextEditor?.document;
      const isCatalog = !!document && looksLikeCatalog(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));
      return vscode.commands.executeCommand('setContext', SPEC_CONTEXT_KEY, isCatalog);
    };
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.backstage.openCatalogOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.backstage.openConsolidatedCatalog', (resource?: vscode.Uri) =>
        ConsolidatedCatalogPanel.show(context, index, resource instanceof vscode.Uri ? resource : (editor.activeDocumentUri() ?? vscode.window.activeTextEditor?.document.uri)),
      ),

      vscode.commands.registerCommand('sdd.backstage.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, catalogKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.backstage.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.backstage.newCatalogFile', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create catalog files.');
          return;
        }
        const title = await vscode.window.showInputBox({
          title: 'New catalog file (Backstage)',
          prompt: 'Name of the system described by the file',
          placeHolder: 'e.g. Online shop',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          catalogKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(catalogKind)),
          `${slugify(title)}.catalog-info.yaml`,
          title,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, catalogKind.editorViewType);
        }
      }),
    );
  },
};
