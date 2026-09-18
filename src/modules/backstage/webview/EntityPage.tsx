import { getIn } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { ChipsField, Field, Section, TextField } from '../../../webview/structured/fields';
import { moveEntityEdits } from '../core/consolidated';
import { deleteEntityEdits, deleteImpact } from '../core/edits';
import {
  CATEGORIES,
  CLASSIFICATION_LABEL,
  ARTIFACT_TYPE,
  CLOUD_PROVIDER_ANNOTATION,
  DATA_ASSET_TYPE,
  DEPLOYED_ON_ANNOTATION,
  INFRASTRUCTURE_TYPE,
  NETWORK_TYPE,
  PLATFORM_TYPE,
  REGION_ANNOTATION,
  REPOSITORY_TYPE,
  SITE_ANNOTATION,
  SITE_TYPE,
  dirOf,
  documentFiles,
  documentsOf,
  fileOfDocument,
  entityAt,
  entityPath,
  incoming,
  keyOf,
  LIFECYCLES,
  refField,
  RELATIONSHIPS_ANNOTATION,
  relativePath,
  resolvePath,
  SPECS_ANNOTATION,
  ARTIFACT_TYPE_ANNOTATION,
  BRANCH_ANNOTATION,
  CIDR_ANNOTATION,
  PRODUCED_BY_ANNOTATION,
  PROVIDER_ANNOTATION,
  PURL_ANNOTATION,
  REPOSITORY_ANNOTATION,
  REPOSITORY_PATH_ANNOTATION,
  REPOSITORY_URL_ANNOTATION,
  SUPPLIER_ANNOTATION,
  TRUST_ZONE_ANNOTATION,
  str,
  stringList,
  THREAT_MODELS_ANNOTATION,
  TYPE_SUGGESTIONS,
  type Category,
  type EntityInfo,
} from '../core/model';
import { KeyValueSection, LinksSection, NameField, RefInput, RefListField } from './controls';
import { ArtifactSections, CodeSection, DeployedHereSection, DeployedOnSection, NetworkSections, PlacementNotes, RepositorySections, SiteField, SiteSections } from './infrastructure';
import { ContentsSection, CoverageTable, DependenciesSection, DependsOnChecklist, DefinitionSection, describeImpact, RelationsSection, SpecificationsSection, ThreatModelsSection } from './sections';
import { entityLocation, sameLocation, useCatalog, useField, useWorkspace } from './state';

const RESOURCE_TYPE_OF: Partial<Record<Category, string>> = {
  dataAsset: DATA_ASSET_TYPE,
  network: NETWORK_TYPE,
  artifact: ARTIFACT_TYPE,
  repository: REPOSITORY_TYPE,
  platform: PLATFORM_TYPE,
  infrastructure: INFRASTRUCTURE_TYPE,
  site: SITE_TYPE,
};

/** Consolidated view: the catalog file of the entity, and moving it to another one. */
function FileOfEntity({ info }: { info: EntityInfo }) {
  const { spec, edit, navigate } = useCatalog();
  const { consolidated, openFile } = useWorkspace();
  const file = documentFiles(spec)?.[info.index];
  if (!consolidated || file === undefined) return null;
  return (
    <p className="entity-file">
      <span className="codicon codicon-file" aria-hidden="true" />
      <button type="button" className="link-button mono" title="Open the catalog file" onClick={() => openFile(file)}>
        {file}
      </button>
      {consolidated.files.length > 1 && (
        <select
          className="keyword-select compact"
          aria-label="Move to another catalog file"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const edits = moveEntityEdits(spec, info.index, e.target.value);
            edit(edits);
            navigate(entityLocation(documentsOf(spec).length - 1));
          }}
        >
          <option value="">Move to file…</option>
          {consolidated.files
            .filter((f) => f !== file)
            .map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
        </select>
      )}
    </p>
  );
}

