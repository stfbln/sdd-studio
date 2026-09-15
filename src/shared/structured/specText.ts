import { applyEdits as applyJsonEdits, findNodeAtLocation, getNodeValue, modify, parseTree, type FormattingOptions, type ParseError } from 'jsonc-parser';
import { printParseErrorCode } from 'jsonc-parser';
import {
  Document,
  isMap,
  isNode,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  YAMLMap,
  YAMLSeq,
  type Node as YamlNode,
  type ToStringOptions,
} from 'yaml';
import type { Json, SpecEdit, SpecPath } from './edits';

export type SpecFormat = 'yaml' | 'json';

export interface SpecProblem {
  message: string;
  line?: number;
}

export type SpecParseResult =
  | {
      ok: true;
      value: Json;
      format: SpecFormat;
      /** True when the first form edit will also normalize some YAML formatting. */
      formattingDrift: boolean;
    }
  | { ok: false; format: SpecFormat; errors: SpecProblem[] };

export function detectFormat(fileName: string, text: string): SpecFormat {
  if (/\.json$/i.test(fileName)) return 'json';
  if (/\.ya?ml$/i.test(fileName)) return 'yaml';
  return text.trimStart().startsWith('{') ? 'json' : 'yaml';
}

export function parseSpec(text: string, format: SpecFormat): SpecParseResult {
  return format === 'json' ? parseJson(text) : parseYaml(text);
}

export function applySpecEdits(text: string, format: SpecFormat, edits: SpecEdit[]): string {
  return format === 'json' ? applyToJson(text, edits) : applyToYaml(text, edits);
}

/* YAML --------------------------------------------------------------------- */

