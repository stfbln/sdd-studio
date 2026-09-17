/**
 * Backstage software catalog knowledge used by the form editor, the catalog page and the checks.
 *
 * A catalog file holds one entity per YAML document. The form sees `{ documents: [...] }`
 * (see `yamlDocuments.ts`), so the entity of document `i` lives at `['documents', i]`.
 * Entities point to each other with entity references (`[kind:][namespace/]name`), and to the
 * spec files of the workspace with paths relative to the catalog file.
 */
import { dirOf, relativePath, resolvePath } from '../../../shared/files';
import { getIn, isObject, type Json, type JsonObject, type SpecPath } from '../../../shared/structured/edits';
import { DOCUMENTS_KEY } from '../../../shared/structured/yamlDocuments';

export const API_VERSION = 'backstage.io/v1alpha1';
export const DEFAULT_NAMESPACE = 'default';

/** Annotations and labels written by SDD Studio (Backstage keeps and shows unknown ones). */
export const SPECS_ANNOTATION = 'sdd-studio/specs';
export const THREAT_MODELS_ANNOTATION = 'sdd-studio/threat-models';
export const CLASSIFICATION_LABEL = 'sdd-studio/data-classification';
export const TRUST_ZONE_ANNOTATION = 'sdd-studio/trust-zone';
export const CIDR_ANNOTATION = 'sdd-studio/cidr';
export const ARTIFACT_TYPE_ANNOTATION = 'sdd-studio/artifact-type';
export const PURL_ANNOTATION = 'sdd-studio/purl';
export const PRODUCED_BY_ANNOTATION = 'sdd-studio/produced-by';
export const SUPPLIER_ANNOTATION = 'sdd-studio/supplier';
export const REPOSITORY_ANNOTATION = 'sdd-studio/repository';
export const REPOSITORY_PATH_ANNOTATION = 'sdd-studio/repository-path';
export const PROVIDER_ANNOTATION = 'sdd-studio/provider';
export const REPOSITORY_URL_ANNOTATION = 'sdd-studio/repository-url';
export const BRANCH_ANNOTATION = 'sdd-studio/default-branch';
export const SITE_ANNOTATION = 'sdd-studio/site';
export const DEPLOYED_ON_ANNOTATION = 'sdd-studio/deployed-on';
export const CLOUD_PROVIDER_ANNOTATION = 'sdd-studio/cloud-provider';
export const REGION_ANNOTATION = 'sdd-studio/region';
export const RELATIONSHIPS_ANNOTATION = 'sdd-studio/relationships';
/** Backstage's own annotation: where the source code of an entity is ("View source", TechDocs). */
export const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';

/** Data assets, networks, artifacts and repositories are Resources of these types, so any Backstage instance accepts them. */
export const DATA_ASSET_TYPE = 'data-asset';
export const NETWORK_TYPE = 'network';
export const ARTIFACT_TYPE = 'artifact';
export const REPOSITORY_TYPE = 'repository';
export const PLATFORM_TYPE = 'platform';
export const INFRASTRUCTURE_TYPE = 'infrastructure';
export const SITE_TYPE = 'site';
const RESOURCE_CATEGORIES: Record<string, Category> = {
  [DATA_ASSET_TYPE]: 'dataAsset',
  [NETWORK_TYPE]: 'network',
  [ARTIFACT_TYPE]: 'artifact',
  [REPOSITORY_TYPE]: 'repository',
  [PLATFORM_TYPE]: 'platform',
  [INFRASTRUCTURE_TYPE]: 'infrastructure',
  [SITE_TYPE]: 'site',
};

/** The `spec.type` a Resource of this category is written with, when the category comes from a type. */
export const resourceTypeOf = (category: Category): string | undefined => Object.keys(RESOURCE_CATEGORIES).find((type) => RESOURCE_CATEGORIES[type] === category);

export type CatalogLocation = { kind: 'overview' } | { kind: 'entity'; index: number } | { kind: 'diagram' };

export type Category =
  | 'domain'
  | 'system'
  | 'component'
  | 'api'
  | 'resource'
  | 'dataAsset'
  | 'network'
  | 'artifact'
  | 'repository'
  | 'platform'
  | 'infrastructure'
  | 'site'
  | 'group'
  | 'user'
  | 'location'
  | 'other';

