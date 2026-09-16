import { baseName } from '../../../shared/files';
import { DEFAULT_KEYWORD_ICONS, findKeyword, KEYWORDS, levelHeading, levelIntro, levelRank, WRITTEN_NOTICE, type Keyword, type KeywordIcons } from './keywords';
import {
  blockText,
  EXAMPLE_LABEL,
  exampleTitle,
  fencedLines,
  isBlank,
  parseSpecMarkdown,
  scanFences,
  splitLines,
  type RequirementList,
  type Section,
  type SpecModel,
} from './parse';

/**
 * Changes the form makes to a markdown spec. The title, Extends line, description and context are
 * changed on the lines concerned. The Requirements section is written back as a whole, in the
 * layout of key word headings: a `####` heading per key word (with its icon), a `#####` heading per
 * requirement, with its description and "**Title**\" examples under it. Whatever the change, a section
 * written in an older layout is rewritten in this one; one already in it only changes on the lines
 * concerned.
 * A section is written when it gets content and removed when it no longer has any. Groups stay until
 * deleted.
 */
export type SpecEdit =
  /** An empty value removes the title. */
  | { op: 'setTitle'; value: string }
  /** The specs this one inherits its requirements from, closest first; paths relative to this file, an empty list removes the line. */
  | { op: 'setExtends'; parents: { target: string; label?: string }[] }
  | { op: 'setDescription'; value: string }
  | { op: 'setContext'; value: string }
  /** The BCP 14 sentence at the start of the Requirements section. */
  | { op: 'setNotice'; enabled: boolean }
  /** Written under the heading of its key word, created when missing; last of its key word by default. */
  | { op: 'addRequirement'; group: ListRef; text: string; index?: number }
  /** The sentence, on one line: when it takes another key word, the requirement moves under the heading of that key word. */
  | { op: 'setRequirement'; group: ListRef; index: number; text: string }
  /** Description (details, rationale) written between the sentence and the examples; empty removes it. */
  | { op: 'setRequirementDescription'; group: ListRef; index: number; text: string }
  | { op: 'deleteRequirement'; group: ListRef; index: number }
  /** `toIndex` is the position in the target list once moved, within its key word (last of its key word when omitted). */
  | { op: 'moveRequirement'; group: ListRef; index: number; toGroup: ListRef; toIndex?: number }
  /** Example scenarios of one requirement: "**Title**\" with the case on the next line. Appends by default. */
  | { op: 'addExample'; group: ListRef; index: number; text: string; title?: string; at?: number }
  | { op: 'setExample'; group: ListRef; index: number; example: number; text: string }
  /** An empty title numbers the example instead ("**Example 2**"). */
  | { op: 'setExampleTitle'; group: ListRef; index: number; example: number; title: string }
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

/** A requirement is the text of a heading: one line. */
export const normalizeRequirement = (value: string) => normalizeTitle(value);

/**
 * Text written under a requirement: heading lines are escaped so they stay inside it, and so are
 * lines in bold or italics starting a paragraph, which would start an example. `paragraph` tells
 * whether the first line starts a paragraph (a description does, the case under an example title
 * does not).
 */
function normalizeInside(value: string, paragraph: boolean): string {
  const text = closeFences(value.replace(/\r\n?/g, '\n').replace(/^([ \t]*\n)+/, '').replace(/\s+$/, ''));
  if (!text) return '';
  const lines = text.split('\n');
  const inFence = fencedLines(lines);
  return lines
    .map((line, i) => {
      if (inFence[i]) return line;
      const escaped = line.replace(/^( {0,3})(#{1,6})(?=[ \t]|$)/, '$1\\$2');
      const starts = i === 0 ? paragraph : isBlank(lines[i - 1]);
      return starts && exampleTitle(escaped) !== undefined ? escaped.replace(/^( {0,3})([*_])/, '$1\\$2') : escaped;
    })
    .join('\n');
}

export const normalizeRequirementDescription = (value: string) => normalizeInside(value, true);

/** The case of an example, written under its title, so an "Example:" label typed in front of it is not kept. */
export const normalizeExample = (value: string) => normalizeInside(value.replace(/^\s+/, '').replace(EXAMPLE_LABEL, ''), false);

/** A title in bold on one line; "Example 2" is the title of an example without one. */
export function normalizeExampleTitle(value: string): string {
  const text = normalizeTitle(value).replace(/\*/g, '').replace(/[\\\s]+$/, '');
  return (text && exampleTitle(`*${text}*`)) || '';
}

/** Requirements are written level by level, in the order they are listed inside each level. */
export function sortByLevel<T extends { level?: Keyword }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => levelRank(a.item.level) - levelRank(b.item.level) || a.index - b.index)
    .map(({ item }) => item);
}

