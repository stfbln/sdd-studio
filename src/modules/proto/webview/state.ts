import { createContext, useContext, useEffect, useState } from 'react';
import type { ProtoImportInfo, ProtoIssue, ProtoLocation, TypeInfo } from '../core/analysis';
import type { ProtoDocument } from '../core/document';
import type { ProtoEdit } from '../core/edits';
import type { ProtoFile } from '../core/model';

/** Another proto file of the workspace that could be imported (sent by the host). */
export interface AvailableProtoFile {
  importPath: string;
  resolved: string;
  types: { fullName: string; kind: 'message' | 'enum' }[];
}

export interface ProtoHostContext {
  imports?: ProtoImportInfo[];
  available?: AvailableProtoFile[];
}

export interface ProtoEditorValue {
  doc: ProtoDocument;
  file: ProtoFile;
  syntax: 'proto2' | 'proto3' | 'editions';
  imports: ProtoImportInfo[];
  available: AvailableProtoFile[];
  types: Map<string, TypeInfo>;
  issues: ProtoIssue[];
  edit(edits: ProtoEdit | ProtoEdit[]): void;
  navigate(location: ProtoLocation): void;
  openAsText(line?: number): void;
  openFile(path: string): void;
}

export const ProtoContext = createContext<ProtoEditorValue | null>(null);

export function useProto(): ProtoEditorValue {
  const value = useContext(ProtoContext);
  if (!value) throw new Error('ProtoContext missing');
  return value;
}

export const sameLocation = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local copy of a text value written to the file while typing. The file normalizes some input
 * (trailing spaces of comments...), so the draft is only replaced when the file really differs.
 */
export function useDraft(value: string, normalize: (draft: string) => string = (d) => d) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((current) => (normalize(current) === value ? current : value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [draft, setDraft] as const;
}
