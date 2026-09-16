import { CONFORMANCE_NOTICE, findKeyword, isConformanceNotice, levelDefinition, levelIntro, levelOfHeading, levelRank, withoutItalic, WRITTEN_NOTICE, type Keyword } from './keywords';

/**
 * Outline of a markdown spec: title (first `#` heading), description (text before the first `##`),
 * a `## Context` section and a `## Requirements` section, optionally split into `###` groups. Inside
 * the section and each group, requirements are listed level by level: a `####` heading per RFC 2119
 * key word (an icon can come first) with its definition, then a `#####` heading per requirement
 * holding its sentence, with its description and its example scenarios ("**Title**\" and the case on
 * the next line) under it.
 * Requirements written as a list, the layout before key word headings, are still read, in the order
 * they are written back at the next change. Everything else is kept as written.
 * Line numbers are 0-based indexes into the text split on "\n"; ends are exclusive.
 */

export interface Heading {
  level: number;
  text: string;
  line: number;
}

/** One concrete case a requirement is illustrated with. */
export interface Example {
  /** Title written in bold above the case; empty when it is only numbered ("**Example 2**"). */
  title: string;
  /** The case, written on the lines under its title (after "Example:" in a nested list item). */
  text: string;
  line: number;
  end: number;
}

export interface Requirement {
  /** The sentence: the text of its `#####` heading, or the first paragraph of its list item on one line. */
  text: string;
  /** Text under the sentence, before the examples: details, rationale. */
  description: string;
  line: number;
  /** End of the whole requirement, examples included. */
  end: number;
  /** Example scenarios listed under the requirement. */
  examples: Example[];
  /** Task list box ("[ ] ", "[x] ") kept in front of the sentence. */
  checkbox: string;
  /** First RFC 2119 key word in capitals, and how it is written ("SHALL" for MUST). */
  keyword?: Keyword;
  written?: string;
  /** Key word of the `####` heading it is written under, its own key word when there is none. */
  level?: Keyword;
  /** Written as a list item, the layout before key word headings. */
  listItem: boolean;
}

/** The requirements of one key word: a `####` heading, the definition of the key word, then the requirements. */
export interface RequirementLevel {
  /** Undefined for the requirements without a key word. */
  keyword?: Keyword;
  /** The first heading written for it; none when its requirements are still written as a list. */
  heading?: Heading;
  /** The heading names no level ("#### Notes"): it holds the requirements without a key word and is kept as written. */
  customHeading: boolean;
  /**
   * Text between the heading and the first requirement: the definition of the key word, in italics
   * whether it is written with them or not, or notes; the definition when no heading is written.
   */
  intro: string;
  /** Position of its first requirement in the list, and how many it has. */
  start: number;
  count: number;
}

/** Requirements written directly under "## Requirements", or under one of its `###` groups. */
export interface RequirementList {
  /** Range holding the list (after the heading). */
  start: number;
  end: number;
  /** Level by level (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, then without key word), as written inside each level. */
  items: Requirement[];
  /** The levels holding requirements, or notes of their own, in the same order. */
  levels: RequirementLevel[];
  /** Text before the first level that is not a requirement nor the conformance sentence (notes, tables...), kept as written. */
  notes: string;
}

export interface RequirementGroup extends RequirementList {
  heading: Heading;
}

export interface Section {
  heading: Heading;
  end: number;
  kind: 'context' | 'requirements' | 'other';
}

/** One spec named on the "Extends:" line. */
export interface SpecParent {
  /** Text of the link, e.g. "Data storage" (empty when the path is written on its own). */
  label: string;
  /** Path as written, relative to this file. */
  target: string;
}

/**
 * The "Extends: [Data storage](./data-storage.spec.md), [Audit logging](./audit-logging.spec.md)"
 * line under the title: the specs this one inherits its requirements from, closest first.
 */
export interface SpecExtends {
  parents: SpecParent[];
  line: number;
}