export const CATEGORIES: Record<Category, { kind: string; singular: string; plural: string; icon: string; hint: string }> = {
  domain: { kind: 'Domain', singular: 'Domain', plural: 'Domains', icon: 'globe', hint: 'A business area grouping systems.' },
  system: { kind: 'System', singular: 'System', plural: 'Systems', icon: 'server-environment', hint: 'A product or feature made of components, APIs and resources.' },
  component: { kind: 'Component', singular: 'Component', plural: 'Components', icon: 'package', hint: 'A piece of software: service, website, CLI, app, library…' },
  api: { kind: 'API', singular: 'API', plural: 'APIs', icon: 'plug', hint: 'An interface provided by a component, described by a spec file.' },
  resource: { kind: 'Resource', singular: 'Resource', plural: 'Resources', icon: 'server', hint: 'Infrastructure or external dependency: database, queue, bucket, SaaS…' },
  dataAsset: { kind: 'Resource', singular: 'Data asset', plural: 'Data assets', icon: 'database', hint: 'Sensitive information handled by the system, e.g. customer data.' },
  network: { kind: 'Resource', singular: 'Network', plural: 'Networks', icon: 'globe', hint: 'Where components and resources run: internet, DMZ, private network, VPC, subnet…' },
  artifact: { kind: 'Resource', singular: 'Artifact', plural: 'Artifacts', icon: 'archive', hint: 'A package, container image, chart or binary, built here or supplied by another organization.' },
  repository: { kind: 'Resource', singular: 'Repository', plural: 'Repositories', icon: 'repo', hint: 'A source control repository (GitLab, GitHub, Perforce, Subversion…) holding code.' },
  platform: { kind: 'Resource', singular: 'Platform', plural: 'Platforms', icon: 'layers', hint: 'Where components run: Kubernetes cluster, PaaS, serverless platform…' },
  infrastructure: { kind: 'Resource', singular: 'Infrastructure', plural: 'Infrastructure', icon: 'vm', hint: 'Compute components are deployed on: virtual machine, bare-metal server, container host…' },
  site: { kind: 'Resource', singular: 'Site', plural: 'Sites', icon: 'location', hint: 'A cloud provider region or physical location where networks, platforms and infrastructure run.' },
  group: { kind: 'Group', singular: 'Group', plural: 'Groups', icon: 'organization', hint: 'A team or organizational unit owning entities.' },
  user: { kind: 'User', singular: 'User', plural: 'Users', icon: 'person', hint: 'A person, member of groups.' },
  location: { kind: 'Location', singular: 'Location', plural: 'Locations', icon: 'references', hint: 'Other catalog files Backstage should read.' },
  other: { kind: '', singular: 'Entity', plural: 'Other entities', icon: 'symbol-misc', hint: '' },
};

/** Categories of the software hierarchy, in outline order. */
export const HIERARCHY: Category[] = ['domain', 'system', 'component', 'api', 'resource', 'dataAsset'];
/** Networks, platforms, infrastructure and sites: where software runs and what it runs on. */
export const NETWORKS: Category[] = ['network', 'platform', 'infrastructure', 'site'];
export const CODE: Category[] = ['repository', 'artifact'];
export const ORGANIZATION: Category[] = ['group', 'user'];

export const LIFECYCLES = ['experimental', 'production', 'deprecated'];
export const TYPE_SUGGESTIONS: Partial<Record<Category, string[]>> = {
  component: ['service', 'website', 'library', 'cli', 'mobile-app', 'desktop-app', 'worker'],
  api: ['openapi', 'asyncapi', 'grpc', 'graphql', 'opencli', 'trpc'],
  resource: ['database', 'queue', 'topic', 's3-bucket', 'cache', 'cluster', 'cdn', 'external-service', 'saas'],
  group: ['team', 'business-unit', 'product-area', 'department'],
  system: ['product', 'platform', 'feature'],
  domain: ['product-area', 'business-domain'],
};
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
export const ARTIFACT_TYPES = ['container-image', 'dockerfile', 'npm-package', 'maven-package', 'pypi-package', 'nuget-package', 'go-module', 'helm-chart', 'os-package', 'binary'];
export const PROVIDERS = ['gitlab', 'github', 'bitbucket', 'azure-devops', 'gitea', 'perforce', 'subversion', 'mercurial'];
export const CLOUD_PROVIDERS = ['aws', 'azure', 'gcp', 'on-prem', 'colocation', 'edge'];

/* Spec files of the workspace ---------------------------------------------- */

export type SpecFileKind = 'spec' | 'gherkin' | 'openapi' | 'asyncapi' | 'proto' | 'opencli' | 'otm' | 'openslo' | 'adr';

export const SPEC_FILE_KINDS: Record<SpecFileKind, { label: string; icon: string; apiType?: string }> = {
  spec: { label: 'Spec', icon: 'book' },
  gherkin: { label: 'Feature', icon: 'checklist' },
  openapi: { label: 'OpenAPI', icon: 'json', apiType: 'openapi' },
  asyncapi: { label: 'AsyncAPI', icon: 'broadcast', apiType: 'asyncapi' },
  proto: { label: 'gRPC', icon: 'symbol-interface', apiType: 'grpc' },
  opencli: { label: 'OpenCLI', icon: 'terminal', apiType: 'opencli' },
  otm: { label: 'Threat model', icon: 'shield' },
  openslo: { label: 'OpenSLO', icon: 'target' },
  adr: { label: 'ADR', icon: 'notebook' },
};

