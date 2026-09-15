import { createContext, useContext, useEffect, useState } from 'react';
import type { AdrEdit } from '../core/edits';
import { frontMatterList, frontMatterValue, splitLines, type AdrFile, type AdrModel } from '../core/parse';
import type { AdrAnchor, AdrIssue, AdrLocation } from '../core/summary';

export interface AdrEditorValue {
  doc: AdrFile;
  model: AdrModel;
  issues: AdrIssue[];
  edit(edits: AdrEdit | AdrEdit[]): void;
  /** `line` is 1-based. */
  openAsText(line?: number): void;
  request(name: string, payload: unknown): Promise<unknown>;
}

export const AdrContext = createContext<AdrEditorValue | null>(null);

export function useAdr(): AdrEditorValue {
  const value = useContext(AdrContext);
  if (!value) throw new Error('AdrContext missing');
  return value;
}

export const anchorId = (anchor: AdrAnchor) => `adr-${anchor}`;

export let requestedAnchor: AdrAnchor | undefined;

export function scrollToAnchor(anchor: AdrAnchor) {
  requestedAnchor = anchor;
  document.getElementById(anchorId(anchor))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

export function goTo(location: AdrLocation) {
  scrollToAnchor(location.anchor);
}

/** The front matter, as plain values (the model only keeps line ranges: the text stays the source of truth). */
export function frontMatterOf(doc: AdrFile) {
  const lines = splitLines(doc.text);
  const fields = doc.model.frontMatter.fields;
  return {
    status: frontMatterValue(lines, fields.status),
    date: frontMatterValue(lines, fields.date),
    decisionMakers: frontMatterList(lines, fields['decision-makers']),
    consulted: frontMatterList(lines, fields.consulted),
    informed: frontMatterList(lines, fields.informed),
  };
}

/**
 * Local copy of a text written to the file while typing. The file drops some input (trailing
 * spaces, blank lines at the end...), so the draft is only replaced when the file really differs.
 */
export function useDraft(value: string, normalize: (draft: string) => string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((current) => (normalize(current) === value ? current : value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [draft, setDraft] as const;
}
