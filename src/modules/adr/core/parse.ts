/**
 * Outline of an mADR-style markdown ADR: YAML front matter (status, date, decision-makers,
 * consulted, informed), a title, and a fixed set of `##` sections (Context and Problem Statement,
 * Decision Drivers, Considered Options, Options Comparison, Decision Outcome, Pros and Cons of the
 * Options, More Information). Everything else is kept as written. Line numbers are 0-based indexes
 * into the text split on "\n"; ends are exclusive.
 *
 * The Options Comparison table and the Pros and Cons of the Options headings are generated from the
 * Considered Options / Decision Drivers lists (kept in sync by position, see `edits.ts`): still parsed
 * here so the form can read their content, but not meant to be hand-formatted.
 */

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export type SectionKind = 'context' | 'drivers' | 'options' | 'matrix' | 'outcome' | 'prosCons' | 'more' | 'other';

export interface Section {
  heading: Heading;
  end: number;
  kind: SectionKind;
}

/** One bullet list item, before it is interpreted for its section (driver, option, consequence...). */
export interface Bullet {
  text: string;
  line: number;
  end: number;
  marker: string;
}

export interface BulletList {
  start: number;
  end: number;
  items: Bullet[];
}

export type FrontMatterKey = 'status' | 'date' | 'decision-makers' | 'consulted' | 'informed';
export const FRONT_MATTER_KEYS: FrontMatterKey[] = ['status', 'date', 'decision-makers', 'consulted', 'informed'];
const LIST_KEYS = new Set<FrontMatterKey>(['decision-makers', 'consulted', 'informed']);

export interface FrontMatterField {
  /** Line of "key: ...". */
  line: number;
  /** Exclusive end: line+1 for an inline value, or after the last "- item" line for a block list. */
  end: number;
}

export interface FrontMatter {
  /** Line of the opening "---"; start === end when there is no front matter. */
  start: number;
  /** Line after the closing "---" (exclusive). */
  end: number;
  fields: Partial<Record<FrontMatterKey, FrontMatterField>>;
}

export interface Option {
  /** Bold title of the option, e.g. from "**PostgreSQL** — Battle-tested...". */
  title: string;
  description: string;
  line: number;
  end: number;
  marker: string;
}

export interface OptionList {
  start: number;
  end: number;
  items: Option[];
}

export type Rating = 'meets' | 'partial' | 'fails' | undefined;

export interface MatrixCell {
  rating: Rating;
  note: string;
}

export interface Matrix {
  section: Section;
  /** rows[optionIndex][driverIndex], reconciled by position against the current options/drivers. */
  rows: MatrixCell[][];
}

export type ConsequenceType = 'good' | 'bad';

export interface Consequence {
  type: ConsequenceType;
  text: string;
  line: number;
  end: number;
  marker: string;
}

export interface Outcome {
  section: Section;
  /** Index into the Considered Options list, resolved by matching the bold title in "Chosen option: **Title**...". */
  selectedOption?: number;
  /** Bold text after "Chosen option:" when it does not match any considered option. */
  unmatchedChoice?: string;
  rationale: string;
  consequences: { section?: Heading; end: number; list: { start: number; end: number; items: Consequence[] } };
}

export type ProConType = 'good' | 'neutral' | 'bad';

export interface ProCon {
  type: ProConType;
  text: string;
  line: number;
  end: number;
  marker: string;
}

export interface OptionProsCons {
  heading: Heading;
  end: number;
  list: { start: number; end: number; items: ProCon[] };
}

export interface ProsCons {
  section: Section;
  /** options[i] holds the "### {title}" sub-section reconciled by position against the i-th considered option. */
  options: OptionProsCons[];
}

export interface AdrModel {
  frontMatter: FrontMatter;
  /** First line after the front matter and the HTML comments that follow it (update instructions header). */
  bodyStart: number;
  title?: Heading;
  /** Level-1 headings after the first one. */
  extraTitles: Heading[];
  /** Where a first `##` section is inserted when the file only has a title (or nothing) so far. */
  introEnd: number;
  sections: Section[];
  context?: { section: Section; text: string };
  drivers?: { section: Section; list: BulletList };
  options?: { section: Section; list: OptionList };
  matrix?: Matrix;
  outcome?: Outcome;
  prosCons?: ProsCons;
  more?: { section: Section; text: string };
  lineCount: number;
}

export interface AdrFile {
  text: string;
  model: AdrModel;
}

const HEADING = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ITEM = /^( {0,3})([-*+])(?:([ \t]+)(.*)|[ \t]*)$/;

