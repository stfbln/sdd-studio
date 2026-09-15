import type {
  BackgroundModel,
  DataTableModel,
  DocStringModel,
  ExamplesModel,
  GherkinDocumentModel,
  RuleModel,
  ScenarioModel,
  StepModel,
} from './model';

const INDENT = '  ';

/**
 * Writes the model back as canonically formatted Gherkin:
 * two-space indentation, aligned tables, one blank line between blocks.
 */
export function serializeGherkin(doc: GherkinDocumentModel): string {
  const out: string[] = [];
  const f = doc.feature;

  if (doc.language && doc.language !== 'en') out.push(`# language: ${doc.language}`);

  if (f) {
    comments(out, f.comments, '');
    tags(out, f.tags, '');
    out.push(title(f.keyword, f.name, ''));
    description(out, f.description, INDENT);
    for (const child of f.children) {
      out.push('');
      if (child.kind === 'rule') rule(out, child, INDENT);
      else if (child.kind === 'background') background(out, child, INDENT);
      else scenario(out, child, INDENT);
    }
  }

  if (doc.trailingComments.length) {
    if (out.length) out.push('');
    comments(out, doc.trailingComments, '');
  }

  return out.length ? out.join('\n') + '\n' : '';
}

function rule(out: string[], r: RuleModel, indent: string) {
  comments(out, r.comments, indent);
  tags(out, r.tags, indent);
  out.push(title(r.keyword, r.name, indent));
  description(out, r.description, indent + INDENT);
  for (const child of r.children) {
    out.push('');
    if (child.kind === 'background') background(out, child, indent + INDENT);
    else scenario(out, child, indent + INDENT);
  }
}

function background(out: string[], b: BackgroundModel, indent: string) {
  comments(out, b.comments, indent);
  out.push(title(b.keyword, b.name, indent));
  description(out, b.description, indent + INDENT);
  steps(out, b.steps, indent + INDENT);
}

function scenario(out: string[], s: ScenarioModel, indent: string) {
  comments(out, s.comments, indent);
  tags(out, s.tags, indent);
  out.push(title(s.keyword, s.name, indent));
  description(out, s.description, indent + INDENT);
  steps(out, s.steps, indent + INDENT);
  for (const e of s.examples) {
    out.push('');
    examples(out, e, indent + INDENT);
  }
}

function examples(out: string[], e: ExamplesModel, indent: string) {
  comments(out, e.comments, indent);
  tags(out, e.tags, indent);
  out.push(title(e.keyword, e.name, indent));
  description(out, e.description, indent + INDENT);
  if (e.header.length) table(out, [e.header, ...e.rows], indent + INDENT);
}

function steps(out: string[], list: StepModel[], indent: string) {
  for (const s of list) {
    comments(out, s.comments, indent);
    // A bare "Given" line would be read back as description text, so steps still
    // blank in the form are not written. With an argument, keep "Given " as is.
    if (!s.text.trim() && !s.dataTable && !s.docString) continue;
    out.push(s.text.trim() ? `${indent}${s.keyword}${s.text}`.trimEnd() : `${indent}${s.keyword}`);
    if (s.dataTable) dataTable(out, s.dataTable, indent + INDENT);
    if (s.docString) docString(out, s.docString, indent + INDENT);
  }
}

function dataTable(out: string[], t: DataTableModel, indent: string) {
  if (t.rows.length) table(out, t.rows, indent);
}

function docString(out: string[], d: DocStringModel, indent: string) {
  // Only a line starting with the delimiter would close the doc string, and the
  // parser unescapes a single occurrence per line, so escape exactly that case.
  const escape = d.delimiter === '```' ? '\\`\\`\\`' : '\\"\\"\\"';
  out.push(`${indent}${d.delimiter}${d.mediaType}`);
  if (d.content !== '') {
    for (const line of d.content.split('\n')) {
      const safe = line.trimStart().startsWith(d.delimiter) ? line.replace(d.delimiter, escape) : line;
      out.push(safe ? indent + safe : '');
    }
  }
  out.push(`${indent}${d.delimiter}`);
}

/** Pads every column to the widest cell so the table stays readable in plain text. */
export function table(out: string[], rows: string[][], indent: string) {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const escaped = rows.map((r) => Array.from({ length: columns }, (_, i) => escapeCell(r[i] ?? '')));
  const widths = Array.from({ length: columns }, (_, i) => Math.max(...escaped.map((r) => [...r[i]].length)));
  for (const row of escaped) {
    out.push(`${indent}| ${row.map((cell, i) => cell + ' '.repeat(widths[i] - [...cell].length)).join(' | ')} |`);
  }
}

export function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '\\n');
}

function title(keyword: string, name: string, indent: string) {
  return `${indent}${keyword}:${name ? ' ' + name : ''}`;
}

function tags(out: string[], list: string[], indent: string) {
  const normalized = list.map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith('@') ? t : '@' + t));
  if (normalized.length) out.push(indent + normalized.join(' '));
}

function comments(out: string[], list: string[], indent: string) {
  for (const c of list) out.push(indent + (c.startsWith('#') ? c : '# ' + c));
}

function description(out: string[], text: string, indent: string) {
  if (!text.trim()) return;
  for (const line of text.split('\n')) out.push(line.trim() ? indent + line.trimEnd() : '');
}
