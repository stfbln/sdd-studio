import {
  fencedLines,
  isBlank,
  parseAdrMarkdown,
  renderCell,
  renderConsequenceText,
  renderOptionText,
  renderProConText,
  scanFences,
  splitLines,
  withPeriod,
  type AdrModel,
  type Bullet,
  type ConsequenceType,
  type FrontMatterField,
  type FrontMatterKey,
  type MatrixCell,
  type Option,
  type OptionProsCons,
  type ProCon,
  type ProConType,
  type Rating,
  type Section,
  type SectionKind,
} from './parse';

/**
 * Changes the form makes to an ADR: each one rewrites only the lines concerned. The Options
 * Comparison table and the Pros and Cons of the Options headings are generated from the Considered
 * Options / Decision Drivers lists: any edit that adds, renames, reorders or deletes an option or a
 * driver regenerates them from the current content (reconciled by the position the option or driver
 * held before the edit), so ratings and pros/cons bullets are carried over. See `parse.ts`.
 */
export type AdrEdit =
  | { op: 'setStatus'; value: string }
  | { op: 'setDate'; value: string }
  | { op: 'setDecisionMakers'; value: string[] }
  | { op: 'setConsulted'; value: string[] }
  | { op: 'setInformed'; value: string[] }
  | { op: 'setTitle'; value: string }
  | { op: 'setContext'; value: string }
  | { op: 'setMoreInformation'; value: string }
  | { op: 'addDriver'; text: string; index?: number }
  | { op: 'setDriver'; index: number; text: string }
  | { op: 'deleteDriver'; index: number }
  | { op: 'moveDriver'; index: number; toIndex: number }
  | { op: 'addOption'; title: string; description?: string; index?: number }
  | { op: 'setOption'; index: number; title: string; description: string }
  | { op: 'deleteOption'; index: number }
  | { op: 'moveOption'; index: number; toIndex: number }
  | { op: 'setCell'; option: number; driver: number; rating: Rating; note: string }
  | { op: 'setOutcome'; selectedOption?: number; rationale: string }
  | { op: 'addConsequence'; type: ConsequenceType; text: string; index?: number }
  | { op: 'setConsequence'; index: number; type: ConsequenceType; text: string }
  | { op: 'deleteConsequence'; index: number }
  | { op: 'moveConsequence'; index: number; toIndex: number }
  | { op: 'addProCon'; option: number; type: ProConType; text: string; index?: number }
  | { op: 'setProCon'; option: number; index: number; type: ProConType; text: string }
  | { op: 'deleteProCon'; option: number; index: number }
  | { op: 'moveProCon'; option: number; index: number; toIndex: number };

const SECTION_ORDER: SectionKind[] = ['context', 'drivers', 'options', 'matrix', 'outcome', 'prosCons', 'more'];
const EMPTY_CELL: MatrixCell = { rating: undefined, note: '' };

function sectionOf(model: AdrModel, kind: SectionKind): Section | undefined {
  switch (kind) {
    case 'context':
      return model.context?.section;
    case 'drivers':
      return model.drivers?.section;
    case 'options':
      return model.options?.section;
    case 'matrix':
      return model.matrix?.section;
    case 'outcome':
      return model.outcome?.section;
    case 'prosCons':
      return model.prosCons?.section;
    case 'more':
      return model.more?.section;
    default:
      return undefined;
  }
}

function insertionPoint(model: AdrModel, kind: SectionKind): number {
  const index = SECTION_ORDER.indexOf(kind);
  for (let i = index - 1; i >= 0; i--) {
    const section = sectionOf(model, SECTION_ORDER[i]);
    if (section) return section.end;
  }
  return model.introEnd;
}

