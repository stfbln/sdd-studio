import type {
  FieldLabel,
  ProtoEnum,
  ProtoEnumValue,
  ProtoField,
  ProtoFile,
  ProtoMessage,
  ProtoOneof,
  ProtoOption,
  ProtoPath,
  ProtoReserved,
  ProtoRpc,
  ProtoService,
  Span,
} from './model';
import { parseProto, quote } from './parse';

/**
 * Changes the form makes to a .proto file. Each edit targets an element by its path and is
 * applied to the text by replacing, inserting or removing only the tokens or lines concerned.
 */
export type ProtoEdit =
  | { op: 'setSyntax'; value: string }
  /** An empty value removes the package statement. */
  | { op: 'setPackage'; value: string }
  | { op: 'addImport'; path: string; modifier?: 'public' | 'weak' }
  | { op: 'removeImport'; path: string }
  | { op: 'rename'; target: ProtoPath; name: string }
  | { op: 'setComment'; target: ProtoPath; comment: string }
  /** Field type, e.g. `string`, `Order.Item` or `map<string, Order>`. */
  | { op: 'setType'; target: ProtoPath; type: string }
  | { op: 'setNumber'; target: ProtoPath; number: number }
  | { op: 'setLabel'; target: ProtoPath; label?: FieldLabel }
  | { op: 'setRpcSide'; target: ProtoPath; side: 'request' | 'response'; type: string; stream: boolean }
  /** `value` is proto source text (`true`, `"text"`, `IDEMPOTENT`); undefined removes the option. */
  | { op: 'setOption'; target: ProtoPath; name: string; value?: string }
  /** Replaces the `reserved` numbers or names of a message or enum (empty removes them). */
  | { op: 'setReserved'; target: ProtoPath; kind: 'numbers' | 'names'; items: string[] }
  | { op: 'add'; parent: ProtoPath; element: NewElement }
  | { op: 'delete'; target: ProtoPath }
  /** Moves a field into or out of a oneof, keeping its comments and options. */
  | { op: 'move'; target: ProtoPath; parent: ProtoPath };

export type NewElement =
  | { kind: 'message'; name: string; comment?: string }
  | { kind: 'enum'; name: string; values: { name: string; number: number }[]; comment?: string }
  | { kind: 'service'; name: string; comment?: string }
  | { kind: 'field'; name: string; type: string; number: number; label?: FieldLabel; comment?: string }
  | { kind: 'oneof'; name: string; field: { name: string; type: string; number: number } }
  | { kind: 'value'; name: string; number: number; comment?: string }
  | { kind: 'rpc'; name: string; request: string; response: string; requestStream?: boolean; responseStream?: boolean; comment?: string };

type Resolved =
  | { kind: 'file'; node: ProtoFile }
  | { kind: 'message'; node: ProtoMessage }
  | { kind: 'enum'; node: ProtoEnum }
  | { kind: 'service'; node: ProtoService }
  | { kind: 'field'; node: ProtoField; parent: ProtoMessage }
  | { kind: 'oneof'; node: ProtoOneof; parent: ProtoMessage }
  | { kind: 'value'; node: ProtoEnumValue; parent: ProtoEnum }
  | { kind: 'rpc'; node: ProtoRpc; parent: ProtoService };

const describePath = (path: ProtoPath) => path.map((p) => p.replace(':', ' ')).join(' > ') || 'file';

