/**
 * Update instructions written at the top of spec files, so that people and AI assistants editing
 * the text know its format, the JSON schema it follows and the conventions SDD Studio relies on.
 *
 * - `hash` (YAML, Gherkin) and `slash` (Protocol Buffers): comment lines, with a
 *   `# yaml-language-server: $schema=...` modeline first when there is a schema (YAML only).
 * - `markdown`: an HTML comment, invisible once rendered.
 * - `json`: JSON has no comments, so only the schema link is written, as a property.
 */
import { applyEdits, findNodeAtLocation, modify, parseTree } from 'jsonc-parser';

export type CommentStyle = 'hash' | 'slash' | 'markdown' | 'json';

/** A rule, or a rule followed by sub-items. */
export type InstructionRule = string | [string, ...string[]];

export interface FileInstructions {
  style: CommentStyle;
  /** What the file is, e.g. "an OpenAPI 3.0 document". */
  format: string;
  /** Reference documentation of the format. */
  docs?: string;
  /** JSON schema the file follows. */
  schema?: string;
  /** JSON property holding the schema (default "$schema", for formats that forbid it an "x-" property). */
  schemaProperty?: string;
  rules: InstructionRule[];
  /** Hash style: a first line to keep above the header (Gherkin's "# language: fr"). */
  keepFirstLine?: RegExp;
  /**
   * No blank line between the header and the rest of the file (Gherkin, whose form writes comments
   * right above the feature). Elsewhere the blank line keeps the header apart: YAML keeps it when
   * the first document is deleted, and in Protocol Buffers a comment right above an element documents it.
   */
  compact?: boolean;
}

export const INSTRUCTIONS_TITLE = 'How to update this file';
const WIDTH = 100;

const MODELINE = /^#\s*yaml-language-server\s*:/;

/** The rule shared by every file: the header itself stays. */
export const KEEP_HEADER_RULE = 'Keep this header and the existing comments.';

/** The rule shared by files with a JSON schema. */
export const schemaRule = (versionField: string) =>
  `Keep the file valid against the JSON schema of the first line; when you change "${versionField}", link the schema of that version.`;

function wrap(text: string, first: string, next: string, width: number): string[] {
  const lines: string[] = [];
  let line = first;
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && line.length + 1 + word.length > width) {
      lines.push(line);
      line = next + word;
    } else {
      line += (empty ? '' : ' ') + word;
    }
    empty = false;
  }
  lines.push(line);
  return lines;
}

/** Lines of the header, without comment markers ("- " items, "  " continuations). */
function bodyLines(instructions: FileInstructions, width: number): string[] {
  const title = `${INSTRUCTIONS_TITLE} (for people and AI assistants): ${instructions.format}${instructions.docs ? `, see ${instructions.docs}` : ''}.`;
  const lines = wrap(title, '', '  ', width);
  for (const rule of instructions.rules) {
    const [text, ...items] = typeof rule === 'string' ? [rule] : rule;
    lines.push(...wrap(text, '- ', '  ', width));
    for (const item of items) lines.push(...wrap(item, '  - ', '    ', width));
  }
  return lines;
}

/** The header as written at the top of the file (ends with a line break). */
export function renderInstructions(instructions: FileInstructions): string {
  switch (instructions.style) {
    case 'hash':
    case 'slash': {
      const marker = instructions.style === 'hash' ? '#' : '//';
      const modeline = instructions.style === 'hash' && instructions.schema ? [`# yaml-language-server: $schema=${instructions.schema}`] : [];
      return [...modeline, ...bodyLines(instructions, WIDTH - marker.length - 1).map((l) => `${marker} ${l}`)].join('\n') + '\n';
    }
    case 'markdown':
      return ['<!--', ...bodyLines(instructions, WIDTH), '-->'].join('\n') + '\n';
    case 'json':
      return '';
  }
}

