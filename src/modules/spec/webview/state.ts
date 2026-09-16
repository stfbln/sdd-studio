import { createContext, useContext, useEffect, useState } from 'react';
import { requestFocus } from '../../../webview/focus';
import type { ListRef, SpecEdit } from '../core/edits';
import type { SpecEditorContext } from '../core/inherit';
import type { SpecFile, SpecModel } from '../core/parse';
import type { SpecAnchor, SpecIssue, SpecLocation } from '../core/summary';

export interface SpecEditorValue {
  doc: SpecFile;
  model: SpecModel;
  issues: SpecIssue[];
  /** The specs of the workspace and the inherited requirements; undefined until the host sends them. */
  context?: SpecEditorContext;
  edit(edits: SpecEdit | SpecEdit[]): void;
  /** `line` is 1-based. */
  openAsText(line?: number): void;
  /** Opens another file of the workspace folder. */
  openFile(path: string): void;
}

export const SpecContext = createContext<SpecEditorValue | null>(null);

export function useSpec(): SpecEditorValue {
  const value = useContext(SpecContext);
  if (!value) throw new Error('SpecContext missing');
  return value;
}

export const anchorId = (anchor: SpecAnchor) => `spec-${anchor}`;
export const groupId = (group: number) => `spec-group-${group}`;
/** A group only the specs extended have, in the order `mergeInherited` met them. */
export const inheritedGroupId = (group: number) => `spec-inherited-group-${group}`;
/** Focus keys: "main-2" is the third requirement of the ungrouped list, "g0-add" the add box of the first group. */
export const listKey = (group: ListRef) => (group === null ? 'main' : `g${group}`);
/**
 * Focus key of an example: "main-2-ex-0" is the first example of the third requirement, "main-2-ex-0-title" its title;
 * "main-2-ex-add" and "main-2-ex-add-title" are the boxes adding one.
 */
export const exampleKey = (group: ListRef, index: number, example?: number, part?: 'title') =>
  `${listKey(group)}-${index}-ex${example === undefined ? '-add' : `-${example}`}${part ? `-${part}` : ''}`;
/** Focus key of the description of a requirement. */
export const descriptionKey = (group: ListRef, index: number) => `${listKey(group)}-${index}-description`;

/** Last part jumped to: near the end of the page it cannot reach the top, but is still the one shown. */
export let requestedAnchor: SpecAnchor | undefined;

export function scrollToAnchor(anchor: SpecAnchor) {
  requestedAnchor = anchor;
  document.getElementById(anchorId(anchor))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

export function goTo(location: SpecLocation) {
  if (location.index !== undefined && location.group !== undefined) {
    requestedAnchor = location.anchor;
    requestFocus(location.example === undefined ? `${listKey(location.group)}-${location.index}` : exampleKey(location.group, location.index, location.example));
  } else {
    scrollToAnchor(location.anchor);
  }
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
