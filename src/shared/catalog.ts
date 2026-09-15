/**
 * Data and messages of the spec catalog page (the list of all features, all API specs...).
 * The page is generic: each module describes its kind of spec with a `CatalogInfo`.
 */

export interface CatalogFormat {
  label: string;
  /** Extension given to new files, e.g. ".feature" or ".openapi.yaml". */
  extension: string;
}

/** Texts and options the page needs to present one kind of spec. */
export interface CatalogInfo {
  kind: string;
  /** Page title, e.g. "Features". */
  title: string;
  singular: string;
  plural: string;
  icon: string;
  namePlaceholder: string;
  /** Formats offered for new files; the first one is the default. */
  formats: CatalogFormat[];
  /** Every extension a file name may end with (e.g. ".yaml" besides ".openapi.yaml"). */
  acceptedExtensions: string[];
  /** Word separator of generated file names: "-" (default) or "_" (e.g. proto files). */
  fileNameSeparator?: '-' | '_';
  /** New file names get a "NNNN-" prefix (the next number used in the target folder), e.g. ADRs. */
  numberedFiles?: boolean;
}

export interface WorkspaceEntry {
  index: number;
  name: string;
}

/** A folder, relative to its workspace folder ("" is the workspace root). */
export interface FolderEntry {
  workspace: number;
  path: string;
  /** False for the configured default folder when it has not been created yet. */
  exists: boolean;
}

/** What a module tells about one spec file. */
export interface SpecDetails {
  /** Display name (feature name, API title...), empty when unknown. */
  name: string;
  tags: string[];
  /** Short facts shown next to the name, e.g. ["3 scenarios", "OpenAPI 3.0.3"]. */
  details: string[];
  /** Number of validation problems in a readable file. */
  problems?: number;
  /** Syntax error or unsupported file. */
  error?: string;
  /** Anything worth a warning icon (e.g. relative references). */
  warning?: string;
}

export interface SpecSummary extends SpecDetails {
  workspace: number;
  /** Workspace-relative path with "/" separators. */
  path: string;
}

export interface CatalogState {
  info: CatalogInfo;
  workspaces: WorkspaceEntry[];
  /** Where new specs go by default (setting). */
  defaultFolder: string;
  folders: FolderEntry[];
  specs: SpecSummary[];
}

export type CatalogHostMessage =
  | ({ type: 'state' } & CatalogState)
  | { type: 'result'; requestId: number; error?: string }
  /** Asks the page to prepare the creation form for a folder (e.g. from the Explorer). */
  | { type: 'prepareCreate'; workspace: number; folder: string };

export type CatalogWebviewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'open'; workspace: number; path: string; asText?: boolean }
  | { type: 'reveal'; workspace: number; path: string }
  | { type: 'createSpec'; requestId: number; workspace: number; folder: string; fileName: string; name: string; open: boolean }
  | { type: 'createFolder'; requestId: number; workspace: number; path: string }
  /** Without a target, the host asks for one with a quick pick. */
  | { type: 'moveSpec'; requestId: number; workspace: number; path: string; target?: { workspace: number; folder: string } }
  | { type: 'deleteSpec'; requestId: number; workspace: number; path: string };
