import { Document, LineCounter, parseAllDocuments, parseDocument } from 'yaml';
import type { Json, SpecEdit } from './edits';
import { editYamlDocument, yamlOptions, type SpecParseResult } from './specText';

/**
 * Multi-document YAML files (`---` separated), such as Backstage catalog files. The form sees
 * `{ documents: [...] }`, so edit paths start with `documents` and the document index. Only the
 * documents touched by an edit are serialized again: the others keep their exact text.
 */
export const DOCUMENTS_KEY = 'documents';

interface Part {
  /** Original text of the document, from its `---` (or the file start) to the next document. */
  source: string;
  doc?: Document;
  /** Serialized again instead of reusing `source`. */
  dirty: boolean;
}

function splitDocuments(text: string, lineCounter?: LineCounter) {
  const parsed = parseAllDocuments(text, { uniqueKeys: false, lineCounter });
  const docs = Array.isArray(parsed) ? (parsed as Document[]) : [];
  const starts = docs.map((d, i) => (i === 0 ? 0 : (d.range?.[0] ?? 0)));
  const sources = docs.map((_, i) => text.slice(starts[i], i + 1 < docs.length ? starts[i + 1] : text.length));
  return { docs, sources };
}

/** `doc.toString()` with the blank lines (or missing final newline) of the original text. */
function serialize(doc: Document, source: string | undefined, options: ReturnType<typeof yamlOptions>): string {
  let out = doc.toString(options);
  if (source === undefined) return out;
  const trailing = (s: string) => /\n*$/.exec(s)![0].length;
  const wanted = trailing(source);
  const actual = trailing(out);
  if (wanted > actual) out += '\n'.repeat(wanted - actual);
  else if (wanted === 0 && actual > 0) out = out.replace(/\n+$/, '');
  return out;
}

export function parseYamlDocuments(text: string): SpecParseResult {
  const lineCounter = new LineCounter();
  const { docs, sources } = splitDocuments(text, lineCounter);
  const errors = docs.flatMap((d) => d.errors);
  if (errors.length) {
    return {
      ok: false,
      format: 'yaml',
      errors: errors.map((e) => ({ message: e.message.split('\n')[0], line: lineCounter.linePos(e.pos[0]).line })),
    };
  }
  const options = yamlOptions(text);
  const documents = docs.map((d) => (d.toJS({ maxAliasCount: 1000 }) ?? null) as Json);
  const formattingDrift = docs.some((d, i) => serialize(d, sources[i], options) !== sources[i]);
  return { ok: true, value: { [DOCUMENTS_KEY]: documents }, format: 'yaml', formattingDrift };
}

export function applyYamlDocumentEdits(text: string, edits: SpecEdit[]): string {
  const { docs, sources } = splitDocuments(text);
  if (docs.some((d) => d.errors.length)) throw new Error('The YAML file has syntax errors; fix them in the text editor first.');
  const options = yamlOptions(text);
  const parts: Part[] = sources.map((source) => ({ source, dirty: false }));
  /** Comment block at the top of the file, kept when the first document is deleted. */
  let header = '';

  const docOf = (part: Part) => (part.doc ??= parseDocument(part.source, { uniqueKeys: false }));

  for (const edit of edits) {
    if (edit.path[0] !== DOCUMENTS_KEY || edit.path.length < 2) continue;
    const index = Number(edit.path[1]);
    if (!Number.isInteger(index) || index < 0) continue;

    if (edit.path.length === 2) {
      if (edit.op === 'set') {
        const doc = new Document(edit.value);
        if (index < parts.length) parts[index] = { source: parts[index].source, doc, dirty: true };
        else parts.push({ source: '', doc, dirty: true });
      } else if (edit.op === 'delete' && index < parts.length) {
        if (index === 0) header = /^(?:#[^\n]*\n)+\n/.exec(parts[0].source)?.[0] ?? '';
        parts.splice(index, 1);
      } else if (edit.op === 'move' && index < parts.length) {
        const [part] = parts.splice(index, 1);
        parts.splice(Math.min(Math.max(edit.to, 0), parts.length), 0, part);
      }
      continue;
    }
    if (index >= parts.length) {
      if (edit.op !== 'set') continue;
      parts.push({ source: '', doc: new Document({}), dirty: true });
    }
    const part = parts[Math.min(index, parts.length - 1)];
    editYamlDocument(docOf(part), [{ ...edit, path: edit.path.slice(2) } as SpecEdit]);
    part.dirty = true;
  }

  let result = header;
  parts.forEach((part, i) => {
    let chunk: string;
    if (part.dirty && part.doc) {
      if (i > 0) part.doc.directives!.docStart = true;
      chunk = serialize(part.doc, part.source || undefined, options);
    } else {
      chunk = part.source;
    }
    if (i > 0 && !/^(?:#[^\n]*\n|[ \t]*\n)*---/.test(chunk)) chunk = `---\n${chunk}`;
    if (result && !result.endsWith('\n')) result += '\n';
    result += chunk;
  });
  return result;
}