/** Finds the element a path points to. Throws when it does not exist (anymore). */
export function resolvePath(file: ProtoFile, path: ProtoPath): Resolved {
  let current: Resolved = { kind: 'file', node: file };
  for (const segment of path) {
    const colon = segment.indexOf(':');
    const kind = segment.slice(0, colon);
    const name = segment.slice(colon + 1);
    const missing = () => new Error(`${describePath(path)} no longer exists in the file.`);
    const container: ProtoFile | ProtoMessage | undefined = current.kind === 'file' || current.kind === 'message' ? current.node : undefined;
    let found: Resolved | undefined;
    if (kind === 'message' && container) {
      const node: ProtoMessage | undefined = container.messages.find((m) => m.name === name);
      if (node) found = { kind, node };
    } else if (kind === 'enum' && container) {
      const node: ProtoEnum | undefined = container.enums.find((e) => e.name === name);
      if (node) found = { kind, node };
    } else if (kind === 'service' && current.kind === 'file') {
      const node: ProtoService | undefined = current.node.services.find((s) => s.name === name);
      if (node) found = { kind, node };
    } else if (kind === 'field' && (current.kind === 'message' || current.kind === 'oneof')) {
      const parent = current.kind === 'message' ? current.node : current.parent;
      const oneof = current.kind === 'oneof' ? current.node.name : undefined;
      const node: ProtoField | undefined = parent.fields.find((f) => f.name === name && (!oneof || f.oneof === oneof));
      if (node) found = { kind, node, parent };
    } else if (kind === 'oneof' && current.kind === 'message') {
      const node: ProtoOneof | undefined = current.node.oneofs.find((o) => o.name === name);
      if (node) found = { kind, node, parent: current.node };
    } else if (kind === 'value' && current.kind === 'enum') {
      const node: ProtoEnumValue | undefined = current.node.values.find((v) => v.name === name);
      if (node) found = { kind, node, parent: current.node };
    } else if (kind === 'rpc' && current.kind === 'service') {
      const node: ProtoRpc | undefined = current.node.rpcs.find((r) => r.name === name);
      if (node) found = { kind, node, parent: current.node };
    }
    if (!found) throw missing();
    current = found;
  }
  return current;
}

interface Splice {
  start: number;
  end: number;
  text: string;
}

const lineStart = (text: string, offset: number) => text.lastIndexOf('\n', offset - 1) + 1;
const lineEnd = (text: string, offset: number) => {
  const end = text.indexOf('\n', offset);
  return end < 0 ? text.length : end;
};
const isBlank = (s: string) => !/\S/.test(s);

/** Indentation of the line holding an offset. */
function indentAt(text: string, offset: number): string {
  const start = lineStart(text, offset);
  return /^[ \t]*/.exec(text.slice(start, offset))![0];
}

/** Indentation step of the file, taken from the first nested declaration. */
function indentUnit(text: string, file: ProtoFile): string {
  const blocks = [...file.messages, ...file.enums, ...file.services];
  for (const block of blocks) {
    const children =
      'fields' in block ? [...block.fields, ...block.options] : 'values' in block ? [...block.values, ...block.options] : [...block.rpcs, ...block.options];
    const child = children.sort((a, b) => a.span.start - b.span.start)[0];
    if (!child || lineStart(text, child.span.start) === lineStart(text, block.span.start)) continue;
    const outer = indentAt(text, block.span.start);
    const inner = indentAt(text, child.span.start);
    if (inner.length > outer.length && inner.startsWith(outer)) return inner.slice(outer.length);
  }
  return '  ';
}

function apply(text: string, splices: Splice[]): string {
  let result = text;
  for (const s of [...splices].sort((a, b) => b.start - a.start)) result = result.slice(0, s.start) + s.text + result.slice(s.end);
  return result;
}

/** Range removing a statement with its leading comment, and its whole lines when it has them to itself. */
function removal(text: string, node: { docStart: number; span: Span }): Splice {
  let start = node.docStart;
  let end = node.span.end;
  const before = text.slice(lineStart(text, start), start);
  const rest = text.slice(end, lineEnd(text, end));
  if (isBlank(before) && /^\s*(\/\/.*|\/\*.*\*\/\s*)?$/.test(rest)) {
    start = lineStart(text, start);
    end = Math.min(text.length, lineEnd(text, end) + 1);
    // Avoid leaving two blank lines, or a blank line right after "{".
    const previousLine = start === 0 ? '' : text.slice(lineStart(text, start - 1), start - 1);
    const nextLine = text.slice(end, lineEnd(text, end));
    if (end < text.length && isBlank(nextLine) && (isBlank(previousLine) || previousLine.trimEnd().endsWith('{'))) {
      end = Math.min(text.length, lineEnd(text, end) + 1);
    } else if (end >= text.length && start > 0 && isBlank(previousLine)) {
      // Last declaration of the file: drop the blank line that separated it.
      start = lineStart(text, start - 1);
    }
  } else {
    while (text[end] === ' ' || text[end] === '\t') end++;
  }
  return { start, end, text: '' };
}

