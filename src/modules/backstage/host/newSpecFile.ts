import * as vscode from 'vscode';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import { createSpecFile, defaultFolder, exists, toUri } from '../../../host/catalog/workspaceFiles';
import { joinPath } from '../../../shared/files';
import { slugify } from '../../../shared/naming';
import type { NewSpecFileRequest } from '../core/brief';
import { scaffoldSpecFile } from '../core/scaffold';

/**
 * Creates a spec file or threat model for a catalog entity in the default folder of its kind,
 * filled from the catalog. Returns its workspace path, so the form can link it.
 */
export async function createSpecFileFromCatalog(workspace: number, request: NewSpecFileRequest): Promise<{ path: string; name: string }> {
  const index = registeredSpecIndexes().find((i) => i.kind.info.kind === request.kind);
  if (!index) throw new Error(`No module handles ${request.kind} files.`);
  const { kind } = index;
  const title = request.title.trim();
  const { extension } = kind.info.formats[0];
  const folder = defaultFolder(kind);
  const base = slugify(title, kind.info.fileNameSeparator) || kind.info.kind;
  let fileName = `${base}${extension}`;
  for (let i = 2; await exists(toUri(workspace, joinPath(folder, fileName))); i++) fileName = `${base}${kind.info.fileNameSeparator ?? '-'}${i}${extension}`;

  const path = joinPath(folder, fileName);
  const text = scaffoldSpecFile(request, path, /\.json$/i.test(extension) ? 'json' : 'yaml');
  const uri = await createSpecFile(kind, workspace, folder, fileName, title, text);
  await index.refresh(uri);
  return { path, name: title };
}

export const workspaceIndexOf = (document: vscode.TextDocument) => vscode.workspace.getWorkspaceFolder(document.uri)?.index ?? 0;
