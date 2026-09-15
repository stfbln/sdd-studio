/**
 * What the software catalog knows about an entity, gathered to start a new spec file or threat
 * model for it (see `scaffold.ts`, which writes the file from this brief).
 */
import { slugify } from '../../../shared/naming';
import { getIn, isObject, type JsonObject, type SpecEdit } from '../../../shared/structured/edits';
import { linkSpecFileEdits, setAnnotationEdits, setDefinitionEdits } from './edits';
import {
  ancestors,
  CLASSIFICATION_LABEL,
  codeLocationOf,
  dirOfDocument,
  documentsOf,
  entityAt,
  formatTrustZoneRef,
  incoming,
  knownEntities,
  networksOf,
  parentKey,
  SOURCE_LOCATION_ANNOTATION,
  specsFor,
  SPEC_FILE_KINDS,
  str,
  stringList,
  threatModelsFor,
  TRUST_ZONE_ANNOTATION,
  type CatalogContext,
  type Category,
  type KnownEntity,
  type SpecFileInfo,
  type SpecFileKind,
} from './model';

export interface BriefRef {
  name: string;
  /** Title, else name. */
  title: string;
  kind: string;
  category: Category;
  type?: string;
  description?: string;
  /** Workspace path of the catalog file defining it. */
  file: string;
}

export interface BriefApi extends BriefRef {
  /** Workspace path of its definition. */
  definition?: string;
}

export interface EntityBrief {
  entity: BriefRef & { namespace: string; lifecycle?: string; tags: string[]; links: { url: string; title?: string }[] };
  owner?: BriefRef & { email?: string };
  system?: BriefRef;
  domain?: BriefRef;
  /** Parent component or domain. */
  parent?: BriefRef;
  /** Web address of the code. */
  code?: string;
  providesApis: BriefApi[];
  consumesApis: BriefApi[];
  /** Components providing or consuming this API. */
  providedBy: BriefRef[];
  consumedBy: BriefRef[];
  /** Components and resources it depends on, and those depending on it. */
  dependsOn: BriefRef[];
  usedBy: BriefRef[];
  networks: BriefRef[];
  dataAssets: (BriefRef & { classification?: string })[];
  /** Systems of a domain, parts of a system, subcomponents of a component. */
  parts: BriefRef[];
  /** Linked spec files (and the definition of an API). */
  specs: { path: string; title: string }[];
  /** Threat models applying to it, inherited ones included. */
  threatModels: { path: string; title: string }[];
}

/** Open Threat Model elements standing for the part of the catalog a threat model covers. */
export interface ThreatModelDraft {
  trustZones: JsonObject[];
  components: JsonObject[];
  dataflows: JsonObject[];
  assets: JsonObject[];
  representations: JsonObject[];
  /** Networks of this file standing for no trust zone yet, and the trust zone created for each. */
  networkLinks: { index: number; zoneId: string }[];
}

export interface NewSpecFileRequest {
  kind: SpecFileKind;
  title: string;
  brief: EntityBrief;
  threatModel?: ThreatModelDraft;
}

const uniqueBy = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map((i) => [key(i), i])).values()];

/** Plain components and resources: what a threat model shows as components. */
const isSystemPart = (e: KnownEntity) => e.category === 'component' || e.category === 'resource';

function refOf(e: KnownEntity): BriefRef {
  return {
    name: e.name,
    title: e.title || e.name,
    kind: e.kind,
    category: e.category,
    ...(e.type ? { type: e.type } : {}),
    ...(e.description ? { description: e.description } : {}),
    file: e.file,
  };
}

/** The document of an entity of the edited file, when it is one. */
const docOf = (spec: unknown, e: KnownEntity) => (e.index === undefined ? undefined : documentsOf(spec)[e.index]);

const classificationOf = (spec: unknown, e: KnownEntity) => str(getIn(docOf(spec, e), ['metadata', 'labels', CLASSIFICATION_LABEL])) || undefined;

/** Entities pointing to `key` through one of `fields`. */
const incomingThrough = (key: string, known: KnownEntity[], fields: string[]) => incoming(key, known).filter((r) => fields.includes(r.field)).map((r) => r.entity);

/** Entities `e` points to through `field`. */
const targetsOf = (e: KnownEntity, known: KnownEntity[], field: string) => e.relations.filter((r) => r.field === field).flatMap((r) => known.filter((k) => k.key === r.target));