/** Source lines of a statement (with its leading comment), without their indentation. */
function extractLines(text: string, node: { docStart: number; span: Span }): string[] {
  const indent = indentAt(text, node.span.start);
  const ownLines = isBlank(text.slice(lineStart(text, node.docStart), node.docStart));
  const start = ownLines ? lineStart(text, node.docStart) : node.docStart;
  const end = /^\s*(\/\/.*)?$/.test(text.slice(node.span.end, lineEnd(text, node.span.end))) ? lineEnd(text, node.span.end) : node.span.end;
  return text
    .slice(start, end)
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()));
}

function commentLines(comment: string | undefined): string[] {
  if (!comment?.trim()) return [];
  return comment.split('\n').map((line) => (line.trim() ? `// ${line.trimEnd()}` : '//'));
}

function elementLines(element: NewElement, unit: string, spaceBeforeParen: boolean): string[] {
  const comment = 'comment' in element ? commentLines(element.comment) : [];
  switch (element.kind) {
    case 'message':
      return [...comment, `message ${element.name} {}`];
    case 'service':
      return [...comment, `service ${element.name} {}`];
    case 'enum':
      return [...comment, `enum ${element.name} {`, ...element.values.map((v) => `${unit}${v.name} = ${v.number};`), '}'];
    case 'field':
      return [...comment, `${element.label ? `${element.label} ` : ''}${element.type} ${element.name} = ${element.number};`];
    case 'oneof':
      return [`oneof ${element.name} {`, `${unit}${element.field.type} ${element.field.name} = ${element.field.number};`, '}'];
    case 'value':
      return [...comment, `${element.name} = ${element.number};`];
    case 'rpc': {
      const side = (type: string, stream?: boolean) => `(${stream ? 'stream ' : ''}${type})`;
      return [
        ...comment,
        `rpc ${element.name}${spaceBeforeParen ? ' ' : ''}${side(element.request, element.requestStream)} returns ${side(element.response, element.responseStream)};`,
      ];
    }
  }
}

interface Container {
  /** Offset of the declaration, for its indentation; undefined for the file. */
  start?: number;
  /** Inside of the braces; undefined for the file. */
  body?: Span;
}

/**
 * Inserts lines in a container: after the `after` sibling when given, otherwise at the top or
 * the end of the body.
 */