export const splitLines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n');
export const isBlank = (line: string | undefined) => line !== undefined && line.trim() === '';

function headingText(raw: string | undefined): string {
  const text = (raw ?? '').replace(/(^|[ \t]+)#+$/, '').trim();
  return text.replace(/^([*_]{1,2})(.+)\1$/, '$2').trim();
}

export const isContextHeading = (text: string) => /^context( and problem statement)?$/i.test(text.trim());
export const isDriversHeading = (text: string) => /^decision drivers?$/i.test(text.trim());
export const isOptionsHeading = (text: string) => /^considered options$/i.test(text.trim());
export const isMatrixHeading = (text: string) => /^options comparison$/i.test(text.trim());
export const isOutcomeHeading = (text: string) => /^decision outcome$/i.test(text.trim());
export const isProsConsHeading = (text: string) => /^pros and cons of the options$/i.test(text.trim());
export const isMoreInfoHeading = (text: string) => /^more information$/i.test(text.trim());
export const isConsequencesHeading = (text: string) => /^consequences$/i.test(text.trim());

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

function headingsOf(lines: string[], start: number): Heading[] {
  const inFence = fencedLines(lines);
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

/** Top-level bullet items of a range (unordered lists only: "-", "*", "+"). */
export function parseBullets(lines: string[], start: number, end: number, inFence: boolean[]): BulletList {
  const items: Bullet[] = [];
  let line = start;
  while (line < end) {
    const text = lines[line];
    const match = inFence[line] ? null : ITEM.exec(text);
    if (!match) {
      line++;
      continue;
    }
    const [, indent, marker, spacing = '', first = ''] = match;
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
        (!afterBlank && content.some((c) => c.trim()) && !inFence[next] && !ITEM.exec(candidate) && !HEADING.exec(candidate) && !FENCE.exec(candidate));
      if (!continues) break;
      for (let blank = last + 1; blank < next; blank++) content.push('');
      content.push(dedent(candidate, contentIndent));
      last = next;
      next++;
    }
    const itemText = content.join('\n').replace(/\s+$/, '');
    items.push({ text: itemText, line, end: last + 1, marker });
    line = last + 1;
  }
  return { start, end, items };
}

const OPTION_SEPARATOR = ' — ';
const TITLE = /^\*\*(.+?)\*\*[ \t]*(?:—[ \t]*([\s\S]*))?$/;

function toOption(bullet: Bullet): Option {
  const match = TITLE.exec(bullet.text);
  return { title: match ? match[1].trim() : bullet.text, description: (match?.[2] ?? '').trim(), line: bullet.line, end: bullet.end, marker: bullet.marker };
}

export const renderOptionText = (title: string, description: string) => (description.trim() ? `**${title.trim()}**${OPTION_SEPARATOR}${description.trim()}` : `**${title.trim()}**`);

const CONSEQUENCE = /^(Good|Bad)[ \t]*,[ \t]*because[ \t]+([\s\S]*)$/i;

function toConsequence(bullet: Bullet): Consequence {
  const match = CONSEQUENCE.exec(bullet.text);
  return { type: match ? (match[1].toLowerCase() as ConsequenceType) : 'good', text: (match?.[2] ?? bullet.text).trim(), line: bullet.line, end: bullet.end, marker: bullet.marker };
}

/** "Good, because ..." bullets read as prose: end with a period unless they already end the sentence. */
export function withPeriod(text: string): string {
  const value = text.trim();
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

export const renderConsequenceText = (type: ConsequenceType, text: string) => `${type === 'good' ? 'Good' : 'Bad'}, because ${withPeriod(text)}`;

const PRO_CON = /^(Good|Neutral|Bad)[ \t]*,[ \t]*because[ \t]+([\s\S]*)$/i;

function toProCon(bullet: Bullet): ProCon {
  const match = PRO_CON.exec(bullet.text);
  return { type: match ? (match[1].toLowerCase() as ProConType) : 'good', text: (match?.[2] ?? bullet.text).trim(), line: bullet.line, end: bullet.end, marker: bullet.marker };
}

export const renderProConText = (type: ProConType, text: string) => `${type === 'good' ? 'Good' : type === 'neutral' ? 'Neutral' : 'Bad'}, because ${withPeriod(text)}`;

/** A YAML flow list ("[a, b]") or block list ("- a" lines) starting right after "key:". */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return /^(".*"|'.*')$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

function parseFlowList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((v) => stripQuotes(v))
    .filter(Boolean);
}

export function frontMatterValue(lines: string[], field: FrontMatterField | undefined): string {
  if (!field) return '';
  const raw = lines[field.line];
  return stripQuotes(raw.slice(raw.indexOf(':') + 1));
}

export function frontMatterList(lines: string[], field: FrontMatterField | undefined): string[] {
  if (!field) return [];
  const raw = lines[field.line];
  const inline = raw.slice(raw.indexOf(':') + 1).trim();
  if (inline) return inline.startsWith('[') ? parseFlowList(inline) : [stripQuotes(inline)];
  const items: string[] = [];
  for (let l = field.line + 1; l < field.end; l++) {
    const match = /^[ \t]*-[ \t]*(.*)$/.exec(lines[l]);
    if (match) items.push(stripQuotes(match[1]));
  }
  return items;
}

function parseFrontMatter(lines: string[]): FrontMatter {
  if (lines[0]?.trim() !== '---') return { start: 0, end: 0, fields: {} };
  const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
  if (close <= 0) return { start: 0, end: 0, fields: {} };
  const fields: FrontMatter['fields'] = {};
  let line = 1;
  while (line < close) {
    const match = /^([A-Za-z][\w-]*)[ \t]*:(.*)$/.exec(lines[line]);
    const key = match?.[1] as FrontMatterKey | undefined;
    if (key && FRONT_MATTER_KEYS.includes(key)) {
      let end = line + 1;
      if (LIST_KEYS.has(key) && !match![2].trim()) {
        while (end < close && /^[ \t]*-[ \t]*.*$/.test(lines[end])) end++;
      }
      fields[key] = { line, end };
      line = end;
    } else {
      line++;
    }
  }
  return { start: 0, end: close + 1, fields };
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

function classify(text: string): SectionKind {
  if (isContextHeading(text)) return 'context';
  if (isDriversHeading(text)) return 'drivers';
  if (isOptionsHeading(text)) return 'options';
  if (isMatrixHeading(text)) return 'matrix';
  if (isOutcomeHeading(text)) return 'outcome';
  if (isProsConsHeading(text)) return 'prosCons';
  if (isMoreInfoHeading(text)) return 'more';
  return 'other';
}

const CHOSEN = /^Chosen option:\s*\*\*(.+?)\*\*\s*(?:,?\s*because\s+)?([\s\S]*?)\.?\s*$/i;

function parseOutcome(lines: string[], section: Section, options: Option[], inFence: boolean[]): Outcome {
  const subheadings = headingsOf(lines, section.heading.line + 1).filter((h) => h.level === 3 && h.line < section.end);
  const consequencesHeading = subheadings.find((h) => isConsequencesHeading(h.text));
  const statementEnd = subheadings[0]?.line ?? section.end;
  const paragraph = blockText(lines, section.heading.line + 1, statementEnd);
  const match = CHOSEN.exec(paragraph);
  let selectedOption: number | undefined;
  let unmatchedChoice: string | undefined;
  let rationale = paragraph;
  if (match) {
    const title = match[1].trim();
    const index = options.findIndex((o) => o.title.toLowerCase() === title.toLowerCase());
    if (index >= 0) selectedOption = index;
    else unmatchedChoice = title;
    rationale = match[2].trim();
  }
  const consequences = consequencesHeading
    ? { section: consequencesHeading, end: subheadings[subheadings.indexOf(consequencesHeading) + 1]?.line ?? section.end }
    : undefined;
  const listStart = consequences ? consequences.section.line + 1 : section.end;
  const listEnd = consequences ? consequences.end : section.end;
  const list = consequences ? parseBullets(lines, listStart, listEnd, inFence) : { start: listStart, end: listStart, items: [] };
  return {
    section,
    selectedOption,
    unmatchedChoice,
    rationale,
    consequences: { section: consequences?.section, end: consequences?.end ?? section.end, list: { start: list.start, end: list.end, items: list.items.map(toConsequence) } },
  };
}

function parseProsCons(lines: string[], section: Section, options: Option[], inFence: boolean[]): ProsCons {
  const subheadings = headingsOf(lines, section.heading.line + 1).filter((h) => h.level === 3 && h.line < section.end);
  const optionSections: OptionProsCons[] = options.map((_, i) => {
    const heading = subheadings[i];
    if (!heading) return { heading: { level: 3, text: '', line: section.end }, end: section.end, list: { start: section.end, end: section.end, items: [] } };
    const end = subheadings[i + 1]?.line ?? section.end;
    const list = parseBullets(lines, heading.line + 1, end, inFence);
    return { heading, end, list: { start: list.start, end: list.end, items: list.items.map(toProCon) } };
  });
  return { section, options: optionSections };
}

const TABLE_ROW = /^\|(.*)\|[ \t]*$/;

function splitRow(line: string): string[] {
  const match = TABLE_ROW.exec(line.trim());
  if (!match) return [];
  return match[1].split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

const RATING_ICON: Record<Exclude<Rating, undefined>, string> = { meets: '✅', partial: '⚠️', fails: '❌' };
const RATING_LABEL: Record<Exclude<Rating, undefined>, string> = { meets: 'Meets', partial: 'Partial', fails: 'Fails' };

export function renderCell(cell: MatrixCell): string {
  const icon = cell.rating ? `${RATING_ICON[cell.rating]} ${RATING_LABEL[cell.rating]}` : '';
  const note = cell.note.trim();
  if (icon && note) return `${icon}: ${note}`;
  return icon || note;
}

function parseCell(raw: string): MatrixCell {
  const text = raw.trim();
  const match = /^(✅|⚠️|❌)\s*(?:Meets|Partial|Fails)?[ \t]*:?[ \t]*([\s\S]*)$/.exec(text);
  if (!match) return { rating: undefined, note: text };
  const rating = match[1] === '✅' ? 'meets' : match[1] === '⚠️' ? 'partial' : 'fails';
  return { rating, note: match[2].trim() };
}

function parseMatrix(lines: string[], section: Section, options: Option[], drivers: Bullet[]): Matrix {
  const rows = lines
    .slice(section.heading.line + 1, section.end)
    .map(splitRow)
    .filter((cells) => cells.length > 0)
    .slice(2); // header + separator
  const grid: MatrixCell[][] = options.map((_, i) => {
    const row = rows[i]?.slice(1) ?? [];
    return drivers.map((_, j) => (row[j] !== undefined ? parseCell(row[j]) : { rating: undefined, note: '' }));
  });
  return { section, rows: grid };
}

export function parseAdrMarkdown(text: string): AdrModel {
  const lines = splitLines(text);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const frontMatter = parseFrontMatter(lines);
  const bodyStart = afterLeadingComments(lines, frontMatter.end);

  const headings = headingsOf(lines, bodyStart);
  const titles = headings.filter((h) => h.level === 1);
  const title = titles[0];
  const boundaries = headings.filter((h) => h.level <= 2 && h !== title);
  const sections: Section[] = boundaries
    .filter((h) => h.level === 2)
    .map((heading) => {
      const next = boundaries.find((b) => b.line > heading.line);
      return { heading, end: next?.line ?? lines.length, kind: classify(heading.text) };
    });

  const introEnd = boundaries.find((b) => b.line >= (title ? title.line + 1 : bodyStart))?.line ?? lines.length;
  const model: AdrModel = { frontMatter, bodyStart, title, extraTitles: titles.slice(1), introEnd, sections, lineCount: lines.length };

  const inFence = fencedLines(lines);
  const section = (kind: SectionKind) => sections.find((s) => s.kind === kind);

  const contextSection = section('context');
  if (contextSection) model.context = { section: contextSection, text: blockText(lines, contextSection.heading.line + 1, contextSection.end) };

  const driversSection = section('drivers');
  if (driversSection) model.drivers = { section: driversSection, list: parseBullets(lines, driversSection.heading.line + 1, driversSection.end, inFence) };

  const optionsSection = section('options');
  const optionBullets = optionsSection ? parseBullets(lines, optionsSection.heading.line + 1, optionsSection.end, inFence) : undefined;
  const options = optionBullets?.items.map(toOption) ?? [];
  if (optionsSection) model.options = { section: optionsSection, list: { start: optionBullets!.start, end: optionBullets!.end, items: options } };

  const matrixSection = section('matrix');
  if (matrixSection) model.matrix = parseMatrix(lines, matrixSection, options, model.drivers?.list.items ?? []);

  const outcomeSection = section('outcome');
  if (outcomeSection) model.outcome = parseOutcome(lines, outcomeSection, options, inFence);

  const prosConsSection = section('prosCons');
  if (prosConsSection) model.prosCons = parseProsCons(lines, prosConsSection, options, inFence);

  const moreSection = section('more');
  if (moreSection) model.more = { section: moreSection, text: blockText(lines, moreSection.heading.line + 1, moreSection.end) };

  return model;
}

export function parseAdrFile(text: string): AdrFile {
  return { text, model: parseAdrMarkdown(text) };
}