function Header({ info }: { info: EntityInfo }) {
  const { spec, edit, navigate } = useCatalog();
  const { issues } = useWorkspace();
  const { singular, icon } = info.category === 'other' ? { singular: info.kind || 'Entity', icon: CATEGORIES.other.icon } : CATEGORIES[info.category];
  const [title, setTitle] = useField(entityPath(info.index, 'metadata', 'title'));
  const [description, setDescription] = useField(entityPath(info.index, 'metadata', 'description'));
  const own = issues.filter((i) => sameLocation(i.location, entityLocation(info.index)));
  return (
    <>
      <div className="page-title-row">
        <span className={`codicon codicon-${icon}`} aria-hidden="true" />
        <input
          className="input title-input grow"
          aria-label="Title"
          placeholder={info.name || `${singular} title`}
          value={str(title)}
          onChange={(e) => setTitle(e.target.value)}
        />
        <IconButton
          icon="trash"
          label={`Delete ${singular.toLowerCase()}${describeImpact(deleteImpact(spec, info.index))}`}
          onClick={() => {
            edit(deleteEntityEdits(spec, info.index));
            navigate({ kind: 'overview' });
          }}
        />
      </div>
      <AutoTextarea
        className="description-input"
        value={str(description)}
        placeholder={`Add a description of this ${singular.toLowerCase()}…`}
        onChange={(v) => setDescription(v)}
      />
      <p className="muted small">
        {RESOURCE_TYPE_OF[info.category] ? `${singular} (Resource of type ${RESOURCE_TYPE_OF[info.category]})` : singular}
        {info.name && <span className="mono"> · {info.kind.toLowerCase()}:{info.namespace === 'default' ? '' : `${info.namespace}/`}{info.name}</span>}
      </p>
      <FileOfEntity info={info} />
      {own.length > 0 && <ProblemsList issues={own} onNavigate={navigate} />}
    </>
  );
}

/** Name, title, namespace, description and tags, followed by the kind's own fields. */
function About({ info, children }: { info: EntityInfo; children?: React.ReactNode }) {
  const base = entityPath(info.index, 'metadata');
  return (
    <Section title="About" icon="info">
      <div className="form-grid">
        <NameField index={info.index} />
        <TextField path={[...base, 'namespace']} label="Namespace" mono placeholder="default" hint="Changing it does not update references." />
        {children}
        <ChipsField path={[...base, 'tags']} label="Tags" placeholder="Add tag (lowercase, e.g. java)" />
      </div>
    </Section>
  );
}

function TypeField({ info, required = true, hint }: { info: EntityInfo; required?: boolean; hint?: string }) {
  const listId = `types-${info.category}`;
  return (
    <>
      <TextField path={entityPath(info.index, 'spec', 'type')} label="Type" required={required} mono list={listId} hint={hint} />
      <datalist id={listId}>
        {(TYPE_SUGGESTIONS[info.category] ?? []).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

function LifecycleField({ info }: { info: EntityInfo }) {
  return (
    <>
      <TextField path={entityPath(info.index, 'spec', 'lifecycle')} label="Lifecycle" required mono list="lifecycles" hint="experimental, production or deprecated." />
      <datalist id="lifecycles">
        {LIFECYCLES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

const ref = (info: EntityInfo, field: string) => <RefInput index={info.index} field={refField(info.kind, field)!} />;

/** Annotations shown through their own dedicated field, never in the generic Annotations list. */
const ALWAYS_HIDDEN_ANNOTATIONS = [REPOSITORY_ANNOTATION, REPOSITORY_PATH_ANNOTATION, DEPLOYED_ON_ANNOTATION];

function Metadata({ info, hiddenLabels = [], hiddenAnnotations = [] }: { info: EntityInfo; hiddenLabels?: string[]; hiddenAnnotations?: string[] }) {
  return (
    <>
      <LinksSection index={info.index} />
      <KeyValueSection index={info.index} map="labels" title="Labels" icon="tag" hidden={hiddenLabels} empty="Identifying values used to filter entities, e.g. tier: critical." />
      <KeyValueSection
        index={info.index}
        map="annotations"
        title="Annotations"
        icon="note"
        hidden={[SPECS_ANNOTATION, THREAT_MODELS_ANNOTATION, ...ALWAYS_HIDDEN_ANNOTATIONS, ...hiddenAnnotations]}
        empty="Values read by Backstage plugins, e.g. github.com/project-slug or backstage.io/techdocs-ref."
      />
    </>
  );
}

function DomainPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'subdomainOf')}
        <TypeField info={info} required={false} />
      </About>
      <ContentsSection index={info.index} />
      <SpecificationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} />
    </>
  );
}

function SystemPage({ info }: { info: EntityInfo }) {
  const { known } = useWorkspace();
  const parts = info.name ? incoming(keyOf(info), known).filter((r) => r.field === 'system').map((r) => r.entity) : [];
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'domain')}
        <TypeField info={info} required={false} />
      </About>
      <ContentsSection index={info.index} />
      {parts.length > 0 && (
        <Section title="Coverage" icon="checklist" count={parts.length}>
          <p className="muted small">What each part of the system implements, and the threat models applying to it.</p>
          <CoverageTable entities={parts} />
        </Section>
      )}
      <SpecificationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} />
    </>
  );
}

function ComponentPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        <TypeField info={info} hint="service, website, library, cli, mobile-app…" />
        <LifecycleField info={info} />
        {ref(info, 'owner')}
        {ref(info, 'system')}
        {ref(info, 'subcomponentOf')}
      </About>
      <SpecificationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <Section title="APIs" icon="plug">
        <div className="form-grid">
          <RefListField index={info.index} field={refField(info.kind, 'providesApis')!} placeholder="Add API…" />
          <RefListField index={info.index} field={refField(info.kind, 'consumesApis')!} placeholder="Add API…" />
        </div>
      </Section>
      <CodeSection info={info} />
      <DeployedOnSection info={info} />
      <DependsOnChecklist index={info.index} category="network">
        <PlacementNotes info={info} />
      </DependsOnChecklist>
      <DependsOnChecklist index={info.index} category="dataAsset" />
      <DependsOnChecklist index={info.index} category="artifact" />
      <DependenciesSection index={info.index} />
      <ContentsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[RELATIONSHIPS_ANNOTATION]} />
    </>
  );
}

function ApiPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        <TypeField info={info} hint="Follows the definition file: openapi, asyncapi, grpc, opencli…" />
        <LifecycleField info={info} />
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <DefinitionSection index={info.index} />
      <CodeSection info={info} />
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} />
    </>
  );
}

function ResourcePage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        <TypeField info={info} hint="database, queue, s3-bucket, external-service…" />
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <DependsOnChecklist index={info.index} category="network">
        <PlacementNotes info={info} />
      </DependsOnChecklist>
      <DependsOnChecklist index={info.index} category="dataAsset" />
      <DependsOnChecklist index={info.index} category="artifact" />
      <CodeSection info={info} />
      <DeployedOnSection info={info} />
      <DependenciesSection index={info.index} />
      <SpecificationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[RELATIONSHIPS_ANNOTATION]} />
    </>
  );
}

function ClassificationField({ info }: { info: EntityInfo }) {
  const path = entityPath(info.index, 'metadata', 'labels', CLASSIFICATION_LABEL);
  const { spec, edit } = useCatalog();
  const value = str(getIn(spec, path));
  const labels = getIn(spec, entityPath(info.index, 'metadata', 'labels'));
  const onlyLabel = !!labels && typeof labels === 'object' && Object.keys(labels).length === 1;
  return (
    <Field label="Classification" hint={`Written as the ${CLASSIFICATION_LABEL} label.`}>
      <select
        className={`keyword-select classification-select classification-${value}`}
        value={value}
        onChange={(e) =>
          e.target.value
            ? edit({ op: 'set', path, value: e.target.value })
            : edit({ op: 'delete', path: onlyLabel ? entityPath(info.index, 'metadata', 'labels') : path })
        }
      >
        <option value="">(not classified)</option>
        {['public', 'internal', 'confidential', 'restricted', ...(value && !['public', 'internal', 'confidential', 'restricted'].includes(value) ? [value] : [])].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DataAssetPage({ info }: { info: EntityInfo }) {
  const stored = stringList(getIn(info.entity, ['spec', 'dependsOn'])).length;
  return (
    <>
      <About info={info}>
        <ClassificationField info={info} />
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <Section title="Stored in" icon="server" count={stored}>
        <RefListField index={info.index} field={{ ...refField(info.kind, 'dependsOn')!, label: 'Resources holding this data' }} placeholder="resource:orders-db" />
        <p className="muted small">Components and resources using this data check it in their “Data assets” section; they are listed under Relations.</p>
      </Section>
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenLabels={[CLASSIFICATION_LABEL]} />
    </>
  );
}

function NetworkPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <NetworkSections info={info} />
      <SiteField info={info} />
      <ContentsSection index={info.index} />
      <RelationsSection index={info.index} />
      <CodeSection info={info} />
      <ThreatModelsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[TRUST_ZONE_ANNOTATION, CIDR_ANNOTATION, SITE_ANNOTATION]} />
    </>
  );
}

function ArtifactPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <ArtifactSections info={info} />
      <CodeSection info={info} />
      <RelationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[ARTIFACT_TYPE_ANNOTATION, PURL_ANNOTATION, PRODUCED_BY_ANNOTATION, SUPPLIER_ANNOTATION]} />
    </>
  );
}

function RepositoryPage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <RepositorySections info={info} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[PROVIDER_ANNOTATION, REPOSITORY_URL_ANNOTATION, BRANCH_ANNOTATION]} />
    </>
  );
}

/** Platform (Kubernetes cluster, PaaS…) and infrastructure (VM, bare-metal server…) share the same shape. */
function PlatformOrInfrastructurePage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <SiteField info={info} />
      <DeployedHereSection info={info} />
      <DependsOnChecklist index={info.index} category="network">
        <PlacementNotes info={info} />
      </DependsOnChecklist>
      <DependsOnChecklist index={info.index} category="dataAsset" />
      <DependsOnChecklist index={info.index} category="artifact" />
      <CodeSection info={info} />
      <DependenciesSection index={info.index} />
      <SpecificationsSection index={info.index} />
      <ThreatModelsSection index={info.index} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[RELATIONSHIPS_ANNOTATION]} />
    </>
  );
}

function SitePage({ info }: { info: EntityInfo }) {
  return (
    <>
      <About info={info}>
        {ref(info, 'owner')}
        {ref(info, 'system')}
      </About>
      <SiteSections info={info} />
      <RelationsSection index={info.index} />
      <Metadata info={info} hiddenAnnotations={[CLOUD_PROVIDER_ANNOTATION, REGION_ANNOTATION]} />
    </>
  );
}

function GroupPage({ info }: { info: EntityInfo }) {
  const profile = entityPath(info.index, 'spec', 'profile');
  const { known } = useWorkspace();
  const owned = info.name ? incoming(keyOf(info), known).filter((r) => r.field === 'owner').map((r) => r.entity) : [];
  return (
    <>
      <About info={info}>
        <TypeField info={info} hint="team, business-unit, product-area…" />
        {ref(info, 'parent')}
        <TextField path={[...profile, 'displayName']} label="Display name" />
        <TextField path={[...profile, 'email']} label="Email" type="email" />
      </About>
      <Section title="Members" icon="organization">
        <div className="form-grid">
          <RefListField index={info.index} field={refField(info.kind, 'children')!} placeholder="Add group…" />
          <RefListField index={info.index} field={refField(info.kind, 'members')!} placeholder="Add user…" />
        </div>
      </Section>
      {owned.length > 0 && (
        <Section title="Owns" icon="briefcase" count={owned.length}>
          <CoverageTable entities={owned} />
        </Section>
      )}
      <Metadata info={info} />
    </>
  );
}

function UserPage({ info }: { info: EntityInfo }) {
  const profile = entityPath(info.index, 'spec', 'profile');
  return (
    <>
      <About info={info}>
        <TextField path={[...profile, 'displayName']} label="Display name" />
        <TextField path={[...profile, 'email']} label="Email" type="email" />
      </About>
      <Section title="Groups" icon="organization">
        <RefListField index={info.index} field={refField(info.kind, 'memberOf')!} placeholder="Add group…" />
      </Section>
      <RelationsSection index={info.index} />
      <Metadata info={info} />
    </>
  );
}