export interface SpecFileInfo {
  /** Workspace-relative path. */
  path: string;
  kind: SpecFileKind;
  name: string;
}

/** What an entity says about itself, with references and paths resolved (entities of any file). */
export interface EntitySummary {
  key: string;
  kind: string;
  category: Category;
  namespace: string;
  name: string;
  title?: string;
  description?: string;
  type?: string;
  /** Workspace path of the catalog file. */
  file: string;
  /** Workspace path of an API definition (`$text` and friends). */
  definition?: string;
  specs: string[];
  threatModels: string[];
  /** Reference fields, resolved to entity keys, with the relationship written for a `dependsOn` entry. */
  relations: Relation[];
  /** Networks: the threat model trust zone they stand for. */
  trustZone?: { path: string; id: string };
  /** Repositories: where they are. */
  repository?: RepositoryInfo;
  /** Path of the code inside the linked repository. */
  repositoryPath?: string;
}

export interface Relation {
  field: string;
  /** Entity key. */
  target: string;
  /** What the entity does with a dependency, when written (see `RELATIONSHIPS_ANNOTATION`). */
  label?: string;
}

/** Trust zones and components of an Open Threat Model file, to correlate networks with trust zones. */
export interface ThreatModelOutline {
  /** Workspace path. */
  path: string;
  name: string;
  trustZones: { id: string; name: string; type?: string; trustRating?: number; parent?: string; description?: string }[];
  /** Components with the trust zone enclosing them. */
  components: { id: string; name: string; trustZone?: string }[];
}

export interface RepositoryInfo {
  provider?: string;
  url?: string;
  branch?: string;
}

/** Computed by the extension host and sent to the form. */
export interface CatalogContext {
  /** Workspace path of the edited file. */
  file: string;
  specFiles: SpecFileInfo[];
  /** Entities of the other catalog files of the workspace folder. */
  entities: EntitySummary[];
  catalogFiles: string[];
  threatModels: ThreatModelOutline[];
  /** Whether each workspace path referenced by the edited file exists. */
  files: Record<string, boolean>;
  /** Folder exported diagrams are written to (setting `sdd.backstage.diagramsFolder`). */
  diagramsFolder?: string;
  /** Consolidated view of every catalog file of the workspace folder. */
  consolidated?: {
    /** Name of the workspace folder. */
    folder: string;
    /** Catalog files that could not be read, so their entities are missing. */
    brokenFiles: { path: string; line?: number; message: string }[];
  };
}

/* Documents and entities --------------------------------------------------- */

export interface EntityInfo {
  /** Document index in the file. */
  index: number;
  entity: JsonObject;
  kind: string;
  category: Category;
  name: string;
  namespace: string;
}

export const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

export const entityPath = (index: number, ...rest: SpecPath): SpecPath => [DOCUMENTS_KEY, index, ...rest];

/** Consolidated view: the form sees `{ documents, files }`, `files[i]` being the catalog file of document `i`. */
export const FILES_KEY = 'files';

export function documentFiles(spec: unknown): string[] | undefined {
  const files = getIn(spec, [FILES_KEY]);
  return Array.isArray(files) ? files.map(str) : undefined;
}

/** Workspace path of the catalog file holding document `index` (the edited file outside the consolidated view). */
export const fileOfDocument = (spec: unknown, index: number, context: { file: string } | undefined): string => documentFiles(spec)?.[index] ?? context?.file ?? '';

export const dirOfDocument = (spec: unknown, index: number, context: { file: string } | undefined): string => dirOf(fileOfDocument(spec, index, context));

export function documentsOf(spec: unknown): Json[] {
  const list = getIn(spec, [DOCUMENTS_KEY]);
  return Array.isArray(list) ? list : [];
}

export function categoryOf(entity: unknown): Category {
  const kind = str(getIn(entity, ['kind'])).toLowerCase();
  if (kind === 'resource') return RESOURCE_CATEGORIES[str(getIn(entity, ['spec', 'type']))] ?? 'resource';
  const found = (Object.keys(CATEGORIES) as Category[]).find((c) => c !== 'other' && CATEGORIES[c].kind !== 'Resource' && CATEGORIES[c].kind.toLowerCase() === kind);
  return found ?? 'other';
}

const infoOf = (entity: JsonObject, index: number): EntityInfo => ({
  index,
  entity,
  kind: str(entity.kind),
  category: categoryOf(entity),
  name: str(getIn(entity, ['metadata', 'name'])),
  namespace: str(getIn(entity, ['metadata', 'namespace'])) || DEFAULT_NAMESPACE,
});

