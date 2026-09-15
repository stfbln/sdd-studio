import { findKeyword, isConformanceNotice, type Keyword } from './keywords';

/**
 * Outline of a markdown spec: title (first `#` heading), description (text before the first `##`),
 * a `## Context` section and a `## Requirements` section: a list of requirements using the
 * RFC 2119 key words, optionally split into `###` groups. Everything else is kept as written.
 * Line numbers are 0-based indexes into the text split on "\n"; ends are exclusive.
 */

export interface Heading {
  level: number;
  text: string;
  line: number;
}

/** One concrete case a requirement is illustrated with: a nested "- Example: ..." item under it. */
export interface Example {
  /** Text after the "Example:" label; continuation lines are de-indented. */
  text: string;
  line: number;
  end: number;
  /** "-", "*", "+", "1." or "1)". */
  marker: string;
}

export interface Requirement {
  /** Sentence of the requirement without its marker and without its examples; continuation lines are de-indented. */
  text: string;
  line: number;
  /** End of the whole item, examples included. */
  end: number;
  /** End of the sentence: where the examples start. */
  bodyEnd: number;
  /** Example scenarios listed under the requirement. */
  examples: Example[];
  /** Column the text of the item starts at, so examples are written under it. */
  indent: number;
  /** "-", "*", "+", "1." or "1)". */
  marker: string;
  /** Task list box ("[ ] ", "[x] ") kept in front of the text. */
  checkbox: string;
  /** First RFC 2119 key word in capitals, and how it is written ("SHALL" for MUST). */
  keyword?: Keyword;
  written?: string;
}

/** Requirements written directly under "## Requirements", or under one of its `###` groups. */
export interface RequirementList {
  /** Range holding the list (after the heading). */
  start: number;
  end: number;
  items: Requirement[];
  /** Blank lines between items (a "loose" list). */
  loose: boolean;
  /** Non-blank lines that are not list items (notes, tables...), the conformance sentence aside. */
  otherContent: boolean;
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
    /** The BCP 14 sentence ("The key words MUST..."). */
    notice?: { start: number; end: number };
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
/** "Example:", "Example 2:", "**Example:**"... in front of an example scenario. */
export const EXAMPLE_LABEL = /^[*_]{0,2}example[ \t]*\d*[*_]{0,2}[ \t]*:[ \t]*[*_]{0,2}[ \t]*/i;
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

/**
 * Splits the content of a requirement into its sentence and its example scenarios: everything from
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
      examples.push({ text: '', line: base + i, end: base + i + 1, marker: match[2] });
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

/** Top-level list items of a range, and whether anything else is written there. */
export function parseItems(lines: string[], start: number, end: number, inFence: boolean[], skip?: { start: number; end: number }): Omit<RequirementList, 'start' | 'end'> {
  const items: Requirement[] = [];
  let otherContent = false;
  let loose = false;
  let line = start;
  while (line < end) {
    if (skip && line >= skip.start && line < skip.end) {
      line = skip.end;
      continue;
    }
    const text = lines[line];
    const match = inFence[line] ? null : ITEM.exec(text);
    if (!match) {
      if (!isBlank(text)) otherContent = true;
      line++;
      continue;
    }
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
    if (items.length && line > items[items.length - 1].end) loose ||= lines.slice(items[items.length - 1].end, line).some(isBlank);
    const { body, examples } = splitExamples(content, line);
    const itemText = body.join('\n').replace(/\s+$/, '');
    const keyword = findKeyword(itemText);
    items.push({
      text: itemText,
      line,
      end: last + 1,
      bodyEnd: line + body.length,
      examples,
      indent: contentIndent,
      marker,
      checkbox: checkbox.replace(/[ \t]+$/, ' '),
      keyword: keyword?.keyword,
      written: keyword?.written,
    });
    line = last + 1;
  }
  return { items, otherContent, loose };
}

/** The conformance sentence: a paragraph (not a list item) mentioning the key words and RFC 2119. */
function findNotice(lines: string[], start: number, end: number, inFence: boolean[]) {
  for (let line = start; line < end; line++) {
    if (isBlank(lines[line]) || inFence[line] || ITEM.test(lines[line]) || (line > start && !isBlank(lines[line - 1]))) continue;
    let last = line;
    while (last + 1 < end && !isBlank(lines[last + 1]) && !inFence[last + 1] && !ITEM.test(lines[last + 1])) last++;
    if (isConformanceNotice(lines.slice(line, last + 1).join(' '))) return { start: line, end: last + 1 };
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
    const subheadings = headings.filter((h) => h.level === 3 && h.line > requirements.heading.line && h.line < requirements.end);
    const listStart = requirements.heading.line + 1;
    const listEnd = subheadings[0]?.line ?? requirements.end;
    const notice = findNotice(lines, listStart, listEnd, inFence);
    model.requirements = {
      section: requirements,
      notice,
      list: { start: listStart, end: listEnd, ...parseItems(lines, listStart, listEnd, inFence, notice) },
      groups: subheadings.map((heading, i) => {
        const end = subheadings[i + 1]?.line ?? requirements.end;
        return { heading, start: heading.line + 1, end, ...parseItems(lines, heading.line + 1, end, inFence) };
      }),
    };
  }
  return model;
}

export function parseSpecFile(text: string): SpecFile {
  return { text, model: parseSpecMarkdown(text) };
}
