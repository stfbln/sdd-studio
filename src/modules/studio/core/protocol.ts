/** Messages between the extension host and the SDD Studio home page. */

/** One kind of spec, as the home page shows it. */
export interface StudioKind {
  /** `CatalogInfo.kind`, sent back to open the overview page of that kind. */
  kind: string;
  /** Page title, e.g. "Features". */
  title: string;
  singular: string;
  plural: string;
  icon: string;
  /** What these files are for (`SPEC_PURPOSES`). */
  purpose: string;
  /** Files of that kind in the workspace. */
  count: number;
  /** Problems found in them; a file that cannot be read counts as one. */
  problems: number;
}

export interface StudioState {
  hasWorkspace: boolean;
  /** Names of the open workspace folders. */
  workspaces: string[];
  kinds: StudioKind[];
}

export type StudioHostMessage = { type: 'state' } & StudioState;

/** The pages and commands the home page offers besides the overview of each kind. */
export type StudioAction = 'consolidatedCatalog' | 'prompts' | 'instructions' | 'configureClaudeCode' | 'settings';

export type StudioWebviewMessage = { type: 'ready' } | { type: 'openOverview'; kind: string } | { type: 'run'; action: StudioAction };
