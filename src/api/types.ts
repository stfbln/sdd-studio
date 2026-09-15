/**
 * API of SDD Studio for other extensions (returned by `activate`) and, through the MCP server, for
 * AI assistants. Paths are relative to their workspace folder, with "/" separators.
 *
 * ```ts
 * const api = await vscode.extensions.getExtension<SddStudioApi>('sdd.sdd-studio')?.activate();
 * ```
 */
import type { EntityBrief } from '../modules/backstage/core/brief';
import type { SpecFileKind } from '../modules/backstage/core/model';

export type { EntityBrief, SpecFileKind };

export const SDD_STUDIO_API_VERSION = 1;

export interface SpecProblem {
  severity: 'error' | 'warning';
  message: string;
}

export interface SpecKindDescription {
  /** "backstage" for catalog files, else a `SpecFileKind`. */
  kind: string;
  title: string;
  /** What these files are for. */
  purpose: string;
  /** What these files are the source of truth for. */
  owns: string[];
  /** What does not belong in these files, and where it goes. */
  elsewhere: string[];
  /** How the catalog links these files to their entity. */
  linkedFrom: string;
  formats: { label: string; extension: string }[];
  /** Where new files go (setting of the workspace). */
  defaultFolder: string;
  /** Rules written at the top of the files, for people and AI assistants editing them. */
  editingRules: string[];
  docs?: string;
  schema?: string;
}

export interface SpecKindsDescription {
  /** Which file is the source of truth for what, and how to work with them. */
  sourceOfTruth: string[];
  kinds: SpecKindDescription[];
}

export interface CatalogEntity {
  /** Reference to use with the other calls, e.g. "component:shop-api". */
  ref: string;
  kind: string;
  /** SDD Studio category: domain, system, component, api, resource, dataAsset, network, artifact, repository, group, user, location. */
  category: string;
  type?: string;
  title?: string;
  description?: string;
  /** References of its system and owner. */
  system?: string;
  owner?: string;
  workspaceFolder: string;
  /** Catalog file defining the entity. */
  file: string;
  /** API definition file. */
  definition?: string;
  /** Linked spec files and threat models (the entity's own links, not inherited ones). */
  specs: string[];
  threatModels: string[];
}

export interface EntityDetails {
  entity: CatalogEntity;
  /** Everything the catalog knows about the entity: owner, system, APIs, dependencies, networks, data, parts, specs and threat models (inherited ones included). */
  brief: EntityBrief;
}

export interface SpecFileEntry {
  kind: string;
  workspaceFolder: string;
  path: string;
  name: string;
  details: string[];
  problems?: number;
  /** Syntax error or unsupported version. */
  error?: string;
  /** Entities linking the file (catalog files themselves have none). */
  linkedFrom: string[];
}

export interface SpecCheckResult {
  kind: string;
  workspaceFolder: string;
  path: string;
  /** Whether the file has changes not saved yet (they are checked). */
  unsaved: boolean;
  problems: SpecProblem[];
  linkedFrom: string[];
}

export interface CreateSpecOptions {
  kind: SpecFileKind;
  /** Catalog entity the file describes: the entry point, the file is linked from it. */
  entity: string;
  /** Name of the file and title written in it; by default derived from the entity. */
  title?: string;
  /** Format label or extension for kinds with several ("yaml", "json"). */
  format?: string;
  /** Folder relative to the workspace folder; by default the folder setting of the kind. */
  folder?: string;
  /** Full text of the file; by default a skeleton filled from the catalog. The update instructions header is added. */
  content?: string;
  workspaceFolder?: string;
}

export interface CreateCatalogFileOptions {
  /** Name of the system or domain the file describes, giving its file name. */
  title: string;
  /** Full text of the file, one entity per YAML document; by default a system named after the title. The update instructions header is added. */
  content?: string;
  /** Folder relative to the workspace folder; by default the catalog folder setting. */
  folder?: string;
  workspaceFolder?: string;
}

export interface CatalogFileResult {
  workspaceFolder: string;
  path: string;
  /** References of the entities of the file. */
  entities: string[];
  /** False when the file waits, unsaved, for the user to review and save it: its entities are only known once saved. */
  saved: boolean;
  message: string;
  problems: SpecProblem[];
}

export interface LinkSpecOptions {
  entity: string;
  /** Workspace-relative or absolute path of an existing spec file or threat model. */
  path: string;
  workspaceFolder?: string;
}

export interface WriteResult {
  kind: string;
  workspaceFolder: string;
  path: string;
  entity: string;
  catalogFile: string;
  /**
   * False when the changes wait in open editors for the user to review and save (the default):
   * a new file does not exist on disk until then. True when the user lets SDD Studio write without review.
   */
  saved: boolean;
  message: string;
  problems: SpecProblem[];
}

export interface SddStudioApi {
  readonly version: number;
  describeSpecKinds(): SpecKindsDescription;
  listCatalogEntities(options?: { workspaceFolder?: string; category?: string; query?: string }): Promise<CatalogEntity[]>;
  getCatalogEntity(ref: string, options?: { workspaceFolder?: string }): Promise<EntityDetails>;
  listSpecFiles(options?: { workspaceFolder?: string; kind?: string }): Promise<SpecFileEntry[]>;
  checkSpecFile(path: string, options?: { workspaceFolder?: string }): Promise<SpecCheckResult>;
  createCatalogFile(options: CreateCatalogFileOptions): Promise<CatalogFileResult>;
  createSpecFile(options: CreateSpecOptions): Promise<WriteResult>;
  linkSpecFile(options: LinkSpecOptions): Promise<WriteResult>;
}
