/**
 * Targeted changes sent by the form. They are applied to the spec text (keeping comments,
 * key order and every field the form does not know about) and to the in-memory object.
 */

export type PathSegment = string | number;
export type SpecPath = PathSegment[];

export type SpecEdit =
  /** Creates missing parent objects. An index equal to an array's length appends. */
  | { op: 'set'; path: SpecPath; value: unknown }
  | { op: 'delete'; path: SpecPath }
  /** Renames the key at `path` in place, keeping its position. */
  | { op: 'renameKey'; path: SpecPath; newKey: string }
  /** Moves the array item at `path` so that it ends up at index `to` of the same array. */
  | { op: 'move'; path: SpecPath; to: number };

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function getIn(root: unknown, path: SpecPath): unknown {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current)) current = current[Number(segment)];
    else if (isObject(current)) current = current[String(segment)];
    else return undefined;
  }
  return current;
}

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** Pure, immutable version of the edits, used by the webview and to check the text backends. */
export function applyEditsToValue<T>(root: T, edits: SpecEdit[]): T {
  let result: unknown = root;
  for (const edit of edits) result = applyOne(result, edit);
  return result as T;
}

function applyOne(root: unknown, edit: SpecEdit): unknown {
  const { path } = edit;
  if (path.length === 0) return edit.op === 'set' ? clone(edit.value) : root;

  const update = (node: unknown, depth: number): unknown => {
    const segment = path[depth];
    const last = depth === path.length - 1;

    if (Array.isArray(node)) {
      const index = Number(segment);
      const copy = [...node];
      if (last) {
        if (edit.op === 'set') copy[index] = clone(edit.value) as Json;
        else if (edit.op === 'delete') copy.splice(index, 1);
        else if (edit.op === 'move' && index < copy.length) copy.splice(Math.min(Math.max(edit.to, 0), copy.length - 1), 0, ...copy.splice(index, 1));
        return copy;
      }
      if (index >= copy.length && edit.op !== 'set') return node;
      copy[index] = update(copy[index], depth + 1) as Json;
      return copy;
    }

    const object: JsonObject = isObject(node) ? node : {};
    if (!isObject(node) && edit.op !== 'set') return node;
    const key = String(segment);

    if (last) {
      if (edit.op === 'set') return { ...object, [key]: clone(edit.value) as Json };
      if (!(key in object) || edit.op === 'move') return object;
      if (edit.op === 'delete') {
        const { [key]: _removed, ...rest } = object;
        return rest;
      }
      // renameKey: rebuild to keep the key position.
      return Object.fromEntries(Object.entries(object).map(([k, v]) => [k === key ? edit.newKey : k, v]));
    }

    const next = object[key];
    if (next === undefined && edit.op !== 'set') return object;
    const child = next === undefined || next === null ? (typeof path[depth + 1] === 'number' ? [] : {}) : next;
    return { ...object, [key]: update(child, depth + 1) as Json };
  };

  return update(root, 0);
}