/** What the Requirements section holds, as it is written back. */
interface RequirementContent {
  text: string;
  checkbox: string;
  description: string;
  level?: Keyword;
  examples: { title: string; text: string }[];
}

interface ListContent {
  notes: string;
  items: RequirementContent[];
  /** The text under the `####` headings, and the headings naming no level, as written. */
  levels: { keyword?: Keyword; customHeading?: string; intro: string }[];
}

interface SectionContent {
  notice?: string;
  list: ListContent;
  /** `heading` is the `###` line as written. */
  groups: (ListContent & { heading: string })[];
}

function listContent(lines: string[], list: RequirementList): ListContent {
  return {
    notes: list.notes,
    items: list.items.map(({ text, checkbox, description, level, examples }) => ({ text, checkbox, description, level, examples: examples.map(({ title, text }) => ({ title, text })) })),
    levels: list.levels.map(({ keyword, heading, customHeading, intro }) => ({ keyword, customHeading: heading && customHeading ? lines[heading.line] : undefined, intro })),
  };
}

function sectionContent(lines: string[], model: SpecModel): SectionContent {
  const requirements = model.requirements;
  if (!requirements) return { notice: WRITTEN_NOTICE, list: { notes: '', items: [], levels: [] }, groups: [] };
  return {
    notice: requirements.notice?.text,
    list: listContent(lines, requirements.list),
    groups: requirements.groups.map((group) => ({ heading: lines[group.heading.line], ...listContent(lines, group) })),
  };
}

/** "##### The service MUST ...": closing #s of the sentence are kept by closing the heading. */
function requirementHeading({ checkbox, text }: RequirementContent): string {
  const sentence = `${checkbox}${text}`;
  return `##### ${sentence}${/(^|[ \t])#+$/.test(sentence) ? ' #' : ''}`.trimEnd();
}

/** "**Card declined**\" with the case on the next line: the backslash breaks the line once rendered. */
function exampleBlock({ title, text }: { title: string; text: string }, index: number): string {
  const heading = `**${title || `Example ${index + 1}`}**`;
  return text ? `${heading}\\\n${text}` : heading;
}

/** Blocks of a list, to be separated by blank lines: notes, then each level with its requirements. */
function listBlocks(list: ListContent, icons: KeywordIcons): string[] {
  const blocks = list.notes ? [list.notes] : [];
  for (let rank = 0; rank <= KEYWORDS.length; rank++) {
    const keyword = KEYWORDS[rank] as Keyword | undefined;
    const items = list.items.filter((item) => levelRank(item.level) === rank);
    const level = list.levels.find((l) => levelRank(l.keyword) === rank);
    const intro = level ? level.intro : levelIntro(keyword);
    if (!items.length && (!intro || intro === levelIntro(keyword))) continue;
    blocks.push(level?.customHeading ?? levelHeading(keyword, icons));
    if (intro) blocks.push(intro);
    for (const item of items) {
      blocks.push(requirementHeading(item));
      if (item.description) blocks.push(item.description);
      blocks.push(...item.examples.map(exampleBlock));
    }
  }
  return blocks;
}

function sectionLines(content: SectionContent, icons: KeywordIcons): string[] {
  const blocks = [
    ...(content.notice ? [content.notice] : []),
    ...listBlocks(content.list, icons),
    ...content.groups.flatMap((group) => [group.heading, ...listBlocks(group, icons)]),
  ];
  return blocks.length ? blocks.join('\n\n').split('\n') : [];
}

class Lines {
  lines: string[];
  private readonly trailingNewline: boolean;

