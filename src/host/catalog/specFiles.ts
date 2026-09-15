import * as vscode from 'vscode';
import { registeredSpecIndexes } from './registry';
import type { SpecIndex } from './SpecIndex';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** The index of the kind of spec a file is, looking at its extension and content like the indexes do. */
export function indexOf(uri: vscode.Uri, text: string): SpecIndex<unknown> | undefined {
  const name = uri.path.toLowerCase();
  return registeredSpecIndexes().find(({ kind }) => kind.fileExtensions.some((ext) => name.endsWith(ext)) && kind.accepts(uri.path, text));
}

/** Text of a file: the open document (with its unsaved changes) or the file on disk. */
export async function readText(uri: vscode.Uri): Promise<{ text: string; document?: vscode.TextDocument } | undefined> {
  const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (document) return { text: document.getText(), document };
  try {
    if ((await vscode.workspace.fs.stat(uri)).size > MAX_FILE_SIZE) return undefined;
    return { text: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)) };
  } catch {
    return undefined;
  }
}
