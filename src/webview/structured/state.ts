import { createContext, useContext } from 'react';
import { getIn, type JsonObject, type SpecEdit, type SpecPath } from '../../shared/structured/edits';

/** What every form of a structured spec editor (OpenAPI, AsyncAPI) can use. */
export interface SpecEditorContextValue<Location = unknown> {
  spec: JsonObject;
  /** Version of the specification format, e.g. "3.0.3" or "2.6.0". */
  version: string;
  edit(edits: SpecEdit | SpecEdit[]): void;
  navigate(location: Location): void;
  openAsText(): void;
  schemaOptions: {
    /** OpenAPI 3.0 style `nullable: true`; otherwise JSON Schema `type: [x, "null"]`. */
    nullableKeyword: boolean;
    /** Shows the page of a component schema. */
    open(name: string): void;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SpecEditorContext = createContext<SpecEditorContextValue<any> | null>(null);

export function useSpecEditor<Location = unknown>(): SpecEditorContextValue<Location> {
  const value = useContext(SpecEditorContext);
  if (!value) throw new Error('SpecEditorContext missing');
  return value;
}

/** Value at a path plus a setter; empty optional values remove the key instead of writing "". */
export function useField<T = unknown>(path: SpecPath, options: { keepEmpty?: boolean } = {}) {
  const { spec, edit } = useSpecEditor();
  const value = getIn(spec, path) as T | undefined;
  const set = (next: unknown) => {
    const empty = next === undefined || (next === '' && !options.keepEmpty) || (Array.isArray(next) && next.length === 0);
    if (empty) {
      if (value !== undefined) edit({ op: 'delete', path });
    } else {
      edit({ op: 'set', path, value: next });
    }
  };
  return [value, set] as const;
}

export const sameLocation = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