interface Split {
  bom: string;
  eol: string;
  lines: string[];
}

function split(text: string): Split {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const body = text.slice(bom.length);
  return { bom, eol: body.includes('\r\n') ? '\r\n' : '\n', lines: body.split(/\r?\n/) };
}

const join = ({ bom, eol, lines }: Split) => bom + lines.join(eol);

/** Line range [start, end) of the header, and where a new header goes. */
function locate(lines: string[], instructions: FileInstructions): { insertAt: number; range?: [number, number] } {
  if (instructions.style === 'markdown') {
    let start = 0;
    if (lines[0]?.trim() === '---') {
      const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
      if (close > 0) start = close + 1;
    }
    let first = start;
    while (first < lines.length && !lines[first].trim()) first++;
    const opens = lines[first]?.trim().startsWith('<!--');
    const titled = opens && (lines[first].includes(INSTRUCTIONS_TITLE) || lines[first + 1]?.startsWith(INSTRUCTIONS_TITLE));
    if (!titled) return { insertAt: start };
    const close = lines.findIndex((l, i) => i >= first && l.includes('-->'));
    return close < 0 ? { insertAt: start } : { insertAt: start, range: [first, close + 1] };
  }

  const marker = instructions.style === 'hash' ? '#' : '//';
  const start = instructions.keepFirstLine?.test(lines[0] ?? '') ? 1 : 0;
  let line = start;
  if (instructions.style === 'hash' && MODELINE.test(lines[line] ?? '')) line++;
  if (lines[line]?.startsWith(`${marker} ${INSTRUCTIONS_TITLE}`)) {
    line++;
    while (line < lines.length && (lines[line].startsWith(`${marker} - `) || lines[line].startsWith(`${marker}   `))) line++;
  }
  return line > start ? { insertAt: start, range: [start, line] } : { insertAt: start };
}

export function hasInstructions(text: string, instructions: FileInstructions): boolean {
  if (instructions.style === 'json') return jsonSchemaValue(text, instructions) !== undefined;
  return locate(split(text).lines, instructions).range !== undefined;
}

function jsonSchemaValue(text: string, instructions: FileInstructions): unknown {
  const root = parseTree(text);
  const node = root?.type === 'object' ? findNodeAtLocation(root, [instructions.schemaProperty ?? '$schema']) : undefined;
  return node ? (node.value ?? null) : undefined;
}

function writeJson(text: string, instructions: FileInstructions): string {
  const property = instructions.schemaProperty ?? '$schema';
  const root = parseTree(text);
  if (!instructions.schema || root?.type !== 'object' || jsonSchemaValue(text, instructions) === instructions.schema) return text;
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
  const edits = modify(text, [property], instructions.schema, {
    formattingOptions: { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' },
    getInsertionIndex: () => 0,
  });
  return applyEdits(text, edits);
}

/** Adds the header, or brings an existing one up to date. */
export function withInstructions(text: string, instructions: FileInstructions): string {
  if (instructions.style === 'json') return writeJson(text, instructions);
  const parts = split(text);
  const { insertAt, range } = locate(parts.lines, instructions);
  const header = renderInstructions(instructions).replace(/\n$/, '').split('\n');
  const lines = [...parts.lines];
  if (range) {
    lines.splice(range[0], range[1] - range[0], ...header);
  } else {
    const rest = lines.slice(insertAt);
    const empty = rest.every((l) => !l.trim());
    const blank = !empty && !instructions.compact && rest[0]?.trim() ? [''] : [];
    lines.splice(insertAt, empty ? lines.length - insertAt : 0, ...header, ...blank, ...(empty ? [''] : []));
  }
  return join({ ...parts, lines });
}

/** Brings an existing header up to date (e.g. after a version change); files without one are left alone. */
export function refreshInstructions(text: string, instructions: FileInstructions): string {
  return hasInstructions(text, instructions) ? withInstructions(text, instructions) : text;
}