/** Entities below `root` through `fields` (subcomponents of subcomponents...), without `root`. */
function descendants(root: KnownEntity, known: KnownEntity[], fields: string[]): KnownEntity[] {
  const found = new Map<string, KnownEntity>();
  const queue = [root];
  while (queue.length) {
    for (const child of incomingThrough(queue.shift()!.key, known, fields)) {
      if (child.key === root.key || found.has(child.key)) continue;
      found.set(child.key, child);
      queue.push(child);
    }
  }
  return [...found.values()];
}

export function entityBrief(spec: unknown, index: number, context: CatalogContext | undefined): EntityBrief | undefined {
  const info = entityAt(spec, index);
  if (!info) return undefined;
  const known = knownEntities(spec, context);
  const self = known.find((e) => e.index === index);
  if (!self) return undefined;
  const one = (field: string) => targetsOf(self, known, field)[0];
  const refs = (list: KnownEntity[]) => uniqueBy(list, (e) => e.key).map(refOf);
  const api = (e: KnownEntity): BriefApi => ({ ...refOf(e), ...(e.definition ? { definition: e.definition } : {}) });

  const owner = one('owner');
  const email = owner && str(getIn(docOf(spec, owner), ['spec', 'profile', 'email']));
  const system = one('system');
  const domain = one('domain') ?? (system && targetsOf(system, known, 'domain')[0]);
  const parent = one('subcomponentOf') ?? one('subdomainOf');
  const written = str(getIn(info.entity, ['metadata', 'annotations', SOURCE_LOCATION_ANNOTATION])) || codeLocationOf(self, known).location;
  const code = written?.replace(/^url:/, '');
  const dependencies = targetsOf(self, known, 'dependsOn');
  const links = getIn(info.entity, ['metadata', 'links']);
  const title = (path: string) => context?.specFiles.find((f) => f.path === path)?.name || path.slice(path.lastIndexOf('/') + 1);

  const partFields: Partial<Record<Category, string[]>> = { domain: ['domain', 'subdomainOf'], system: ['system'], component: ['subcomponentOf'] };
  const parts = incomingThrough(self.key, known, partFields[self.category] ?? []);

  return {
    entity: {
      ...refOf(self),
      namespace: info.namespace,
      ...(str(getIn(info.entity, ['spec', 'lifecycle'])) ? { lifecycle: str(getIn(info.entity, ['spec', 'lifecycle'])) } : {}),
      tags: stringList(getIn(info.entity, ['metadata', 'tags'])),
      links: (Array.isArray(links) ? links : []).flatMap((l) => (isObject(l) && str(l.url) ? [{ url: str(l.url), ...(str(l.title) ? { title: str(l.title) } : {}) }] : [])),
    },
    ...(owner ? { owner: { ...refOf(owner), ...(email ? { email } : {}) } } : {}),
    ...(system ? { system: refOf(system) } : {}),
    ...(domain ? { domain: refOf(domain) } : {}),
    ...(parent ? { parent: refOf(parent) } : {}),
    ...(code ? { code } : {}),
    providesApis: uniqueBy(targetsOf(self, known, 'providesApis'), (e) => e.key).map(api),
    consumesApis: uniqueBy(targetsOf(self, known, 'consumesApis'), (e) => e.key).map(api),
    providedBy: refs(incomingThrough(self.key, known, ['providesApis'])),
    consumedBy: refs(incomingThrough(self.key, known, ['consumesApis'])),
    dependsOn: refs(dependencies.filter(isSystemPart)),
    usedBy: refs(incomingThrough(self.key, known, ['dependsOn']).filter(isSystemPart)),
    networks: refs(networksOf(self, known) as KnownEntity[]),
    dataAssets: uniqueBy(dependencies.filter((e) => e.category === 'dataAsset'), (e) => e.key).map((e) => ({ ...refOf(e), ...(classificationOf(spec, e) ? { classification: classificationOf(spec, e) } : {}) })),
    parts: refs(parts),
    // Definitions of provided APIs are listed with the APIs.
    specs: specsFor(self.key, known).filter((s) => !s.api || s.api.key === self.key).map((s) => ({ path: s.path, title: title(s.path) })),
    threatModels: threatModelsFor(self.key, known).map((t) => ({ path: t.path, title: title(t.path) })),
  };
}

/* Threat models ------------------------------------------------------------ */

