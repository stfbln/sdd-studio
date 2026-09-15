import { baseName } from '../../../shared/files';
import { CONFORMANCE_NOTICE } from './keywords';
import {
  blockText,
  EXAMPLE_LABEL,
  fencedLines,
  isBlank,
  parseSpecMarkdown,
  scanFences,
  splitLines,
  type Example,
  type Requirement,
  type RequirementList,
  type SpecModel,
} from './parse';

/**
 * Changes the form makes to a markdown spec. Each one rewrites only the lines concerned; a section
 * is written when it gets content and removed when it no longer has any. Groups stay until deleted.
 */
export type SpecEdit =
  /** An empty value removes the title. */
  | { op: 'setTitle'; value: string }
  /** The spec this one inherits its requirements from: a path relative to this file, empty to remove the line. */
  | { op: 'setExtends'; value: string; label?: string }
  | { op: 'setDescription'; value: string }
  | { op: 'setContext'; value: string }
  /** The BCP 14 sentence at the start of the Requirements section. */
  | { op: 'setNotice'; enabled: boolean }
  /** Appends by default. */
  | { op: 'addRequirement'; group: ListRef; text: string; index?: number }
  | { op: 'setRequirement'; group: ListRef; index: number; text: string }
  | { op: 'deleteRequirement'; group: ListRef; index: number }
  /** `toIndex` is the position in the target list once moved (appends when omitted). */
  | { op: 'moveRequirement'; group: ListRef; index: number; toGroup: ListRef; toIndex?: number }
  /** Example scenarios of one requirement: nested "- Example: ..." items under it. Appends by default. */
  | { op: 'addExample'; group: ListRef; index: number; text: string; at?: number }
  | { op: 'setExample'; group: ListRef; index: number; example: number; text: string }
  | { op: 'deleteExample'; group: ListRef; index: number; example: number }
  | { op: 'moveExample'; group: ListRef; index: number; example: number; to: number }
  /** Appended after the other groups, with its first requirement when `text` is given. */
  | { op: 'addGroup'; name: string; text?: string }
  | { op: 'renameGroup'; group: number; name: string }
  /** `toIndex` is the position among the groups once moved. */
  | { op: 'moveGroup'; group: number; toIndex: number }
  /** Removes the heading with everything under it (requirements and notes). */
  | { op: 'deleteGroup'; group: number };

/** null: the requirements directly under "## Requirements"; n: its n-th `###` group. */
export type ListRef = number | null;

export function listOf(model: SpecModel, ref: ListRef): RequirementList | undefined {
  const requirements = model.requirements;
  return ref === null ? requirements?.list : requirements?.groups[ref];
}