/** Entities of the file; empty documents (e.g. after a trailing `---`) are skipped. */
export function entitiesOf(spec: unknown): EntityInfo[] {
  return documentsOf(spec).flatMap((doc, index) => (isObject(doc) ? [infoOf(doc, index)] : []));
}

export function entityAt(spec: unknown, index: number): EntityInfo | undefined {
  const doc = documentsOf(spec)[index];
  return isObject(doc) ? infoOf(doc, index) : undefined;
}

export function entityLabel(entity: unknown, fallback = '(unnamed)'): string {
  return str(getIn(entity, ['metadata', 'title'])).trim() || str(getIn(entity, ['metadata', 'name'])).trim() || fallback;
}

export const entityKey = (kind: string, namespace: string, name: string) =>
  `${kind.toLowerCase()}:${(namespace || DEFAULT_NAMESPACE).toLowerCase()}/${name.toLowerCase()}`;

export const keyOf = (info: { kind: string; namespace: string; name: string }) => entityKey(info.kind, info.namespace, info.name);

/* Entity references -------------------------------------------------------- */

export interface EntityRef {
  kind?: string;
  namespace?: string;
  name: string;
}

export function parseRef(text: string): EntityRef | undefined {
  const match = /^(?:([A-Za-z][A-Za-z0-9-]*):)?(?:([A-Za-z0-9][A-Za-z0-9-]*)\/)?([A-Za-z0-9][A-Za-z0-9_.-]*)$/.exec(text.trim());
  if (!match) return undefined;
  return { kind: match[1], namespace: match[2], name: match[3] };
}

/**
 * Entities a reference typed by a person or an assistant may stand for: kind and namespace are
 * optional (an exact namespace match wins over other namespaces), names ignore case.
 */
