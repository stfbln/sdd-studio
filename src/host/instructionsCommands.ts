import * as vscode from 'vscode';
import { withInstructions } from '../shared/instructions';
import { registeredSpecIndexes } from './catalog/registry';
import { indexOf, readText } from './catalog/specFiles';

/** File of the active editor, text or form. */
function activeFile(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

async function specFilesUnder(folders: vscode.Uri[] | undefined): Promise<vscode.Uri[]> {
  const found = new Map<string, vscode.Uri>();
  for (const index of registeredSpecIndexes()) {
    for (const entry of await index.all()) {
      const path = entry.uri.toString();
      if (!folders || folders.some((f) => path.startsWith(f.toString().replace(/\/?$/, '/')))) found.set(path, entry.uri);
    }
  }
  return [...found.values()];
}

interface Outcome {
  updated: vscode.Uri[];
  current: number;
  skipped: vscode.Uri[];
}

/** Adds or refreshes the update instructions of each spec file, saving the files that had no unsaved changes. */
async function addInstructions(uris: vscode.Uri[]): Promise<Outcome> {
  const outcome: Outcome = { updated: [], current: 0, skipped: [] };
  const edit = new vscode.WorkspaceEdit();
  const toSave: vscode.Uri[] = [];
  for (const uri of uris) {
    const read = await readText(uri);
    const kind = read && indexOf(uri, read.text)?.kind;
    if (!read || !kind) {
      outcome.skipped.push(uri);
      continue;
    }
    const instructions = kind.instructions(uri.path, read.text);
    const text = withInstructions(read.text, instructions);
    if (text === read.text) {
      outcome.current++;
      continue;
    }
    const document = read.document ?? (await vscode.workspace.openTextDocument(uri));
    if (document.getText() !== read.text) {
      outcome.skipped.push(uri);
      continue;
    }
    edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(read.text.length)), text);
    if (!document.isDirty) toSave.push(uri);
    outcome.updated.push(uri);
  }
  if (outcome.updated.length) {
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error('VS Code refused the changes.');
    for (const uri of toSave) await vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())?.save();
  }
  return outcome;
}

function report(outcome: Outcome, what: string) {
  const { updated, current, skipped } = outcome;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (!updated.length && !current) {
    void vscode.window.showWarningMessage(`${what} has no spec file SDD Studio knows (feature, OpenAPI, AsyncAPI, proto, OpenCLI, markdown spec, threat model or catalog file).`);
    return;
  }
  const parts = [
    updated.length === 1 ? `Update instructions written in ${vscode.workspace.asRelativePath(updated[0])}` : updated.length ? `Update instructions written in ${plural(updated.length, 'file')}` : '',
    current ? `${plural(current, 'file')} already up to date` : '',
    skipped.length ? `${plural(skipped.length, 'file')} skipped` : '',
  ].filter(Boolean);
  void vscode.window.showInformationMessage(`${parts.join(', ')}.`);
}

async function isFolder(uri: vscode.Uri): Promise<boolean> {
  try {
    return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

export function registerInstructionsCommands(): vscode.Disposable {
  const run = async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (err) {
      void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };
  return vscode.Disposable.from(
    // Explorer: the selected files and folders; elsewhere: the active file.
    vscode.commands.registerCommand('sdd.addUpdateInstructions', (resource?: vscode.Uri, selection?: vscode.Uri[]) =>
      run(async () => {
        const picked = (selection?.length ? selection : resource instanceof vscode.Uri ? [resource] : []).filter((u) => u instanceof vscode.Uri);
        const targets = picked.length ? picked : [activeFile()].filter((u): u is vscode.Uri => !!u);
        if (!targets.length) {
          await vscode.commands.executeCommand('sdd.addUpdateInstructionsToWorkspace');
          return;
        }
        const folders: vscode.Uri[] = [];
        const files: vscode.Uri[] = [];
        for (const uri of targets) (await isFolder(uri) ? folders : files).push(uri);
        const uris = [...files, ...(folders.length ? await specFilesUnder(folders) : [])];
        const what = targets.length === 1 ? vscode.workspace.asRelativePath(targets[0]) : 'The selection';
        report(await addInstructions(uris), what);
      }),
    ),
    vscode.commands.registerCommand('sdd.addUpdateInstructionsToWorkspace', () =>
      run(async () => {
        const uris = await specFilesUnder(undefined);
        if (!uris.length) return report({ updated: [], current: 0, skipped: [] }, 'The workspace');
        const answer = await vscode.window.showInformationMessage(
          `Write update instructions for people and AI assistants at the top of the spec files of the workspace (${uris.length} file${uris.length === 1 ? '' : 's'})?`,
          { modal: true, detail: 'Files with a header already get its latest version. JSON files only get a link to their JSON schema.' },
          'Write Instructions',
        );
        if (answer) report(await addInstructions(uris), 'The workspace');
      }),
    ),
  );
}
