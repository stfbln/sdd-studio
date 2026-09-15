import * as vscode from 'vscode';

/** Applies only the changed span, so cursors in a side-by-side text editor stay put. */
export async function replaceText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const current = document.getText();
  if (current === text) return true;

  let start = 0;
  const max = Math.min(current.length, text.length);
  while (start < max && current.charCodeAt(start) === text.charCodeAt(start)) start++;
  let end = 0;
  while (
    end < max - start &&
    current.charCodeAt(current.length - 1 - end) === text.charCodeAt(text.length - 1 - end)
  ) {
    end++;
  }
  // Never split a surrogate pair or a CRLF sequence.
  if (start > 0 && /[\uD800-\uDBFF\r]/.test(current[start - 1])) start--;
  if (end > 0 && /[\uDC00-\uDFFF\n]/.test(current[current.length - end])) end--;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(start), document.positionAt(current.length - end)),
    text.slice(start, text.length - end),
  );
  return vscode.workspace.applyEdit(edit);
}
