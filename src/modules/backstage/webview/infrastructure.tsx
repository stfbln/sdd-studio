import { getIn } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { Field, Section } from '../../../webview/structured/fields';
import { addRefEdits, importNetworksEdits, placeLikeThreatModelEdits, setAnnotationEdits, setParentNetworkEdits, unlinkAnnotationEdits } from '../core/edits';
import {
  annotationList,
  ARTIFACT_TYPE_ANNOTATION,
  ARTIFACT_TYPES,
  BRANCH_ANNOTATION,
  CIDR_ANNOTATION,
  CLOUD_PROVIDER_ANNOTATION,
  CLOUD_PROVIDERS,
  codeLocationOf,
  DEPLOYED_ON_ANNOTATION,
  dirOfDocument,
  fileOfDocument,
  entityPath,
  formatTrustZoneRef,
  keyOf,
  parentKey,
  placementsOf,
  PROVIDER_ANNOTATION,
  PROVIDERS,
  PURL_ANNOTATION,
  refField,
  refTarget,
  REGION_ANNOTATION,
  REPOSITORY_ANNOTATION,
  REPOSITORY_PATH_ANNOTATION,
  REPOSITORY_URL_ANNOTATION,
  SITE_ANNOTATION,
  SOURCE_LOCATION_ANNOTATION,
  splitList,
  str,
  summarizeEntity,
  summaryLabel,
  SUPPLIER_ANNOTATION,
  trustZoneRef,
  TRUST_ZONE_ANNOTATION,
  PRODUCED_BY_ANNOTATION,
  ancestors,
  incoming,
  entitiesOf,
  CATEGORIES,
  formatRef,
  type EntityInfo,
  type KnownEntity,
} from '../core/model';
import { AnnotationField, EntityLink, RefInput } from './controls';
import { useCatalog, useWorkspace } from './state';

/* Code --------------------------------------------------------------------- */

/** Repository holding the code of an entity, the path inside it, and the source location Backstage gets. */
export function CodeSection({ info }: { info: EntityInfo }) {
  const { spec } = useCatalog();
  const { known, context } = useWorkspace();
  const summary = summarizeEntity(info, fileOfDocument(spec, info.index, context));
  const { repository, location } = codeLocationOf(summary, known);
  const current = str(getIn(info.entity, ['metadata', 'annotations', SOURCE_LOCATION_ANNOTATION]));
  const linked = !!str(getIn(spec, entityPath(info.index, 'metadata', 'annotations', REPOSITORY_ANNOTATION)));
  return (
    <Section title="Code" icon="repo">
      <div className="form-grid">
        <RefInput index={info.index} field={refField(info.kind, 'repository')!} hint="The repository holding the code of this entity." />
        <AnnotationField
          index={info.index}
          annotation={REPOSITORY_PATH_ANNOTATION}
          label="Path in the repository"
          placeholder={info.category === 'artifact' ? 'e.g. docker/Dockerfile' : 'e.g. services/shop-api'}
          mono
          hint="Leave empty when the whole repository is about this entity."
        />
      </div>
      {linked && (
        <p className="muted small">
          {current ? (
            <>
              Backstage source location: <code>{current}</code>
              {location && current !== location ? ' (written by hand, kept as is)' : ''}
            </>
          ) : repository ? (
            'Give the repository a web URL (and a provider for sub-paths) to also write backstage.io/source-location.'
          ) : null}
        </p>
      )}
    </Section>
  );
}