export interface SpecModel {
  /** First line after the front matter and the HTML comments that follow it. */
  bodyStart: number;
  title?: Heading;
  /** Level-1 headings after the first one. */
  extraTitles: Heading[];
  /** The spec this one extends, written right under the title. */
  extends?: SpecExtends;
  /** Lines between the title (or the Extends line, or the start) and the first section. */
  description: { text: string; start: number; end: number };
  sections: Section[];
  context?: { section: Section; text: string };
  requirements?: {
    section: Section;
    /** The BCP 14 sentence ("The key words MUST..."): the one of RFC 8174 in italics, another as written. */
    notice?: { start: number; end: number; text: string };
    /** Requirements before the first group. */
    list: RequirementList;
    groups: RequirementGroup[];
  };
  lineCount: number;
}

export interface SpecFile {
  text: string;
  model: SpecModel;
}

const HEADING = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(\[[ xX]\][ \t]+)?(.*)|[ \t]*)$/;
/** A list item nested under a requirement, once the item's own indentation is removed. */
const NESTED_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
/** "Example:", "Example 2:", "**Example:**"... in front of an example scenario written as a list item. */
export const EXAMPLE_LABEL = /^[*_]{0,2}example[ \t]*\d*[*_]{0,2}[ \t]*:[ \t]*[*_]{0,2}[ \t]*/i;
/** A line in bold (or italics) on its own, a backslash breaking the line: the title of an example scenario, "**Declined card**\". */
const EXAMPLE_TITLE = /^ {0,3}(?:\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|_([^_]+)_)\\?[ \t]*$/;
/** The title of an example that has none: "Example", "Example 2". */
const NUMBERED_EXAMPLE = /^example(?:[ \t]*\d+)?$/i;
/** Lines that start another block than a paragraph. */
const BLOCK_START = /^ {0,3}(?:[-*+][ \t]|\d{1,9}[.)][ \t]|>|`{3}|~{3}|#{1,6}(?:[ \t]|$)|\|)/;
/** "Extends: [Title](path)", "**Extends:** path"... */
const EXTENDS = /^[ \t]*(?:[*_]{1,2})?extends(?:[*_]{1,2})?[ \t]*:[ \t]*(?:[*_]{1,2})?[ \t]*(.+?)[ \t]*$/i;
/** A markdown link, with the destination in angle brackets when it has spaces. */
const LINK = /^\[([^\]]*)\][ \t]*\([ \t]*(?:<([^>]*)>|([^)\s]*))[ \t]*(?:"[^"]*")?[ \t]*\)$/;

export const splitLines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n');
export const isBlank = (line: string | undefined) => line !== undefined && line.trim() === '';

function headingText(raw: string | undefined): string {
  const text = (raw ?? '').replace(/(^|[ \t]+)#+$/, '').trim();
  // Markdown emphasis around the whole heading: **Must**.
  return text.replace(/^([*_]{1,2})(.+)\1$/, '$2').trim();
}

export const isContextHeading = (text: string) => /^(context|background)$/i.test(text.trim());
export const isRequirementsHeading = (text: string) => /^requirements$/i.test(text.trim());

/** Marks the lines inside fenced code blocks (their `#` lines are not headings) and returns the fence left open. */
export function scanFences(lines: string[]): { inFence: boolean[]; open?: string } {
  const inFence: boolean[] = [];
  let open: string | undefined;
  let openLine = '';
  for (const line of lines) {
    const fence = FENCE.exec(line)?.[1];
    if (open) {
      inFence.push(true);
      if (fence && fence[0] === open[0] && fence.length >= open.length && !line.trim().slice(fence.length).trim()) open = undefined;
    } else if (fence && !(fence[0] === '`' && line.slice(line.indexOf(fence) + fence.length).includes('`'))) {
      inFence.push(true);
      open = fence;
      openLine = line;
    } else {
      inFence.push(false);
    }
  }
  return { inFence, open: open && openLine };
}

export const fencedLines = (lines: string[]) => scanFences(lines).inFence;

