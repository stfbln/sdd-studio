import { useId, useRef, useState } from 'react';
import { getIn, isObject, type JsonObject, type SpecEdit } from '../../../shared/structured/edits';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { IconButton } from '../../../webview/components/IconButton';
import { Section } from '../../../webview/structured/fields';
import { creatableSpecKinds, entityBrief, newSpecFileRequest, suggestedTitle, trustZoneLinkEdits, type NewSpecFileRequest } from '../core/brief';
import { addRefEdits, appendEntityEdit, linkSpecFileEdits, newEntity, setDefinitionEdits, setRelationshipEdits, unlinkAnnotationEdits } from '../core/edits';
import {
  annotationList,
  ARTIFACT_TYPE_ANNOTATION,
  CATEGORIES,
  CLASSIFICATION_LABEL,
  defaultRelationship,
  definitionRef,
  dirOf,
  dirOfDocument,
  documentsOf,
  entityAt,
  entityPath,
  formatRef,
  incoming,
  keyOf,
  refField,
  refFieldsOf,
  refTarget,
  relationshipEntries,
  relationshipOf,
  RELATIONSHIPS,
  RELATIONSHIPS_ANNOTATION,
  resolvePath,
  SPEC_FILE_KINDS,
  SPECS_ANNOTATION,
  specsFor,
  str,
  stringList,
  summaryLabel,
  THREAT_MODELS_ANNOTATION,
  threatModelsFor,
  type Category,
  type EntityInfo,
  type KnownEntity,
  type SpecFileInfo,
  type SpecFileKind,
} from '../core/model';
import { CreateButton, EntityLink, NamePrompt, plural } from './controls';
import { entityLocation, useCatalog, useWorkspace } from './state';

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/* Spec files --------------------------------------------------------------- */

/** One linked file: kind, name, path, open and remove buttons. */
function FileRow({ path, written, file, missing, extra, onRemove, removeLabel }: { path?: string; written: string; file?: SpecFileInfo; missing?: boolean; extra?: React.ReactNode; onRemove?(): void; removeLabel?: string }) {
  const { openFile } = useWorkspace();
  const kind = file ? SPEC_FILE_KINDS[file.kind] : undefined;
  return (
    <div className="file-row">
      <span className={`codicon codicon-${kind?.icon ?? 'file'}`} aria-hidden="true" />
      {kind && <span className={`spec-kind spec-kind-${file!.kind}`}>{kind.label}</span>}
      {path && !missing ? (
        <button type="button" className="link-button" title={`Open ${path}`} onClick={() => openFile(path)}>
          {file?.name || baseName(path)}
        </button>
      ) : (
        <span className="warning-text">{baseName(written)}</span>
      )}
      <span className="muted small mono file-hint" title={written === path ? undefined : `Written as ${written}`}>
        {path ?? written}
      </span>
      {missing && <span className="warning-text small">file not found</span>}
      {extra}
      {onRemove && <IconButton icon="close" label={removeLabel ?? 'Remove link'} onClick={onRemove} />}
    </div>
  );
}

