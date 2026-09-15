import * as vscode from 'vscode';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import type { IndexEntry, SpecIndex } from '../../../host/catalog/SpecIndex';
import { toUri, toWorkspacePath } from '../../../host/catalog/workspaceFiles';
import type { JsonObject } from '../../../shared/structured/edits';
import { parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import type { OtmOutline } from '../../otm/core/summary';
import { referencedPaths } from '../core/edits';
import { categoryOf, DEFAULT_NAMESPACE, SPEC_FILE_KINDS, str, summarizeEntity, type CatalogContext, type EntitySummary, type SpecFileInfo, type SpecFileKind, type ThreatModelOutline } from '../core/model';

const MAX_SPEC_FILES = 2000;

/** Spec files and threat model outlines of a workspace folder, from the indexes of the other modules. */
export async function workspaceSpecs(workspace: number): Promise<{ specFiles: SpecFileInfo[]; threatModels: ThreatModelOutline[] }> {
  const specFiles: SpecFileInfo[] = [];
  const threatModels: ThreatModelOutline[] = [];
  for (const index of registeredSpecIndexes()) {
    const kind = index.kind.info.kind;
    if (!(kind in SPEC_FILE_KINDS)) continue;
    for (const entry of await index.all()) {
      if (entry.summary.workspace !== workspace || entry.summary.error || specFiles.length >= MAX_SPEC_FILES) continue;
      specFiles.push({ path: entry.summary.path, kind: kind as SpecFileKind, name: entry.summary.name });
      if (kind === 'otm' && entry.extra) threatModels.push({ path: entry.summary.path, name: entry.summary.name, ...(entry.extra as OtmOutline) });
    }
  }
  specFiles.sort((a, b) => a.path.localeCompare(b.path));
  return { specFiles, threatModels };
}

/** Whether each workspace path exists; paths of `known` files are not looked up. */
export async function existingFiles(workspace: number, paths: string[], known: Iterable<string>): Promise<Record<string, boolean>> {
  const knownSet = new Set(known);
  const files: Record<string, boolean> = {};
  await Promise.all(
    paths.map(async (path) => {
      if (knownSet.has(path)) {
        files[path] = true;
        return;
      }
      try {
        await vscode.workspace.fs.stat(toUri(workspace, path));
        files[path] = true;
      } catch {
        files[path] = false;
      }
    }),
  );
  return files;
}

/** Entities of a catalog file of the index, as saved on disk. */
export function entitiesOfEntry(entry: IndexEntry<JsonObject[]>): EntitySummary[] {
  return entry.extra.map((entity, i) =>
    summarizeEntity(
      {
        index: i,
        entity,
        kind: str(entity.kind),
        category: categoryOf(entity),
        name: str((entity.metadata as JsonObject | undefined)?.name),
        namespace: str((entity.metadata as JsonObject | undefined)?.namespace) || DEFAULT_NAMESPACE,
      },
      entry.summary.path,
    ),
  );
}

/** Spec files, other catalog files and referenced paths of the workspace folder of a catalog file. */
export async function computeCatalogContext(document: vscode.TextDocument, catalogIndex: SpecIndex<JsonObject[]>): Promise<CatalogContext | undefined> {
  const location = toWorkspacePath(document.uri);
  if (!location) return undefined;
  const { specFiles, threatModels } = await workspaceSpecs(location.workspace);

  const catalogEntries = (await catalogIndex.all()).filter((e) => e.summary.workspace === location.workspace && e.uri.toString() !== document.uri.toString());
  const entities = catalogEntries.flatMap(entitiesOfEntry);
  const catalogFiles = catalogEntries.map((e) => e.summary.path).sort();

  const parsed = parseYamlDocuments(document.getText());
  const files = parsed.ok
    ? await existingFiles(location.workspace, referencedPaths(parsed.value, location.path), [...specFiles.map((f) => f.path), ...catalogFiles, location.path])
    : {};
  return { file: location.path, specFiles, entities, catalogFiles, threatModels, files };
}

/** Fires when any spec index changes (spec files or catalog files added, renamed, edited). */
export function onAnySpecChange(): vscode.Event<unknown> {
  return (listener, thisArgs, disposables) => {
    const subscriptions = registeredSpecIndexes().map((index) => index.onDidChange(listener, thisArgs));
    const disposable = vscode.Disposable.from(...subscriptions);
    disposables?.push(disposable);
    return disposable;
  };
}