/** Entities whose code is in this repository, with a way to link more. */
function HoldsCodeSection({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const key = keyOf(info);
  const holders = info.name ? incoming(key, known).filter((r) => r.field === 'repository') : [];
  const linkable = entitiesOf(spec).filter(
    (e) =>
      e.index !== info.index &&
      e.name &&
      refField(e.kind, 'repository') &&
      ['component', 'api', 'resource', 'artifact', 'network', 'platform', 'infrastructure'].includes(e.category) &&
      !str(getIn(e.entity, ['metadata', 'annotations', REPOSITORY_ANNOTATION])),
  );
  return (
    <Section title="Holds code for" icon="file-code" count={holders.length}>
      {holders.length === 0 && <p className="muted">No component, resource or artifact points to this repository yet.</p>}
      {holders.map(({ entity }) => (
        <div key={entity.key} className="list-row">
          <EntityLink entity={entity} showKind />
          {entity.repositoryPath && <span className="muted small mono">{entity.repositoryPath}</span>}
        </div>
      ))}
      {linkable.length > 0 && (
        <div className="list-row">
          <select
            className="keyword-select link-select"
            aria-label="Link an entity to this repository"
            value=""
            onChange={(e) => {
              const target = entitiesOf(spec).find((t) => String(t.index) === e.target.value);
              if (target) edit(setAnnotationEdits(spec, target.index, REPOSITORY_ANNOTATION, formatRef(info, 'Resource', target.namespace)));
            }}
          >
            <option value="">Link an entity of this file…</option>
            {linkable.map((e) => (
              <option key={e.index} value={e.index}>
                {summaryLabel(summarizeEntity(e, fileOfDocument(spec, e.index, context)))} ({CATEGORIES[e.category].singular})
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

export function RepositorySections({ info }: { info: EntityInfo }) {
  const url = str(getIn(info.entity, ['metadata', 'annotations', REPOSITORY_URL_ANNOTATION]));
  const provider = str(getIn(info.entity, ['metadata', 'annotations', PROVIDER_ANNOTATION]));
  const perforce = provider.toLowerCase() === 'perforce';
  return (
    <>
      <Section title="Repository" icon="repo">
        <div className="form-grid">
          <AnnotationField index={info.index} annotation={PROVIDER_ANNOTATION} label="Provider" mono suggestions={PROVIDERS} placeholder="gitlab, github, perforce…" />
          <AnnotationField
            index={info.index}
            annotation={REPOSITORY_URL_ANNOTATION}
            label={perforce ? 'Server and depot path' : 'URL'}
            mono
            invalid={!url.trim()}
            placeholder={perforce ? 'ssl:perforce.example.com:1666 //depot/shop' : 'https://gitlab.com/acme/shop'}
          />
          <AnnotationField index={info.index} annotation={BRANCH_ANNOTATION} label={perforce ? 'Stream' : 'Default branch'} mono placeholder={perforce ? '//shop/main' : 'main'} />
        </div>
        {/^https?:\/\//i.test(url) && (
          <p className="muted small">
            Entities of this file linked to the repository get <code>backstage.io/source-location</code> from this URL, the provider and the branch.
          </p>
        )}
      </Section>
      <HoldsCodeSection info={info} />
    </>
  );
}

/* Deployment ----------------------------------------------------------------
 * "Deployed on" is written as a comma-separated sdd-studio/deployed-on annotation on the
 * component or resource being deployed (the only many-valued annotation reference field).
 */

/** Badge naming which kind of platform or infrastructure a deployment target is. */
function DeploymentBadge({ entity }: { entity: KnownEntity }) {
  return <span className="muted small">{CATEGORIES[entity.category].singular}</span>;
}

/** Platforms and infrastructure a component or resource is deployed on, with a way to add more. */
export function DeployedOnSection({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const field = refField(info.kind, 'deployedOn');
  if (!field) return null;
  const texts = annotationList(info.entity, DEPLOYED_ON_ANNOTATION);
  const candidates = known.filter((e) => (e.category === 'platform' || e.category === 'infrastructure') && e.key !== keyOf(info));
  const usedKeys = new Set(texts.map((t) => refTarget(t, field, info.namespace)));
  const toggle = (target: KnownEntity, on: boolean) => {
    if (on) return edit(addRefEdits(spec, info.index, 'deployedOn', target));
    const written = texts.find((t) => refTarget(t, field, info.namespace) === target.key);
    if (written) edit(unlinkAnnotationEdits(info, spec, DEPLOYED_ON_ANNOTATION, written));
  };
  const count = candidates.filter((c) => usedKeys.has(c.key)).length;
  return (
    <Section title="Deployed on" icon="rocket" count={count}>
      {candidates.length === 0 && <p className="muted">No platform or infrastructure in the catalog yet: Kubernetes clusters, PaaS, VMs or bare-metal servers this runs on.</p>}
      {candidates.map((target) => (
        <div key={target.key} className="list-row">
          <input type="checkbox" aria-label={`Deployed on ${summaryLabel(target)}`} checked={usedKeys.has(target.key)} onChange={(e) => toggle(target, e.target.checked)} />
          <EntityLink entity={target} />
          <DeploymentBadge entity={target} />
        </div>
      ))}
      <div className="list-row">
        <span className="muted small">
          Written as <code>{DEPLOYED_ON_ANNOTATION}</code>, a comma-separated list of platforms and infrastructure.
        </span>
      </div>
      {!context && <p className="muted small">Looking at the workspace…</p>}
    </Section>
  );
}

/** Entities deployed on this platform or infrastructure, with a way to link more. */
export function DeployedHereSection({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const key = keyOf(info);
  const deployed = info.name ? incoming(key, known).filter((r) => r.field === 'deployedOn') : [];
  const linkable = entitiesOf(spec).filter(
    (e) => e.index !== info.index && e.name && ['component', 'resource'].includes(e.category) && refField(e.kind, 'deployedOn') && !annotationList(e.entity, DEPLOYED_ON_ANNOTATION).some((t) => refTarget(t, refField(e.kind, 'deployedOn')!, e.namespace) === key),
  );
  const singular = CATEGORIES[info.category].singular.toLowerCase();
  return (
    <Section title="Deployed here" icon="rocket" count={deployed.length}>
      {deployed.length === 0 && <p className="muted">No component or resource is deployed on this {singular} yet.</p>}
      {deployed.map(({ entity }) => (
        <div key={entity.key} className="list-row">
          <EntityLink entity={entity} showKind />
        </div>
      ))}
      {linkable.length > 0 && (
        <div className="list-row">
          <select
            className="keyword-select link-select"
            aria-label={`Deploy an entity of this file on this ${singular}`}
            value=""
            onChange={(e) => {
              const target = entitiesOf(spec).find((t) => String(t.index) === e.target.value);
              if (target) edit(addRefEdits(spec, target.index, 'deployedOn', info));
            }}
          >
            <option value="">Deploy an entity of this file…</option>
            {linkable.map((e) => (
              <option key={e.index} value={e.index}>
                {summaryLabel(summarizeEntity(e, fileOfDocument(spec, e.index, context)))} ({CATEGORIES[e.category].singular})
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

/** Cloud region or physical location a network, platform or piece of infrastructure runs in. */
export function SiteField({ info }: { info: EntityInfo }) {
  const field = refField(info.kind, 'site');
  if (!field) return null;
  return (
    <Section title="Site" icon="location">
      <div className="form-grid">
        <RefInput index={info.index} field={field} hint="The cloud provider region or physical location this runs in." />
      </div>
    </Section>
  );
}

/** Entities linked to this site (networks, platforms, infrastructure), with a way to link more. */
function HostsSection({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const key = keyOf(info);
  const hosted = info.name ? incoming(key, known).filter((r) => r.field === 'site') : [];
  const linkable = entitiesOf(spec).filter(
    (e) => e.index !== info.index && e.name && refField(e.kind, 'site') && ['network', 'platform', 'infrastructure'].includes(e.category) && !str(getIn(e.entity, ['metadata', 'annotations', SITE_ANNOTATION])),
  );
  return (
    <Section title="Hosts" icon="server" count={hosted.length}>
      {hosted.length === 0 && <p className="muted">No network, platform or infrastructure points to this site yet.</p>}
      {hosted.map(({ entity }) => (
        <div key={entity.key} className="list-row">
          <EntityLink entity={entity} showKind />
        </div>
      ))}
      {linkable.length > 0 && (
        <div className="list-row">
          <select
            className="keyword-select link-select"
            aria-label="Link an entity to this site"
            value=""
            onChange={(e) => {
              const target = entitiesOf(spec).find((t) => String(t.index) === e.target.value);
              if (target) edit(setAnnotationEdits(spec, target.index, SITE_ANNOTATION, formatRef(info, 'Resource', target.namespace)));
            }}
          >
            <option value="">Link an entity of this file…</option>
            {linkable.map((e) => (
              <option key={e.index} value={e.index}>
                {summaryLabel(summarizeEntity(e, fileOfDocument(spec, e.index, context)))} ({CATEGORIES[e.category].singular})
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

export function SiteSections({ info }: { info: EntityInfo }) {
  return (
    <>
      <Section title="Site" icon="location">
        <div className="form-grid">
          <AnnotationField index={info.index} annotation={CLOUD_PROVIDER_ANNOTATION} label="Cloud provider" mono suggestions={CLOUD_PROVIDERS} placeholder="aws, azure, gcp, on-prem…" />
          <AnnotationField index={info.index} annotation={REGION_ANNOTATION} label="Region / address" placeholder="e.g. us-east-1, Datacenter B, rack 12" />
        </div>
      </Section>
      <HostsSection info={info} />
    </>
  );
}

/* Artifacts ---------------------------------------------------------------- */

export function ArtifactSections({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const purl = str(getIn(info.entity, ['metadata', 'annotations', PURL_ANNOTATION]));
  return (
    <>
      <Section title="Artifact" icon="archive">
        <div className="form-grid">
          <AnnotationField index={info.index} annotation={ARTIFACT_TYPE_ANNOTATION} label="Artifact type" mono suggestions={ARTIFACT_TYPES} placeholder="container-image, npm-package…" />
          <AnnotationField
            index={info.index}
            annotation={PURL_ANNOTATION}
            label="Package URL (purl)"
            mono
            invalid={!!purl && !/^pkg:[a-zA-Z][a-zA-Z0-9.+-]*\/./.test(purl)}
            placeholder="pkg:docker/acme/shop-api"
            hint={
              <>
                Identifies the artifact in registries and SBOMs, e.g. <code>pkg:npm/%40acme/ui@2.1.0</code>.
              </>
            }
          />
        </div>
      </Section>
      <Section title="Origin" icon="package">
        <div className="form-grid">
          <RefInput index={info.index} field={refField(info.kind, 'producedBy')!} hint="Component, system, team or repository of the catalog building it." />
          <AnnotationField index={info.index} annotation={SUPPLIER_ANNOTATION} label="External supplier" placeholder="e.g. PostgreSQL Global Development Group" hint="Organization or project outside the catalog providing it." />
        </div>
        {!!str(getIn(info.entity, ['metadata', 'annotations', SUPPLIER_ANNOTATION])) && !!str(getIn(info.entity, ['metadata', 'annotations', PRODUCED_BY_ANNOTATION])) && (
          <p className="notice">
            <span className="codicon codicon-info" aria-hidden="true" />
            Both an entity of the catalog and an external supplier are given.
            <IconButton icon="close" label="Remove the supplier" showLabel onClick={() => edit(setAnnotationEdits(spec, info.index, SUPPLIER_ANNOTATION, undefined))} />
          </p>
        )}
      </Section>
    </>
  );
}

/* Networks ----------------------------------------------------------------- */

function TrustZoneField({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { context, openFile } = useWorkspace();
  const dir = dirOfDocument(spec, info.index, context);
  const zone = trustZoneRef(info.entity, dir);
  const outline = zone?.path ? context?.threatModels.find((t) => t.path === zone.path) : undefined;
  const found = outline?.trustZones.find((z) => z.id === zone?.id);
  const value = zone?.path ? `${zone.path}#${zone.id}` : '';
  const models = context?.threatModels ?? [];
  return (
    <Field
      label="Trust zone"
      hint={
        found ? (
          <span className="list-row">
            <span className="trust-badge">
              <span className="codicon codicon-shield" aria-hidden="true" /> {found.name}
              {found.trustRating !== undefined ? ` · trust ${found.trustRating}` : ''}
              {found.type ? ` · ${found.type}` : ''}
            </span>
            <button type="button" className="link-button" onClick={() => openFile(outline!.path)}>
              {outline!.name || outline!.path}
            </button>
          </span>
        ) : zone ? (
          <span className="warning-text">{zone.written} is not a trust zone of the threat models of the workspace</span>
        ) : (
          'The trust zone of a threat model this network stands for.'
        )
      }
    >
      <select
        className={`keyword-select ${zone && !found && context ? 'invalid' : ''}`}
        value={value}
        onChange={(e) => {
          const [path, id] = [e.target.value.slice(0, e.target.value.lastIndexOf('#')), e.target.value.slice(e.target.value.lastIndexOf('#') + 1)];
          edit(setAnnotationEdits(spec, info.index, TRUST_ZONE_ANNOTATION, e.target.value ? formatTrustZoneRef(dir, path, id) : undefined));
        }}
      >
        <option value="">(no trust zone)</option>
        {zone && !found && <option value={value}>{zone.written} (missing)</option>}
        {models.map((model) => (
          <optgroup key={model.path} label={model.name ? `${model.name} — ${model.path}` : model.path}>
            {model.trustZones.map((z) => (
              <option key={z.id} value={`${model.path}#${z.id}`}>
                {z.name || z.id}
                {z.trustRating !== undefined ? ` (trust ${z.trustRating})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

function ParentNetworkField({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const summary = summarizeEntity(info, fileOfDocument(spec, info.index, context));
  const key = summary.key;
  const parent = parentKey(summary, known);
  // A network cannot sit in itself or in one of its subnetworks.
  const options = known.filter((e) => e.category === 'network' && e.key !== key && !ancestors(e.key, known).some((a) => a.key === key));
  return (
    <Field label="Part of network" hint="Written as the first network of dependsOn.">
      <select
        className="keyword-select"
        value={parent ?? ''}
        onChange={(e) => edit(setParentNetworkEdits(spec, info.index, known.find((n) => n.key === e.target.value), known))}
      >
        <option value="">(none)</option>
        {options.map((n) => (
          <option key={n.key} value={n.key}>
            {summaryLabel(n)}
            {n.index === undefined ? ` — ${n.file}` : ''}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function NetworkSections({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const path = entityPath(info.index, 'metadata', 'annotations', CIDR_ANNOTATION);
  const ranges = splitList(getIn(spec, path));
  return (
    <Section title="Network" icon="globe">
      <div className="form-grid">
        <TrustZoneField info={info} />
        <ParentNetworkField info={info} />
        <Field label="IP ranges" hint="CIDR blocks, e.g. 10.0.0.0/16.">
          <ChipsInput values={ranges} placeholder="Add range…" onChange={(next) => edit(setAnnotationEdits(spec, info.index, CIDR_ANNOTATION, next.join(', ')))} />
        </Field>
      </div>
    </Section>
  );
}

/** How the threat models applying to an entity place it, next to the networks it runs in. */
export function PlacementNotes({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  if (!info.name) return null;
  const placements = placementsOf(keyOf(info), known, context);
  return (
    <>
      {placements.map((p) => {
        const zone = p.outline.trustZones.find((z) => z.id === p.component.trustZone);
        const where = zone ? `trust zone ${zone.name || zone.id}` : 'no trust zone';
        const placed = p.actual.length > 0;
        const status = !placed ? (p.expected.length ? 'suggest' : 'info') : p.matches ? 'ok' : 'mismatch';
        return (
          <p key={p.outline.path} className={`notice placement placement-${status}`}>
            <span className={`codicon codicon-${status === 'ok' ? 'pass' : status === 'mismatch' ? 'warning' : 'shield'}`} aria-hidden="true" />
            <span>
              {p.outline.name || p.outline.path} places {p.component.name || p.component.id} in {where}
              {status === 'ok' && ', like its networks.'}
              {status === 'mismatch' && `, not in ${p.actual.map(summaryLabel).join(', ')}.`}
              {status === 'suggest' && `, which ${p.expected.map(summaryLabel).join(', ')} stands for.`}
              {status === 'info' && (zone ? '; no network stands for it yet.' : '.')}
            </span>
            {(status === 'suggest' || status === 'mismatch') && p.expected.length > 0 && (
              <IconButton icon="check" label="Place it like the threat model" showLabel onClick={() => edit(placeLikeThreatModelEdits(spec, info.index, p))} />
            )}
          </p>
        );
      })}
    </>
  );
}

/** Creates networks for the trust zones of a threat model. */
export function ImportNetworks() {
  const { spec, edit } = useCatalog();
  const { context, known, consolidated } = useWorkspace();
  const models = (context?.threatModels ?? []).map((model) => {
    const networks = known.filter((n) => n.category === 'network' && n.trustZone?.path === model.path);
    return {
      model,
      missing: model.trustZones.filter((z) => z.id && !networks.some((n) => n.trustZone!.id === z.id)).length,
      elsewhere: [...new Set(networks.filter((n) => n.index === undefined).map((n) => n.file))],
    };
  });
  if (!models.length) return null;
  return (
    <div className="list-row">
      <select
        className="keyword-select link-select"
        aria-label="Import networks from a threat model"
        value=""
        onChange={(e) => {
          const model = context!.threatModels.find((m) => m.path === e.target.value);
          if (!model) return;
          if (consolidated) consolidated.editIn(consolidated.target, importNetworksEdits(spec, model, context, consolidated.target));
          else edit(importNetworksEdits(spec, model, context));
        }}
      >
        <option value="">Import networks from a threat model…</option>
        {models.map(({ model, missing, elsewhere }) => (
          <option key={model.path} value={model.path} disabled={missing === 0}>
            {model.name || model.path} — {missing ? `${missing} trust zone${missing === 1 ? '' : 's'} without network` : 'every trust zone has a network'}
            {elsewhere.length ? ` (networks also in ${elsewhere.join(', ')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
