/** Changes made by the catalog form: new entities, renames, deletes and links to spec files. */
import { slugify } from '../../../shared/naming';
import { applyEditsToValue as applyEdits, getIn, isObject, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import {
  annotationList,
  API_VERSION,
  CATEGORIES,
  ARTIFACT_TYPE,
  cleanRelationship,
  codeLocationOf,
  defaultRelationship,
  RELATIONSHIPS_ANNOTATION,
  relationshipEntries,
  DATA_ASSET_TYPE,
  formatTrustZoneRef,
  INFRASTRUCTURE_TYPE,
  NETWORK_TYPE,
  PLATFORM_TYPE,
  REPOSITORY_TYPE,
  SITE_TYPE,
  refValuePath,
  SOURCE_LOCATION_ANNOTATION,
  summarizeEntity,
  TRUST_ZONE_ANNOTATION,
  type KnownEntity,
  type Placement,
  type ThreatModelOutline,
  DEFAULT_NAMESPACE,
  definitionRef,
  dirOf,
  dirOfDocument,
  documentsOf,
  fileOfDocument,
  entitiesOf,
  entityAt,
  entityPath,
  formatRef,
  keyOf,
  knownEntities,
  parseRef,
  refsOf,
  refTarget,
  relativePath,
  resolvePath,
  SPEC_FILE_KINDS,
  SPECS_ANNOTATION,
  str,
  stringList,
  THREAT_MODELS_ANNOTATION,
  refField,
  type CatalogContext,
  type Category,
  type EntityInfo,
  type SpecFileInfo,
} from './model';

/* New entities ------------------------------------------------------------- */

/** Entity name derived from a title, unique for its kind among `taken` keys. */
export function uniqueName(title: string, kind: string, namespace: string, taken: string[], fallback = 'entity'): string {
  const base = slugify(title).slice(0, 60).replace(/-+$/, '') || fallback;
  const key = (name: string) => `${kind.toLowerCase()}:${namespace.toLowerCase()}/${name}`;
  let name = base;
  for (let i = 2; taken.includes(key(name)); i++) name = `${base}-${i}`;
  return name;
}

/** Owner written by most entities of the file, so new entities start with the usual team. */
export function defaultOwner(spec: unknown): string {
  const counts = new Map<string, number>();
  for (const info of entitiesOf(spec)) {
    const owner = str(getIn(info.entity, ['spec', 'owner'])).trim();
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export interface NewEntityOptions {
  /** Extra `spec` fields, e.g. `{ system: 'shop' }`. */
  spec?: JsonObject;
  /** Extra `metadata` fields, e.g. annotations. */
  metadata?: JsonObject;
  namespace?: string;
}

/** A new entity with the fields Backstage requires. `title` becomes the name (slug) and the title. */
export function newEntity(spec: unknown, category: Exclude<Category, 'other'>, title: string, options: NewEntityOptions = {}, context?: CatalogContext): JsonObject {
  const { kind } = CATEGORIES[category];
  const namespace = options.namespace && options.namespace !== DEFAULT_NAMESPACE ? options.namespace : undefined;
  const taken = knownEntities(spec, context).map((e) => e.key);
  const name = uniqueName(title, kind, namespace ?? DEFAULT_NAMESPACE, taken, category === 'dataAsset' ? 'data-asset' : category);
  const owner = defaultOwner(spec);
  const specs: Record<Exclude<Category, 'other'>, JsonObject> = {
    domain: { owner },
    system: { owner },
    component: { type: 'service', lifecycle: 'experimental', owner },
    api: { type: 'openapi', lifecycle: 'experimental', owner, definition: '' },
    resource: { type: 'database', owner },
    dataAsset: { type: DATA_ASSET_TYPE, owner },
    network: { type: NETWORK_TYPE, owner },
    artifact: { type: ARTIFACT_TYPE, owner },
    repository: { type: REPOSITORY_TYPE, owner },
    platform: { type: PLATFORM_TYPE, owner },
    infrastructure: { type: INFRASTRUCTURE_TYPE, owner },
    site: { type: SITE_TYPE, owner },
    group: { type: 'team', children: [] },
    user: { memberOf: [] },
    location: { targets: [] },
  };
  // The definition (often a long text) comes last, like in Backstage examples.
  const { definition, ...fields } = { ...specs[category], ...options.spec };
  return {
    apiVersion: API_VERSION,
    kind,
    metadata: { name, ...(namespace ? { namespace } : {}), ...(title.trim() && title.trim() !== name ? { title: title.trim() } : {}), ...options.metadata },
    spec: { ...fields, ...(definition === undefined ? {} : { definition }) },
  };
}

export const appendEntityEdit = (spec: unknown, entity: JsonObject): SpecEdit => ({ op: 'set', path: entityPath(documentsOf(spec).length), value: entity });

/* References --------------------------------------------------------------- */

export interface LocalReference {
  /** Document index of the entity writing the reference. */
  index: number;
  /** Where the reference is written: a spec field or list entry, or the whole comma-separated annotation holding it. */
  path: SpecPath;
  field: string;
  position?: number;
  many: boolean;
  /** Set when the reference is one entry of a comma-separated annotation (e.g. deployed on). */
  annotation?: string;
  text: string;
}

/** References of this file pointing to the entity of document `index`. */
export function referencesTo(spec: unknown, index: number): LocalReference[] {
  const target = entityAt(spec, index);
  if (!target?.name) return [];
  const key = keyOf(target);
  return entitiesOf(spec).flatMap((info) =>
    refsOf(info)
      .filter((r) => refTarget(r.text, r.field, info.namespace) === key)
      .map((r) => {
        // An entry of a comma-separated annotation cannot be addressed on its own: the annotation is written as a whole.
        const inAnnotation = r.field.many && r.field.annotation;
        return {
          index: info.index,
          path: entityPath(info.index, ...refValuePath(r.field), ...(r.position === undefined || inAnnotation ? [] : [r.position])),
          field: r.field.field,
          position: r.position,
          many: r.field.many,
          ...(inAnnotation ? { annotation: r.field.annotation } : {}),
          text: r.text,
        };
      }),
  );
}

/** Writes each comma-separated annotation holding some of `references` again, with `change` applied to those entries (undefined removes one). */
function annotationReferenceEdits(spec: unknown, references: LocalReference[], change: (text: string) => string | undefined): SpecEdit[] {
  const byAnnotation = new Map<string, LocalReference[]>();
  for (const r of references) if (r.annotation) byAnnotation.set(`${r.index} ${r.annotation}`, [...(byAnnotation.get(`${r.index} ${r.annotation}`) ?? []), r]);
  return [...byAnnotation.values()].flatMap((list) => {
    const { index, annotation } = list[0];
    const positions = new Set(list.map((r) => r.position));
    const entries = annotationList(documentsOf(spec)[index], annotation!).flatMap((text, i) => (positions.has(i) ? (change(text) ?? []) : [text]));
    return setAnnotationListEdits(spec, index, annotation!, entries);
  });
}

/** Renames an entity and every reference to it in this file, keeping how each reference is written. */
export function renameEntityEdits(spec: unknown, index: number, newName: string): SpecEdit[] {
  const target = entityAt(spec, index);
  const renamed = (text: string) => {
    const ref = parseRef(text)!;
    return `${ref.kind ? `${ref.kind}:` : ''}${ref.namespace ? `${ref.namespace}/` : ''}${newName}`;
  };
  const references = referencesTo(spec, index);
  const edits: SpecEdit[] = references.filter((r) => !r.annotation).map((r) => ({ op: 'set', path: r.path, value: renamed(r.text) }));
  edits.push(...annotationReferenceEdits(spec, references, renamed));
  // Relationships name the dependency they are about.
  if (target?.name) {
    const key = keyOf(target);
    for (const info of entitiesOf(spec)) {
      const field = refField(info.kind, 'dependsOn');
      const entries = relationshipEntries(info.entity);
      const about = (e: (typeof entries)[number]) => !!field && !!e.label && refTarget(e.text, field, info.namespace) === key;
      if (!entries.some(about)) continue;
      edits.push(...setAnnotationListEdits(spec, info.index, RELATIONSHIPS_ANNOTATION, entries.map((e) => (about(e) ? `${e.label} ${renamed(e.text)}` : e.written))));
    }
  }
  return [{ op: 'set', path: entityPath(index, 'metadata', 'name'), value: newName }, ...edits];
}

/** Links removed with the entity (list entries) and references left pointing to nothing. */
export function deleteImpact(spec: unknown, index: number): { removed: number; broken: number } {
  const refs = referencesTo(spec, index).filter((r) => r.index !== index);
  return { removed: refs.filter((r) => r.many).length, broken: refs.filter((r) => !r.many).length };
}

/**
 * Deletes the document and the list entries pointing to it (provided APIs, dependencies,
 * members...). Single references (owner, system...) stay, and are reported by the checks.
 */
export function deleteEntityEdits(spec: unknown, index: number): SpecEdit[] {
  const listEntries = referencesTo(spec, index)
    .filter((r) => r.many && r.index !== index)
    .sort((a, b) => a.index - b.index || a.field.localeCompare(b.field) || (b.position ?? 0) - (a.position ?? 0));
  return [
    ...listEntries.filter((r) => !r.annotation).map((r): SpecEdit => ({ op: 'delete', path: r.path })),
    ...annotationReferenceEdits(spec, listEntries, () => undefined),
    { op: 'delete', path: entityPath(index) },
  ];
}

/** Adds a reference to a list field (`providesApis`, `dependsOn`, or a comma-separated annotation like `deployedOn`) unless it already points there. */
export function addRefEdits(spec: unknown, index: number, field: string, target: { kind: string; namespace: string; name: string }): SpecEdit[] {
  const info = entityAt(spec, index);
  const definition = info && refField(info.kind, field);
  if (!info || !definition) return [];
  const key = keyOf(target);
  const ref = formatRef(target, definition.defaultKind, info.namespace);
  if (definition.annotation) {
    const current = annotationList(info.entity, definition.annotation);
    if (current.some((text) => refTarget(text, definition, info.namespace) === key)) return [];
    return setAnnotationListEdits(spec, index, definition.annotation, [...current, ref]);
  }
  const list = stringList(getIn(info.entity, ['spec', field]));
  if (list.some((text) => refTarget(text, definition, info.namespace) === key)) return [];
  // Appending keeps the comments of the existing entries.
  if (Array.isArray(getIn(info.entity, ['spec', field]))) return [{ op: 'set', path: entityPath(index, 'spec', field, list.length), value: ref }];
  return [{ op: 'set', path: entityPath(index, 'spec', field), value: [ref] }];
}

/* Relationships ------------------------------------------------------------ */

/**
 * Writes what the entity of document `index` does with `target`, one of its dependencies. The
 * default relationship ("runs in" a network, "uses" anything else), or nothing, removes the entry.
 */
export function setRelationshipEdits(spec: unknown, index: number, target: { kind: string; namespace: string; name: string; category: Category }, label: string): SpecEdit[] {
  const info = entityAt(spec, index);
  const field = info && refField(info.kind, 'dependsOn');
  if (!info || !field) return [];
  const key = keyOf(target);
  const entries = relationshipEntries(info.entity);
  const about = (e: (typeof entries)[number]) => refTarget(e.text, field, info.namespace) === key;
  const clean = cleanRelationship(label);
  const entry = clean && clean.toLowerCase() !== defaultRelationship(target) ? `${clean} ${formatRef(target, undefined, info.namespace)}` : undefined;
  const position = entries.findIndex(about);
  const next = entries.filter((e) => !about(e)).map((e) => e.written);
  if (entry) next.splice(position < 0 ? next.length : position, 0, entry);
  if (next.join(', ') === entries.map((e) => e.written).join(', ')) return [];
  return setAnnotationListEdits(spec, index, RELATIONSHIPS_ANNOTATION, next);
}

/**
 * A relationship follows its `dependsOn` entry: removes the relationships written for the
 * dependencies an edit took away (unticked, deleted, placed elsewhere), from `before` to `after`.
 */
export function droppedRelationshipEdits(before: unknown, after: unknown): SpecEdit[] {
  const dependencies = (info: EntityInfo) => {
    const field = refField(info.kind, 'dependsOn');
    return new Set(field ? stringList(getIn(info.entity, ['spec', 'dependsOn'])).map((text) => refTarget(text, field, info.namespace)) : []);
  };
  const previous = new Map(entitiesOf(before).map((info) => [keyOf(info), info]));
  return entitiesOf(after).flatMap((info) => {
    const was = previous.get(keyOf(info));
    const field = refField(info.kind, 'dependsOn');
    const entries = relationshipEntries(info.entity);
    if (!was || !field || !entries.length) return [];
    const now = dependencies(info);
    const removed = [...dependencies(was)].filter((key) => key && !now.has(key));
    const kept = entries.filter((e) => !removed.includes(refTarget(e.text, field, info.namespace)));
    return kept.length === entries.length ? [] : setAnnotationListEdits(after, info.index, RELATIONSHIPS_ANNOTATION, kept.map((e) => e.written));
  });
}

/* Annotations and spec files ----------------------------------------------- */

/** Writes an annotation (or label); an empty value removes it, and the map when nothing is left in it. */
export function setAnnotationEdits(spec: unknown, index: number, key: string, value: string | undefined, map: 'annotations' | 'labels' = 'annotations'): SpecEdit[] {
  const current = getIn(documentsOf(spec)[index], ['metadata', map]);
  if (value !== undefined && value !== '') return [{ op: 'set', path: entityPath(index, 'metadata', map, key), value }];
  if (!isObject(current) || !(key in current)) return [];
  const onlyOne = Object.keys(current).length === 1;
  return [{ op: 'delete', path: entityPath(index, 'metadata', map, ...(onlyOne ? [] : [key])) }];
}

/** Writes a comma-separated annotation; an empty list removes it (and an empty `annotations` map). */
export const setAnnotationListEdits = (spec: unknown, index: number, key: string, values: string[]): SpecEdit[] => setAnnotationEdits(spec, index, key, values.join(', '));

export const annotationKeyFor = (file: SpecFileInfo) => (file.kind === 'otm' ? THREAT_MODELS_ANNOTATION : SPECS_ANNOTATION);

/**
 * Links a spec file to an entity. API specs (OpenAPI, AsyncAPI, gRPC, OpenCLI) linked to a
 * component go through an API entity, as Backstage expects: an existing API whose definition is
 * the file, or a new one, is added to `providesApis`. Threat models and other specs are listed in
 * the `sdd-studio/threat-models` and `sdd-studio/specs` annotations.
 */
export function linkSpecFileEdits(spec: unknown, index: number, file: SpecFileInfo, context: CatalogContext | undefined): SpecEdit[] {
  const info = entityAt(spec, index);
  if (!info) return [];
  const dir = dirOfDocument(spec, index, context);
  const apiType = SPEC_FILE_KINDS[file.kind].apiType;

  if (apiType && info.category === 'component') {
    const known = knownEntities(spec, context);
    const existing = known.find((e) => e.category === 'api' && e.definition === file.path);
    if (existing) return addRefEdits(spec, index, 'providesApis', existing);
    const title = file.name || file.path.slice(file.path.lastIndexOf('/') + 1).replace(/\..*$/, '');
    const system = str(getIn(info.entity, ['spec', 'system']));
    const api = newEntity(
      spec,
      'api',
      title,
      {
        namespace: info.namespace,
        spec: {
          type: apiType,
          lifecycle: str(getIn(info.entity, ['spec', 'lifecycle'])) || 'experimental',
          owner: str(getIn(info.entity, ['spec', 'owner'])) || defaultOwner(spec),
          ...(system ? { system } : {}),
          definition: { $text: relativePath(dir, file.path) },
        },
      },
      context,
    );
    const target = { kind: 'API', namespace: info.namespace, name: str((api.metadata as JsonObject).name) };
    return [appendEntityEdit(spec, api), ...addRefEdits(spec, index, 'providesApis', target)];
  }

  const key = annotationKeyFor(file);
  const list = annotationList(info.entity, key);
  const written = relativePath(dir, file.path);
  if (list.some((p) => p === written)) return [];
  return setAnnotationListEdits(spec, index, key, [...list, written]);
}

/** Makes `file` the definition of an API entity (and its type follow the file). */
export function setDefinitionEdits(spec: unknown, index: number, file: SpecFileInfo, context: CatalogContext | undefined): SpecEdit[] {
  const apiType = SPEC_FILE_KINDS[file.kind].apiType;
  return [
    ...(apiType ? [{ op: 'set' as const, path: entityPath(index, 'spec', 'type'), value: apiType }] : []),
    { op: 'set', path: entityPath(index, 'spec', 'definition'), value: { $text: relativePath(dirOfDocument(spec, index, context), file.path) } },
  ];
}

/** Removes one path of a comma-separated annotation. */
export function unlinkAnnotationEdits(info: EntityInfo, spec: unknown, key: string, written: string): SpecEdit[] {
  return setAnnotationListEdits(spec, info.index, key, annotationList(info.entity, key).filter((p) => p !== written));
}

/** Workspace paths written in the file: API definitions, linked specs and threat models, location targets. */
export function referencedPaths(spec: unknown, file: string): string[] {
  const paths = entitiesOf(spec).flatMap((info) => {
    const dir = dirOfDocument(spec, info.index, { file });
    const targets = [str(getIn(info.entity, ['spec', 'target'])), ...stringList(getIn(info.entity, ['spec', 'targets']))].filter((t) => info.category === 'location' && t && !t.includes('*'));
    const definition = info.category === 'api' ? definitionRef(info.entity) : undefined;
    const zone = str(getIn(info.entity, ['metadata', 'annotations', TRUST_ZONE_ANNOTATION])).replace(/#.*$/, '');
    return [...annotationList(info.entity, SPECS_ANNOTATION), ...annotationList(info.entity, THREAT_MODELS_ANNOTATION), ...targets, ...(definition ? [definition] : []), ...(zone ? [zone] : [])].flatMap(
      (p) => resolvePath(dir, p) ?? [],
    );
  });
  return [...new Set(paths)];
}

/* Networks ----------------------------------------------------------------- */

/** Replaces the parent network of a network (its first `dependsOn` entry pointing to a network). */
export function setParentNetworkEdits(spec: unknown, index: number, parent: { kind: string; namespace: string; name: string } | undefined, known: KnownEntity[]): SpecEdit[] {
  const info = entityAt(spec, index);
  const field = info && refField(info.kind, 'dependsOn');
  if (!info || !field) return [];
  const list = stringList(getIn(info.entity, ['spec', 'dependsOn']));
  const isNetwork = (text: string) => known.some((e) => e.category === 'network' && e.key === refTarget(text, field, info.namespace));
  const kept = list.filter((text) => !isNetwork(text));
  const next = parent ? [formatRef(parent, field.defaultKind, info.namespace), ...kept] : kept;
  if (next.length === 0) return list.length ? [{ op: 'delete', path: entityPath(index, 'spec', 'dependsOn') }] : [];
  return [{ op: 'set', path: entityPath(index, 'spec', 'dependsOn'), value: next }];
}

/**
 * New networks for the trust zones of a threat model that no network stands for yet, nested like
 * the trust zones and linked to them with the `sdd-studio/trust-zone` annotation.
 */
export function importNetworksEdits(spec: unknown, outline: ThreatModelOutline, context: CatalogContext | undefined, targetFile = context?.file ?? ''): SpecEdit[] {
  const dir = dirOf(targetFile);
  const known = knownEntities(spec, context);
  const edits: SpecEdit[] = [];
  let current: unknown = spec;
  const networkFor = (id: string) =>
    knownEntities(current, context).find((e) => e.category === 'network' && e.trustZone?.path === outline.path && e.trustZone.id === id);
  // Parents first, so children can point to them.
  const depth = (zone: ThreatModelOutline['trustZones'][number], seen = new Set<string>()): number => {
    const parent = outline.trustZones.find((z) => z.id === zone.parent);
    if (!parent || seen.has(parent.id)) return 0;
    seen.add(zone.id);
    return 1 + depth(parent, seen);
  };
  for (const zone of [...outline.trustZones].sort((a, b) => depth(a) - depth(b))) {
    if (!zone.id || networkFor(zone.id)) continue;
    const parent = zone.parent ? networkFor(zone.parent) : undefined;
    const entity = newEntity(
      current,
      'network',
      zone.name || zone.id,
      {
        metadata: {
          ...(zone.description ? { description: zone.description } : {}),
          annotations: { [TRUST_ZONE_ANNOTATION]: formatTrustZoneRef(dir, outline.path, zone.id) },
        },
        spec: parent ? { dependsOn: [formatRef(parent, undefined)] } : {},
      },
      context,
    );
    // The name follows the trust zone id when it is free, so both files use the same identifiers.
    const metadata = entity.metadata as JsonObject;
    if (!known.some((e) => e.kind.toLowerCase() === 'resource' && e.name === zone.id) && /^[a-z0-9]([-a-z0-9_.]*[a-z0-9])?$/i.test(zone.id)) metadata.name = zone.id;
    const edit = appendEntityEdit(current, entity);
    edits.push(edit);
    current = applyEdits(current, [edit]);
  }
  return edits;
}

/** Places an entity in the networks standing for the trust zone a threat model gives it (a network it only used, it now runs in). */
export function placeLikeThreatModelEdits(spec: unknown, index: number, placement: Placement): SpecEdit[] {
  const info = entityAt(spec, index);
  const field = info && refField(info.kind, 'dependsOn');
  if (!info || !field || !placement.expected.length) return [];
  const wrong = new Set(placement.actual.filter((n) => !placement.expected.some((e) => e.key === n.key)).map((n) => n.key));
  const list = stringList(getIn(info.entity, ['spec', 'dependsOn'])).filter((text) => !wrong.has(refTarget(text, field, info.namespace) ?? ''));
  const has = (key: string) => list.some((text) => refTarget(text, field, info.namespace) === key);
  const next = [...list, ...placement.expected.filter((n) => !has(n.key)).map((n) => formatRef(n, undefined, info.namespace))];
  const entries = relationshipEntries(info.entity);
  const kept = entries.filter((e) => !placement.expected.some((n) => n.key === refTarget(e.text, field, info.namespace)));
  return [
    { op: 'set', path: entityPath(index, 'spec', 'dependsOn'), value: next },
    ...(kept.length < entries.length ? setAnnotationListEdits(spec, index, RELATIONSHIPS_ANNOTATION, kept.map((e) => e.written)) : []),
  ];
}

/* Repositories ------------------------------------------------------------- */

/**
 * Keeps `backstage.io/source-location` in line with the repository (URL, provider, branch) and
 * the path of each entity's code, after a change from `before` to `after`. A value written by
 * hand (one that is not what the repository gave before the change) is left alone.
 */
export function sourceLocationEdits(before: unknown, after: unknown, context: CatalogContext | undefined): SpecEdit[] {
  const knownBefore = knownEntities(before, context);
  const knownAfter = knownEntities(after, context);
  return entitiesOf(after).flatMap((info) => {
    const summary = summarizeEntity(info, fileOfDocument(after, info.index, context));
    const previous = knownBefore.find((e) => e.key === summary.key);
    const wanted = codeLocationOf(summary, knownAfter).location;
    const had = previous ? codeLocationOf(previous, knownBefore).location : undefined;
    const current = str(getIn(info.entity, ['metadata', 'annotations', SOURCE_LOCATION_ANNOTATION])) || undefined;
    if (current === wanted || (current !== undefined && current !== had)) return [];
    return setAnnotationEdits(after, info.index, SOURCE_LOCATION_ANNOTATION, wanted);
  });
}