function headingsOf(lines: string[], start: number, inFence: boolean[]): Heading[] {
  const headings: Heading[] = [];
  for (let line = start; line < lines.length; line++) {
    const match = inFence[line] ? null : HEADING.exec(lines[line]);
    if (match) headings.push({ level: match[1].length, text: headingText(match[2]), line });
  }
  return headings;
}

function leadingSpaces(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width++;
    else if (char === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
}

function dedent(line: string, width: number): string {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < width && (line[index] === ' ' || line[index] === '\t')) {
    removed += line[index] === '\t' ? 4 - (removed % 4) : 1;
    index++;
  }
  return line.slice(index);
}

/** Text of a range without its surrounding blank lines. */
export function blockText(lines: string[], start: number, end: number): string {
  let first = start;
  let last = end - 1;
  while (first <= last && isBlank(lines[first])) first++;
  while (last >= first && isBlank(lines[last])) last--;
  return lines.slice(first, last + 1).join('\n').replace(/\s+$/, '');
}

/** Last non-blank line of a range, plus one. */
function contentEnd(lines: string[], start: number, end: number): number {
  let last = end;
  while (last > start && isBlank(lines[last - 1])) last--;
  return last;
}

/**
 * The title of an example scenario when `line` is one: "**Declined card**\" gives "Declined card",
 * "**Example 2**\" gives "" (a numbered example has no title of its own); undefined for other lines.
 */
export function exampleTitle(line: string): string | undefined {
  const match = EXAMPLE_TITLE.exec(line);
  const written = match && (match[1] ?? match[2] ?? match[3] ?? match[4]);
  // "* a *" is not emphasis, and "*a\*" ends with an escaped star.
  if (!written || written !== written.trim() || written.endsWith('\\')) return undefined;
  const title = written.replace(/[ \t]*:$/, '').trim();
  return NUMBERED_EXAMPLE.test(title) ? '' : title;
}