/** Components and resources a threat model of `root` is about. */
function coveredBy(root: KnownEntity, known: KnownEntity[]): KnownEntity[] {
  const withSubcomponents = (list: KnownEntity[]) => [...list, ...list.flatMap((e) => (e.category === 'component' ? descendants(e, known, ['subcomponentOf']) : []))];
  switch (root.category) {
    case 'component':
      return withSubcomponents([root]);
    case 'resource':
      return [root];
    case 'system':
      return withSubcomponents(incomingThrough(root.key, known, ['system']).filter(isSystemPart));
    case 'domain': {
      const domains = [root, ...descendants(root, known, ['subdomainOf']).filter((e) => e.category === 'domain')];
      const systems = domains.flatMap((d) => incomingThrough(d.key, known, ['domain']));
      return withSubcomponents(systems.flatMap((s) => incomingThrough(s.key, known, ['system']).filter(isSystemPart)));
    }
    case 'api':
      return withSubcomponents(incomingThrough(root.key, known, ['providesApis']));
    case 'dataAsset':
      return [...incomingThrough(root.key, known, ['dependsOn']), ...targetsOf(root, known, 'dependsOn')].filter(isSystemPart);
    case 'network': {
      const networks = [root, ...descendants(root, known, ['dependsOn']).filter((e) => e.category === 'network')];
      return networks.flatMap((n) => incomingThrough(n.key, known, ['dependsOn'])).filter(isSystemPart);
    }
    case 'artifact':
      return [...incomingThrough(root.key, known, ['dependsOn']), ...targetsOf(root, known, 'producedBy')].filter(isSystemPart);
    default:
      return [];
  }
}

/** What talks to the covered entities: their dependencies, the providers of the APIs they use, and their users. */
function neighboursOf(covered: KnownEntity[], known: KnownEntity[]): KnownEntity[] {
  return covered.flatMap((e) => [
    ...targetsOf(e, known, 'dependsOn'),
    ...targetsOf(e, known, 'consumesApis').flatMap((api) => incomingThrough(api.key, known, ['providesApis'])),
    ...incomingThrough(e.key, known, ['dependsOn']),
    ...targetsOf(e, known, 'providesApis').flatMap((api) => incomingThrough(api.key, known, ['consumesApis'])),
  ]).filter(isSystemPart);
}

const COMPONENT_TYPES: Record<string, string> = {
  service: 'web-service',
  website: 'web-application',
  'web-app': 'web-application',
  frontend: 'web-application',
  'mobile-app': 'mobile-client',
  database: 'database',
  queue: 'message-broker',
  topic: 'message-broker',
  'message-broker': 'message-broker',
  's3-bucket': 'storage',
  bucket: 'storage',
  storage: 'storage',
  'external-service': 'third-party-service',
  'identity-provider': 'identity-provider',
  'api-gateway': 'api-gateway',
};

/** Confidentiality of an asset from the classification of the data asset. */
const CONFIDENTIALITY: Record<string, number> = { public: 10, internal: 40, confidential: 70, restricted: 100 };

const FALLBACK_ZONE = 'not-placed';

/**
 * Trust zones, components, dataflows, assets and code representations of a new threat model for
 * the entity of document `index`: networks become trust zones (reusing the id of the trust zone a
 * network already stands for), components and resources become components placed in them, data
 * assets become assets, dependencies and API use become dataflows.
 */