  constructor(
    text: string,
    readonly icons: KeywordIcons,
  ) {
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

/** "[Data storage](./data-storage.spec.md)": the label falls back to the file name, spaces need angle brackets. */
function renderParent({ target, label }: { target: string; label?: string }): string {
  const text = normalizeTitle(label ?? '').replace(/[[\]]/g, '') || baseName(target);
  return `[${text}](${/[()\s]/.test(target) ? `<${target}>` : target})`;
}

/** "Extends: [A](a.spec.md), [B](b.spec.md)" right under the title; an empty list removes the line. */
function setExtends(doc: Lines, parents: { target: string; label?: string }[]) {
  const model = doc.model;
  const current = model.extends;
  const written = parents.map((parent) => ({ ...parent, target: normalizeTitle(parent.target) })).filter((parent) => parent.target);
  // The same spec listed twice would apply twice: keep the first mention.
  const unique = written.filter((parent, index) => written.findIndex((p) => p.target === parent.target) === index);
  if (!unique.length) {
    if (current) doc.removeBlock(current.line, current.line + 1);
    return;
  }
  const line = `Extends: ${unique.map(renderParent).join(', ')}`;
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

/** Writes the Requirements section back, or creates it (after Context, or the description), or removes it when `removeEmpty` and it has nothing left. */
function writeSection(doc: Lines, section: Section | undefined, content: SectionContent, removeEmpty = false) {
  const body = sectionLines(content, doc.icons);
  if (!section) {
    const model = doc.model;
    return doc.insertBlock(model.context ? model.context.section.end : model.description.end, ['## Requirements', '', ...body]);
  }
  // A notice alone does not keep the section.
  if (removeEmpty && !content.groups.length && !listBlocks(content.list, doc.icons).length) return doc.removeBlock(section.heading.line, section.end);
  const replacement = [...(body.length ? ['', ...body] : []), ...(section.end < doc.lines.length ? [''] : [])];
  if (doc.lines.slice(section.heading.line + 1, section.end).join('\n') !== replacement.join('\n')) doc.replace(section.heading.line + 1, section.end, replacement);
}

const missingGroup = () => new Error('This group of requirements no longer exists in the file.');

function listIn(content: SectionContent, ref: ListRef): ListContent {
  const list = ref === null ? content.list : content.groups[ref];
  if (!list) throw missingGroup();
  return list;
}

function requirementIn(list: ListContent, index: number): RequirementContent {
  const item = list.items[index];
  if (!item) throw new Error(`Requirement ${index + 1} no longer exists in the file.`);
  return item;
}

function exampleIn(item: RequirementContent, index: number) {
  const example = item.examples[index];
  if (!example) throw new Error(`Example ${index + 1} no longer exists in the file.`);
  return example;
}

const newRequirement = (text: string): RequirementContent => ({ text, checkbox: '', description: '', level: findKeyword(text)?.keyword, examples: [] });

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

/** Applies a change to the requirements and writes the section back, requirements sorted by key word. */
function changeRequirements(doc: Lines, change: (content: SectionContent, model: SpecModel) => void, options: { create?: boolean; removeEmpty?: boolean } = {}) {
  const model = doc.model;
  const section = model.requirements?.section;
  if (!section && !options.create) return;
  const content = sectionContent(doc.lines, model);
  change(content, model);
  for (const list of [content.list, ...content.groups]) list.items = sortByLevel(list.items);
  writeSection(doc, section, content, options.removeEmpty);
}

/** Requirement edits: every one of them writes the section back. */
function applyToRequirements(doc: Lines, edit: SpecEdit) {
  switch (edit.op) {
    case 'setNotice':
      return changeRequirements(doc, (content) => {
        content.notice = edit.enabled ? (content.notice ?? WRITTEN_NOTICE) : undefined;
      });
    case 'addRequirement': {
      const text = normalizeRequirement(edit.text);
      if (!text) throw new Error('A requirement cannot be empty.');
      return changeRequirements(
        doc,
        (content) => {
          const list = listIn(content, edit.group);
          list.items.splice(clamp(edit.index ?? list.items.length, list.items.length), 0, newRequirement(text));
        },
        { create: edit.group === null },
      );
    }
    case 'setRequirement':
      return changeRequirements(doc, (content) => {
        const item = requirementIn(listIn(content, edit.group), edit.index);
        item.text = normalizeRequirement(edit.text);
        // Typing keeps the requirement in place until its sentence has another key word.
        const keyword = findKeyword(item.text)?.keyword;
        if (keyword) item.level = keyword;
      });
    case 'setRequirementDescription':
      return changeRequirements(doc, (content) => {
        requirementIn(listIn(content, edit.group), edit.index).description = normalizeRequirementDescription(edit.text);
      });
    case 'deleteRequirement':
      return changeRequirements(
        doc,
        (content) => {
          const list = listIn(content, edit.group);
          requirementIn(list, edit.index);
          list.items.splice(edit.index, 1);
        },
        { removeEmpty: true },
      );
    case 'moveRequirement':
      return changeRequirements(doc, (content) => {
        const from = listIn(content, edit.group);
        const item = requirementIn(from, edit.index);
        if (edit.toGroup !== null && !content.groups[edit.toGroup]) throw new Error('The target group no longer exists in the file.');
        const to = listIn(content, edit.toGroup);
        from.items.splice(edit.index, 1);
        to.items.splice(clamp(edit.toIndex ?? to.items.length, to.items.length), 0, item);
      });
    case 'addExample': {
      const text = normalizeExample(edit.text);
      const title = normalizeExampleTitle(edit.title ?? '');
      if (!text && !title) throw new Error('An example cannot be empty.');
      return changeRequirements(doc, (content) => {
        const { examples } = requirementIn(listIn(content, edit.group), edit.index);
        examples.splice(clamp(edit.at ?? examples.length, examples.length), 0, { title, text });
      });
    }
    case 'setExample':
      return changeRequirements(doc, (content) => {
        exampleIn(requirementIn(listIn(content, edit.group), edit.index), edit.example).text = normalizeExample(edit.text);
      });
    case 'setExampleTitle':
      return changeRequirements(doc, (content) => {
        exampleIn(requirementIn(listIn(content, edit.group), edit.index), edit.example).title = normalizeExampleTitle(edit.title);
      });
    case 'deleteExample':
      return changeRequirements(doc, (content) => {
        const item = requirementIn(listIn(content, edit.group), edit.index);
        exampleIn(item, edit.example);
        item.examples.splice(edit.example, 1);
      });
    case 'moveExample':
      return changeRequirements(doc, (content) => {
        const { examples } = requirementIn(listIn(content, edit.group), edit.index);
        const [example] = examples.splice(edit.example, 1);
        if (!example) throw new Error(`Example ${edit.example + 1} no longer exists in the file.`);
        examples.splice(clamp(edit.to, examples.length), 0, example);
      });
    case 'addGroup': {
      const name = normalizeTitle(edit.name);
      const text = normalizeRequirement(edit.text ?? '');
      if (!name) throw new Error('A group needs a name.');
      return changeRequirements(doc, (content) => content.groups.push({ heading: `### ${name}`, notes: '', items: text ? [newRequirement(text)] : [], levels: [] }), { create: true });
    }
    case 'renameGroup': {
      const name = normalizeTitle(edit.name);
      const group = doc.model.requirements?.groups[edit.group];
      if (!group) throw missingGroup();
      if (!name) throw new Error('A group needs a name.');
      // A heading kept as written ("### **Security**") is only rewritten when the name changes.
      return changeRequirements(doc, (content) => {
        if (name !== group.heading.text) content.groups[edit.group].heading = `### ${name}`;
      });
    }
    case 'moveGroup':
      return changeRequirements(doc, (content) => {
        const [group] = content.groups.splice(edit.group, 1);
        if (!group) throw missingGroup();
        content.groups.splice(clamp(edit.toIndex, content.groups.length), 0, group);
      });
    case 'deleteGroup':
      return changeRequirements(
        doc,
        (content) => {
          if (!content.groups[edit.group]) throw missingGroup();
          content.groups.splice(edit.group, 1);
        },
        { removeEmpty: true },
      );
  }
}

function applyOne(doc: Lines, edit: SpecEdit) {
  const model = doc.model;
  switch (edit.op) {
    case 'setTitle':
      return setTitle(doc, edit.value);
    case 'setExtends':
      return setExtends(doc, edit.parents);
    case 'setDescription':
      return doc.setBlock(model.description.start, model.description.end, normalizeBlock(edit.value), model.extends ? model.extends.line + 1 : model.title ? model.title.line + 1 : model.bodyStart);
    case 'setContext':
      return setContext(doc, edit.value);
    default:
      return applyToRequirements(doc, edit);
  }
}

/** How requirements are written: the icons of the key word headings. */
export interface SpecWriteOptions {
  icons?: KeywordIcons;
}

export function applySpecEdits(text: string, edits: SpecEdit[], options: SpecWriteOptions = {}): string {
  const doc = new Lines(text, options.icons ?? DEFAULT_KEYWORD_ICONS);
  for (const edit of edits) applyOne(doc, edit);
  // Whatever the change, requirements written in an older layout are rewritten in the current one.
  const requirements = edits.length ? doc.model.requirements : undefined;
  if (requirements) writeSection(doc, requirements.section, sectionContent(doc.lines, doc.model));
  return doc.toString();
}
