import { createContext, useContext } from 'react';
import type { SpecEdit } from '../../../shared/structured/edits';
import { useSpecEditor } from '../../../webview/structured/state';
import type { CatalogIssue } from '../core/analysis';
import { entityAt, type CatalogContext, type CatalogLocation, type KnownEntity } from '../core/model';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with catalog locations. */
export const useCatalog = () => useSpecEditor<CatalogLocation>();

export interface WorkspaceValue {
  /** Undefined until the extension host has looked at the workspace. */
  context?: CatalogContext;
  /** Entities of this file (with their document index), then those of the other catalog files. */
  known: KnownEntity[];
  issues: CatalogIssue[];
  openFile(path: string): void;
  openCatalog(): void;
  /** Runs a command offered by the host (`consolidated`, `newCatalogFile`). */
  runCommand(name: string): void;
  /** Work done by the host (`newSpecFile`); resolves with its result. */
  request(name: string, payload: unknown): Promise<unknown>;
  /** Consolidated view of every catalog file. */
  consolidated?: {
    /** Every catalog file, entities or not. */
    files: string[];
    /** File receiving new entities when the page does not say otherwise. */
    target: string;
    setTarget(file: string): void;
    /** File shown in the outline ("" for all). */
    filter: string;
    setFilter(file: string): void;
    /** Edits whose new entities go to `file`. */
    editIn(file: string, edits: SpecEdit[]): void;
  };
}

export const WorkspaceContext = createContext<WorkspaceValue>({
  known: [],
  issues: [],
  openFile: () => {},
  openCatalog: () => {},
  runCommand: () => {},
  request: () => Promise.reject(new Error('Not available')),
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const entityLocation = (index: number): CatalogLocation => ({ kind: 'entity', index });

/** Falls back to the overview when the entity no longer exists (deleted in the text...). */
export function validLocation(spec: unknown, location: CatalogLocation): CatalogLocation {
  if (location.kind === 'entity' && entityAt(spec, location.index)) return location;
  return { kind: 'overview' };
}
