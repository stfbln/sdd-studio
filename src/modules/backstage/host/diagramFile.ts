import * as vscode from 'vscode';
import { exists, toUri } from '../../../host/catalog/workspaceFiles';
import { folderError, joinPath, normalizeFolder } from '../../../shared/files';
import { slugify } from '../../../shared/naming';
import { diagramMarkdown } from '../core/mermaid';

export const DIAGRAMS_FOLDER_SETTING = 'sdd.backstage.diagramsFolder';

/** Folder exported diagrams go to (relative to the workspace folder). */
export function diagramsFolder(): string {
  const configured = normalizeFolder(vscode.workspace.getConfiguration().get<string>(DIAGRAMS_FOLDER_SETTING, 'docs/diagrams'));
  return folderError(configured) ? 'docs/diagrams' : configured;
}

export interface DiagramExportRequest {
  action: 'copy' | 'save';
  title: string;
  /** Mermaid source of the diagram. */
  diagram: string;
}

/** Path of the markdown file a diagram titled `title` is written to. */
export const diagramPath = (title: string) => joinPath(diagramsFolder(), `${slugify(title) || 'catalog-diagram'}.md`);

/**
 * Copies the diagram to the clipboard, or writes it as a markdown file of the diagrams folder
 * (where the ```mermaid fence renders) and opens it. Replacing a file is confirmed first.
 */
export async function exportDiagram(workspace: number, request: DiagramExportRequest): Promise<{ path?: string }> {
  const diagram = request.diagram.trim();
  if (!diagram) throw new Error('Choose the entities to draw first.');
  if (request.action === 'copy') {
    await vscode.env.clipboard.writeText(diagram);
    return {};
  }

  const title = request.title.trim() || 'Software catalog diagram';
  const path = diagramPath(title);
  const uri = toUri(workspace, path);
  if (await exists(uri)) {
    const answer = await vscode.window.showWarningMessage(`${path} already exists.`, { modal: true, detail: 'Replace it with this diagram?' }, 'Replace');
    if (answer !== 'Replace') return {};
  }
  await vscode.workspace.fs.createDirectory(toUri(workspace, diagramsFolder()));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(diagramMarkdown(title, diagram)));
  await vscode.commands.executeCommand('vscode.open', uri);
  return { path };
}
