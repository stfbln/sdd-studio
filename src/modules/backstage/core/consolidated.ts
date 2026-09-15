/**
 * Consolidated catalog: every catalog file of a workspace folder in one form. The form sees
 * `{ documents, files }` where `files[i]` is the catalog file of document `i`; edits made on that
 * merged value are split into edits of each file.
 */
import { applyEditsToValue, getIn, isObject, type Json, type JsonObject, type SpecEdit } from '../../../shared/structured/edits';
import { DOCUMENTS_KEY } from '../../../shared/structured/yamlDocuments';
import {
  dirOf,
  documentFiles,
  documentsOf,
  entityAt,
  entityPath,
  FILES_KEY,
  isUrl,
  relativePath,
  resolvePath,
  SPECS_ANNOTATION,
  str,
  THREAT_MODELS_ANNOTATION,
  TRUST_ZONE_ANNOTATION,
} from './model';

export interface ConsolidatedValue {
  documents: Json[];
  files: string[];
}

/**
 * Merges the documents of catalog files. Documents keep the order of `previous` (the files of the
 * value shown so far), so that a reload does not move entities around; new files and documents
 * come after, files sorted by path.
 */
export function mergeCatalogFiles(catalogFiles: { path: string; documents: Json[] }[], previous: string[] = []): ConsolidatedValue {
  const byPath = new Map(catalogFiles.map((f) => [f.path, f.documents]));
  const taken = new Map<string, number>();
  const result: ConsolidatedValue = { documents: [], files: [] };
  const take = (path: string) => {
    const documents = byPath.get(path);
    const next = taken.get(path) ?? 0;
    if (!documents || next >= documents.length) return false;
    result.documents.push(documents[next]);
    result.files.push(path);
    taken.set(path, next + 1);
    return true;
  };
  for (const path of previous) take(path);
  for (const path of [...new Set([...previous, ...[...byPath.keys()].sort()])]) while (take(path));
  return result;
}

/** Position of document `index` among the documents of its own file. */
const localIndex = (files: string[], index: number) => files.slice(0, index).filter((f) => f === files[index]).length;

/**
 * Splits edits of the consolidated value into edits of each catalog file. A new document is
 * written by a `documents[n]` set followed by the `files[n]` set naming its file; a deleted one by
 * a `documents[i]` delete followed by the `files[i]` delete (see `withFileEdits`).
 */
export function splitConsolidatedEdits(files: string[], edits: SpecEdit[]): Map<string, SpecEdit[]> {
  const current = [...files];
  const pending = new Map<number, unknown>();
  const byFile = new Map<string, SpecEdit[]>();
  const push = (file: string, edit: SpecEdit) => byFile.set(file, [...(byFile.get(file) ?? []), edit]);

  for (const edit of edits) {
    const [root, index, ...rest] = edit.path;
    if (typeof index !== 'number') throw new Error('Unsupported change in the consolidated catalog.');
    if (root === DOCUMENTS_KEY) {
      if (pending.has(index)) {
        if (edit.op !== 'set') throw new Error('Unsupported change of a new entity.');
        pending.set(index, rest.length ? applyEditsToValue(pending.get(index), [{ ...edit, path: rest }]) : edit.value);
      } else if (index < current.length) {
        if (edit.op === 'move' && rest.length === 0) throw new Error('Entities cannot be reordered in the consolidated catalog.');
        push(current[index], { ...edit, path: [DOCUMENTS_KEY, localIndex(current, index), ...rest] } as SpecEdit);
      } else if (edit.op === 'set' && rest.length === 0) {
        pending.set(index, edit.value);
      } else {
        throw new Error('Change to an entity that does not exist.');
      }
    } else if (root === FILES_KEY) {
      if (edit.op === 'delete') {
        current.splice(index, 1);
      } else if (edit.op === 'set' && pending.has(index)) {
        const file = String(edit.value);
        current.splice(index, 0, file);
        push(file, { op: 'set', path: [DOCUMENTS_KEY, localIndex(current, index)], value: pending.get(index) });
        pending.delete(index);
      } else {
        throw new Error('The file of an entity changes by moving it (delete and add).');
      }
    }
  }
  if (pending.size) throw new Error('A new entity has no catalog file.');
  return byFile;
}