function insertion(text: string, unit: string, container: Container, lines: string[], where: { after?: { span: Span }; top?: boolean; blankLine?: boolean }): Splice {
  const outer = container.start === undefined ? '' : indentAt(text, container.start);
  const inner = container.start === undefined ? '' : outer + unit;
  const indentLines = (indent: string) => lines.map((l) => (l ? indent + l : l)).join('\n');
  const blank = where.blankLine ? '\n' : '';

  if (where.after) {
    const end = where.after.span.end;
    const eol = lineEnd(text, end);
    const restOfLine = text.slice(end, eol);
    const withinBody = !container.body || eol <= container.body.end;
    if (withinBody && /^\s*(\/\/.*)?$/.test(restOfLine)) {
      const indent = isBlank(text.slice(lineStart(text, where.after.span.start), where.after.span.start)) ? indentAt(text, where.after.span.start) : inner;
      return { start: eol, end: eol, text: `\n${blank}${indentLines(indent)}` };
    }
  }

  if (!container.body) {
    // End (or top) of the file.
    if (where.top) return { start: 0, end: 0, text: `${indentLines('')}\n${text.trim() ? '\n' : ''}` };
    const trimmed = text.replace(/\s*$/, '');
    return { start: trimmed.length, end: text.length, text: `${trimmed ? '\n\n' : ''}${indentLines('')}\n` };
  }

  const { body } = container;
  const content = text.slice(body.start, body.end);
  if (!content.includes('\n')) {
    const trimmedEnd = body.start + content.trimEnd().length;
    return { start: trimmedEnd, end: body.end, text: `\n${indentLines(inner)}\n${outer}` };
  }
  if (where.top) {
    const firstLineEnd = lineEnd(text, body.start);
    return { start: firstLineEnd + 1, end: firstLineEnd + 1, text: `${indentLines(inner)}\n${blank}` };
  }
  const closingLine = lineStart(text, body.end);
  if (isBlank(text.slice(closingLine, body.end)) && closingLine > body.start) {
    const hasContent = !isBlank(content);
    return { start: closingLine, end: closingLine, text: `${hasContent ? blank : ''}${indentLines(inner)}\n` };
  }
  return { start: body.end, end: body.end, text: `\n${indentLines(inner)}\n${outer}` };
}

/** True when the last two siblings are separated by a blank line (the new one follows that spacing). */
function spacedSiblings(text: string, siblings: { docStart: number; span: Span }[]): boolean {
  const sorted = [...siblings].sort((a, b) => a.span.start - b.span.start);
  if (sorted.length < 2) return false;
  const [previous, last] = sorted.slice(-2);
  const gap = text.slice(previous.span.end, last.docStart);
  // Only a gap made of whitespace counts: another declaration in between says nothing about spacing.
  return !/\S/.test(gap.replace(/\/\/.*$/gm, '')) && /\n[ \t]*\n/.test(gap);
}

const lastOf = <T extends { span: Span }>(...lists: T[][]): T | undefined =>
  lists.flat().reduce<T | undefined>((last, n) => (!last || n.span.end > last.span.end ? n : last), undefined);

function containerOf(target: Resolved): Container {
  switch (target.kind) {
    case 'file':
      return {};
    case 'field':
    case 'value':
      throw new Error('Cannot add elements inside a field.');
    case 'rpc':
      return { start: target.node.span.start, body: target.node.body };
    default:
      return { start: target.node.span.start, body: target.node.body };
  }
}

function fileHeaderAnchor(file: ProtoFile, ...kinds: ('options' | 'imports' | 'package' | 'syntax')[]): { span: Span } | undefined {
  for (const kind of kinds) {
    if (kind === 'options' && file.options.length) return lastOf(file.options);
    if (kind === 'imports' && file.imports.length) return lastOf(file.imports);
    if (kind === 'package' && file.package) return file.package;
    if (kind === 'syntax' && file.syntax) return file.syntax;
  }
  return undefined;
}

function addElement(text: string, file: ProtoFile, parentPath: ProtoPath, element: NewElement): Splice {
  const unit = indentUnit(text, file);
  const parent = resolvePath(file, parentPath);
  const spaceBeforeParen = file.services.some((s) => s.rpcs.some((r) => r.request.span.start > r.nameSpan.end));
  const lines = elementLines(element, unit, spaceBeforeParen);
  return insertLines(text, file, parent, element.kind, lines);
}