function LocationPage({ info }: { info: EntityInfo }) {
  const { spec, edit } = useCatalog();
  const { context, openFile } = useWorkspace();
  const ownFile = fileOfDocument(spec, info.index, context);
  const dir = dirOf(ownFile);
  const path = entityPath(info.index, 'spec', 'targets');
  const targets = getIn(spec, path);
  const list = stringList(targets);
  const available = (context?.catalogFiles ?? [])
    .filter((file) => file !== ownFile)
    .map((file) => relativePath(dir, file))
    .filter((t) => !list.includes(t));
  return (
    <>
      <About info={info}>
        <TextField path={entityPath(info.index, 'spec', 'type')} label="Type" mono placeholder="url" hint="url (default) or file." />
        <TextField path={entityPath(info.index, 'spec', 'target')} label="Target" mono placeholder="./other/catalog-info.yaml" hint="A single target; use the list below for several." />
      </About>
      <Section title="Targets" icon="references" count={list.length}>
        {list.length === 0 && <p className="muted">Catalog files Backstage reads through this location. Globs such as ./systems/*.yaml are allowed.</p>}
        {list.map((target, i) => {
          const resolved = resolvePath(dir, target);
          const missing = !!resolved && context?.files[resolved] === false;
          return (
            <div key={i} className="attribute-row">
              <input
                className={`input mono ${missing ? 'invalid' : ''}`}
                aria-label={`Target ${i + 1}`}
                value={target}
                title={missing ? 'File not found' : undefined}
                onChange={(e) => edit({ op: 'set', path: [...path, i], value: e.target.value })}
              />
              <IconButton icon="go-to-file" label="Open file" disabled={!resolved || missing || target.includes('*')} onClick={() => resolved && openFile(resolved)} />
              <IconButton icon="trash" label="Remove target" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
            </div>
          );
        })}
        <div className="list-row">
          {available.length > 0 && (
            <select
              className="keyword-select link-select"
              aria-label="Add a catalog file"
              value=""
              onChange={(e) => e.target.value && edit({ op: 'set', path: Array.isArray(targets) ? [...path, list.length] : path, value: Array.isArray(targets) ? e.target.value : [e.target.value] })}
            >
              <option value="">Add a catalog file…</option>
              {available.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <IconButton icon="add" label="Add target" showLabel onClick={() => edit({ op: 'set', path: Array.isArray(targets) ? [...path, list.length] : path, value: Array.isArray(targets) ? './' : ['./'] })} />
        </div>
      </Section>
      <Metadata info={info} />
    </>
  );
}

function OtherPage({ info }: { info: EntityInfo }) {
  const { openAsText } = useCatalog();
  return (
    <>
      <About info={info} />
      <p className="notice">
        <span className="codicon codicon-info" aria-hidden="true" />
        There is no form for the fields of {info.kind ? `a ${info.kind}` : 'this entity'}.
        <IconButton icon="go-to-file" label="Open as text" showLabel onClick={openAsText} />
      </p>
      <Metadata info={info} />
    </>
  );
}

const PAGES: Record<Category, (props: { info: EntityInfo }) => React.ReactNode> = {
  domain: DomainPage,
  system: SystemPage,
  component: ComponentPage,
  api: ApiPage,
  resource: ResourcePage,
  dataAsset: DataAssetPage,
  network: NetworkPage,
  artifact: ArtifactPage,
  repository: RepositoryPage,
  platform: PlatformOrInfrastructurePage,
  infrastructure: PlatformOrInfrastructurePage,
  site: SitePage,
  group: GroupPage,
  user: UserPage,
  location: LocationPage,
  other: OtherPage,
};

export function EntityPage({ index }: { index: number }) {
  const { spec } = useCatalog();
  const info = entityAt(spec, index);
  if (!info) return null;
  const Page = PAGES[info.category];
  return (
    <div className="page">
      <Header info={info} />
      <Page info={info} />
    </div>
  );
}
