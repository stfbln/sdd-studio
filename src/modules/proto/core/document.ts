import type { SpecProblem } from '../../../shared/structured/specText';
import { applyProtoEdits, type ProtoEdit } from './edits';
import { ProtoSyntaxError, type ProtoFile } from './model';
import { parseProto } from './parse';

/** What the form works on: the text (edits are applied to it) and its syntax tree. */
export interface ProtoDocument {
  text: string;
  file: ProtoFile;
}

export function parseProtoDocument(text: string): { ok: true; value: ProtoDocument; formattingDrift: false } | { ok: false; errors: SpecProblem[] } {
  try {
    return { ok: true, value: { text, file: parseProto(text) }, formattingDrift: false };
  } catch (err) {
    if (err instanceof ProtoSyntaxError) return { ok: false, errors: [{ message: `${err.message} (column ${err.column})`, line: err.line }] };
    return { ok: false, errors: [{ message: err instanceof Error ? err.message : String(err) }] };
  }
}

/** Applies edits and parses the result; throws when the result is not valid. */
export function applyToDocument(document: ProtoDocument, edits: ProtoEdit[]): ProtoDocument {
  const text = applyProtoEdits(document.text, edits);
  return { text, file: parseProto(text) };
}
