import * as vscode from 'vscode';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { toUri, toWorkspacePath } from '../../../host/catalog/workspaceFiles';
import {
  MAX_INHERITANCE_DEPTH,
  MAX_INHERITED_SPECS,
  parentPath,
  requirementsOf,
  type InheritedSpec,
  type SpecEditorContext,
  type SpecInheritance,
} from '../core/inherit';
import { parseSpecMarkdown, type SpecParent } from '../core/parse';

/** The open document, so unsaved changes to a spec extended are shown too. */
async function readSpec(workspace: number, path: string): Promise<string | undefined> {
  return Promise.resolve()
    .then(() => vscode.workspace.openTextDocument(toUri(workspace, path)))
    .then(
      (doc) => doc.getText(),
      () => undefined,
    );
}

/**
 * Every spec inherited from, closest first: the specs the file extends in the order they are
 * written, then the specs those extend. A spec reached twice (two parents extending the same one)
 * is kept once, at the place it is first reached.
 */
async function followParents(workspace: number, file: string, text: string): Promise<SpecInheritance> {
  const chain: InheritedSpec[] = [];
  const problems: string[] = [];
  const seen = new Set([file]);
  let frontier: { path: string; parents: SpecParent[] }[] = [{ path: file, parents: parseSpecMarkdown(text).extends?.parents ?? [] }];

  for (let depth = 1; frontier.length; depth++) {
    if (depth > MAX_INHERITANCE_DEPTH) {
      problems.push(`The specs are extended more than ${MAX_INHERITANCE_DEPTH} levels deep; only the first levels are shown.`);
      break;
    }
    const next: { path: string; parents: SpecParent[] }[] = [];
    for (const current of frontier) {
      for (const parent of current.parents) {
        const path = parentPath(current.path, parent.target);
        if (!path) {
          problems.push(`"${parent.target}" is not a file of this workspace folder.`);
          continue;
        }
        // Already reached through another spec, or the file itself: nothing more to read.
        if (path === file) {
          problems.push(`${current.path} extends this spec back; the specs cannot extend each other.`);
          continue;
        }
        if (seen.has(path)) continue;
        seen.add(path);
        if (chain.length >= MAX_INHERITED_SPECS) {
          problems.push(`More than ${MAX_INHERITED_SPECS} specs are inherited from; only the first ones are shown.`);
          return { chain, problems };
        }
        const parentText = await readSpec(workspace, path);
        if (parentText === undefined) {
          problems.push(`The spec it extends was not found: ${path}.`);
          continue;
        }
        const model = parseSpecMarkdown(parentText);
        chain.push({
          path,
          title: model.title?.text ?? '',
          requirements: requirementsOf(model),
          depth,
          ...(depth > 1 ? { via: current.path } : {}),
        });
        next.push({ path, parents: model.extends?.parents ?? [] });
      }
    }
    frontier = next;
  }
  return { chain, problems };
}

/** The other specs of the workspace folder and the requirements this one inherits. */
export async function computeSpecContext(document: vscode.TextDocument, index: SpecIndex<undefined>): Promise<SpecEditorContext | undefined> {
  const location = toWorkspacePath(document.uri);
  if (!location) return undefined;
  const specs = (await index.all())
    .filter((entry) => entry.summary.workspace === location.workspace && entry.uri.toString() !== document.uri.toString() && !entry.summary.error)
    .map((entry) => ({ path: entry.summary.path, title: entry.summary.name }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { file: location.path, specs, inheritance: await followParents(location.workspace, location.path, document.getText()) };
}