/** Select of spec files grouped by kind; picking one calls `onPick`. */
function FilePicker({ files, label, onPick, suffix }: { files: SpecFileInfo[]; label: string; onPick(file: SpecFileInfo): void; suffix?: (file: SpecFileInfo) => string }) {
  const kinds = [...new Set(files.map((f) => f.kind))];
  if (!files.length) return null;
  return (
    <select
      className="keyword-select link-select"
      aria-label={label}
      value=""
      onChange={(e) => {
        const file = files.find((f) => f.path === e.target.value);
        if (file) onPick(file);
      }}
    >
      <option value="">{label}</option>
      {kinds.map((kind) => (
        <optgroup key={kind} label={SPEC_FILE_KINDS[kind].label}>
          {files
            .filter((f) => f.kind === kind)
            .map((f) => (
              <option key={f.path} value={f.path}>
                {f.name ? `${f.name} — ${f.path}` : f.path}
                {suffix?.(f) ?? ''}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * Creates a spec file or threat model for an entity, filled from what the catalog knows about it,
 * then links it (`linkEdits`) and opens it. With several kinds, a select picks the kind first.
 */
function NewFileControl({ index, kinds, label, hint, linkEdits }: { index: number; kinds: SpecFileKind[]; label: string; hint: string; linkEdits(spec: unknown, file: SpecFileInfo, request: NewSpecFileRequest): SpecEdit[] }) {
  const catalog = useCatalog();
  const workspace = useWorkspace();
  // The file is linked once the host has created it: by then the form may have changed.
  const latest = useRef({ catalog, workspace });
  latest.current = { catalog, workspace };
  const [kind, setKind] = useState<SpecFileKind>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const brief = kind ? entityBrief(catalog.spec, index, workspace.context) : undefined;

  const create = async (chosen: SpecFileKind, title: string) => {
    const request = newSpecFileRequest(catalog.spec, index, workspace.context, chosen, title);
    if (!request) return;
    setBusy(true);
    setError(undefined);
    try {
      const { path, name } = (await workspace.request('newSpecFile', request)) as { path: string; name: string };
      const { catalog: now, workspace: ws } = latest.current;
      now.edit(linkEdits(now.spec, { path, kind: chosen, name }, request));
      ws.openFile(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  let control: React.ReactNode;
  if (busy) control = <span className="muted small">Creating the file…</span>;
  else if (kind && brief) {
    const singular = kind === 'otm' ? 'threat model' : `${SPEC_FILE_KINDS[kind].label} file`;
    control = (
      <>
        <NamePrompt singular={singular} initial={suggestedTitle(kind, brief)} onDone={(name) => (setKind(undefined), name && void create(kind, name))} />
        <span className="muted small">{hint}</span>
      </>
    );
  } else if (kinds.length === 1) {
    control = <IconButton icon="new-file" label={label} showLabel onClick={() => setKind(kinds[0])} />;
  } else {
    control = (
      <select className="keyword-select link-select" aria-label={label} value="" onChange={(e) => e.target.value && setKind(e.target.value as SpecFileKind)}>
        <option value="">{label}</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {SPEC_FILE_KINDS[k].label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      {control}
      {error && <span className="warning-text small">{error}</span>}
    </>
  );
}

const SPEC_HINT = 'Filled from the catalog: title, description, owner and system. A markdown spec points to this entry, which stays the source of truth, and only gets the requirements other files cannot hold.';

function useFiles(index?: number) {
  const { spec } = useCatalog();
  const { context } = useWorkspace();
  const dir = index === undefined ? dirOf(context?.file ?? '') : dirOfDocument(spec, index, context);
  const fileAt = (path: string | undefined) => (path ? context?.specFiles.find((f) => f.path === path) : undefined);
  const missing = (path: string | undefined) => !!path && context?.files[path] === false;
  return { context, dir, fileAt, missing };
}

/** Spec files an entity implements. API specs of components go through provided API entities. */
export function SpecificationsSection({ index }: { index: number }) {
  const { spec, edit } = useCatalog();
  const { known } = useWorkspace();
  const { context, dir, fileAt, missing } = useFiles(index);
  const info = entityAt(spec, index)!;
  const isComponent = info.category === 'component';
  const provides = refField('component', 'providesApis')!;
  const providedTexts = isComponent ? stringList(getIn(info.entity, ['spec', 'providesApis'])) : [];
  const provided = providedTexts.map((text, position) => ({ text, position, api: known.find((e) => e.key === refTarget(text, provides, info.namespace)) }));
  const linked = annotationList(info.entity, SPECS_ANNOTATION).map((written) => ({ written, path: resolvePath(dir, written) }));
  const taken = new Set([...linked.map((l) => l.path), ...provided.map((p) => p.api?.definition)]);
  const available = (context?.specFiles ?? []).filter((f) => f.kind !== 'otm' && !taken.has(f.path));
  const count = provided.length + linked.length;

  return (
    <Section title="Specifications" icon="book" count={count}>
      {count === 0 && (
        <p className="muted">
          {isComponent
            ? 'Spec files this component implements: API specs (OpenAPI, AsyncAPI, gRPC, OpenCLI), markdown specs and features.'
            : `Spec files describing this ${CATEGORIES[info.category].singular.toLowerCase()}.`}
        </p>
      )}
      {provided.map(({ text, position, api }) => (
        <FileRow
          key={`api-${position}`}
          written={api?.definition ? api.definition : text}
          path={api?.definition}
          file={fileAt(api?.definition)}
          missing={!api}
          extra={
            <span className="muted small">
              provided API {api ? <EntityLink entity={api} /> : <span className="warning-text">{text} (not found)</span>}
            </span>
          }
          removeLabel="No longer provided by this component"
          onRemove={() => edit({ op: 'delete', path: entityPath(index, 'spec', 'providesApis', ...(providedTexts.length === 1 ? [] : [position])) })}
        />
      ))}
      {linked.map(({ written, path }) => (
        <FileRow key={written} written={written} path={path} file={fileAt(path)} missing={missing(path)} onRemove={() => edit(unlinkAnnotationEdits(info, spec, SPECS_ANNOTATION, written))} />
      ))}
      <div className="list-row">
        {context ? (
          <>
            {available.length > 0 && (
              <FilePicker
                files={available}
                label="Link a spec file…"
                suffix={(f) => (isComponent && SPEC_FILE_KINDS[f.kind].apiType ? (known.some((e) => e.category === 'api' && e.definition === f.path) ? ' (provided API)' : ' (new API entity)') : '')}
                onPick={(file) => edit(linkSpecFileEdits(spec, index, file, context))}
              />
            )}
            {info.name && (
              <NewFileControl
                index={index}
                kinds={creatableSpecKinds()}
                label="New spec file…"
                hint={isComponent ? `${SPEC_HINT} API specs are provided through a new API entity.` : SPEC_HINT}
                linkEdits={(current, file) => linkSpecFileEdits(current, index, file, context)}
              />
            )}
          </>
        ) : (
          <span className="muted small">Looking for spec files…</span>
        )}
      </div>
      {count > 0 && (
        <p className="muted small">
          {isComponent ? 'API specs are linked through API entities (providesApis) so Backstage shows them; other files through the ' : 'Written in the '}
          <code>{SPECS_ANNOTATION}</code> annotation.
        </p>
      )}
    </Section>
  );
}

/** Threat models applying to an entity: its own and those inherited from its system, domain... */
export function ThreatModelsSection({ index }: { index: number }) {
  const { spec, edit } = useCatalog();
  const { known } = useWorkspace();
  const { context, dir, fileAt, missing } = useFiles(index);
  const info = entityAt(spec, index)!;
  const own = annotationList(info.entity, THREAT_MODELS_ANNOTATION).map((written) => ({ written, path: resolvePath(dir, written) }));
  const inherited = info.name ? threatModelsFor(keyOf(info), known).filter((t) => t.from) : [];
  const available = (context?.specFiles ?? []).filter((f) => f.kind === 'otm' && !own.some((o) => o.path === f.path));
  const singular = CATEGORIES[info.category].singular.toLowerCase();

  return (
    <Section title="Threat models" icon="shield" count={own.length + inherited.length}>
      {own.length + inherited.length === 0 && <p className="muted">Open Threat Model files covering this {singular}. They also apply to everything inside it.</p>}
      {own.map(({ written, path }) => (
        <FileRow key={written} written={written} path={path} file={fileAt(path)} missing={missing(path)} onRemove={() => edit(unlinkAnnotationEdits(info, spec, THREAT_MODELS_ANNOTATION, written))} />
      ))}
      {inherited.map(({ path, from }) => (
        <FileRow
          key={`${from!.key}-${path}`}
          written={path}
          path={path}
          file={fileAt(path)}
          extra={
            <span className="muted small">
              from <EntityLink entity={from!} showKind />
            </span>
          }
        />
      ))}
      <div className="list-row">
        {context ? (
          <>
            {available.length > 0 && <FilePicker files={available} label="Apply a threat model…" onPick={(file) => edit(linkSpecFileEdits(spec, index, file, context))} />}
            {info.name && (
              <NewFileControl
                index={index}
                kinds={['otm']}
                label="New threat model"
                hint="Filled from the catalog: networks become trust zones, components and resources become components, with their data assets and dataflows."
                linkEdits={(current, file, request) => [...linkSpecFileEdits(current, index, file, context), ...trustZoneLinkEdits(current, request, file.path, context)]}
              />
            )}
          </>
        ) : (
          <span className="muted small">Looking for threat models…</span>
        )}
      </div>
    </Section>
  );
}

/** Definition of an API: a spec file of the workspace (`$text`), or text written in the file. */
export function DefinitionSection({ index }: { index: number }) {
  const { spec, edit } = useCatalog();
  const { context, dir, fileAt, missing } = useFiles(index);
  const info = entityAt(spec, index)!;
  const definition = getIn(info.entity, ['spec', 'definition']);
  const written = definitionRef(info.entity);
  const path = written ? resolvePath(dir, written) : undefined;
  const apiFiles = (context?.specFiles ?? []).filter((f) => SPEC_FILE_KINDS[f.kind].apiType && f.path !== path);
  const inline = typeof definition === 'string';
  const apiType = str(getIn(info.entity, ['spec', 'type']));

  return (
    <Section title="Definition" icon="file-code">
      {written !== undefined ? (
        <FileRow written={written} path={path} file={fileAt(path)} missing={missing(path) || (!!context && !path)} />
      ) : inline && definition.trim() ? (
        <p className="muted small">The definition is written in the catalog file.</p>
      ) : (
        <p className="muted">
          The spec file describing this API. Backstage shows it on the API page. <span className="required">*</span>
        </p>
      )}
      {inline && definition.trim() !== '' && (
        <AutoTextarea value={definition} onChange={(v) => edit({ op: 'set', path: entityPath(index, 'spec', 'definition'), value: v })} />
      )}
      <div className="list-row">
        {context ? (
          <>
            <FilePicker files={apiFiles} label={written ? 'Use another spec file…' : 'Choose the spec file…'} onPick={(file) => edit(setDefinitionEdits(spec, index, file, context))} />
            {info.name && (
              <NewFileControl
                index={index}
                // The kind matching the API type comes first.
                kinds={creatableSpecKinds(true).sort((a, b) => Number(SPEC_FILE_KINDS[b].apiType === apiType) - Number(SPEC_FILE_KINDS[a].apiType === apiType))}
                label={written ? 'New spec file…' : 'Create the spec file…'}
                hint="Filled from the catalog: title, description, owner and system."
                linkEdits={(current, file) => setDefinitionEdits(current, index, file, context)}
              />
            )}
          </>
        ) : (
          <span className="muted small">Looking for spec files…</span>
        )}
        {isObject(definition) && written !== undefined && <span className="muted small">Written as <code>$text: {written}</code>, read by Backstage when it loads the file.</span>}
      </div>
    </Section>
  );
}

/* Hierarchy and relations -------------------------------------------------- */

/** Which fields place an entity inside another: what is listed, and what can be created inside it. */
const CONTAINS: Partial<Record<Category, { field: string; categories: Category[]; add: Category[]; singular?: string }[]>> = {
  domain: [
    { field: 'domain', categories: ['system'], add: ['system'] },
    { field: 'subdomainOf', categories: ['domain'], add: ['domain'], singular: 'Subdomain' },
  ],
  system: [
    {
      field: 'system',
      categories: ['component', 'api', 'resource', 'dataAsset', 'network', 'artifact', 'repository', 'platform', 'infrastructure'],
      add: ['component', 'api', 'resource', 'dataAsset'],
    },
  ],
  component: [{ field: 'subcomponentOf', categories: ['component'], add: ['component'], singular: 'Subcomponent' }],
  network: [{ field: 'dependsOn', categories: ['network'], add: ['network'], singular: 'Subnetwork' }],
};

/** Entities listed in the contents of `info` (so relations do not list them again). */
function childrenOf(info: EntityInfo, known: KnownEntity[]) {
  const rules = CONTAINS[info.category] ?? [];
  if (!info.name) return [];
  return incoming(keyOf(info), known).filter((r) => r.entity.key !== keyOf(info) && rules.some((rule) => rule.field === r.field && rule.categories.includes(r.entity.category)));
}

const lowerLabel = (singular: string) => (singular === 'API' ? singular : singular.toLowerCase());

/** Entities placed inside this one (systems of a domain, components of a system, subnetworks...), with add buttons. */
export function ContentsSection({ index }: { index: number }) {
  const { spec, edit, navigate } = useCatalog();
  const { known, context } = useWorkspace();
  const info = entityAt(spec, index)!;
  const rules = CONTAINS[info.category] ?? [];
  const children = childrenOf(info, known);
  const create = (category: Category, field: string, name: string) => {
    const definition = refFieldsOf(CATEGORIES[category].kind, category).find((f) => f.field === field)!;
    const ref = formatRef(info, definition.defaultKind, info.namespace);
    const extra: JsonObject = { [field]: definition.many ? [ref] : ref };
    // A subcomponent belongs to the system of its parent.
    const system = str(getIn(info.entity, ['spec', 'system']));
    if (field === 'subcomponentOf' && system) extra.system = system;
    const entity = newEntity(spec, category as Exclude<Category, 'other'>, name, { namespace: info.namespace, spec: extra }, context);
    edit(appendEntityEdit(spec, entity));
    navigate(entityLocation(documentsOf(spec).length));
  };

  return (
    <Section title="Contents" icon="type-hierarchy-sub" count={children.length}>
      {children.length === 0 && <p className="muted">Nothing is part of this {CATEGORIES[info.category].singular.toLowerCase()} yet.</p>}
      {children.map(({ entity, field }) => (
        <div key={`${entity.key}-${field}`} className="list-row">
          <EntityLink entity={entity} showKind />
          {entity.type && entity.category === 'resource' && <span className="muted small">{entity.type}</span>}
          {entity.description && <span className="muted small entity-description">{entity.description}</span>}
        </div>
      ))}
      {info.name && (
        <div className="list-row add-methods">
          {rules.flatMap((rule) =>
            rule.add.map((category) => {
              const singular = lowerLabel(rule.singular ?? CATEGORIES[category].singular);
              return <CreateButton key={`${rule.field}-${category}`} label={`Add ${singular}`} singular={singular} onCreate={(name) => create(category, rule.field, name)} />;
            }),
          )}
        </div>
      )}
    </Section>
  );
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Entities pointing to this one (owners, consumers, users...), except those listed in its contents. */
export function RelationsSection({ index }: { index: number }) {
  const { spec } = useCatalog();
  const { known } = useWorkspace();
  const info = entityAt(spec, index)!;
  const shown = new Set(childrenOf(info, known).map((r) => `${r.entity.key} ${r.field}`));
  // Repositories list the entities they hold in their own section.
  if (info.category === 'repository') for (const r of incoming(keyOf(info), known)) if (r.field === 'repository') shown.add(`${r.entity.key} ${r.field}`);
  // Platforms and infrastructure list what is deployed on them in their own section.
  if (info.category === 'platform' || info.category === 'infrastructure') for (const r of incoming(keyOf(info), known)) if (r.field === 'deployedOn') shown.add(`${r.entity.key} ${r.field}`);
  // Sites list what points to them in their own section.
  if (info.category === 'site') for (const r of incoming(keyOf(info), known)) if (r.field === 'site') shown.add(`${r.entity.key} ${r.field}`);
  const relations = info.name ? incoming(keyOf(info), known).filter((r) => !shown.has(`${r.entity.key} ${r.field}`) && r.entity.key !== keyOf(info)) : [];
  const groups = new Map<string, KnownEntity[]>();
  for (const { entity, field, label: relationship } of relations) {
    // A dependency says what is done with it: "Runs in this network", "Reads from this resource".
    const custom = !!relationship && relationship.toLowerCase() !== defaultRelationship(info);
    const label =
      field === 'dependsOn' && (custom || info.category === 'network')
        ? `${sentence(relationshipOf({ label: relationship }, info))} this ${CATEGORIES[info.category].singular.toLowerCase()}`
        : (refFieldsOf(entity.kind, entity.category).find((f) => f.field === field)?.reverse ?? field);
    groups.set(label, [...(groups.get(label) ?? []), entity]);
  }
  if (!groups.size) return null;
  return (
    <Section title="Relations" icon="references" count={relations.length}>
      {[...groups.entries()].map(([label, entities]) => (
        <div key={label} className="relation-group">
          <span className="relation-label">{label}</span>
          <span className="list-row">
            {entities.map((entity) => (
              <EntityLink key={entity.key} entity={entity} showKind />
            ))}
          </span>
        </div>
      ))}
    </Section>
  );
}

/**
 * What the entity of document `index` does with `target`, one of its dependencies: picked from the
 * usual relationships or typed. Empty means the default ("runs in" a network, "uses" anything else).
 */
export function RelationshipInput({ index, target }: { index: number; target: KnownEntity }) {
  const { spec, edit } = useCatalog();
  const listId = useId();
  // What is typed stays as it is while the field has focus: the file keeps the relationship tidied up.
  const [draft, setDraft] = useState<string>();
  const info = entityAt(spec, index)!;
  const field = refField(info.kind, 'dependsOn')!;
  const written = relationshipEntries(info.entity).find((e) => e.label && refTarget(e.text, field, info.namespace) === target.key)?.label ?? '';
  const fallback = defaultRelationship(target);
  return (
    <>
      <input
        className="input input-small relationship-input"
        list={listId}
        value={draft ?? written}
        placeholder={fallback}
        aria-label={`Relationship to ${summaryLabel(target)}`}
        title={`What it does with ${summaryLabel(target)}: runs in, uses, reads from, calls… Empty means “${fallback}”.`}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          const edits = setRelationshipEdits(spec, index, target, e.target.value);
          if (edits.length) edit(edits);
        }}
        onBlur={() => setDraft(undefined)}
      />
      <datalist id={listId}>
        {RELATIONSHIPS.map((r) => (
          <option key={r.label} value={r.label} />
        ))}
      </datalist>
    </>
  );
}

const CHECKLISTS: Partial<Record<Category, { title: string; icon: string; verb: string; empty: string }>> = {
  dataAsset: { title: 'Data assets', icon: 'database', verb: 'Uses', empty: 'No data assets in the catalog yet. Add one to record the sensitive information this entity handles.' },
  network: { title: 'Networks', icon: 'globe', verb: 'Runs in', empty: 'No networks in the catalog yet. Add one, or import them from a threat model on the overview page.' },
  artifact: { title: 'Artifacts', icon: 'archive', verb: 'Uses', empty: 'No artifacts in the catalog yet: packages, container images, charts or binaries this entity uses.' },
};

/** Badge shown next to a data asset (classification), network (trust zone) or artifact (type). */
function EntityBadge({ entity }: { entity: KnownEntity }) {
  const { spec } = useCatalog();
  const { context } = useWorkspace();
  const doc = entity.index !== undefined ? documentsOf(spec)[entity.index] : undefined;
  if (entity.category === 'dataAsset') {
    const classification = str(getIn(doc, ['metadata', 'labels', CLASSIFICATION_LABEL]));
    return classification ? <span className={`classification classification-${classification}`}>{classification}</span> : null;
  }
  if (entity.category === 'network' && entity.trustZone) {
    const zone = context?.threatModels.find((t) => t.path === entity.trustZone!.path)?.trustZones.find((z) => z.id === entity.trustZone!.id);
    return (
      <span className="trust-badge" title={`Trust zone ${entity.trustZone.id} of ${entity.trustZone.path}`}>
        <span className="codicon codicon-shield" aria-hidden="true" /> {zone ? `${zone.name}${zone.trustRating !== undefined ? ` · trust ${zone.trustRating}` : ''}` : entity.trustZone.id}
      </span>
    );
  }
  if (entity.category === 'artifact') {
    const type = str(getIn(doc, ['metadata', 'annotations', ARTIFACT_TYPE_ANNOTATION]));
    return type ? <span className="muted small mono">{type}</span> : null;
  }
  return null;
}

/** Data assets, networks or artifacts an entity uses, as `resource:name` entries of `dependsOn`. */
export function DependsOnChecklist({ index, category, children }: { index: number; category: 'dataAsset' | 'network' | 'artifact'; children?: React.ReactNode }) {
  const { spec, edit, navigate } = useCatalog();
  const { known, context } = useWorkspace();
  const info = entityAt(spec, index)!;
  const texts = CHECKLISTS[category]!;
  const singular = CATEGORIES[category].singular;
  const field = refField(info.kind, 'dependsOn')!;
  const path = entityPath(index, 'spec', 'dependsOn');
  const list = stringList(getIn(info.entity, ['spec', 'dependsOn']));
  const candidates = known.filter((e) => e.category === category && e.key !== keyOf(info));
  const usedKeys = new Set(list.map((text) => refTarget(text, field, info.namespace)));
  const toggle = (target: KnownEntity, on: boolean) => {
    if (on) return edit(addRefEdits(spec, index, 'dependsOn', target));
    const positions = list.map((text, i) => (refTarget(text, field, info.namespace) === target.key ? i : -1)).filter((i) => i >= 0);
    if (positions.length === list.length) return edit({ op: 'delete', path });
    edit(positions.reverse().map((i): SpecEdit => ({ op: 'delete', path: [...path, i] })));
  };
  const system = str(getIn(info.entity, ['spec', 'system']));
  const count = candidates.filter((a) => usedKeys.has(a.key)).length;

  return (
    <Section title={texts.title} icon={texts.icon} count={count}>
      {candidates.length === 0 && <p className="muted">{texts.empty}</p>}
      {candidates.map((target) => (
        <div key={target.key} className="list-row">
          <input type="checkbox" aria-label={`${texts.verb} ${summaryLabel(target)}`} checked={usedKeys.has(target.key)} onChange={(e) => toggle(target, e.target.checked)} />
          <EntityLink entity={target} />
          <EntityBadge entity={target} />
          {usedKeys.has(target.key) && <RelationshipInput index={index} target={target} />}
        </div>
      ))}
      {children}
      <div className="list-row">
        <CreateButton
          label={`New ${singular.toLowerCase()}`}
          singular={singular.toLowerCase()}
          onCreate={(name) => {
            const created = newEntity(spec, category, name, { namespace: info.namespace, spec: system && category !== 'network' ? { system } : {} }, context);
            const target = { kind: 'Resource', namespace: info.namespace, name: str((created.metadata as JsonObject).name) };
            edit([appendEntityEdit(spec, created), ...addRefEdits(spec, index, 'dependsOn', target)]);
            navigate(entityLocation(documentsOf(spec).length));
          }}
        />
        <span className="muted small">
          Written as <code>resource:name</code> entries of dependsOn; a relationship other than “{defaultRelationship({ category })}” goes to{' '}
          <code>{RELATIONSHIPS_ANNOTATION}</code>.
        </span>
      </div>
    </Section>
  );
}

/** Specs and threat models of a set of entities, to see at a glance what is covered. */
export function CoverageTable({ entities }: { entities: KnownEntity[] }) {
  const { known } = useWorkspace();
  const { fileAt } = useFiles();
  if (!entities.length) return null;
  const name = (path: string) => fileAt(path)?.name || baseName(path);
  return (
    <div className="table coverage-table" role="table">
      <div className="table-head" role="row">
        <span>Entity</span>
        <span>Specifications</span>
        <span>Threat models</span>
      </div>
      {entities.map((entity) => {
        const specs = specsFor(entity.key, known);
        const threats = threatModelsFor(entity.key, known);
        return (
          <div key={entity.key} className="table-row" role="row">
            <EntityLink entity={entity} showKind />
            <span className="small">{specs.length ? specs.map((s) => name(s.path)).join(', ') : <span className="muted">none</span>}</span>
            <span className="small">
              {threats.length ? (
                threats.map((t) => `${name(t.path)}${t.from ? ` (from ${summaryLabel(t.from)})` : ''}`).join(', ')
              ) : (
                <span className="warning-text">none</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const describeImpact = ({ removed, broken }: { removed: number; broken: number }) =>
  broken ? ` (${plural(broken, 'reference')} will point to nothing)` : removed ? ` (also removes ${plural(removed, 'link')} to it)` : '';