/** Closes a code fence left open, so the rest of the file is not swallowed by it. */
function closeFences(text: string): string {
  const open = scanFences(text.split('\n')).open;
  if (open === undefined) return text;
  const [, indent, fence] = /^( *)(`{3,}|~{3,})/.exec(open) ?? ['', '', '```'];
  return `${text}\n${indent}${fence}`;
}

export const normalizeTitle = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Description and context: level-1/2 heading lines are escaped so they stay inside the block. */
export function normalizeBlock(value: string): string {
  const text = closeFences(value.replace(/\r\n?/g, '\n').replace(/^([ \t]*\n)+/, '').replace(/\s+$/, ''));
  if (!text) return '';
  const lines = text.split('\n');
  const inFence = fencedLines(lines);
  return lines.map((l, i) => (inFence[i] ? l : l.replace(/^( {0,3})(#{1,2})(?=[ \t]|$)/, '$1\\$2'))).join('\n');
}

export const normalizeRequirement = (value: string) => {
  const text = value.replace(/\r\n?/g, '\n').replace(/^\s+/, '').replace(/\s+$/, '');
  return text && closeFences(text);
};

/** An example is written under its requirement, so its own "Example:" label is not repeated. */
export const normalizeExample = (value: string) => normalizeRequirement(value).replace(EXAMPLE_LABEL, '');

/** Wraps a text under a list marker: "- <first>", continuation lines aligned with it. */
function renderLines(indent: string, marker: string, prefix: string, text: string): string[] {
  const [first, ...rest] = text.split('\n');
  const inner = indent + ' '.repeat(marker.length + 1);
  return [`${indent}${marker} ${prefix}${first}`.trimEnd(), ...rest.map((l) => (l.trim() ? inner + l : ''))];
}

/** "  - Example: ..." under a requirement whose text starts at column `indent`. */
function renderExample(indent: number, marker: string, text: string): string[] {
  return renderLines(' '.repeat(indent), marker, 'Example: ', text);
}

function renderItem(marker: string, checkbox: string, text: string, examples: string[] = [], exampleMarker = '-'): string[] {
  const lines = renderLines('', marker, checkbox, text);
  for (const example of examples) lines.push(...renderExample(marker.length + 1, exampleMarker, example));
  return lines;
}

/** Marker for an item inserted at `index`, following the style of the list. */
function markerAt(items: Requirement[], index: number): string {
  const reference = items[Math.min(index, items.length) - 1] ?? items[0];
  if (!reference) return '-';
  const ordered = /^(\d+)([.)])$/.exec(reference.marker);
  if (!ordered) return reference.marker;
  return reference === items[index - 1] ? `${Number(ordered[1]) + 1}${ordered[2]}` : reference.marker;
}

class Lines {
  lines: string[];
  private readonly trailingNewline: boolean;

  constructor(text: string) {
    this.lines = text ? splitLines(text) : [];
    // A new, empty file gets a final newline like the others.
    this.trailingNewline = !text || /\n$/.test(text);
    if (this.lines[this.lines.length - 1] === '') this.lines.pop();
  }

  get model(): SpecModel {
    return parseSpecMarkdown(this.toString());
  }

  replace(start: number, end: number, block: string[]) {
    this.lines.splice(start, end - start, ...block);
  }

  /** Inserts a block separated from its neighbours by one blank line. */
  insertBlock(at: number, block: string[]) {
    const before = at > 0 && !isBlank(this.lines[at - 1]);
    const after = at < this.lines.length && !isBlank(this.lines[at]);
    this.lines.splice(at, 0, ...(before ? [''] : []), ...block, ...(after ? [''] : []));
  }

  /** Removes lines without leaving a double blank line or blank lines at the end. */
  removeBlock(start: number, end: number) {
    this.lines.splice(start, end - start);
    while (start > 0 && start < this.lines.length && isBlank(this.lines[start - 1]) && isBlank(this.lines[start])) this.lines.splice(start, 1);
    if (start >= this.lines.length) while (this.lines.length && isBlank(this.lines[this.lines.length - 1])) this.lines.pop();
    if (start === 0) while (this.lines.length && isBlank(this.lines[0])) this.lines.shift();
  }

  /** Replaces the non-blank content of a range, keeping the blank lines around it. */
  setBlock(start: number, end: number, value: string, insertAt: number) {
    let first = start;
    let last = Math.min(end, this.lines.length) - 1;
    while (first <= last && isBlank(this.lines[first])) first++;
    while (last >= first && isBlank(this.lines[last])) last--;
    if (first > last) {
      if (value) this.insertBlock(insertAt, value.split('\n'));
    } else if (value) {
      if (blockText(this.lines, start, end) !== value) this.replace(first, last + 1, value.split('\n'));
    } else {
      this.removeBlock(first, last + 1);
    }
  }

  toString() {
    const text = this.lines.join('\n');
    return this.trailingNewline && this.lines.length ? `${text}\n` : text;
  }
}

function setTitle(doc: Lines, value: string) {
  const { title, bodyStart } = doc.model;
  const text = normalizeTitle(value);
  if (title) {
    if (!text) doc.removeBlock(title.line, title.line + 1);
    else if (title.text !== text) doc.replace(title.line, title.line + 1, [`# ${text}`]);
  } else if (text) {
    doc.insertBlock(bodyStart, [`# ${text}`]);
  }
}

/** "Extends: [Title](path)" right under the title; an empty path removes the line. */
function setExtends(doc: Lines, value: string, label?: string) {
  const model = doc.model;
  const target = normalizeTitle(value);
  const current = model.extends;
  if (!target) {
    if (current) doc.removeBlock(current.line, current.line + 1);
    return;
  }
  const text = normalizeTitle(label ?? '').replace(/[[\]]/g, '') || baseName(target);
  const destination = /[()\s]/.test(target) ? `<${target}>` : target;
  const line = `Extends: [${text}](${destination})`;
  if (current) {
    if (doc.lines[current.line] !== line) doc.replace(current.line, current.line + 1, [line]);
  } else {
    doc.insertBlock(model.title ? model.title.line + 1 : model.bodyStart, [line]);
  }
}

function setContext(doc: Lines, value: string) {
  const model = doc.model;
  const text = normalizeBlock(value);
  const context = model.context?.section;
  if (!context) {
    if (text) doc.insertBlock(model.description.end, ['## Context', '', ...text.split('\n')]);
  } else if (!text && blockText(doc.lines, context.heading.line + 1, context.end) !== '') {
    doc.removeBlock(context.heading.line, context.end);
  } else if (text) {
    doc.setBlock(context.heading.line + 1, context.end, text, context.heading.line + 1);
  }
}

/** Removes the Requirements section when it has no requirement, group or note left. */
function cleanUp(doc: Lines) {
  const requirements = doc.model.requirements;
  if (requirements && !requirements.list.items.length && !requirements.list.otherContent && !requirements.groups.length) {
    doc.removeBlock(requirements.section.heading.line, requirements.section.end);
  }
}

/** Lines of a group from its heading to its last non-blank line. */
function groupLines(doc: Lines, group: number): { start: number; end: number } {
  const found = doc.model.requirements?.groups[group];
  if (!found) throw new Error('This group of requirements no longer exists in the file.');
  let end = found.end;
  while (end > found.heading.line + 1 && isBlank(doc.lines[end - 1])) end--;
  return { start: found.heading.line, end };
}

function moveGroup(doc: Lines, group: number, toIndex: number) {
  const count = doc.model.requirements?.groups.length ?? 0;
  const { start, end } = groupLines(doc, group);
  const target = Math.max(0, Math.min(toIndex, count - 1));
  if (target === group) return;
  const block = doc.lines.slice(start, end);
  doc.removeBlock(start, doc.model.requirements!.groups[group].end);
  if (target < count - 1) return doc.insertBlock(doc.model.requirements!.groups[target].heading.line, block);
  doc.insertBlock(groupLines(doc, count - 2).end, block);
}

/** A new Requirements section, placed after Context (or the description). */
function insertSection(doc: Lines, block: string[]) {
  const model = doc.model;
  const at = model.context ? model.context.section.end : model.description.end;
  doc.insertBlock(at, ['## Requirements', '', CONFORMANCE_NOTICE, '', ...block]);
}

function addRequirement(doc: Lines, ref: ListRef, value: string, index?: number, checkbox = '', forceLoose?: boolean, examples: string[] = []) {
  const model = doc.model;
  const text = normalizeRequirement(value);
  if (!model.requirements && ref === null) return insertSection(doc, renderItem('-', checkbox, text, examples));
  const list = listOf(model, ref);
  if (!list) throw new Error('This group of requirements no longer exists in the file.');

  const { items } = list;
  const position = Math.max(0, Math.min(index ?? items.length, items.length));
  const block = renderItem(markerAt(items, position), checkbox, text, examples);
  const loose = forceLoose ?? list.loose;
  if (!items.length) {
    // After the notes of the list (or the conformance sentence), before the next group.
    let last = list.end - 1;
    while (last >= list.start && isBlank(doc.lines[last])) last--;
    doc.insertBlock(last + 1, block);
  } else if (position < items.length) {
    doc.replace(items[position].line, items[position].line, loose ? [...block, ''] : block);
  } else {
    const end = items[items.length - 1].end;
    doc.replace(end, end, loose ? ['', ...block] : block);
  }
}

/** The requirement an example edit is about, with the list holding it. */
function requirementOf(model: SpecModel, group: ListRef, index: number): Requirement {
  const item = listOf(model, group)?.items[index];
  if (!item) throw new Error(`Requirement ${index + 1} no longer exists in the file.`);
  return item;
}

function exampleOf(item: Requirement, index: number): Example {
  const example = item.examples[index];
  if (!example) throw new Error(`Example ${index + 1} no longer exists in the file.`);
  return example;
}

function addExample(doc: Lines, group: ListRef, index: number, value: string, at?: number) {
  const text = normalizeExample(value);
  if (!text) throw new Error('An example cannot be empty.');
  const item = requirementOf(doc.model, group, index);
  const { examples } = item;
  const position = Math.max(0, Math.min(at ?? examples.length, examples.length));
  const block = renderExample(item.indent, examples[0]?.marker ?? '-', text);
  const line = position < examples.length ? examples[position].line : (examples[examples.length - 1]?.end ?? item.bodyEnd);
  doc.replace(line, line, block);
}

function applyOne(doc: Lines, edit: SpecEdit) {
  const model = doc.model;
  switch (edit.op) {
    case 'setTitle':
      return setTitle(doc, edit.value);
    case 'setExtends':
      return setExtends(doc, edit.value, edit.label);
    case 'setDescription':
      return doc.setBlock(model.description.start, model.description.end, normalizeBlock(edit.value), model.extends ? model.extends.line + 1 : model.title ? model.title.line + 1 : model.bodyStart);
    case 'setContext':
      return setContext(doc, edit.value);
    case 'setNotice': {
      const requirements = model.requirements;
      if (!requirements) return;
      if (edit.enabled && !requirements.notice) doc.insertBlock(requirements.section.heading.line + 1, [CONFORMANCE_NOTICE]);
      if (!edit.enabled && requirements.notice) doc.removeBlock(requirements.notice.start, requirements.notice.end);
      return;
    }
    case 'addRequirement':
      if (!normalizeRequirement(edit.text)) throw new Error('A requirement cannot be empty.');
      return addRequirement(doc, edit.group, edit.text, edit.index);
    case 'addExample':
      return addExample(doc, edit.group, edit.index, edit.text, edit.at);
    case 'setExample': {
      const item = requirementOf(model, edit.group, edit.index);
      const example = exampleOf(item, edit.example);
      const text = normalizeExample(edit.text);
      if (text !== example.text) doc.replace(example.line, example.end, renderExample(item.indent, example.marker, text));
      return;
    }
    case 'deleteExample': {
      const example = exampleOf(requirementOf(model, edit.group, edit.index), edit.example);
      return doc.removeBlock(example.line, example.end);
    }
    case 'moveExample': {
      const item = requirementOf(model, edit.group, edit.index);
      const example = exampleOf(item, edit.example);
      const to = Math.max(0, Math.min(edit.to, item.examples.length - 1));
      if (to === edit.example) return;
      doc.removeBlock(example.line, example.end);
      return addExample(doc, edit.group, edit.index, example.text, to);
    }
    case 'addGroup': {
      const name = normalizeTitle(edit.name);
      const text = normalizeRequirement(edit.text ?? '');
      if (!name) throw new Error('A group needs a name.');
      const block = [`### ${name}`, ...(text ? ['', ...renderItem('-', '', text)] : [])];
      if (!model.requirements) return insertSection(doc, block);
      return doc.insertBlock(model.requirements.section.end, block);
    }
    case 'renameGroup': {
      const group = model.requirements?.groups[edit.group];
      const name = normalizeTitle(edit.name);
      if (!group) throw new Error('This group of requirements no longer exists in the file.');
      if (!name) throw new Error('A group needs a name.');
      if (name !== group.heading.text) doc.replace(group.heading.line, group.heading.line + 1, [`### ${name}`]);
      return;
    }
    case 'moveGroup':
      return moveGroup(doc, edit.group, edit.toIndex);
    case 'deleteGroup': {
      const group = model.requirements?.groups[edit.group];
      if (!group) throw new Error('This group of requirements no longer exists in the file.');
      doc.removeBlock(group.heading.line, group.end);
      return cleanUp(doc);
    }
  }

  const list = listOf(model, edit.group);
  const item = list?.items[edit.index];
  if (!list || !item) throw new Error(`Requirement ${edit.index + 1} no longer exists in the file.`);
  switch (edit.op) {
    case 'setRequirement': {
      // Only the sentence is rewritten: the examples listed under it stay where they are.
      const text = normalizeRequirement(edit.text);
      if (text !== item.text) doc.replace(item.line, item.bodyEnd, renderItem(item.marker, item.checkbox, text));
      return;
    }
    case 'deleteRequirement':
      doc.removeBlock(item.line, item.end);
      return cleanUp(doc);
    case 'moveRequirement': {
      const same = edit.toGroup === edit.group;
      if (same && (edit.toIndex ?? list.items.length - 1) === edit.index) return;
      if (!same && !listOf(model, edit.toGroup)) throw new Error('The target group no longer exists in the file.');
      doc.removeBlock(item.line, item.end);
      return addRequirement(
        doc,
        edit.toGroup,
        item.text || ' ',
        edit.toIndex,
        item.checkbox,
        same ? list.loose : undefined,
        item.examples.map((e) => e.text),
      );
    }
  }
}

export function applySpecEdits(text: string, edits: SpecEdit[]): string {
  const doc = new Lines(text);
  for (const edit of edits) applyOne(doc, edit);
  return doc.toString();
}
