import { useState } from 'react';
import { getIn } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { NavItem, NavSearch } from '../../../webview/structured/NavParts';
import { appendEntityEdit, newEntity } from '../core/edits';
import {
  CATEGORIES,
  ARTIFACT_TYPE_ANNOTATION,
  CLASSIFICATION_LABEL,
  CODE,
  NETWORKS,
  PROVIDER_ANNOTATION,
  TRUST_ZONE_ANNOTATION,
  documentsOf,
  entitiesOf,
  entityLabel,
  formatRef,
  HIERARCHY,
  ORGANIZATION,
  parentKey,
  str,
  documentFiles,
  type CatalogLocation,
  type Category,
  type EntityInfo,
  type KnownEntity,
} from '../core/model';
import { entityLocation, sameLocation, useCatalog, useWorkspace } from './state';

/** Short text shown after an entity's name. */
function detail(info: EntityInfo, parent: KnownEntity | undefined, inTree: boolean): string | undefined {
  const type = str(getIn(info.entity, ['spec', 'type']));
  const outside = parent && !inTree ? `in ${parent.title || parent.name}` : undefined;
  switch (info.category) {
    case 'component':
    case 'api':
    case 'resource':
    case 'group':
      return [type, outside].filter(Boolean).join(' · ') || undefined;
    case 'dataAsset':
      return [str(getIn(info.entity, ['metadata', 'labels', CLASSIFICATION_LABEL])), outside].filter(Boolean).join(' · ') || undefined;
    case 'artifact':
      return [str(getIn(info.entity, ['metadata', 'annotations', ARTIFACT_TYPE_ANNOTATION])), outside].filter(Boolean).join(' · ') || undefined;
    case 'repository':
      return [str(getIn(info.entity, ['metadata', 'annotations', PROVIDER_ANNOTATION])), outside].filter(Boolean).join(' · ') || undefined;
    case 'network':
      return [str(getIn(info.entity, ['metadata', 'annotations', TRUST_ZONE_ANNOTATION])).replace(/^.*#/, 'zone '), outside].filter(Boolean).join(' · ') || undefined;
    default:
      return outside;
  }
}

interface TreeRow {
  info: EntityInfo;
  depth: number;
  parent?: KnownEntity;
  /** The parent is shown above in the same tree. */
  inTree: boolean;
}

/** Entities of the given categories as a tree: children below the entity they belong to. */
function tree(spec: unknown, categories: Category[], known: KnownEntity[], onlyFile: string): TreeRow[] {
  const files = documentFiles(spec);
  const infos = entitiesOf(spec).filter((e) => categories.includes(e.category) && (!onlyFile || files?.[e.index] === onlyFile));
  const summaries = new Map(known.filter((e) => e.index !== undefined).map((e) => [e.index!, e]));
  const parentOf = (info: EntityInfo) => {
    const key = parentKey(summaries.get(info.index)!, known);
    return key ? known.find((e) => e.key === key) : undefined;
  };
  const order = (a: EntityInfo, b: EntityInfo) => categories.indexOf(a.category) - categories.indexOf(b.category) || a.index - b.index;
  const rows: TreeRow[] = [];
  const placed = new Set<number>();
  const visit = (info: EntityInfo, depth: number) => {
    if (placed.has(info.index)) return;
    placed.add(info.index);
    const parent = parentOf(info);
    rows.push({ info, depth, parent, inTree: depth > 0 });
    const key = summaries.get(info.index)!.key;
    infos
      .filter((child) => child.index !== info.index && parentKey(summaries.get(child.index)!, known) === key)
      .sort(order)
      .forEach((child) => visit(child, depth + 1));
  };
  const roots = infos.filter((info) => {
    const parent = parentOf(info);
    return parent?.index === undefined || !infos.some((i) => i.index === parent.index);
  });
  [...roots].sort(order).forEach((info) => visit(info, 0));
  // Entities caught in a parent loop.
  infos.filter((info) => !placed.has(info.index)).forEach((info) => visit(info, 0));
  return rows;
}

/** Outline group whose "add" asks for the kind of entity and its name. */
function AddableGroup({
  title,
  count,
  categories,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  categories: Exclude<Category, 'other'>[];
  onAdd(category: Exclude<Category, 'other'>, name: string, file: string): void;
  children: React.ReactNode;
}) {
  const { consolidated } = useWorkspace();
  const [draft, setDraft] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0]);
  const [file, setFile] = useState('');
  const commit = () => {
    if (draft === null || !draft.trim()) return;
    onAdd(category, draft, file || consolidated?.target || '');
    setDraft(null);
  };
  return (
    <div className="nav-group">
      <div className="nav-heading">
        <span>{title}</span>
        <span className="count">{count}</span>
        <IconButton icon="add" label={`Add to ${title.toLowerCase()}`} onClick={() => setDraft('')} />
      </div>
      {draft !== null && (
        <div className="nav-add nav-add-entity">
          <select className="keyword-select compact" aria-label="Kind of entity" value={category} onChange={(e) => setCategory(e.target.value as Exclude<Category, 'other'>)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].singular}
              </option>
            ))}
          </select>
          <input
            className="input input-small"
            autoFocus
            aria-label="Name of the new entity"
            placeholder={`${CATEGORIES[category].singular} name`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
          <IconButton icon="check" label="Add" disabled={!draft.trim()} onClick={commit} />
          <IconButton icon="close" label="Cancel" onClick={() => setDraft(null)} />
          {consolidated && (
            <select className="keyword-select compact nav-add-file" aria-label="Catalog file of the new entity" value={file || consolidated.target} onChange={(e) => setFile(e.target.value)}>
              {consolidated.files.map((f) => (
                <option key={f} value={f}>
                  in {f}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/** Sidebar: overview, the software hierarchy, the organization, locations and other kinds. */
export function Nav({ current }: { current: CatalogLocation }) {
  const { spec, edit, navigate } = useCatalog();
  const { issues, known, context, consolidated } = useWorkspace();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const onlyFile = consolidated?.filter ?? '';
  const entities = entitiesOf(spec);
  const issuesAt = (location: CatalogLocation) => issues.filter((i) => sameLocation(i.location, location));

  const add = (category: Exclude<Category, 'other'>, name: string, file: string) => {
    // Parts of a system go into the only system of the file, systems into the only domain.
    const container = category === 'system' ? 'domain' : ['component', 'api', 'resource', 'dataAsset', 'artifact'].includes(category) ? 'system' : undefined;
    const candidates = container ? entities.filter((e) => e.category === container && e.name) : [];
    const extra = candidates.length === 1 ? { [container!]: formatRef(candidates[0], CATEGORIES[container as Category].kind) } : {};
    const edits = [appendEntityEdit(spec, newEntity(spec, category, name, { spec: extra }, context))];
    if (consolidated) consolidated.editIn(file, edits);
    else edit(edits);
    navigate(entityLocation(documentsOf(spec).length));
  };

  const renderRows = (rows: TreeRow[]) =>
    rows.map(({ info, depth, parent, inTree }) => {
      const text = detail(info, parent, inTree);
      const label = entityLabel(info.entity, `${info.kind || 'Entity'} ${info.index + 1}`);
      if (query && ![label, info.name, text].some((t) => t?.toLowerCase().includes(query))) return null;
      const location = entityLocation(info.index);
      const icon = CATEGORIES[info.category].icon;
      return (
        <NavItem key={info.index} depth={query ? 0 : Math.min(depth, 5)} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
          <span className={`codicon codicon-${icon}`} aria-hidden="true" title={CATEGORIES[info.category].singular} />
          <span className="path-label">{label}</span>
          {text && <span className="op-label">{text}</span>}
        </NavItem>
      );
    });

  const software = tree(spec, HIERARCHY, known, onlyFile);
  const infrastructure = tree(spec, NETWORKS, known, onlyFile);
  const code = tree(spec, CODE, known, onlyFile);
  const organization = tree(spec, ORGANIZATION, known, onlyFile);
  const locations = tree(spec, ['location'], known, onlyFile);
  const others = tree(spec, ['other'], known, onlyFile);
  const overviewIssues = issuesAt({ kind: 'overview' });

  return (
    <nav className="nav" aria-label="Catalog outline">
      {consolidated && (
        <select className="keyword-select nav-file-filter" aria-label="Catalog file shown" value={consolidated.filter} onChange={(e) => consolidated.setFilter(e.target.value)}>
          <option value="">All catalog files ({consolidated.files.length})</option>
          {consolidated.files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter entities…" />
      <NavItem active={current.kind === 'overview'} onClick={() => navigate({ kind: 'overview' })} issues={overviewIssues}>
        <span className="codicon codicon-type-hierarchy" aria-hidden="true" />
        <span className="path-label">Overview</span>
      </NavItem>
      <NavItem active={current.kind === 'diagram'} onClick={() => navigate({ kind: 'diagram' })}>
        <span className="codicon codicon-graph" aria-hidden="true" />
        <span className="path-label">Diagram</span>
      </NavItem>

      <AddableGroup title="Software" count={software.length} categories={HIERARCHY as Exclude<Category, 'other'>[]} onAdd={add}>
        {renderRows(software)}
      </AddableGroup>
      <AddableGroup title="Infrastructure" count={infrastructure.length} categories={NETWORKS as Exclude<Category, 'other'>[]} onAdd={add}>
        {renderRows(infrastructure)}
      </AddableGroup>
      <AddableGroup title="Code and artifacts" count={code.length} categories={CODE as Exclude<Category, 'other'>[]} onAdd={add}>
        {renderRows(code)}
      </AddableGroup>
      <AddableGroup title="Organization" count={organization.length} categories={ORGANIZATION as Exclude<Category, 'other'>[]} onAdd={add}>
        {renderRows(organization)}
      </AddableGroup>
      <AddableGroup title="Locations" count={locations.length} categories={['location']} onAdd={add}>
        {renderRows(locations)}
      </AddableGroup>
      {others.length > 0 && (
        <div className="nav-group">
          <div className="nav-heading">
            <span>Other kinds</span>
            <span className="count">{others.length}</span>
          </div>
          {renderRows(others)}
        </div>
      )}
    </nav>
  );
}