/** Text of a requirement heading: the closing #s go, emphasis stays (it belongs to the sentence). */
function requirementHeadingText(line: string): string {
  return (HEADING.exec(line)?.[2] ?? '').replace(/(^|[ \t]+)#+$/, '').trim();
}

/**
 * A list item written before key word headings: its first paragraph is the sentence, on one line, and
 * what follows (nested lists, other paragraphs) its description.
 */
function sentenceOf(body: string[]): { text: string; description: string } {
  const inFence = fencedLines(body);
  let end = 0;
  while (end < body.length && !isBlank(body[end]) && !(end > 0 && (inFence[end] || BLOCK_START.test(body[end])))) end++;
  return {
    text: body
      .slice(0, end)
      .map((line) => line.trim())
      .join(' '),
    description: blockText(body, end, body.length),
  };
}

/**
 * Splits the content of a list item into its sentence and its example scenarios: everything from
 * the first nested "Example:" item on is examples. `base` is the line the content starts at, so the
 * examples carry their line in the file (content line `i` is line `base + i`).
 */
function splitExamples(content: string[], base: number): { body: string[]; examples: Example[] } {
  const inFence = fencedLines(content);
  let start = -1;
  for (let i = 1; i < content.length && start < 0; i++) {
    const match = inFence[i] ? null : NESTED_ITEM.exec(content[i]);
    if (match && EXAMPLE_LABEL.test(match[3])) start = i;
  }
  if (start < 0) return { body: content, examples: [] };

  const examples: Example[] = [];
  const parts: string[][] = [];
  let indent = 0;
  for (let i = start; i < content.length; i++) {
    const match = inFence[i] ? null : NESTED_ITEM.exec(content[i]);
    if (match) {
      indent = match[1].length + match[2].length + 1;
      examples.push({ title: '', text: '', line: base + i, end: base + i + 1 });
      parts.push([match[3].replace(EXAMPLE_LABEL, '')]);
    } else if (examples.length) {
      // Continuation of the example above: kept with it, blank lines included.
      parts[parts.length - 1].push(isBlank(content[i]) ? '' : dedent(content[i], indent));
      if (!isBlank(content[i])) examples[examples.length - 1].end = base + i + 1;
    }
  }
  for (const [i, example] of examples.entries()) {
    example.text = parts[i].join('\n').replace(/\s+$/, '');
  }
  let body = start;
  while (body > 0 && isBlank(content[body - 1])) body--;
  return { body: content.slice(0, body), examples };
}

/** List items of a range (requirements written before key word headings), and the notes around them. */
function parseItems(lines: string[], start: number, end: number, inFence: boolean[], skip?: { start: number; end: number }): { items: Requirement[]; notes: string } {
  const items: Requirement[] = [];
  const notes: string[] = [];
  let note = -1;
  const closeNote = (at: number) => {
    const text = note < 0 ? '' : blockText(lines, note, at);
    if (text) notes.push(text);
    note = -1;
  };
  let line = start;
  while (line < end) {
    if (skip && line >= skip.start && line < skip.end) {
      closeNote(line);
      line = skip.end;
      continue;
    }
    const text = lines[line];
    const match = inFence[line] ? null : ITEM.exec(text);
    if (!match) {
      if (note < 0) note = line;
      line++;
      continue;
    }
    closeNote(line);
    const [, indent, marker, spacing = '', checkbox = '', first = ''] = match;
    const spaces = leadingSpaces(spacing);
    const contentIndent = indent.length + marker.length + (spaces >= 1 && spaces <= 4 && first ? spaces : 1);
    const content = [first];
    let last = line;
    let next = line + 1;
    while (next < end) {
      const candidate = lines[next];
      if (isBlank(candidate)) {
        next++;
        continue;
      }
      const afterBlank = next > last + 1;
      const continues =
        leadingSpaces(candidate) >= contentIndent ||
        (!afterBlank && content.some((c) => c.trim()) && !inFence[next] && !ITEM.exec(candidate) && !HEADING.exec(candidate) && !FENCE.exec(candidate) && !/^ {0,3}(>|[-*_]([ \t]*[-*_]){2,}[ \t]*$)/.test(candidate));
      if (!continues) break;
      for (let blank = last + 1; blank < next; blank++) content.push('');
      content.push(dedent(candidate, contentIndent));
      last = next;
      next++;
    }
    const { body, examples } = splitExamples(content, line);
    const { text: sentence, description } = sentenceOf(body);
    const keyword = findKeyword(sentence);
    items.push({
      text: sentence,
      description,
      line,
      end: last + 1,
      examples,
      checkbox: checkbox.replace(/[ \t]+$/, ' '),
      keyword: keyword?.keyword,
      written: keyword?.written,
      level: keyword?.keyword,
      listItem: true,
    });
    line = last + 1;
  }
  closeNote(end);
  return { items, notes: notes.join('\n\n') };
}

/**
 * A requirement written as a `#####` heading, up to `end`: its sentence, then its description, then its
 * examples, each starting with a title line in bold at the start of a paragraph. `level` is the
 * key word of the `####` heading above it, null when there is none.
 */
function parseHeadingRequirement(lines: string[], inFence: boolean[], line: number, end: number, level: Keyword | undefined | null): Requirement {
  const heading = requirementHeadingText(lines[line]);
  const box = /^(\[[ xX]\])[ \t]+/.exec(heading);
  const text = box ? heading.slice(box[0].length) : heading;
  const titles: number[] = [];
  for (let i = line + 1; i < end; i++) {
    if (!inFence[i] && (i === line + 1 || isBlank(lines[i - 1])) && exampleTitle(lines[i]) !== undefined) titles.push(i);
  }
  const keyword = findKeyword(text);
  return {
    text,
    description: blockText(lines, line + 1, titles[0] ?? end),
    line,
    end: contentEnd(lines, line + 1, end),
    examples: titles.map((title, i) => {
      const next = titles[i + 1] ?? end;
      return { title: exampleTitle(lines[title]) ?? '', text: blockText(lines, title + 1, next), line: title, end: contentEnd(lines, title + 1, next) };
    }),
    checkbox: box ? `${box[1]} ` : '',
    keyword: keyword?.keyword,
    written: keyword?.written,
    level: level === null ? keyword?.keyword : level,
    listItem: false,
  };
}

/**
 * The requirements of a range (the section before its first group, or a group): the list items and
 * notes written first, then the `####` level headings with their `#####` requirements. Requirements
 * are gathered level by level, so a level written twice, or list items next to headings, read as
 * they are written back.
 */
function parseList(lines: string[], start: number, end: number, inFence: boolean[], headings: Heading[], skip?: { start: number; end: number }): RequirementList {
  const inside = headings.filter((h) => h.line >= start && h.line < end && (h.level === 4 || h.level === 5));
  const { items: listed, notes } = parseItems(lines, start, inside[0]?.line ?? end, inFence, skip);
  const byRank = new Map<number, { keyword?: Keyword; heading?: Heading; customHeading: boolean; intros: string[]; items: Requirement[] }>();
  const levelOf = (keyword: Keyword | undefined) => {
    const rank = levelRank(keyword);
    const found = byRank.get(rank) ?? { keyword, customHeading: false, intros: [], items: [] };
    byRank.set(rank, found);
    return found;
  };
  for (const item of listed) levelOf(item.level).items.push(item);
  let current: Keyword | undefined | null = null;
  for (const [i, heading] of inside.entries()) {
    const next = inside[i + 1]?.line ?? end;
    if (heading.level === 4) {
      const named = levelOfHeading(heading.text);
      current = named?.keyword;
      const level = levelOf(current);
      if (!level.heading) {
        level.heading = heading;
        level.customHeading = !named;
      }
      const written = blockText(lines, heading.line + 1, next);
      const intro = withoutItalic(written) === levelDefinition(current) ? levelIntro(current) : written;
      if (intro && !level.intros.includes(intro)) level.intros.push(intro);
    } else {
      const item = parseHeadingRequirement(lines, inFence, heading.line, next, current);
      levelOf(item.level).items.push(item);
    }
  }

  const items: Requirement[] = [];
  const levels: RequirementLevel[] = [];
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const { keyword, heading, customHeading, intros, items: own } = byRank.get(rank)!;
    const intro = heading ? intros.join('\n\n') : levelIntro(keyword);
    // A level left with only its definition is not written back.
    if (!own.length && (!intro || intro === levelIntro(keyword))) continue;
    levels.push({ keyword, heading, customHeading, intro, start: items.length, count: own.length });
    items.push(...own);
  }
  return { start, end, items, levels, notes };
}