function insertLines(text: string, file: ProtoFile, parent: Resolved, kind: NewElement['kind'], lines: string[]): Splice {
  const unit = indentUnit(text, file);
  const container = containerOf(parent);
  const block = kind === 'message' || kind === 'enum' || kind === 'service' || kind === 'oneof' || lines.length > 1;

  switch (parent.kind) {
    case 'file': {
      if (kind === 'service') return insertion(text, unit, container, lines, { after: lastOf(file.services), blankLine: true });
      if (kind === 'message' || kind === 'enum') return insertion(text, unit, container, lines, { after: lastOf<{ span: Span }>(kind === 'message' ? file.messages : file.enums), blankLine: true });
      throw new Error(`A ${kind} cannot be added at the top of the file.`);
    }
    case 'message': {
      const m = parent.node;
      if (kind === 'field' || kind === 'oneof') {
        const regular = m.fields.filter((f) => !f.oneof);
        const after = lastOf<ProtoField | ProtoOneof>(regular, m.oneofs);
        const afterOneof = !!after && m.oneofs.includes(after as ProtoOneof);
        return insertion(text, unit, container, lines, { after, blankLine: kind === 'oneof' || afterOneof || spacedSiblings(text, regular) });
      }
      if (kind === 'message' || kind === 'enum') {
        return insertion(text, unit, container, lines, { after: lastOf<{ span: Span }>(m.messages, m.enums), blankLine: true });
      }
      break;
    }
    case 'oneof': {
      const fields = parent.parent.fields.filter((f) => f.oneof === parent.node.name);
      if (kind === 'field') return insertion(text, unit, container, lines, { after: lastOf(fields), blankLine: spacedSiblings(text, fields) });
      break;
    }
    case 'enum':
      if (kind === 'value') return insertion(text, unit, container, lines, { after: lastOf(parent.node.values), blankLine: spacedSiblings(text, parent.node.values) });
      break;
    case 'service':
      if (kind === 'rpc') {
        const { rpcs } = parent.node;
        return insertion(text, unit, container, lines, { after: lastOf(rpcs), blankLine: (block && rpcs.length > 0) || spacedSiblings(text, rpcs) });
      }
      break;
  }
  throw new Error(`A ${kind} cannot be added to a ${parent.kind}.`);
}

function nodeOf(target: Resolved) {
  if (target.kind === 'file') throw new Error('This change needs an element of the file.');
  return target.node;
}

function setOption(text: string, file: ProtoFile, target: Resolved, name: string, value: string | undefined): Splice[] {
  const sameName = (o: ProtoOption) => o.name === name.replace(/\s+/g, '');

  if (target.kind === 'field' || target.kind === 'value') {
    const node = target.node;
    const index = node.options.findIndex(sameName);
    if (index >= 0) {
      const option = node.options[index];
      if (value !== undefined) return [{ start: option.valueSpan.start, end: option.valueSpan.end, text: value }];
      if (node.options.length === 1) {
        let start = node.optionsSpan!.start;
        while (text[start - 1] === ' ' || text[start - 1] === '\t') start--;
        return [{ start, end: node.optionsSpan!.end, text: '' }];
      }
      const next = node.options[index + 1];
      if (next) return [{ start: option.span.start, end: next.span.start, text: '' }];
      return [{ start: node.options[index - 1].span.end, end: option.span.end, text: '' }];
    }
    if (value === undefined) return [];
    if (node.optionsSpan) {
      const last = node.options[node.options.length - 1];
      return [{ start: last.span.end, end: last.span.end, text: `, ${name} = ${value}` }];
    }
    return [{ start: node.numberSpan.end, end: node.numberSpan.end, text: ` [${name} = ${value}]` }];
  }

  const options = target.kind === 'file' ? file.options : target.node.options;
  const existing = options.find(sameName);
  if (existing) return [value === undefined ? removal(text, existing) : { start: existing.valueSpan.start, end: existing.valueSpan.end, text: value }];
  if (value === undefined) return [];

  const unit = indentUnit(text, file);
  const line = [`option ${name} = ${value};`];
  if (target.kind === 'file') {
    const after = fileHeaderAnchor(file, 'options', 'imports', 'package', 'syntax');
    if (!after) return [insertion(text, unit, {}, line, { top: true })];
    return [insertion(text, unit, {}, line, { after, blankLine: !file.options.length })];
  }
  if (target.kind === 'rpc' && !target.node.body) {
    const rpc = target.node;
    const indent = indentAt(text, rpc.span.start);
    return [{ start: rpc.span.end - 1, end: rpc.span.end, text: ` {\n${indent}${unit}${line[0]}\n${indent}}` }];
  }
  return [insertion(text, unit, containerOf(target), line, { after: lastOf(options), top: true })];
}

