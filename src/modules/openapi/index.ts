import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { newFileText } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { newSpecTemplate } from './core/openapi';
import { looksLikeApiSpec } from './core/summary';
import { apiSpecKind } from './host/apiSpecKind';


const SPEC_CONTEXT_KEY = 'sdd.openapi.activeEditorIsSpec';

const looksLikeOpenApi = (document: vscode.TextDocument) =>
  looksLikeApiSpec(document.fileName, document.getText(new vscode.Range(0, 0, 200, 0)));

export const openApiModule: SddModule = {
  id: 'openapi',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(apiSpecKind));
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: apiSpecKind.editorViewType,
      bundle: 'openapi',
      title: 'OpenAPI Editor',
      catalogCommand: 'sdd.openapi.openSpecsOverview',
      instructions: apiSpecKind.instructions,
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    const updateContext = () =>
      vscode.commands.executeCommand(
        'setContext',
        SPEC_CONTEXT_KEY,
        !!vscode.window.activeTextEditor && looksLikeOpenApi(vscode.window.activeTextEditor.document),
      );
    void updateContext();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(updateContext),
      vscode.workspace.onDidSaveTextDocument(updateContext),

      vscode.commands.registerCommand('sdd.openapi.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.openapi.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, apiSpecKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.openapi.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.openapi.newSpec', async (folder?: vscode.Uri) => {
        const base = folder ?? vscode.workspace.workspaceFolders?.[0]?.uri;
        const title = await vscode.window.showInputBox({
          title: 'New OpenAPI specification',
          prompt: 'API name',
          placeHolder: 'e.g. Orders API',
          validateInput: (v) => (slugify(v) ? undefined : 'Please enter a name'),
        });
        if (!title) return;
        const target = await vscode.window.showSaveDialog({
          defaultUri: base ? vscode.Uri.joinPath(base, `${slugify(title)}.openapi.yaml`) : undefined,
          filters: { OpenAPI: ['yaml', 'yml', 'json'] },
        });
        if (!target) return;
        const content = newFileText(apiSpecKind, target.path, newSpecTemplate(title, /\.json$/i.test(target.path) ? 'json' : 'yaml'));
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
        await index.refresh(target);
        await vscode.commands.executeCommand('vscode.openWith', target, apiSpecKind.editorViewType);
      }),
    );
  },
};