export function threatModelDraft(spec: unknown, index: number, context: CatalogContext | undefined): ThreatModelDraft | undefined {
  const known = knownEntities(spec, context);
  const root = known.find((e) => e.index === index);
  if (!root) return undefined;
  const covered = uniqueBy(coveredBy(root, known), (e) => e.key);
  const elements = uniqueBy([...covered, ...neighboursOf(covered, known)], (e) => e.key);
  const taken: string[] = [];
  const claim = (wanted: string, fallback: string) => {
    let id = wanted && !taken.includes(wanted) ? wanted : slugify(wanted) || fallback;
    for (let i = 2; taken.includes(id); i++) id = `${slugify(wanted) || fallback}-${i}`;
    taken.push(id);
    return id;
  };

  // Networks the elements run in, with their parents.
  const networks = uniqueBy(
    elements.flatMap((e) => networksOf(e, known)).flatMap((n) => [n, ...ancestors(n.key, known).filter((a) => a.category === 'network')]) as KnownEntity[],
    (n) => n.key,
  );
  const zoneOf = new Map<string, string>();
  const trustZones: JsonObject[] = [];
  const networkLinks: ThreatModelDraft['networkLinks'] = [];
  const depth = (n: KnownEntity) => ancestors(n.key, known).filter((a) => a.category === 'network').length;
  for (const network of [...networks].sort((a, b) => depth(a) - depth(b))) {
    const zone = network.trustZone && context?.threatModels.find((t) => t.path === network.trustZone!.path)?.trustZones.find((z) => z.id === network.trustZone!.id);
    const id = claim(network.trustZone?.id || network.name, 'trust-zone');
    zoneOf.set(network.key, id);
    const parent = parentKey(network, known);
    const description = network.description ?? zone?.description;
    trustZones.push({
      name: zone?.name || network.title || network.name,
      id,
      ...(zone?.type ? { type: zone.type } : {}),
      ...(description ? { description } : {}),
      ...(parent && zoneOf.has(parent) ? { parent: { trustZone: zoneOf.get(parent)! } } : {}),
      risk: { trustRating: zone?.trustRating ?? 50 },
    });
    if (!network.trustZone && network.index !== undefined) networkLinks.push({ index: network.index, zoneId: id });
  }

  const componentId = new Map<string, string>();
  for (const e of elements) componentId.set(e.key, claim(e.name, e.category));

  // Data assets: processed by components, stored by resources (and by the resources a data asset depends on).
  const assetUse = new Map<string, { processed: Set<string>; stored: Set<string> }>();
  const assetsOf = (key: string) => assetUse.get(key) ?? assetUse.set(key, { processed: new Set(), stored: new Set() }).get(key)!;
  const dataAssets = new Map<string, KnownEntity>();
  for (const e of elements) {
    for (const asset of targetsOf(e, known, 'dependsOn').filter((t) => t.category === 'dataAsset')) {
      dataAssets.set(asset.key, asset);
      assetsOf(e.key)[e.category === 'resource' ? 'stored' : 'processed'].add(asset.name);
    }
  }
  for (const asset of known.filter((a) => a.category === 'dataAsset')) {
    for (const store of targetsOf(asset, known, 'dependsOn').filter((t) => componentId.has(t.key))) {
      dataAssets.set(asset.key, asset);
      assetsOf(store.key).stored.add(asset.name);
    }
  }

  let fallbackUsed = false;
  const components = elements.map((e): JsonObject => {
    const network = networksOf(e, known)[0];
    const parentComponent = targetsOf(e, known, 'subcomponentOf').find((p) => componentId.has(p.key));
    const parent: JsonObject = network
      ? { trustZone: zoneOf.get(network.key)! }
      : parentComponent
        ? { component: componentId.get(parentComponent.key)! }
        : ((fallbackUsed = true), { trustZone: FALLBACK_ZONE });
    const use = assetUse.get(e.key);
    const assets: JsonObject = use && (use.processed.size || use.stored.size) ? { assets: { ...(use.processed.size ? { processed: [...use.processed] } : {}), ...(use.stored.size ? { stored: [...use.stored] } : {}) } } : {};
    return {
      name: e.title || e.name,
      id: componentId.get(e.key)!,
      type: COMPONENT_TYPES[e.type ?? ''] ?? (e.type || 'generic'),
      ...(e.description ? { description: e.description } : {}),
      parent,
      ...assets,
    };
  });
  if (fallbackUsed) {
    const id = taken.includes(FALLBACK_ZONE) ? claim(FALLBACK_ZONE, 'trust-zone') : (taken.push(FALLBACK_ZONE), FALLBACK_ZONE);
    for (const c of components) if (isObject(c.parent) && c.parent.trustZone === FALLBACK_ZONE) c.parent = { trustZone: id };
    trustZones.push({ name: 'Not placed yet', id, description: 'Components whose networks are not recorded in the software catalog. Move them to their trust zone.', risk: { trustRating: 50 } });
  }

  // API use first: it names the dataflow better than a plain dependency between the same components.
  const dataflows: JsonObject[] = [];
  const flowIds: string[] = [];
  const pairs = new Set<string>();
  const addFlow = (from: KnownEntity, to: KnownEntity, name: string, description?: string) => {
    const source = componentId.get(from.key);
    const destination = componentId.get(to.key);
    if (!source || !destination || source === destination || pairs.has(`${source} ${destination}`)) return;
    pairs.add(`${source} ${destination}`);
    let id = `${source}-to-${destination}`;
    for (let i = 2; flowIds.includes(id); i++) id = `${source}-to-${destination}-${i}`;
    flowIds.push(id);
    dataflows.push({ name, id, ...(description ? { description } : {}), source, destination });
  };
  for (const e of elements) {
    for (const api of targetsOf(e, known, 'consumesApis')) {
      for (const provider of incomingThrough(api.key, known, ['providesApis'])) addFlow(e, provider, api.title || api.name, `${e.title || e.name} uses ${api.title || api.name}.`);
    }
  }
  for (const e of elements) for (const target of targetsOf(e, known, 'dependsOn')) addFlow(e, target, `${e.title || e.name} to ${target.title || target.name}`);

  const assets = [...dataAssets.values()].map((a): JsonObject => {
    const classification = classificationOf(spec, a);
    return {
      name: a.title || a.name,
      id: a.name,
      ...(a.description ? { description: a.description } : {}),
      risk: {
        confidentiality: CONFIDENTIALITY[classification ?? ''] ?? 50,
        integrity: 50,
        availability: 50,
        ...(classification ? { comment: `Classified ${classification} in the software catalog.` } : {}),
      },
    };
  });

  const repositories = uniqueBy(elements.map((e) => codeLocationOf(e, known).repository).filter((r): r is KnownEntity => !!r?.repository?.url), (r) => r.key);
  const representations = repositories.map((r): JsonObject => ({ name: r.title || r.name, id: r.name, type: 'code', repository: { url: r.repository!.url! } }));

  return { trustZones, components, dataflows, assets, representations, networkLinks };
}