/** Adds the `files` edits going with added and deleted documents; new documents go to `target`. */
export function withFileEdits(spec: unknown, edits: SpecEdit[], target: string): SpecEdit[] {
  if (!documentFiles(spec)) return edits;
  let count = documentsOf(spec).length;
  const out: SpecEdit[] = [];
  edits.forEach((edit, k) => {
    out.push(edit);
    if (edit.path[0] === FILES_KEY) return;
    if (edit.path[0] !== DOCUMENTS_KEY || edit.path.length !== 2 || typeof edit.path[1] !== 'number') return;
    const index = edit.path[1];
    const next = edits[k + 1];
    const explicit = next?.path[0] === FILES_KEY && next.path[1] === index;
    if (edit.op === 'delete' && index < count) {
      count--;
      if (!explicit) out.push({ op: 'delete', path: [FILES_KEY, index] });
    } else if (edit.op === 'set' && index >= count) {
      count++;
      if (!explicit) out.push({ op: 'set', path: [FILES_KEY, index], value: target });
    }
  });
  return out;
}

/** Rewrites the paths an entity writes relative to its file, for a file in `toDir`. */
export function rebaseEntityPaths(entity: JsonObject, fromDir: string, toDir: string): JsonObject {
  const rebase = (written: string) => {
    if (!written.trim() || isUrl(written)) return written;
    const resolved = resolvePath(fromDir, written);
    return resolved === undefined ? written : relativePath(toDir, resolved);
  };
  const rebaseList = (value: string) =>
    value
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map(rebase)
      .join(', ');
  const copy = JSON.parse(JSON.stringify(entity)) as JsonObject;
  const annotations = getIn(copy, ['metadata', 'annotations']);
  if (isObject(annotations)) {
    for (const key of [SPECS_ANNOTATION, THREAT_MODELS_ANNOTATION]) if (typeof annotations[key] === 'string') annotations[key] = rebaseList(annotations[key] as string);
    const zone = annotations[TRUST_ZONE_ANNOTATION];
    if (typeof zone === 'string' && zone.includes('#')) annotations[TRUST_ZONE_ANNOTATION] = `${rebase(zone.slice(0, zone.lastIndexOf('#')))}${zone.slice(zone.lastIndexOf('#'))}`;
  }
  const spec = isObject(copy.spec) ? copy.spec : undefined;
  if (spec && isObject(spec.definition)) {
    for (const key of ['$text', '$json', '$yaml']) if (typeof spec.definition[key] === 'string') spec.definition[key] = rebase(spec.definition[key] as string);
  }
  if (spec && str(copy.kind).toLowerCase() === 'location') {
    if (typeof spec.target === 'string') spec.target = rebase(spec.target);
    if (Array.isArray(spec.targets)) spec.targets = spec.targets.map((t) => (typeof t === 'string' ? rebase(t) : t));
  }
  return copy;
}

/** Moves an entity to another catalog file (it becomes the last document), keeping its links working. */
export function moveEntityEdits(spec: unknown, index: number, toFile: string): SpecEdit[] {
  const files = documentFiles(spec);
  const info = entityAt(spec, index);
  if (!files || !info || files[index] === toFile) return [];
  const moved = rebaseEntityPaths(info.entity, dirOf(files[index]), dirOf(toFile));
  const last = documentsOf(spec).length - 1;
  return [
    { op: 'delete', path: entityPath(index) },
    { op: 'delete', path: [FILES_KEY, index] },
    { op: 'set', path: entityPath(last), value: moved },
    { op: 'set', path: [FILES_KEY, last], value: toFile },
  ];
}

/** Entities per catalog file of the consolidated value. */
export function entityCounts(spec: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  documentsOf(spec).forEach((doc, i) => {
    if (!isObject(doc)) return;
    const file = documentFiles(spec)?.[i] ?? '';
    counts.set(file, (counts.get(file) ?? 0) + 1);
  });
  return counts;
}