export function yamlOptions(text: string): ToStringOptions {
  // Respect the file's indentation and list style so edits don't reformat everything.
  const indent = /^( +)\S/m.exec(text)?.[1].length ?? 2;
  const seqMatch = /^( *)[^\s#-][^\n]*:\s*\n(?:\s*#[^\n]*\n)*( *)- /m.exec(text);
  const indentSeq = seqMatch ? seqMatch[2].length > seqMatch[1].length : true;
  const padded = text.match(/[:\-] [[{] \S/g)?.length ?? 0;
  const tight = text.match(/[:\-] [[{][^\s\]}]/g)?.length ?? 0;
  return {
    indent: Math.min(Math.max(indent, 1), 8),
    indentSeq,
    lineWidth: 0,
    minContentWidth: 0,
    flowCollectionPadding: padded >= tight,
    // New quoted strings (e.g. '#/components/...' references) follow the file's habit.
    singleQuote: (text.match(/[:-] '/g)?.length ?? 0) > (text.match(/[:-] "/g)?.length ?? 0),
  };
}

function parseYaml(text: string): SpecParseResult {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, keepSourceTokens: false, uniqueKeys: false });
  if (doc.errors.length) {
    return {
      ok: false,
      format: 'yaml',
      errors: doc.errors.map((e) => ({ message: e.message.split('\n')[0], line: lineCounter.linePos(e.pos[0]).line })),
    };
  }
  const value = (doc.toJS({ maxAliasCount: 1000 }) ?? {}) as Json;
  return { ok: true, value, format: 'yaml', formattingDrift: text.trim() !== '' && doc.toString(yamlOptions(text)) !== text };
}

const keyMatches = (key: unknown, segment: string | number) => String(isScalar(key) ? key.value : key) === String(segment);

function yamlChild(node: unknown, segment: string | number): unknown {
  if (isMap(node)) return node.items.find((p) => keyMatches(p.key, segment))?.value;
  if (isSeq(node)) return node.items[Number(segment)];
  return undefined;
}

/** Walks to the collection holding the last segment, creating maps/sequences on the way. */
function yamlParent(doc: Document, path: SpecPath, create: boolean): YAMLMap | YAMLSeq | undefined {
  if (!doc.contents || !(isMap(doc.contents) || isSeq(doc.contents))) {
    if (!create) return undefined;
    doc.contents = new YAMLMap() as never;
  }
  let node = doc.contents as unknown;
  for (let i = 0; i < path.length - 1; i++) {
    let next = yamlChild(node, path[i]);
    unflowIfEmpty(node);
    if (!isMap(next) && !isSeq(next)) {
      if (!create) return undefined;
      next = typeof path[i + 1] === 'number' ? new YAMLSeq() : new YAMLMap();
      yamlAssign(doc, node as YAMLMap | YAMLSeq, path[i], next as YamlNode);
    }
    node = next;
  }
  unflowIfEmpty(node);
  return node as YAMLMap | YAMLSeq;
}

/** An empty `{}` / `[]` about to receive items becomes a regular block collection. */
function unflowIfEmpty(node: unknown) {
  if ((isMap(node) || isSeq(node)) && node.flow && node.items.length === 0) node.flow = false;
}

function yamlAssign(doc: Document, parent: YAMLMap | YAMLSeq, segment: string | number, value: YamlNode) {
  if (isSeq(parent)) {
    const index = Number(segment);
    if (index < parent.items.length) parent.items[index] = value;
    else parent.items.push(value);
    return;
  }
  const pair = parent.items.find((p) => keyMatches(p.key, segment));
  if (pair) {
    pair.value = value;
    return;
  }
  // Follow the file's habit for numeric keys such as response codes (200: vs "200":).
  const numericSibling = parent.items.some((p) => isScalar(p.key) && typeof p.key.value === 'number');
  const key = /^\d+$/.test(String(segment)) && numericSibling ? Number(segment) : String(segment);
  parent.items.push(doc.createPair(key, value));
}

/** Adds a blank line before whatever follows `path` in the document (next key or list item, at any depth). */
function markNextSpaceBefore(doc: Document, path: SpecPath) {
  for (let depth = path.length - 1; depth >= 0; depth--) {
    let container: unknown = doc.contents;
    for (const segment of path.slice(0, depth)) container = yamlChild(container, segment);
    if (isMap(container)) {
      const index = container.items.findIndex((p) => keyMatches(p.key, path[depth]));
      const next = container.items[index + 1];
      if (index >= 0 && next) {
        if (isScalar(next.key)) next.key.spaceBefore = true;
        return;
      }
    } else if (isSeq(container)) {
      const next = container.items[Number(path[depth]) + 1];
      if (isNode(next)) {
        next.spaceBefore = true;
        return;
      }
    }
  }
}

function applyToYaml(text: string, edits: SpecEdit[]): string {
  const doc = parseDocument(text, { uniqueKeys: false });
  if (doc.errors.length) throw new Error('The YAML file has syntax errors; fix them in the text editor first.');
  editYamlDocument(doc, edits);
  return doc.toString(yamlOptions(text));
}

/** Applies edits to a parsed YAML document in place, keeping comments and styles. */
export function editYamlDocument(doc: Document, edits: SpecEdit[]) {
  for (const edit of edits) {
    if (edit.path.length === 0) {
      if (edit.op === 'set') doc.contents = doc.createNode(edit.value) as never;
      continue;
    }
    const last = edit.path[edit.path.length - 1];
    const parent = yamlParent(doc, edit.path, edit.op === 'set');
    if (!parent) continue;

    if (edit.op === 'set') {
      const existing = yamlChild(parent, last);
      const primitive = edit.value === null || typeof edit.value !== 'object';
      if (isScalar(existing) && existing.value === null && existing.source === '' && existing.spaceBefore && edit.value !== null) {
        // `key:` with no value keeps the blank line after it; it belongs before the next entry once filled.
        existing.spaceBefore = false;
        markNextSpaceBefore(doc, edit.path);
      }
      if (isScalar(existing) && primitive) {
        // Keep quoting style and comments of the existing scalar. An empty string only needed
        // its quotes while empty: once filled, quotes are added again only if the text needs them.
        if (existing.value === '' && typeof edit.value === 'string' && edit.value !== '') existing.type = undefined;
        existing.value = edit.value;
      } else {
        const created = doc.createNode(edit.value) as YamlNode;
        // Replacing a list or map keeps its inline/block style and comment.
        if ((isSeq(existing) && isSeq(created)) || (isMap(existing) && isMap(created))) {
          created.flow = existing.flow && (created.items.length > 0 || existing.items.length === 0);
          created.commentBefore = existing.commentBefore;
          created.comment = existing.comment;
        }
        yamlAssign(doc, parent, last, created);
      }
    } else if (edit.op === 'move') {
      // Moving the node itself keeps its comments and style.
      if (isSeq(parent) && Number(last) < parent.items.length) {
        const [item] = parent.items.splice(Number(last), 1);
        parent.items.splice(Math.min(Math.max(edit.to, 0), parent.items.length), 0, item);
      }
    } else if (edit.op === 'delete') {
      if (isSeq(parent)) parent.items.splice(Number(last), 1);
      else {
        const index = parent.items.findIndex((p) => keyMatches(p.key, last));
        if (index >= 0) parent.items.splice(index, 1);
      }
    } else if (isMap(parent)) {
      const pair = parent.items.find((p) => keyMatches(p.key, last));
      if (pair && isScalar(pair.key)) pair.key.value = edit.newKey;
      else if (pair) pair.key = doc.createNode(edit.newKey);
    }
  }
}

/* JSON --------------------------------------------------------------------- */

function parseJson(text: string): SpecParseResult {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !tree) {
    const lineOf = (offset: number) => text.slice(0, offset).split('\n').length;
    return {
      ok: false,
      format: 'json',
      errors: errors.length
        ? errors.map((e) => ({ message: printParseErrorCode(e.error), line: lineOf(e.offset) }))
        : [{ message: 'The file is empty' }],
    };
  }
  return { ok: true, value: JSON.parse(stripJsonc(text)) as Json, format: 'json', formattingDrift: false };
}

/** JSON.parse equivalent that tolerates comments and trailing commas (JSONC). */
function stripJsonc(text: string): string {
  const tree = parseTree(text, [], { allowTrailingComma: true });
  const build = (node: ReturnType<typeof parseTree>): unknown => {
    if (!node) return null;
    switch (node.type) {
      case 'object':
        return Object.fromEntries((node.children ?? []).map((p) => [p.children![0].value, build(p.children![1])]));
      case 'array':
        return (node.children ?? []).map(build);
      default:
        return node.value;
    }
  };
  return JSON.stringify(build(tree));
}

function jsonFormatting(text: string): FormattingOptions {
  const indent = /^([ \t]+)\S/m.exec(text)?.[1] ?? '  ';
  return {
    insertSpaces: !indent.startsWith('\t'),
    tabSize: indent.startsWith('\t') ? 1 : indent.length,
    eol: text.includes('\r\n') ? '\r\n' : '\n',
  };
}

function applyToJson(text: string, edits: SpecEdit[]): string {
  let result = text.trim() ? text : '{}\n';
  for (const edit of edits) {
    const formattingOptions = jsonFormatting(result);
    const { path } = edit;
    if (edit.op === 'renameKey') {
      const tree = parseTree(result);
      const parent = tree && findNodeAtLocation(tree, path.slice(0, -1));
      const property = parent?.children?.find((p) => p.children?.[0].value === String(path[path.length - 1]));
      const keyNode = property?.children?.[0];
      if (keyNode) {
        result = result.slice(0, keyNode.offset) + JSON.stringify(edit.newKey) + result.slice(keyNode.offset + keyNode.length);
      }
      continue;
    }
    if (edit.op === 'move') {
      const tree = parseTree(result);
      const node = tree && findNodeAtLocation(tree, path);
      const length = arrayLengthAt(result, path.slice(0, -1));
      if (!node || length === undefined) continue;
      const value = getNodeValue(node);
      result = applyJsonEdits(result, modify(result, path, undefined, { formattingOptions }));
      const to = Math.min(Math.max(edit.to, 0), length - 1);
      result = applyJsonEdits(result, modify(result, [...path.slice(0, -1), to], value, { formattingOptions, isArrayInsertion: true }));
      continue;
    }
    if (edit.op === 'set') result = replaceNullParents(result, path, formattingOptions);
    const last = path[path.length - 1];
    const arrayLength = typeof last === 'number' ? arrayLengthAt(result, path.slice(0, -1)) : undefined;
    const isArrayInsertion = edit.op === 'set' && arrayLength !== undefined && (last as number) >= arrayLength;
    const value = edit.op === 'set' ? edit.value : undefined;
    result = applyJsonEdits(result, modify(result, path, value, { formattingOptions, isArrayInsertion }));
  }
  return result;
}

/** `"attributes": null` becomes `{}` (or `[]`) before something is written inside it. */
function replaceNullParents(text: string, path: SpecPath, formattingOptions: FormattingOptions): string {
  let result = text;
  for (let depth = 1; depth < path.length; depth++) {
    const tree = parseTree(result);
    const node = tree && findNodeAtLocation(tree, path.slice(0, depth));
    if (node?.type === 'null') {
      result = applyJsonEdits(result, modify(result, path.slice(0, depth), typeof path[depth] === 'number' ? [] : {}, { formattingOptions }));
    }
  }
  return result;
}

function arrayLengthAt(text: string, path: SpecPath): number | undefined {
  const tree = parseTree(text);
  const node = path.length === 0 ? tree : tree && findNodeAtLocation(tree, path);
  return node?.type === 'array' ? (node.children?.length ?? 0) : undefined;
}