/** The conformance sentence: a paragraph (not a list item) mentioning the key words and RFC 2119. */
function findNotice(lines: string[], start: number, end: number, inFence: boolean[]) {
  for (let line = start; line < end; line++) {
    if (isBlank(lines[line]) || inFence[line] || ITEM.test(lines[line]) || (line > start && !isBlank(lines[line - 1]))) continue;
    let last = line;
    while (last + 1 < end && !isBlank(lines[last + 1]) && !inFence[last + 1] && !ITEM.test(lines[last + 1])) last++;
    const written = lines.slice(line, last + 1).join('\n');
    // The sentence of RFC 8174 is written in italics; other wordings are kept as written.
    if (isConformanceNotice(written)) return { start: line, end: last + 1, text: withoutItalic(written) === CONFORMANCE_NOTICE ? WRITTEN_NOTICE : written };
  }
  return undefined;
}

/** Splits "[A](a.md), [B](b.md)" on the commas that separate the specs, not those inside a link. */
function splitParents(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '[' || char === '(' || char === '<') depth++;
    else if (char === ']' || char === ')' || char === '>') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseParent(written: string): SpecParent | undefined {
  const link = LINK.exec(written);
  if (link) {
    const target = (link[2] ?? link[3] ?? '').trim();
    return target ? { label: link[1].trim(), target } : undefined;
  }
  const target = written.replace(/^[`<]+|[`>]+$/g, '').trim();
  return target ? { label: '', target } : undefined;
}

