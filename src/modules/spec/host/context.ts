import * as vscode from 'vscode';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { toUri, toWorkspacePath } from '../../../host/catalog/workspaceFiles';
import { MAX_INHERITANCE, parentPath, requirementsOf, type InheritedSpec, type SpecEditorContext, type SpecInheritance } from '../core/inherit';
import { parseSpecMarkdown } from '../core/parse';

/** The specs a spec extends, closest first, following the "Extends:" line of each one. */
async function followChain(workspace: number, file: string, text: string): Promise<SpecInheritance> {
  const chain: InheritedSpec[] = [];
  const seen = new Set([file]);
  let current = { path: file, written: parseSpecMarkdown(text).extends?.target };

  for (let depth = 1; current.written; depth++) {
    const path = parentPath(current.path, current.written);
    if (!path) return { chain, problem: `"${current.written}" is not a file of this workspace folder.` };
    if (seen.has(path)) return { chain, problem: `${path} extends a spec that extends it back; the chain of specs is circular.` };
    if (depth > MAX_INHERITANCE) return { chain, problem: `Only the first ${MAX_INHERITANCE} specs of the chain are shown.` };
    seen.add(path);

    // The open document, so unsaved changes to a parent spec are shown too.
    const parent = await Promise.resolve()
      .then(() => vscode.workspace.openTextDocument(toUri(workspace, path)))
      .then(
        (doc) => doc.getText(),
        () => undefined,
      );
    if (parent === undefined) return { chain, problem: `The spec it extends was not found: ${path}.` };
    const model = parseSpecMarkdown(parent);
    chain.push({ path, title: model.title?.text ?? '', requirements: requirementsOf(model), depth });
    current = { path, written: model.extends?.target };
  }
  return { chain };
}

/** The other specs of the workspace folder and the requirements this one inherits. */
export async function computeSpecContext(document: vscode.TextDocument, index: SpecIndex<undefined>): Promise<SpecEditorContext | undefined> {
  const location = toWorkspacePath(document.uri);
  if (!location) return undefined;
  const specs = (await index.all())
    .filter((entry) => entry.summary.workspace === location.workspace && entry.uri.toString() !== document.uri.toString() && !entry.summary.error)
    .map((entry) => ({ path: entry.summary.path, title: entry.summary.name }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { file: location.path, specs, inheritance: await followChain(location.workspace, location.path, document.getText()) };
}
