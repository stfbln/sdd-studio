import * as vscode from 'vscode';
import { CatalogPanel } from '../../host/catalog/CatalogPanel';
import { registerSpecIndex } from '../../host/catalog/registry';
import { SpecIndex } from '../../host/catalog/SpecIndex';
import { createSpecFile, defaultFolder, toWorkspacePath } from '../../host/catalog/workspaceFiles';
import { StructuredSpecEditorProvider } from '../../host/StructuredSpecEditorProvider';
import { slugify } from '../../shared/naming';
import type { SddModule } from '../types';
import { parseProtoDocument } from './core/document';
import { applyProtoEdits, type ProtoEdit } from './core/edits';
import { ProtoImportResolver } from './host/imports';
import { protoKind } from './host/protoKind';

export const protoModule: SddModule = {
  id: 'proto',

  activate(context) {
    const index = registerSpecIndex(new SpecIndex(protoKind));
    const imports = new ProtoImportResolver(index);
    const editor = new StructuredSpecEditorProvider(context, {
      viewType: protoKind.editorViewType,
      bundle: 'proto',
      title: 'Protobuf Editor',
      catalogCommand: 'sdd.proto.openSpecsOverview',
      instructions: protoKind.instructions,
      engine: {
        format: () => 'proto',
        parse: (text) => parseProtoDocument(text),
        apply: (text, _format, edits) => applyProtoEdits(text, edits as ProtoEdit[]),
      },
      context: {
        compute: async (document) => ({ imports: await imports.resolve(document), available: await imports.available(document) }),
        onDidChange: index.onDidChange,
      },
    });
    context.subscriptions.push(index, editor.register(), CatalogPanel.registerSerializer(context, index));

    context.subscriptions.push(
      vscode.commands.registerCommand('sdd.proto.openSpecsOverview', (folder?: vscode.Uri) =>
        CatalogPanel.show(context, index, folder instanceof vscode.Uri ? folder : undefined),
      ),

      vscode.commands.registerCommand('sdd.proto.openVisualEditor', (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, protoKind.editorViewType);
      }),

      vscode.commands.registerCommand('sdd.proto.openTextEditor', (uri?: vscode.Uri) => {
        const target = uri ?? editor.activeDocumentUri();
        if (target) return vscode.commands.executeCommand('vscode.openWith', target, 'default');
      }),

      vscode.commands.registerCommand('sdd.proto.newSpec', async (folder?: vscode.Uri) => {
        const workspaceFolder = folder ? vscode.workspace.getWorkspaceFolder(folder) : vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          void vscode.window.showWarningMessage('Open a folder to create proto files.');
          return;
        }
        const name = await vscode.window.showInputBox({
          title: 'New gRPC / Protobuf file',
          prompt: 'Service name',
          placeHolder: 'e.g. Order service',
          validateInput: (v) => (slugify(v, '_') ? undefined : 'Please enter a name'),
        });
        if (!name) return;
        const location = folder ? toWorkspacePath(folder) : undefined;
        const uri = await createSpecFile(
          protoKind,
          workspaceFolder.index,
          location?.path ?? (folder ? '' : defaultFolder(protoKind)),
          `${slugify(name, '_')}.proto`,
          name,
        ).catch((err: Error) => void vscode.window.showErrorMessage(err.message));
        if (uri) {
          await index.refresh(uri);
          await vscode.commands.executeCommand('vscode.openWith', uri, protoKind.editorViewType);
        }
      }),
    );
  },
};