function setReserved(text: string, file: ProtoFile, target: Resolved, kind: 'numbers' | 'names', items: string[]): Splice[] {
  if (target.kind !== 'message' && target.kind !== 'enum') throw new Error('Only messages and enums have reserved numbers and names.');
  const all: ProtoReserved[] = target.node.reserved;
  const existing = all.filter((r) => r.kind === kind);
  const clean = items.map((i) => i.trim()).filter(Boolean);
  if (!clean.length) return existing.map((r) => removal(text, r));

  const quoted = existing[0]?.quoted ?? all.find((r) => r.kind === 'names')?.quoted ?? file.syntax?.keyword !== 'edition';
  const itemsText = (kind === 'names' && quoted ? clean.map(quote) : clean).join(', ');
  if (existing.length) {
    return [{ start: existing[0].itemsSpan.start, end: existing[0].itemsSpan.end, text: itemsText }, ...existing.slice(1).map((r) => removal(text, r))];
  }
  const after = lastOf<{ span: Span }>(all, target.node.options);
  return [insertion(text, indentUnit(text, file), containerOf(target), [`reserved ${itemsText};`], { after, top: true })];
}

function setComment(text: string, target: { docStart: number; span: Span }, comment: string): Splice {
  const indent = indentAt(text, target.span.start);
  const ownLine = isBlank(text.slice(lineStart(text, target.span.start), target.span.start));
  const block = target.docStart < target.span.start && text.startsWith('/**', target.docStart);
  const trimmed = comment.replace(/\s+$/, '');
  const lines = !trimmed
    ? []
    : block
      ? [`/**`, ...trimmed.split('\n').map((l) => (l.trim() ? ` * ${l}` : ' *')), ' */']
      : commentLines(trimmed);
  const rendered = lines.map((l) => indent + l).join('\n');

  const from = target.docStart < target.span.start && isBlank(text.slice(lineStart(text, target.docStart), target.docStart)) ? lineStart(text, target.docStart) : target.docStart;
  if (ownLine) {
    const to = lineStart(text, target.span.start);
    const start = target.docStart < target.span.start ? from : to;
    return { start, end: to, text: rendered ? `${rendered}\n` : '' };
  }
  const start = target.docStart < target.span.start ? from : target.span.start;
  return { start, end: target.span.start, text: rendered ? `\n${rendered}\n${indent}` : '' };
}