export function matchEntities<T extends { kind: string; namespace: string; name: string }>(text: string, entities: T[]): T[] {
  const ref = parseRef(text);
  if (!ref) return [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const named = entities.filter((e) => same(e.name, ref.name) && (!ref.kind || same(e.kind, ref.kind)));
  const namespace = ref.namespace ?? DEFAULT_NAMESPACE;
  const exact = named.filter((e) => same(e.namespace || DEFAULT_NAMESPACE, namespace));
  return exact.length || ref.namespace ? exact : named;
}

/** Shortest reference from an entity in `fromNamespace` to the target, given the field's default kind. */
export function formatRef(target: { kind: string; namespace: string; name: string }, defaultKind: string | undefined, fromNamespace = DEFAULT_NAMESPACE): string {
  const kind = defaultKind && defaultKind.toLowerCase() === target.kind.toLowerCase() ? '' : `${target.kind.toLowerCase()}:`;
  const namespace = target.namespace.toLowerCase() === fromNamespace.toLowerCase() ? '' : `${target.namespace}/`;
  return `${kind}${namespace}${target.name}`;
}

export interface RefField {
  /** Path below `spec`, or the relation name when `annotation` is set. */
  field: string;
  /** Written in this annotation instead of `spec` (relations Backstage has no field for). */
  annotation?: string;
  /** Only for these categories of the kind (e.g. "produced by" for artifacts). */
  categories?: Category[];
  /** Categories the reference is expected to point to (e.g. repositories among resources). */
  targetCategories?: Category[];
  label: string;
  many: boolean;
  required?: boolean;
  /** Kind used when the reference has none; without it the kind must be written. */
  defaultKind?: string;
  /** Lowercase kinds the reference may point to. */
  allowed: string[];
  /** Name of the relation seen from the target, e.g. "Owns". */
  reverse: string;
}

const OWNER: RefField = { field: 'owner', label: 'Owner', many: false, required: true, defaultKind: 'Group', allowed: ['group', 'user'], reverse: 'Owns' };
const SYSTEM: RefField = { field: 'system', label: 'System', many: false, defaultKind: 'System', allowed: ['system'], reverse: 'Contains' };
const DEPENDS_ON: RefField = { field: 'dependsOn', label: 'Depends on', many: true, allowed: ['component', 'resource'], reverse: 'Used by' };
const DEPENDENCY_OF: RefField = { field: 'dependencyOf', label: 'Dependency of', many: true, allowed: ['component', 'resource'], reverse: 'Depends on' };
const REPOSITORY: RefField = {
  field: 'repository',
  annotation: REPOSITORY_ANNOTATION,
  label: 'Repository',
  many: false,
  defaultKind: 'Resource',
  allowed: ['resource'],
  reverse: 'Holds code for',
  targetCategories: ['repository'],
  categories: ['component', 'api', 'resource', 'artifact', 'network', 'platform', 'infrastructure'],
};
const PRODUCED_BY: RefField = {
  field: 'producedBy',
  annotation: PRODUCED_BY_ANNOTATION,
  label: 'Produced by',
  many: false,
  defaultKind: 'Component',
  allowed: ['component', 'system', 'group', 'user', 'resource'],
  reverse: 'Produces',
  categories: ['artifact'],
  targetCategories: ['component', 'system', 'group', 'user', 'repository'],
};
const SITE: RefField = {
  field: 'site',
  annotation: SITE_ANNOTATION,
  label: 'Site',
  many: false,
  defaultKind: 'Resource',
  allowed: ['resource'],
  targetCategories: ['site'],
  categories: ['network', 'platform', 'infrastructure'],
  reverse: 'Hosts',
};
/** The only many-valued reference field written as a comma-separated annotation, not a spec list. */
const DEPLOYED_ON: RefField = {
  field: 'deployedOn',
  annotation: DEPLOYED_ON_ANNOTATION,
  label: 'Deployed on',
  many: true,
  defaultKind: 'Resource',
  allowed: ['resource'],
  targetCategories: ['platform', 'infrastructure'],
  categories: ['component', 'resource'],
  reverse: 'Deployed here',
};

export const REF_FIELDS: Record<string, RefField[]> = {
  component: [
    OWNER,
    SYSTEM,
    { field: 'subcomponentOf', label: 'Part of component', many: false, defaultKind: 'Component', allowed: ['component'], reverse: 'Subcomponents' },
    { field: 'providesApis', label: 'Provides APIs', many: true, defaultKind: 'API', allowed: ['api'], reverse: 'Provided by' },
    { field: 'consumesApis', label: 'Consumes APIs', many: true, defaultKind: 'API', allowed: ['api'], reverse: 'Consumed by' },
    DEPENDS_ON,
    DEPENDENCY_OF,
    REPOSITORY,
    DEPLOYED_ON,
  ],
  api: [OWNER, SYSTEM, REPOSITORY],
  resource: [OWNER, SYSTEM, DEPENDS_ON, DEPENDENCY_OF, REPOSITORY, PRODUCED_BY, SITE, DEPLOYED_ON],
  system: [OWNER, { field: 'domain', label: 'Domain', many: false, defaultKind: 'Domain', allowed: ['domain'], reverse: 'Systems' }],
  domain: [OWNER, { field: 'subdomainOf', label: 'Part of domain', many: false, defaultKind: 'Domain', allowed: ['domain'], reverse: 'Subdomains' }],
  group: [
    { field: 'parent', label: 'Parent group', many: false, defaultKind: 'Group', allowed: ['group'], reverse: 'Child groups' },
    { field: 'children', label: 'Child groups', many: true, required: true, defaultKind: 'Group', allowed: ['group'], reverse: 'Parent group' },
    { field: 'members', label: 'Members', many: true, defaultKind: 'User', allowed: ['user'], reverse: 'Member of' },
  ],
  user: [{ field: 'memberOf', label: 'Member of', many: true, required: true, defaultKind: 'Group', allowed: ['group'], reverse: 'Members' }],
};

/** Reference fields of a kind; with a category, only those that apply to it. */
export const refFieldsOf = (kind: string, category?: Category): RefField[] =>
  (REF_FIELDS[kind.toLowerCase()] ?? []).filter((f) => !category || !f.categories || f.categories.includes(category));

export const refField = (kind: string, field: string) => refFieldsOf(kind).find((f) => f.field === field);

/** Where a reference field is written in an entity. */
export const refValuePath = (field: RefField): SpecPath => (field.annotation ? ['metadata', 'annotations', field.annotation] : ['spec', field.field]);

/** Key of the entity a reference points to, or undefined when it is not a valid reference. */
export function refTarget(text: string, field: RefField, fromNamespace: string): string | undefined {
  const ref = parseRef(text);
  const kind = ref?.kind ?? field.defaultKind;
  if (!ref || !kind) return undefined;
  return entityKey(kind, ref.namespace ?? fromNamespace, ref.name);
}

export const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

/** Every reference written by an entity: field, position in a list, text. */
export function refsOf(info: EntityInfo): { field: RefField; position?: number; text: string }[] {
  return refFieldsOf(info.kind, info.category).flatMap((field) => {
    const value = getIn(info.entity, refValuePath(field));
    if (field.many) {
      // A many-valued annotation (e.g. deployedOn) is a comma-separated string, not a JSON list.
      if (field.annotation) return splitList(value).map((text, position) => ({ field, position, text }));
      return Array.isArray(value) ? value.map((v, position) => ({ field, position, text: str(v) })) : [];
    }
    return typeof value === 'string' && value.trim() ? [{ field, text: value }] : [];
  });
}

/* Relationships ------------------------------------------------------------ */

/*
 * What an entity does with what it depends on. Backstage's `dependsOn` only lists references, so
 * when the default does not say it (an entity runs in a network and uses anything else), the
 * relationship is written in the `sdd-studio/relationships` annotation of the entity depending on
 * the other one, the relationship before the reference:
 * `uses resource:internet, reads from resource:orders-db`.
 */

export const RUNS_IN = 'runs in';
export const USES = 'uses';

/** Relationships offered when linking, with how each one reads from the other end. */
export const RELATIONSHIPS: { label: string; reverse: string }[] = [
  { label: RUNS_IN, reverse: 'hosts' },
  { label: USES, reverse: 'used by' },
  { label: 'connects to', reverse: 'reached by' },
  { label: 'calls', reverse: 'called by' },
  { label: 'reads from', reverse: 'read by' },
  { label: 'writes to', reverse: 'written to by' },
  { label: 'reads and writes', reverse: 'read and written by' },
  { label: 'publishes to', reverse: 'receives from' },
  { label: 'subscribes to', reverse: 'delivers to' },
  { label: 'deploys to', reverse: 'deployed by' },
];

export const defaultRelationship = (target: { category: Category }) => (target.category === 'network' ? RUNS_IN : USES);

/** A relationship as it is written: single spaces, and no commas (they separate the entries). */
export const cleanRelationship = (text: string) => text.replace(/[\s,]+/g, ' ').trim();

/** How the other end reads a relationship ("used by"), or '' for one written in words of its own. */
export const reverseRelationship = (label: string) => RELATIONSHIPS.find((r) => r.label === cleanRelationship(label).toLowerCase())?.reverse ?? '';

/** Entries of the relationships annotation; `label` is empty when an entry has no reference after it. */
export function relationshipEntries(entity: unknown): { label: string; text: string; written: string }[] {
  return annotationList(entity, RELATIONSHIPS_ANNOTATION).map((written) => {
    const match = /^(.*\S)\s+(\S+)$/.exec(written);
    return match ? { label: cleanRelationship(match[1]), text: match[2], written } : { label: '', text: written, written };
  });
}

/** What a relation says the entity does with `target`: the relationship written, else the default. */
export const relationshipOf = (relation: { label?: string }, target: { category: Category }) => relation.label || defaultRelationship(target);

/** Whether a relation places the entity in a network: it depends on it and runs in it, rather than using it. */
export const runsIn = (relation: { field: string; label?: string }, target: { category: Category }) =>
  relation.field === 'dependsOn' && target.category === 'network' && relationshipOf(relation, target).toLowerCase() === RUNS_IN;

/* Paths -------------------------------------------------------------------- */

/** Workspace path helpers, shared with the other modules. */
export { dirOf, isUrl, relativePath, resolvePath } from '../../../shared/files';

export const splitList = (value: unknown): string[] => str(value).split(',').map((v) => v.trim()).filter(Boolean);

export const annotationList = (entity: unknown, key: string) => splitList(getIn(entity, ['metadata', 'annotations', key]));

/** Relative path of an API definition written as `$text: ./file` (or `$json` / `$yaml`). */
export function definitionRef(entity: unknown): string | undefined {
  const definition = getIn(entity, ['spec', 'definition']);
  if (!isObject(definition)) return undefined;
  const value = definition.$text ?? definition.$yaml ?? definition.$json;
  return typeof value === 'string' ? value : undefined;
}

/** Resolved summary of an entity of the file at workspace path `file`. */
export function summarizeEntity(info: EntityInfo, file: string): EntitySummary {
  const dir = dirOf(file);
  const resolveAll = (list: string[]) => list.flatMap((p) => resolvePath(dir, p) ?? []);
  const definition = definitionRef(info.entity);
  const title = str(getIn(info.entity, ['metadata', 'title']));
  const description = str(getIn(info.entity, ['metadata', 'description']));
  const type = str(getIn(info.entity, ['spec', 'type']));
  const annotation = (key: string) => str(getIn(info.entity, ['metadata', 'annotations', key])).trim();
  const zone = trustZoneRef(info.entity, dir);
  const repositoryPath = annotation(REPOSITORY_PATH_ANNOTATION);
  const relationships = relationshipEntries(info.entity);
  return {
    key: keyOf(info),
    kind: info.kind,
    category: info.category,
    namespace: info.namespace,
    name: info.name,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(type ? { type } : {}),
    file,
    ...(definition && resolvePath(dir, definition) ? { definition: resolvePath(dir, definition) } : {}),
    specs: resolveAll(annotationList(info.entity, SPECS_ANNOTATION)),
    threatModels: resolveAll(annotationList(info.entity, THREAT_MODELS_ANNOTATION)),
    relations: refsOf(info).flatMap((r): Relation[] => {
      const target = refTarget(r.text, r.field, info.namespace);
      if (!target) return [];
      const label = r.field.field === 'dependsOn' ? relationships.find((e) => e.label && refTarget(e.text, r.field, info.namespace) === target)?.label : undefined;
      return [{ field: r.field.field, target, ...(label ? { label } : {}) }];
    }),
    ...(zone?.path ? { trustZone: { path: zone.path, id: zone.id } } : {}),
    ...(info.category === 'repository'
      ? {
          repository: Object.fromEntries(
            ([['provider', PROVIDER_ANNOTATION], ['url', REPOSITORY_URL_ANNOTATION], ['branch', BRANCH_ANNOTATION]] as const).flatMap(([k, a]) => (annotation(a) ? [[k, annotation(a)]] : [])),
          ) as RepositoryInfo,
        }
      : {}),
    ...(repositoryPath ? { repositoryPath } : {}),
  };
}

/** Entities of this file (with their index) followed by those of the other catalog files. */
export interface KnownEntity extends EntitySummary {
  index?: number;
}

export function knownEntities(spec: unknown, context: CatalogContext | undefined): KnownEntity[] {
  const local = entitiesOf(spec).map((info) => ({ ...summarizeEntity(info, fileOfDocument(spec, info.index, context)), index: info.index }));
  return [...local, ...(context?.entities ?? [])];
}

export const summaryLabel = (e: EntitySummary) => e.title || e.name;

/* Hierarchy ---------------------------------------------------------------- */

/** Fields placing an entity below another one in the outline, by priority. */
export const PARENT_FIELDS = ['subcomponentOf', 'system', 'subdomainOf', 'domain', 'parent'];

/**
 * The relation placing an entity below another one (subcomponent, system, domain, parent group). A
 * network sits in the first network it depends on, which needs the known entities to tell networks
 * apart.
 */
export function parentRelation(summary: EntitySummary, known: EntitySummary[] = []): { field: string; target: string } | undefined {
  if (summary.category === 'network') {
    const parent = summary.relations.find((r) => r.field === 'dependsOn' && known.some((e) => e.key === r.target && e.category === 'network'));
    if (parent) return parent;
  }
  return PARENT_FIELDS.flatMap((field) => summary.relations.filter((r) => r.field === field)).at(0);
}

/** Parent in the hierarchy, as an entity key (see `parentRelation`). */
export function parentKey(summary: EntitySummary, known: EntitySummary[] = []): string | undefined {
  return parentRelation(summary, known)?.target;
}

/** Ancestors of an entity (closest first), stopping on loops. */
export function ancestors(key: string, known: EntitySummary[]): EntitySummary[] {
  const byKey = new Map(known.map((e) => [e.key, e]));
  const result: EntitySummary[] = [];
  const seen = new Set([key]);
  let next = byKey.get(key) && parentKey(byKey.get(key)!, known);
  while (next && !seen.has(next)) {
    seen.add(next);
    const entity = byKey.get(next);
    if (!entity) break;
    result.push(entity);
    next = parentKey(entity, known);
  }
  return result;
}

/** Entities pointing to `key`, with the field used and the relationship written. */
export function incoming(key: string, known: KnownEntity[]): { entity: KnownEntity; field: string; label?: string }[] {
  return known.flatMap((entity) => entity.relations.filter((r) => r.target === key).map((r) => ({ entity, field: r.field, ...(r.label ? { label: r.label } : {}) })));
}

/** Threat models applying to an entity: its own, then those of its ancestors (system, domain...). */
export function threatModelsFor(key: string, known: KnownEntity[]): { path: string; from?: KnownEntity }[] {
  const self = known.find((e) => e.key === key);
  const result: { path: string; from?: KnownEntity }[] = (self?.threatModels ?? []).map((path) => ({ path }));
  for (const ancestor of ancestors(key, known)) {
    for (const path of ancestor.threatModels) if (!result.some((r) => r.path === path)) result.push({ path, from: ancestor });
  }
  return result;
}

/** Spec files an entity implements: definitions of the APIs it provides, then its linked specs. */
export function specsFor(key: string, known: KnownEntity[]): { path: string; api?: KnownEntity }[] {
  const self = known.find((e) => e.key === key);
  if (!self) return [];
  const apis = self.relations
    .filter((r) => r.field === 'providesApis')
    .flatMap((r) => known.filter((e) => e.key === r.target && e.definition).map((api) => ({ path: api.definition!, api })));
  if (self.category === 'api' && self.definition) apis.unshift({ path: self.definition, api: self });
  return [...apis, ...self.specs.filter((p) => !apis.some((a) => a.path === p)).map((path) => ({ path }))];
}

/* Networks, trust zones and repositories ----------------------------------- */

/** `../threat-models/shop.otm.yaml#private`: threat model file (resolved) and trust zone id. */
export function trustZoneRef(entity: unknown, dir: string): { written: string; path?: string; id: string } | undefined {
  const written = str(getIn(entity, ['metadata', 'annotations', TRUST_ZONE_ANNOTATION])).trim();
  if (!written) return undefined;
  const hash = written.lastIndexOf('#');
  const file = hash < 0 ? written : written.slice(0, hash);
  return { written, path: resolvePath(dir, file), id: hash < 0 ? '' : written.slice(hash + 1) };
}

export const formatTrustZoneRef = (dir: string, path: string, id: string) => `${relativePath(dir, path)}#${id}`;

/** Networks an entity runs in: its `dependsOn` entries pointing to networks, except the ones it only uses or connects to. */
export const networksOf = (summary: EntitySummary, known: EntitySummary[]): EntitySummary[] =>
  summary.relations.flatMap((r) => known.filter((e) => e.key === r.target && runsIn(r, e)));

/** The component of a threat model standing for a catalog entity: same id as the name, or same name as the title. */
export function matchThreatModelComponent(summary: EntitySummary, outline: ThreatModelOutline) {
  const lower = (t?: string) => (t ?? '').trim().toLowerCase();
  return (
    outline.components.find((c) => c.id.toLowerCase() === summary.name.toLowerCase()) ??
    outline.components.find((c) => lower(c.name) && (lower(c.name) === lower(summary.title) || lower(c.name) === lower(summary.name)))
  );
}

export interface Placement {
  outline: ThreatModelOutline;
  component: ThreatModelOutline['components'][number];
  /** Networks standing for the trust zone the threat model places the component in. */
  expected: EntitySummary[];
  /** Networks of the entity standing for trust zones of this threat model. */
  actual: EntitySummary[];
  matches: boolean;
}

/**
 * How the threat models applying to an entity place it, compared with the networks it runs in.
 * Only threat models with a component standing for the entity are considered.
 */
export function placementsOf(key: string, known: KnownEntity[], context: CatalogContext | undefined): Placement[] {
  const self = known.find((e) => e.key === key);
  if (!self || !context || !['component', 'resource'].includes(self.category)) return [];
  const networks = known.filter((e) => e.category === 'network');
  const mine = networksOf(self, known);
  return threatModelsFor(key, known).flatMap(({ path }) => {
    const outline = context.threatModels.find((t) => t.path === path);
    const component = outline && matchThreatModelComponent(self, outline);
    if (!outline || !component) return [];
    const expected = networks.filter((n) => n.trustZone?.path === path && n.trustZone.id === component.trustZone);
    // Networks pointing to a trust zone the threat model does not have are reported on the network itself.
    const actual = mine.filter((n) => n.trustZone?.path === path && outline.trustZones.some((z) => z.id === n.trustZone!.id));
    // Not placed in a network of this threat model (or no trust zone to compare with) is not a mismatch.
    const matches = !component.trustZone || actual.length === 0 || actual.some((n) => n.trustZone!.id === component.trustZone);
    return [{ outline, component, expected, actual, matches }];
  });
}

/**
 * `backstage.io/source-location` for code at `path` in a repository, following the URL layout of
 * the provider. Undefined when it cannot be written (no web URL, unknown layout for a sub-path).
 */
export function sourceLocation(repository: RepositoryInfo | undefined, path?: string): string | undefined {
  const url = repository?.url?.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  const sub = (path ?? '').trim().replace(/^\.?\/+/, '').replace(/\/+$/, '');
  const branch = repository?.branch?.trim() || 'HEAD';
  if (!sub && !repository?.branch?.trim()) return `url:${url}/`;
  switch ((repository?.provider ?? '').toLowerCase()) {
    case 'github':
    case 'gitea':
      return `url:${url}/tree/${branch}/${sub ? `${sub}/` : ''}`;
    case 'gitlab':
      return `url:${url}/-/tree/${branch}/${sub ? `${sub}/` : ''}`;
    case 'bitbucket':
      return `url:${url}/src/${branch}/${sub ? `${sub}/` : ''}`;
    default:
      return sub ? undefined : `url:${url}/`;
  }
}

/** Repository holding the code of an entity, and the source location it gives. */
export function codeLocationOf(summary: EntitySummary, known: EntitySummary[]): { repository?: EntitySummary; location?: string } {
  const target = summary.relations.find((r) => r.field === 'repository')?.target;
  const repository = target ? known.find((e) => e.key === target) : undefined;
  return { repository, location: repository ? sourceLocation(repository.repository, summary.repositoryPath) : undefined };
}