/** Closes a code fence left open, so the rest of the file is not swallowed by it. */
function closeFences(text: string): string {
  const open = scanFences(text.split('\n')).open;
  if (open === undefined) return text;
  const [, indent, fence] = /^( *)(`{3,}|~{3,})/.exec(open) ?? ['', '', '```'];
  return `${text}\n${indent}${fence}`;
}

export const normalizeTitle = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Multi-line free text (context, more information, option descriptions): heading lines are escaped so they stay inside the block. */
export function normalizeBlock(value: string): string {
  const text = closeFences(value.replace(/\r\n?/g, '\n').replace(/^([ \t]*\n)+/, '').replace(/\s+$/, ''));
  if (!text) return '';
  const lines = text.split('\n');
  const inFence = fencedLines(lines);
  return lines.map((l, i) => (inFence[i] ? l : l.replace(/^( {0,3})(#{1,3})(?=[ \t]|$)/, '$1\\$2'))).join('\n');
}

function renderItem(marker: string, text: string): string[] {
  const [first, ...rest] = text.split('\n');
  const indent = ' '.repeat(marker.length + 1);
  return [`${marker} ${first}`.trimEnd(), ...rest.map((l) => (l.trim() ? indent + l : ''))];
}

const markerOf = (items: { marker: string }[]) => items[0]?.marker ?? '-';
const clampInsert = (index: number, length: number) => Math.max(0, Math.min(index, length));
const clampMove = (index: number, length: number) => (length <= 1 ? 0 : Math.max(0, Math.min(index, length - 1)));

class Lines {
  lines: string[];
  private readonly trailingNewline: boolean;

  constructor(text: string) {
    this.lines = text ? splitLines(text) : [];
    this.trailingNewline = !text || /\n$/.test(text);
    if (this.lines[this.lines.length - 1] === '') this.lines.pop();
  }

  get model(): AdrModel {
    return parseAdrMarkdown(this.toString());
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
      this.replace(first, last + 1, value.split('\n'));
    } else {
      this.removeBlock(first, last + 1);
    }
  }

  toString() {
    const text = this.lines.join('\n');
    return this.trailingNewline && this.lines.length ? `${text}\n` : text;
  }
}

/* Sections (title, context, more information) ---------------------------------------------------- */

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

function setFreeText(doc: Lines, kind: 'context' | 'more', heading: string, value: string) {
  const model = doc.model;
  const text = normalizeBlock(value);
  const section = sectionOf(model, kind);
  if (!section) {
    if (text) doc.insertBlock(insertionPoint(model, kind), [`## ${heading}`, '', ...text.split('\n')]);
  } else if (!text && (model.context?.section === section ? model.context.text : model.more?.text) !== '') {
    doc.removeBlock(section.heading.line, section.end);
  } else if (text) {
    doc.setBlock(section.heading.line + 1, section.end, text, section.heading.line + 1);
  }
}

/* Generic bullet list insert/replace ---------------------------------------------------------------- */

function insertAt(doc: Lines, list: { start: number; end: number; items: { line: number; end: number }[] }, position: number, block: string[]) {
  const items = list.items;
  if (!items.length) {
    let last = list.end - 1;
    while (last >= list.start && isBlank(doc.lines[last])) last--;
    doc.insertBlock(last + 1, block);
  } else if (position < items.length) {
    doc.replace(items[position].line, items[position].line, block);
  } else {
    const end = items[items.length - 1].end;
    doc.replace(end, end, block);
  }
}

function moveItem(doc: Lines, item: { line: number; end: number }, itemsAfter: () => { line: number; end: number }[], target: number) {
  const text = doc.lines.slice(item.line, item.end);
  doc.removeBlock(item.line, item.end);
  const items = itemsAfter();
  if (target >= items.length) doc.insertBlock(items.length ? items[items.length - 1].end : item.line, text);
  else doc.insertBlock(items[target].line, text);
}

function ensureSection(doc: Lines, kind: SectionKind, heading: string) {
  const model = doc.model;
  if (sectionOf(model, kind)) return;
  doc.insertBlock(insertionPoint(model, kind), [`## ${heading}`]);
}

/* Decision drivers and the matrix columns they own -------------------------------------------------- */

function matrixRows(model: AdrModel): MatrixCell[][] {
  const options = model.options?.list.items ?? [];
  const drivers = model.drivers?.list.items ?? [];
  const existing = model.matrix?.rows ?? [];
  return options.map((_, i) => drivers.map((_, j) => existing[i]?.[j] ?? EMPTY_CELL));
}

function withInsertedColumn(rows: MatrixCell[][], at: number): MatrixCell[][] {
  return rows.map((row) => {
    const copy = row.slice();
    copy.splice(at, 0, EMPTY_CELL);
    return copy;
  });
}

function withRemovedColumn(rows: MatrixCell[][], at: number): MatrixCell[][] {
  return rows.map((row) => {
    const copy = row.slice();
    copy.splice(at, 1);
    return copy;
  });
}

function withMovedColumn(rows: MatrixCell[][], from: number, to: number): MatrixCell[][] {
  return rows.map((row) => {
    const copy = row.slice();
    const [cell] = copy.splice(from, 1);
    copy.splice(to, 0, cell);
    return copy;
  });
}

function withInsertedRow<T>(rows: T[][], at: number, empty: T[]): T[][] {
  const copy = rows.slice();
  copy.splice(at, 0, empty);
  return copy;
}

function withRemovedRow<T>(rows: T[][], at: number): T[][] {
  const copy = rows.slice();
  copy.splice(at, 1);
  return copy;
}

function withMovedRow<T>(rows: T[][], from: number, to: number): T[][] {
  const copy = rows.slice();
  const [row] = copy.splice(from, 1);
  copy.splice(to, 0, row);
  return copy;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderMatrixBlock(options: Option[], drivers: Bullet[], rows: MatrixCell[][]): string[] {
  if (!options.length || !drivers.length) return [];
  const row = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`;
  const header = row(['Option', ...drivers.map((d) => d.text)]);
  const sep = row(['---', ...drivers.map(() => '---')]);
  const body = options.map((o, i) => row([o.title || `Option ${i + 1}`, ...drivers.map((_, j) => renderCell(rows[i]?.[j] ?? EMPTY_CELL))]));
  return ['## Options Comparison', '', header, sep, ...body];
}

function replaceSection(doc: Lines, kind: SectionKind, block: string[]) {
  const model = doc.model;
  const existing = sectionOf(model, kind);
  if (existing) doc.removeBlock(existing.heading.line, existing.end);
  if (block.length) doc.insertBlock(existing ? existing.heading.line : insertionPoint(model, kind), block);
}

function writeMatrixSection(doc: Lines, rows: MatrixCell[][]) {
  const model = doc.model;
  const options = model.options?.list.items ?? [];
  const drivers = model.drivers?.list.items ?? [];
  const normalized = options.map((_, i) => drivers.map((_, j) => rows[i]?.[j] ?? EMPTY_CELL));
  replaceSection(doc, 'matrix', renderMatrixBlock(options, drivers, normalized));
}

function addDriver(doc: Lines, text: string, index?: number) {
  const value = normalizeTitle(text);
  if (!value) throw new Error('A decision driver cannot be empty.');
  const before = doc.model;
  const items = before.drivers?.list.items ?? [];
  const position = clampInsert(index ?? items.length, items.length);
  ensureSection(doc, 'drivers', 'Decision Drivers');
  insertAt(doc, doc.model.drivers!.list, position, renderItem(markerOf(items), value));
  writeMatrixSection(doc, withInsertedColumn(matrixRows(before), position));
}

function setDriver(doc: Lines, index: number, text: string) {
  const before = doc.model;
  const item = before.drivers?.list.items[index];
  if (!item) throw new Error('This decision driver no longer exists in the file.');
  const value = normalizeTitle(text);
  if (!value) throw new Error('A decision driver cannot be empty.');
  doc.replace(item.line, item.end, renderItem(item.marker, value));
  writeMatrixSection(doc, matrixRows(before));
}

function deleteDriver(doc: Lines, index: number) {
  const before = doc.model;
  const item = before.drivers?.list.items[index];
  if (!item) throw new Error('This decision driver no longer exists in the file.');
  doc.removeBlock(item.line, item.end);
  const drivers = doc.model.drivers;
  if (drivers && !drivers.list.items.length) doc.removeBlock(drivers.section.heading.line, drivers.section.end);
  writeMatrixSection(doc, withRemovedColumn(matrixRows(before), index));
}

function moveDriver(doc: Lines, index: number, toIndex: number) {
  const before = doc.model;
  const items = before.drivers?.list.items ?? [];
  const item = items[index];
  if (!item) throw new Error('This decision driver no longer exists in the file.');
  const target = clampMove(toIndex, items.length);
  if (target !== index) moveItem(doc, item, () => doc.model.drivers?.list.items ?? [], target);
  writeMatrixSection(doc, withMovedColumn(matrixRows(before), index, target));
}

/* Considered options, the matrix rows and pros/cons subsections they own --------------------------- */

function prosConsItems(model: AdrModel): ProCon[][] {
  const options = model.options?.list.items ?? [];
  const existing = model.prosCons?.options ?? [];
  return options.map((_, i) => existing[i]?.list.items ?? []);
}

function renderProsConsBlock(options: Option[], itemsByOption: ProCon[][]): string[] {
  if (!options.length) return [];
  const lines: string[] = ['## Pros and Cons of the Options'];
  options.forEach((o, i) => {
    lines.push('', `### ${o.title || `Option ${i + 1}`}`);
    const items = itemsByOption[i] ?? [];
    if (items.length) {
      lines.push('');
      items.forEach((item) => lines.push(...renderItem(markerOf(items), renderProConText(item.type, item.text))));
    }
  });
  return lines;
}

function writeProsConsSection(doc: Lines, itemsByOption: ProCon[][]) {
  const options = doc.model.options?.list.items ?? [];
  replaceSection(doc, 'prosCons', renderProsConsBlock(options, options.map((_, i) => itemsByOption[i] ?? [])));
}

function addOption(doc: Lines, title: string, description: string, index?: number) {
  const value = normalizeTitle(title);
  if (!value) throw new Error('An option needs a title.');
  const before = doc.model;
  const items = before.options?.list.items ?? [];
  const position = clampInsert(index ?? items.length, items.length);
  ensureSection(doc, 'options', 'Considered Options');
  insertAt(doc, doc.model.options!.list, position, renderItem(markerOf(items), renderOptionText(value, normalizeBlock(description))));
  writeMatrixSection(doc, withInsertedRow(matrixRows(before), position, (before.drivers?.list.items ?? []).map(() => EMPTY_CELL)));
  writeProsConsSection(doc, withInsertedRow(prosConsItems(before), position, []));
}

function setOption(doc: Lines, index: number, title: string, description: string) {
  const before = doc.model;
  const item = before.options?.list.items[index];
  if (!item) throw new Error('This option no longer exists in the file.');
  const value = normalizeTitle(title);
  if (!value) throw new Error('An option needs a title.');
  doc.replace(item.line, item.end, renderItem(item.marker, renderOptionText(value, normalizeBlock(description))));
  writeMatrixSection(doc, matrixRows(before));
  writeProsConsSection(doc, prosConsItems(before));
}

function deleteOption(doc: Lines, index: number) {
  const before = doc.model;
  const item = before.options?.list.items[index];
  if (!item) throw new Error('This option no longer exists in the file.');
  doc.removeBlock(item.line, item.end);
  const options = doc.model.options;
  if (options && !options.list.items.length) doc.removeBlock(options.section.heading.line, options.section.end);
  writeMatrixSection(doc, withRemovedRow(matrixRows(before), index));
  writeProsConsSection(doc, withRemovedRow(prosConsItems(before), index));
}

function moveOption(doc: Lines, index: number, toIndex: number) {
  const before = doc.model;
  const items = before.options?.list.items ?? [];
  const item = items[index];
  if (!item) throw new Error('This option no longer exists in the file.');
  const target = clampMove(toIndex, items.length);
  if (target !== index) moveItem(doc, item, () => doc.model.options?.list.items ?? [], target);
  writeMatrixSection(doc, withMovedRow(matrixRows(before), index, target));
  writeProsConsSection(doc, withMovedRow(prosConsItems(before), index, target));
}

/* A single matrix cell ------------------------------------------------------------------------------ */

function setCell(doc: Lines, option: number, driver: number, rating: Rating, note: string) {
  const model = doc.model;
  const options = model.options?.list.items ?? [];
  const drivers = model.drivers?.list.items ?? [];
  if (!options[option] || !drivers[driver]) throw new Error('This option or decision driver no longer exists in the file.');
  const rows = matrixRows(model);
  rows[option][driver] = { rating, note: note.trim() };
  writeMatrixSection(doc, rows);
}

/* Decision outcome and its consequences -------------------------------------------------------------- */

function cleanUpOutcome(doc: Lines) {
  const outcome = doc.model.outcome;
  if (!outcome) return;
  const empty = outcome.selectedOption === undefined && !outcome.unmatchedChoice && !outcome.rationale.trim() && !outcome.consequences.section && !outcome.consequences.list.items.length;
  if (empty) doc.removeBlock(outcome.section.heading.line, outcome.section.end);
}

function setOutcome(doc: Lines, selectedOption: number | undefined, rationale: string) {
  ensureSection(doc, 'outcome', 'Decision Outcome');
  const model = doc.model;
  const options = model.options?.list.items ?? [];
  if (selectedOption !== undefined && !options[selectedOption]) throw new Error('This option no longer exists in the file.');
  const title = selectedOption !== undefined ? options[selectedOption].title : undefined;
  const value = normalizeBlock(rationale);
  const outcome = model.outcome!;
  const statementEnd = outcome.consequences.section ? outcome.consequences.section.line : outcome.section.end;
  const paragraph = title ? `Chosen option: **${title}**${value ? `, because ${withPeriod(value)}` : '.'}` : value;
  doc.setBlock(outcome.section.heading.line + 1, statementEnd, paragraph, outcome.section.heading.line + 1);
  cleanUpOutcome(doc);
}

function ensureConsequencesList(doc: Lines) {
  ensureSection(doc, 'outcome', 'Decision Outcome');
  const outcome = doc.model.outcome!;
  if (!outcome.consequences.section) doc.insertBlock(outcome.consequences.end, ['### Consequences']);
  return doc.model.outcome!.consequences.list;
}

function addConsequence(doc: Lines, type: ConsequenceType, text: string, index?: number) {
  const value = normalizeTitle(text);
  if (!value) throw new Error('A consequence cannot be empty.');
  const list = ensureConsequencesList(doc);
  insertAt(doc, list, clampInsert(index ?? list.items.length, list.items.length), renderItem(markerOf(list.items), renderConsequenceText(type, value)));
}

function setConsequence(doc: Lines, index: number, type: ConsequenceType, text: string) {
  const item = doc.model.outcome?.consequences.list.items[index];
  if (!item) throw new Error('This consequence no longer exists in the file.');
  const value = normalizeTitle(text);
  if (!value) throw new Error('A consequence cannot be empty.');
  doc.replace(item.line, item.end, renderItem(item.marker, renderConsequenceText(type, value)));
}

function deleteConsequence(doc: Lines, index: number) {
  const item = doc.model.outcome?.consequences.list.items[index];
  if (!item) throw new Error('This consequence no longer exists in the file.');
  doc.removeBlock(item.line, item.end);
  const outcome = doc.model.outcome;
  if (outcome?.consequences.section && !outcome.consequences.list.items.length) doc.removeBlock(outcome.consequences.section.line, outcome.consequences.end);
  cleanUpOutcome(doc);
}

function moveConsequence(doc: Lines, index: number, toIndex: number) {
  const items = doc.model.outcome?.consequences.list.items ?? [];
  const item = items[index];
  if (!item) throw new Error('This consequence no longer exists in the file.');
  const target = clampMove(toIndex, items.length);
  if (target !== index) moveItem(doc, item, () => doc.model.outcome?.consequences.list.items ?? [], target);
}

/* Pros and cons of one option ------------------------------------------------------------------------ */

function optionProsCons(doc: Lines, option: number): OptionProsCons {
  const found = doc.model.prosCons?.options[option];
  if (!found) throw new Error('This option no longer exists in the file.');
  return found;
}

function addProCon(doc: Lines, option: number, type: ProConType, text: string, index?: number) {
  const value = normalizeTitle(text);
  if (!value) throw new Error('A pro or con cannot be empty.');
  const list = optionProsCons(doc, option).list;
  insertAt(doc, list, clampInsert(index ?? list.items.length, list.items.length), renderItem(markerOf(list.items), renderProConText(type, value)));
}

function setProCon(doc: Lines, option: number, index: number, type: ProConType, text: string) {
  const item = optionProsCons(doc, option).list.items[index];
  if (!item) throw new Error('This pro or con no longer exists in the file.');
  const value = normalizeTitle(text);
  if (!value) throw new Error('A pro or con cannot be empty.');
  doc.replace(item.line, item.end, renderItem(item.marker, renderProConText(type, value)));
}

function deleteProCon(doc: Lines, option: number, index: number) {
  const item = optionProsCons(doc, option).list.items[index];
  if (!item) throw new Error('This pro or con no longer exists in the file.');
  doc.removeBlock(item.line, item.end);
}

function moveProCon(doc: Lines, option: number, index: number, toIndex: number) {
  const items = optionProsCons(doc, option).list.items;
  const item = items[index];
  if (!item) throw new Error('This pro or con no longer exists in the file.');
  const target = clampMove(toIndex, items.length);
  if (target !== index) moveItem(doc, item, () => optionProsCons(doc, option).list.items, target);
}

/* Front matter -------------------------------------------------------------------------------------- */

function yamlScalar(value: string): string {
  return /[:#]|^[-?][ \t]|^[[\]{}&*!|>'"%@`]|^\s|\s$/.test(value) ? JSON.stringify(value) : value;
}

function yamlFlowList(values: string[]): string {
  return `[${values.map((v) => (/[,[\]{}"']/.test(v) ? JSON.stringify(v) : v)).join(', ')}]`;
}

function ensureFrontMatter(doc: Lines) {
  if (doc.model.frontMatter.end === 0) doc.insertBlock(0, ['---', '---']);
  return doc.model.frontMatter;
}

function setFrontMatterField(doc: Lines, key: FrontMatterKey, render: (existing?: FrontMatterField) => string[] | undefined) {
  const fm = ensureFrontMatter(doc);
  const field = fm.fields[key];
  const block = render(field) ?? [];
  if (field) doc.replace(field.line, field.end, block);
  else if (block.length) doc.replace(fm.end - 1, fm.end - 1, block);
  const now = doc.model.frontMatter;
  if (now.end > 0 && !Object.values(now.fields).some(Boolean)) doc.removeBlock(0, now.end);
}

function setStatus(doc: Lines, value: string) {
  const v = value.trim();
  setFrontMatterField(doc, 'status', () => (v ? [`status: ${yamlScalar(v)}`] : undefined));
}

function setDate(doc: Lines, value: string) {
  const v = value.trim();
  setFrontMatterField(doc, 'date', () => (v ? [`date: ${v}`] : undefined));
}

function setPeopleField(doc: Lines, key: 'decision-makers' | 'consulted' | 'informed', values: string[]) {
  const list = values.map((v) => v.trim()).filter(Boolean);
  setFrontMatterField(doc, key, () => (list.length ? [`${key}: ${yamlFlowList(list)}`] : undefined));
}

/* Dispatch ------------------------------------------------------------------------------------------ */

function applyOne(doc: Lines, edit: AdrEdit) {
  switch (edit.op) {
    case 'setStatus':
      return setStatus(doc, edit.value);
    case 'setDate':
      return setDate(doc, edit.value);
    case 'setDecisionMakers':
      return setPeopleField(doc, 'decision-makers', edit.value);
    case 'setConsulted':
      return setPeopleField(doc, 'consulted', edit.value);
    case 'setInformed':
      return setPeopleField(doc, 'informed', edit.value);
    case 'setTitle':
      return setTitle(doc, edit.value);
    case 'setContext':
      return setFreeText(doc, 'context', 'Context and Problem Statement', edit.value);
    case 'setMoreInformation':
      return setFreeText(doc, 'more', 'More Information', edit.value);
    case 'addDriver':
      return addDriver(doc, edit.text, edit.index);
    case 'setDriver':
      return setDriver(doc, edit.index, edit.text);
    case 'deleteDriver':
      return deleteDriver(doc, edit.index);
    case 'moveDriver':
      return moveDriver(doc, edit.index, edit.toIndex);
    case 'addOption':
      return addOption(doc, edit.title, edit.description ?? '', edit.index);
    case 'setOption':
      return setOption(doc, edit.index, edit.title, edit.description);
    case 'deleteOption':
      return deleteOption(doc, edit.index);
    case 'moveOption':
      return moveOption(doc, edit.index, edit.toIndex);
    case 'setCell':
      return setCell(doc, edit.option, edit.driver, edit.rating, edit.note);
    case 'setOutcome':
      return setOutcome(doc, edit.selectedOption, edit.rationale);
    case 'addConsequence':
      return addConsequence(doc, edit.type, edit.text, edit.index);
    case 'setConsequence':
      return setConsequence(doc, edit.index, edit.type, edit.text);
    case 'deleteConsequence':
      return deleteConsequence(doc, edit.index);
    case 'moveConsequence':
      return moveConsequence(doc, edit.index, edit.toIndex);
    case 'addProCon':
      return addProCon(doc, edit.option, edit.type, edit.text, edit.index);
    case 'setProCon':
      return setProCon(doc, edit.option, edit.index, edit.type, edit.text);
    case 'deleteProCon':
      return deleteProCon(doc, edit.option, edit.index);
    case 'moveProCon':
      return moveProCon(doc, edit.option, edit.index, edit.toIndex);
  }
}

export function applyAdrEdits(text: string, edits: AdrEdit[]): string {
  const doc = new Lines(text);
  for (const edit of edits) applyOne(doc, edit);
  return doc.toString();
}