function applyOne(text: string, edit: ProtoEdit): string {
  const file = parseProto(text);
  const unit = () => indentUnit(text, file);

  switch (edit.op) {
    case 'setSyntax': {
      if (file.syntax) {
        if (file.syntax.keyword === 'edition') throw new Error('Files using editions keep their edition; change it as text.');
        return apply(text, [{ start: file.syntax.valueSpan.start, end: file.syntax.valueSpan.end, text: quote(edit.value) }]);
      }
      const first = [file.package, ...file.imports, ...file.options, ...file.messages, ...file.enums, ...file.services, ...file.extends]
        .filter((n) => n !== undefined)
        .reduce((min, n) => Math.min(min, n.docStart), text.length);
      const at = first < text.length ? lineStart(text, first) : 0;
      return apply(text, [{ start: at, end: at, text: `syntax = ${quote(edit.value)};\n${text.trim() ? '\n' : ''}` }]);
    }

    case 'setPackage': {
      const value = edit.value.trim();
      if (file.package) {
        return apply(text, [value ? { start: file.package.nameSpan.start, end: file.package.nameSpan.end, text: value } : removal(text, file.package)]);
      }
      if (!value) return text;
      const after = fileHeaderAnchor(file, 'syntax');
      return apply(text, [insertion(text, unit(), {}, [`package ${value};`], after ? { after, blankLine: true } : { top: true })]);
    }

    case 'addImport': {
      if (file.imports.some((i) => i.path === edit.path)) return text;
      const line = [`import ${edit.modifier ? `${edit.modifier} ` : ''}${quote(edit.path)};`];
      const after = fileHeaderAnchor(file, 'imports', 'package', 'syntax');
      return apply(text, [insertion(text, unit(), {}, line, after ? { after, blankLine: !file.imports.length } : { top: true })]);
    }

    case 'removeImport':
      return apply(text, file.imports.filter((i) => i.path === edit.path).map((i) => removal(text, i)));

    case 'rename': {
      const target = resolvePath(file, edit.target);
      if (target.kind === 'file') throw new Error('The file has no name to change here.');
      return apply(text, [{ start: target.node.nameSpan.start, end: target.node.nameSpan.end, text: edit.name }]);
    }

    case 'setComment':
      return apply(text, [setComment(text, nodeOf(resolvePath(file, edit.target)), edit.comment)]);

    case 'setType': {
      const target = resolvePath(file, edit.target);
      if (target.kind !== 'field') throw new Error('Only fields have a type.');
      if (target.node.kind === 'group') throw new Error('Groups cannot change type in the form.');
      return apply(text, [{ start: target.node.typeSpan.start, end: target.node.typeSpan.end, text: edit.type }]);
    }

    case 'setNumber': {
      const target = resolvePath(file, edit.target);
      if (target.kind !== 'field' && target.kind !== 'value') throw new Error('Only fields and enum values have a number.');
      return apply(text, [{ start: target.node.numberSpan.start, end: target.node.numberSpan.end, text: String(edit.number) }]);
    }

    case 'setLabel': {
      const target = resolvePath(file, edit.target);
      if (target.kind !== 'field' || target.node.kind === 'group') throw new Error('Only fields have a label.');
      const { label, typeSpan } = target.node;
      if (label) {
        return apply(text, [edit.label ? { start: label.span.start, end: label.span.end, text: edit.label } : { start: label.span.start, end: typeSpan.start, text: '' }]);
      }
      return edit.label ? apply(text, [{ start: typeSpan.start, end: typeSpan.start, text: `${edit.label} ` }]) : text;
    }

    case 'setRpcSide': {
      const target = resolvePath(file, edit.target);
      if (target.kind !== 'rpc') throw new Error('Only rpcs have a request and a response.');
      const span = target.node[edit.side].span;
      return apply(text, [{ start: span.start, end: span.end, text: `(${edit.stream ? 'stream ' : ''}${edit.type})` }]);
    }

    case 'setOption':
      return apply(text, setOption(text, file, resolvePath(file, edit.target), edit.name, edit.value));

    case 'setReserved':
      return apply(text, setReserved(text, file, resolvePath(file, edit.target), edit.kind, edit.items));

    case 'add':
      return apply(text, [addElement(text, file, edit.parent, edit.element)]);

    case 'delete':
      return apply(text, [removal(text, nodeOf(resolvePath(file, edit.target)))]);

    case 'move': {
      const target = resolvePath(file, edit.target);
      if (target.kind !== 'field') throw new Error('Only fields can be moved.');
      const lines = extractLines(text, target.node);
      const removed = apply(text, [removal(text, target.node)]);
      const reparsed = parseProto(removed);
      return apply(removed, [insertLines(removed, reparsed, resolvePath(reparsed, edit.parent), 'field', lines)]);
    }
  }
}

/** Applies edits one after the other. Line endings of the file are kept. */
export function applyProtoEdits(text: string, edits: ProtoEdit[]): string {
  const crlf = text.includes('\r\n');
  let result = crlf ? text.replace(/\r\n/g, '\n') : text;
  for (const edit of edits) result = applyOne(result, edit);
  return crlf ? result.replace(/\n/g, '\r\n') : result;
}