/* Requests and links ------------------------------------------------------- */

/** Name offered for a new file: the entity title, made to read well for the kind of file. */
export function suggestedTitle(kind: SpecFileKind, brief: EntityBrief): string {
  const title = brief.entity.title;
  if (brief.entity.category === 'api') return title;
  if (kind === 'openapi' && !/\bapi$/i.test(title)) return `${title} API`;
  if (kind === 'asyncapi' && !/\bevents?$/i.test(title)) return `${title} events`;
  return title;
}

export function newSpecFileRequest(spec: unknown, index: number, context: CatalogContext | undefined, kind: SpecFileKind, title: string): NewSpecFileRequest | undefined {
  const brief = entityBrief(spec, index, context);
  if (!brief) return undefined;
  const threatModel = kind === 'otm' ? threatModelDraft(spec, index, context) : undefined;
  return { kind, title: title.trim() || brief.entity.title, brief, ...(threatModel ? { threatModel } : {}) };
}

/** Networks standing for no trust zone yet now stand for those of the new threat model at `path`. */
export function trustZoneLinkEdits(spec: unknown, request: NewSpecFileRequest, path: string, context: CatalogContext | undefined): SpecEdit[] {
  return (request.threatModel?.networkLinks ?? []).flatMap(({ index, zoneId }) =>
    entityAt(spec, index) ? setAnnotationEdits(spec, index, TRUST_ZONE_ANNOTATION, formatTrustZoneRef(dirOfDocument(spec, index, context), path, zoneId)) : [],
  );
}

/**
 * Edits linking a spec file to an entity, as the catalog form does: an API spec becomes the definition
 * of an API entity, other files go through `linkSpecFileEdits`, and a threat model created from the
 * catalog (`request`) also stands for the networks that had no trust zone.
 */
export function entityLinkEdits(spec: unknown, index: number, file: SpecFileInfo, context: CatalogContext | undefined, request?: NewSpecFileRequest): SpecEdit[] {
  const info = entityAt(spec, index);
  if (!info) return [];
  const link = info.category === 'api' && SPEC_FILE_KINDS[file.kind].apiType ? setDefinitionEdits(spec, index, file, context) : linkSpecFileEdits(spec, index, file, context);
  return request ? [...link, ...trustZoneLinkEdits(spec, request, file.path, context)] : link;
}

/** Why a file should not be linked to an entity: what it holds already has a home there. */
export function linkConflict(spec: unknown, index: number, file: SpecFileInfo, context: CatalogContext | undefined): string | undefined {
  const self = knownEntities(spec, context).find((e) => e.index === index);
  if (!self) return undefined;
  const label = self.title || self.name;
  if (self.category === 'api' && SPEC_FILE_KINDS[file.kind].apiType && self.definition && self.definition !== file.path) {
    return `${label} already has a definition: ${self.definition}. Update that file instead.`;
  }
  const isMarkdownSpec = (path: string) => (context?.specFiles.find((f) => f.path === path)?.kind ?? (/\.spec\.md$/i.test(path) ? 'spec' : undefined)) === 'spec';
  const other = file.kind === 'spec' ? self.specs.find((path) => path !== file.path && isMarkdownSpec(path)) : undefined;
  return other ? `${label} already has a markdown spec: ${other}. An entity has one markdown spec: add the requirements there.` : undefined;
}

/** Kinds of spec files that can be created for an entity (threat models aside). */
export const creatableSpecKinds = (apiOnly = false): SpecFileKind[] =>
  (Object.keys(SPEC_FILE_KINDS) as SpecFileKind[]).filter((k) => k !== 'otm' && (!apiOnly || SPEC_FILE_KINDS[k].apiType));