/** The specs of an "Extends: ..." line, when it is the first thing written under the title. */
export function parseExtendsLine(raw: string): SpecParent[] | undefined {
  const value = EXTENDS.exec(raw)?.[1];
  if (!value) return undefined;
  const parents = splitParents(value).flatMap((written) => parseParent(written) ?? []);
  return parents.length ? parents : undefined;
}

/** Skips HTML comments at the top of the body (update instructions, lint settings): they belong to no section. */
function afterLeadingComments(lines: string[], start: number): number {
  let line = start;
  let end = start;
  while (line < lines.length) {
    if (isBlank(lines[line])) {
      line++;
      continue;
    }
    if (!/^ {0,3}<!--/.test(lines[line])) break;
    const close = lines.findIndex((l, i) => i >= line && l.includes('-->'));
    if (close < 0 || lines[close].slice(lines[close].indexOf('-->') + 3).trim()) break;
    line = end = close + 1;
  }
  return end;
}

export function parseSpecMarkdown(text: string): SpecModel {
  const lines = splitLines(text);
  // The final newline ends the last line; it does not start another one.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (close > 0) bodyStart = close + 1;
  }
  bodyStart = afterLeadingComments(lines, bodyStart);

  const inFence = fencedLines(lines);
  const headings = headingsOf(lines, bodyStart, inFence);
  const titles = headings.filter((h) => h.level === 1);
  const title = titles[0];
  // Sections are the `##` headings; any level-1 heading also ends a section.
  const boundaries = headings.filter((h) => h.level <= 2 && h !== title);
  const sections: Section[] = boundaries
    .filter((h) => h.level === 2)
    .map((heading) => {
      const next = boundaries.find((b) => b.line > heading.line);
      const kind = isContextHeading(heading.text) ? 'context' : isRequirementsHeading(heading.text) ? 'requirements' : 'other';
      return { heading, end: next?.line ?? lines.length, kind };
    });

  const descriptionStart = title ? title.line + 1 : bodyStart;
  const descriptionEnd = boundaries.find((b) => b.line >= descriptionStart)?.line ?? lines.length;
  // The specs extended are written first, above the description.
  let first = descriptionStart;
  while (first < descriptionEnd && isBlank(lines[first])) first++;
  const parents = first < descriptionEnd && !inFence[first] ? parseExtendsLine(lines[first]) : undefined;
  const contentStart = parents ? first + 1 : descriptionStart;
  const model: SpecModel = {
    bodyStart,
    title,
    extraTitles: titles.slice(1),
    ...(parents ? { extends: { parents, line: first } } : {}),
    description: { text: blockText(lines, contentStart, descriptionEnd), start: contentStart, end: descriptionEnd },
    sections,
    lineCount: lines.length,
  };

  const context = sections.find((s) => s.kind === 'context');
  if (context) model.context = { section: context, text: blockText(lines, context.heading.line + 1, context.end) };

  const requirements = sections.find((s) => s.kind === 'requirements');
  if (requirements) {
    const inside = headings.filter((h) => h.line > requirements.heading.line && h.line < requirements.end);
    const groupHeadings = inside.filter((h) => h.level === 3);
    const listStart = requirements.heading.line + 1;
    const listEnd = groupHeadings[0]?.line ?? requirements.end;
    // The conformance sentence comes before the first requirement.
    const noticeEnd = inside.find((h) => h.level >= 3)?.line ?? requirements.end;
    const notice = findNotice(lines, listStart, noticeEnd, inFence);
    model.requirements = {
      section: requirements,
      notice,
      list: parseList(lines, listStart, listEnd, inFence, inside, notice),
      groups: groupHeadings.map((heading, i) => ({
        heading,
        ...parseList(lines, heading.line + 1, groupHeadings[i + 1]?.line ?? requirements.end, inFence, inside),
      })),
    };
  }
  return model;
}

export function parseSpecFile(text: string): SpecFile {
  return { text, model: parseSpecMarkdown(text) };
}
