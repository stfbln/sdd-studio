import * as vscode from 'vscode';
import type { FolderEntry } from '../../shared/catalog';
import { baseName, fileNameError, folderError, joinPath, normalizeFolder } from '../../shared/files';
import { withInstructions } from '../../shared/instructions';
import { withArticle } from '../../shared/naming';
import type { SpecKind } from './SpecKind';

const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'out', 'build', 'target']);
const MAX_FOLDERS = 2000;

export function defaultFolder(kind: SpecKind<unknown>): string {
  return normalizeFolder(vscode.workspace.getConfiguration().get<string>(kind.folderSetting, kind.defaultFolder));
}

export function toWorkspacePath(uri: vscode.Uri): { workspace: number; path: string } | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;
  const root = folder.uri.path.replace(/\/$/, '');
  return { workspace: folder.index, path: uri.path.slice(root.length + 1) };
}

export function toUri(workspace: number, path: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[workspace];
  if (!folder) throw new Error('This workspace folder is no longer open.');
  const segments = normalizeFolder(path).split('/').filter(Boolean);
  return segments.length ? vscode.Uri.joinPath(folder.uri, ...segments) : folder.uri;
}

export async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Folders offered as destinations: every folder below the default folder (even empty
 * ones) plus every folder that already contains a spec.
 */
export async function listFolders(rootFolder: string, specPaths: { workspace: number; path: string }[]): Promise<FolderEntry[]> {
  const found = new Map<string, FolderEntry>();
  const add = (workspace: number, path: string, isReal = true) => {
    const key = `${workspace}:${path}`;
    const known = found.get(key);
    if (!known) found.set(key, { workspace, path, exists: isReal });
    else if (isReal) known.exists = true;
  };

  const segments = rootFolder ? rootFolder.split('/') : [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    add(folder.index, '');
    const root = toUri(folder.index, rootFolder);
    const rootExists = await exists(root);
    // Ancestors are listed too, so the tree can always be drawn.
    segments.forEach((_, i) => add(folder.index, segments.slice(0, i + 1).join('/'), rootExists));
    if (!rootExists) continue;

    const queue = [{ uri: root, path: rootFolder, depth: 0 }];
    while (queue.length && found.size < MAX_FOLDERS) {
      const { uri, path, depth } = queue.shift()!;
      let children: [string, vscode.FileType][] = [];
      try {
        children = await vscode.workspace.fs.readDirectory(uri);
      } catch {
        continue;
      }
      for (const [name, type] of children) {
        if (!(type & vscode.FileType.Directory) || name.startsWith('.') || SKIPPED_FOLDERS.has(name)) continue;
        const childPath = joinPath(path, name);
        add(folder.index, childPath);
        if (depth < 10) queue.push({ uri: vscode.Uri.joinPath(uri, name), path: childPath, depth: depth + 1 });
      }
    }
  }

  for (const { workspace, path } of specPaths) {
    const parts = path.split('/').slice(0, -1);
    parts.forEach((_, i) => add(workspace, parts.slice(0, i + 1).join('/')));
  }
  return [...found.values()];
}

/** Writes a new spec file from the template of its kind, or from `text` when given. */
export async function createSpecFile(kind: SpecKind<unknown>, workspace: number, folder: string, fileName: string, name: string, text?: string): Promise<vscode.Uri> {
  const extensions = [...new Set([...kind.info.formats.map((f) => f.extension), ...kind.info.acceptedExtensions])];
  const error =
    folderError(folder) ??
    fileNameError(fileName, extensions) ??
    (extensions.some((ext) => fileName.toLowerCase().endsWith(ext)) ? undefined : `The file name must end with ${extensions.join(' or ')}`) ??
    (name.trim() ? undefined : `${withArticle(kind.info.singular).replace(/^a/, 'A')} name is required`);
  if (error) throw new Error(error);

  const directory = toUri(workspace, folder);
  const target = vscode.Uri.joinPath(directory, fileName);
  if (await exists(target)) throw new Error(`${joinPath(normalizeFolder(folder), fileName)} already exists.`);
  await vscode.workspace.fs.createDirectory(directory);
  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(newFileText(kind, fileName, text ?? kind.template(name, fileName))));
  return target;
}

/** Text of a new spec file: the template, with update instructions unless the setting turns them off. */
export function newFileText(kind: SpecKind<unknown>, fileName: string, template: string): string {
  const enabled = vscode.workspace.getConfiguration().get<boolean>(INSTRUCTIONS_SETTING, true);
  return enabled ? withInstructions(template, kind.instructions(fileName, template)) : template;
}

export const INSTRUCTIONS_SETTING = 'sdd.instructions.addToNewFiles';

export async function createFolder(workspace: number, path: string): Promise<vscode.Uri> {
  const error = folderError(path) ?? (normalizeFolder(path) ? undefined : 'A folder name is required');
  if (error) throw new Error(error);
  const uri = toUri(workspace, path);
  if (await exists(uri)) throw new Error(`${normalizeFolder(path)} already exists.`);
  await vscode.workspace.fs.createDirectory(uri);
  return uri;
}

/** Moves through a WorkspaceEdit so open editors follow the file. */
export async function moveFile(source: vscode.Uri, workspace: number, folder: string): Promise<vscode.Uri> {
  const error = folderError(folder);
  if (error) throw new Error(error);
  const directory = toUri(workspace, folder);
  const target = vscode.Uri.joinPath(directory, baseName(source.path));
  if (target.toString() === source.toString()) return source;
  if (await exists(target)) throw new Error(`${joinPath(normalizeFolder(folder), baseName(source.path))} already exists.`);
  await vscode.workspace.fs.createDirectory(directory);
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(source, target, { overwrite: false });
  if (!(await vscode.workspace.applyEdit(edit))) throw new Error('The file could not be moved.');
  return target;
}
