import { useMemo, useState } from 'react';
import { joinPath } from '../../../shared/files';
import { slugify } from '../../../shared/naming';
import { IconButton } from '../../../webview/components/IconButton';
import { Section } from '../../../webview/structured/fields';
import {
  buildDiagram,
  DEFAULT_DIAGRAM,
  DIAGRAM_GROUPS,
  AROUND_GROUP,
  hierarchyRows,
  HIERARCHY_GROUPS,
  INSIDE_GROUP,
  relatedEntities,
  RELATION_GROUPS,
  subtreeKeys,
  suggestedTitle,
  type DiagramOptions,
  type Direction,
  type HierarchyRow,
  type LabelMode,
  type RelatedEntity,
} from '../core/mermaid';
import { CATEGORIES, resourceTypeOf, summaryLabel, type KnownEntity } from '../core/model';
import { useWorkspace } from './state';

export interface DiagramSettings extends Omit<DiagramOptions, 'selected' | 'focus'> {
  /** What the diagram is about (step 1). */
  focus: string[];
  /** Entities added around the focus: related (step 2) and unrelated (step 3) ones. */
  also: string[];
  title: string;
}

export const NEW_DIAGRAM: DiagramSettings = { focus: [], also: [], direction: DEFAULT_DIAGRAM.direction, labels: DEFAULT_DIAGRAM.labels, relations: DEFAULT_DIAGRAM.relations, title: '' };

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'LR', label: 'Left to right' },
  { value: 'TB', label: 'Top to bottom' },
];

const LABELS: { value: LabelMode; label: string; hint: string }[] = [
  { value: 'name', label: 'Name only', hint: 'One line per box: the display name of the entity.' },
  { value: 'description', label: 'Name and description', hint: 'The name, what the entity is (kind and type) and its description, wrapped to keep boxes narrow.' },
];

/** How the entities related to the focus are grouped, in the order they are offered. */
const RELATED_GROUPS = [
  { id: AROUND_GROUP, label: 'Around it', hint: 'The system, domain or network holding the focus: it becomes the box drawn around it.' },
  { id: INSIDE_GROUP, label: 'Inside it', hint: 'What the focus holds: components, APIs, resources… drawn as boxes inside it.' },
  ...RELATION_GROUPS,
];

/** Short "Component · service" of an entity, without repeating the category as the type. */
const detailOf = (entity: KnownEntity) =>
  [CATEGORIES[entity.category].singular, entity.type === resourceTypeOf(entity.category) ? undefined : entity.type].filter(Boolean).join(' · ');

/**
 * Exports a chosen part of the catalog as a Mermaid diagram, in four steps: what the diagram is
 * about, what it is connected to, anything else, and how it looks. The hierarchy of the catalog
 * becomes nesting and the other relationships become arrows.
 */
export function DiagramPage({ settings, onChange }: { settings: DiagramSettings; onChange(next: DiagramSettings): void }) {
  const { known, context, request, openFile } = useWorkspace();
  const [status, setStatus] = useState<{ kind: 'done' | 'error'; message: string; path?: string }>();
  const [busy, setBusy] = useState(false);

  const focus = new Set(settings.focus);
  const also = new Set(settings.also);
  const selected = useMemo(() => [...new Set([...settings.focus, ...settings.also])], [settings.focus, settings.also]);
  const related = useMemo(() => relatedEntities(known, settings.focus), [known, settings.focus]);
  const diagram = useMemo(() => buildDiagram(known, { ...settings, selected }), [known, settings, selected]);
  const suggested = useMemo(() => suggestedTitle(known, selected), [known, selected]);

  const set = (next: Partial<DiagramSettings>) => onChange({ ...settings, ...next });

  /** Adds or removes entities from the focus; an entity leaving the focus leaves the diagram. */
  const setFocus = (keys: string[], on: boolean) =>
    set({
      focus: on ? [...settings.focus, ...keys.filter((key) => !focus.has(key))] : settings.focus.filter((key) => !keys.includes(key)),
      also: settings.also.filter((key) => !keys.includes(key)),
    });

  /**
   * Adds or removes entities drawn around the focus. Adding a related entity also turns on the kind
   * of relationship it has with the focus, so the arrow saying why it is there is drawn.
   */
  const setAlso = (keys: string[], on: boolean, groups: string[] = []) =>
    set({
      also: on ? [...settings.also, ...keys.filter((key) => !also.has(key) && !focus.has(key))] : settings.also.filter((key) => !keys.includes(key)),
      ...(on ? { relations: [...new Set([...settings.relations, ...groups.filter((g) => !HIERARCHY_GROUPS.includes(g))])] } : {}),
    });

  const title = settings.title.trim() || suggested;
  const folder = context?.diagramsFolder ?? 'docs/diagrams';
  const fileName = `${slugify(title) || 'catalog-diagram'}.md`;

  const run = async (action: 'copy' | 'save') => {
    setBusy(true);
    setStatus(undefined);
    try {
      const result = (await request('exportDiagram', { action, title, diagram: diagram.text })) as { path?: string } | undefined;
      if (action === 'copy') setStatus({ kind: 'done', message: 'Diagram copied. Paste it in a markdown ```mermaid block, or in mermaid.live.' });
      else if (result?.path) setStatus({ kind: 'done', message: 'Saved to', path: result.path });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Diagram</h1>
      <p className="muted small">
        A Mermaid diagram of a part of the catalog. Entities are drawn inside the entity they belong to, and the relationships between them become arrows — a system with its components gives a
        container diagram (C2), a system with its neighbours a context diagram (C1).
      </p>

      <Section title="1. What the diagram is about" icon="target" count={settings.focus.length || undefined}>
        <p className="muted small">Pick the entity or entities in the spotlight: a system, a few components, a team. They get a stronger outline in the diagram.</p>
        {known.length === 0 ? <p className="muted">This catalog has no entities yet.</p> : <EntityTree entities={known} chosen={focus} onSelect={setFocus} placeholder="Filter entities…" />}
      </Section>

      <Section title="2. What else to include" icon="references" count={related.length || undefined}>
        {settings.focus.length === 0 ? (
          <p className="muted">Pick what the diagram is about first, and everything it is connected to shows up here.</p>
        ) : related.length === 0 ? (
          <p className="muted">
            The catalog records no relationship for {settings.focus.length === 1 ? 'this entity' : 'these entities'} yet. Add what belongs in the diagram below, or link them in the catalog first.
          </p>
        ) : (
          <>
            <p className="muted small">
              Everything the focus is connected to, and how. Ticking one also draws the arrow that explains why it is there. Entities with no connection to the focus are not listed here.
            </p>
            {RELATED_GROUPS.map((group) => {
              const rows = related.filter((r) => r.groups.includes(group.id));
              if (!rows.length) return null;
              const keys = rows.map((r) => r.entity.key);
              const chosen = keys.filter((key) => also.has(key)).length;
              return (
                <div key={group.id} className="diagram-group">
                  <div className="diagram-group-head">
                    <span className="diagram-group-label" title={group.hint}>
                      {group.label}
                    </span>
                    <span className="count">{chosen ? `${chosen}/${rows.length}` : rows.length}</span>
                    <button type="button" className="link-button small" onClick={() => setAlso(keys, chosen < keys.length, [group.id])}>
                      {chosen < keys.length ? 'Add all' : 'Remove all'}
                    </button>
                  </div>
                  {rows.map((row) => (
                    <RelatedRow key={row.entity.key} row={row} chosen={also.has(row.entity.key)} onToggle={(on) => setAlso([row.entity.key], on, row.groups)} onFocus={() => setFocus([row.entity.key], true)} />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </Section>

      <OtherEntitiesSection entities={known.filter((e) => !focus.has(e.key) && !related.some((r) => r.entity.key === e.key))} chosen={also} onSelect={setAlso} />

      <Section title="4. Look" icon="paintcan">
        <div className="diagram-options">
          <fieldset className="diagram-fieldset">
            <legend>What each box says</legend>
            {LABELS.map((mode) => (
              <label key={mode.value} className="checkbox" title={mode.hint}>
                <input type="radio" name="diagram-labels" checked={settings.labels === mode.value} onChange={() => set({ labels: mode.value })} /> {mode.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="diagram-fieldset">
            <legend>Direction</legend>
            {DIRECTIONS.map((direction) => (
              <label key={direction.value} className="checkbox">
                <input type="radio" name="diagram-direction" checked={settings.direction === direction.value} onChange={() => set({ direction: direction.value })} /> {direction.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="diagram-fieldset">
            <legend>Relationships drawn as arrows</legend>
            {RELATION_GROUPS.map((group) => (
              <label key={group.id} className="checkbox" title={group.hint}>
                <input
                  type="checkbox"
                  checked={settings.relations.includes(group.id)}
                  onChange={(e) => set({ relations: e.target.checked ? [...settings.relations, group.id] : settings.relations.filter((id) => id !== group.id) })}
                />{' '}
                {group.label}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="muted small">The hierarchy is never drawn as arrows: it is the nesting of the boxes.</p>
      </Section>

      <Section
        title="Mermaid"
        icon="graph"
        actions={
          <>
            <IconButton icon="copy" label="Copy" showLabel variant="secondary" disabled={!diagram.text || busy} onClick={() => void run('copy')} />
            <IconButton icon="save" label="Save as markdown" showLabel variant="primary" disabled={!diagram.text || busy} onClick={() => void run('save')} />
          </>
        }
      >
        <div className="diagram-export">
          <label className="field">
            <span className="field-label">Title</span>
            <span className="field-control">
              <input className="input" value={settings.title} placeholder={suggested || 'e.g. Online shop — containers'} onChange={(e) => set({ title: e.target.value })} />
            </span>
          </label>
          <span className="muted small">
            Saved as <code>{joinPath(folder, fileName)}</code>
          </span>
        </div>
        {status && (
          <p className={status.kind === 'error' ? 'warning-text small' : 'muted small'}>
            <span className={`codicon codicon-${status.kind === 'error' ? 'warning' : 'pass'}`} aria-hidden="true" /> {status.message}{' '}
            {status.path && (
              <button type="button" className="link-button" onClick={() => openFile(status.path!)}>
                {status.path}
              </button>
            )}
          </p>
        )}
        {diagram.missing.length > 0 && (
          <p className="warning-text small">
            <span className="codicon codicon-info" aria-hidden="true" /> {diagram.missing.length} chosen {diagram.missing.length === 1 ? 'entity is' : 'entities are'} no longer in the catalog and
            {diagram.missing.length === 1 ? ' is' : ' are'} left out.
          </p>
        )}
        {diagram.text ? (
          <>
            <p className="muted small">
              {diagram.entities} {diagram.entities === 1 ? 'entity' : 'entities'} · {diagram.arrows} {diagram.arrows === 1 ? 'arrow' : 'arrows'}. The markdown file renders on GitHub, GitLab and in
              the VS Code markdown preview.
            </p>
            <pre className="diagram-code" tabIndex={0}>
              {diagram.text}
            </pre>
          </>
        ) : (
          <p className="muted">Nothing to draw yet: pick what the diagram is about in step 1.</p>
        )}
      </Section>
    </div>
  );
}

/** One entity connected to the focus: what it is, how it relates, and whether it joins the diagram. */
function RelatedRow({ row, chosen, onToggle, onFocus }: { row: RelatedEntity; chosen: boolean; onToggle(on: boolean): void; onFocus(): void }) {
  const { entity } = row;
  const shown = row.connections.slice(0, 2).join(', ');
  const rest = row.connections.length - 2;
  return (
    <div className="diagram-row">
      <label className="diagram-row-label">
        <input type="checkbox" checked={chosen} onChange={(e) => onToggle(e.target.checked)} />
        <span className={`codicon codicon-${CATEGORIES[entity.category].icon}`} aria-hidden="true" title={CATEGORIES[entity.category].singular} />
        <span className="path-label">{summaryLabel(entity)}</span>
        <span className="muted small">{detailOf(entity)}</span>
        <span className="small diagram-connection" title={row.connections.join('\n')}>
          {shown}
          {rest > 0 && ` +${rest}`}
        </span>
      </label>
      <IconButton icon="target" label={`Make ${summaryLabel(entity)} part of what the diagram is about`} onClick={onFocus} />
    </div>
  );
}

/** Step 3: everything the focus is not connected to, folded away until it is needed. */
function OtherEntitiesSection({ entities, chosen, onSelect }: { entities: KnownEntity[]; chosen: Set<string>; onSelect(keys: string[], on: boolean): void }) {
  const [open, setOpen] = useState(false);
  const picked = entities.filter((e) => chosen.has(e.key)).length;
  return (
    <Section title="3. Anything unrelated to add" icon="list-flat" count={picked || undefined}>
      {entities.length === 0 ? (
        <p className="muted">Everything in the catalog is already in the diagram or connected to the focus.</p>
      ) : open ? (
        <>
          <p className="muted small">
            The rest of the catalog: {entities.length} {entities.length === 1 ? 'entity' : 'entities'} with no recorded relationship to the focus. They are drawn on their own, next to the rest.
          </p>
          <EntityTree entities={entities} chosen={chosen} onSelect={onSelect} placeholder="Filter the rest of the catalog…" />
          <button type="button" className="link-button small" onClick={() => setOpen(false)}>
            Hide
          </button>
        </>
      ) : (
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          Show the rest of the catalog ({entities.length} {entities.length === 1 ? 'entity' : 'entities'}
          {picked > 0 ? `, ${picked} added` : ''})
        </button>
      )}
    </Section>
  );
}

/** Entities as the tree of the outline, with a checkbox each and a filter. */
function EntityTree({ entities, chosen, onSelect, placeholder }: { entities: KnownEntity[]; chosen: Set<string>; onSelect(keys: string[], on: boolean): void; placeholder: string }) {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => DIAGRAM_GROUPS.map((group) => ({ ...group, rows: hierarchyRows(entities, group.categories) })), [entities]);
  const total = groups.reduce((n, group) => n + group.rows.length, 0);
  const picked = entities.filter((e) => chosen.has(e.key)).length;

  return (
    <>
      <div className="diagram-tools">
        <div className="search">
          <span className="codicon codicon-search" aria-hidden="true" />
          <input className="input" type="search" value={filter} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {picked > 0 && (
          <button type="button" className="link-button small" onClick={() => onSelect(entities.map((e) => e.key), false)}>
            Clear {picked}
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="muted small">Nothing to show.</p>
      ) : (
        groups.map((group) => <EntityGroup key={group.id} label={group.label} rows={group.rows} filter={filter} selected={chosen} onSelect={onSelect} />)
      )}
    </>
  );
}

/** One group of the tree (Software, Infrastructure…), as the hierarchy, with a checkbox per entity. */
function EntityGroup({
  label,
  rows,
  filter,
  selected,
  onSelect,
}: {
  label: string;
  rows: HierarchyRow[];
  filter: string;
  selected: Set<string>;
  onSelect(keys: string[], on: boolean): void;
}) {
  const query = filter.trim().toLowerCase();
  const matches = (entity: KnownEntity) => !query || [summaryLabel(entity), entity.name, entity.type, entity.description].some((t) => t?.toLowerCase().includes(query));
  const shown = rows.filter((row) => matches(row.entity));
  if (!rows.length) return null;
  const keys = rows.map((row) => row.entity.key);
  const chosen = keys.filter((key) => selected.has(key)).length;

  return (
    <div className="diagram-group">
      <div className="diagram-group-head">
        <span className="diagram-group-label">{label}</span>
        <span className="count">{chosen ? `${chosen}/${rows.length}` : rows.length}</span>
        <button type="button" className="link-button small" onClick={() => onSelect(keys, chosen < keys.length)}>
          {chosen < keys.length ? 'Select all' : 'Clear'}
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="muted small diagram-empty">No match.</p>
      ) : (
        shown.map((row) => {
          const { entity } = row;
          const subtree = subtreeKeys(rows, entity.key);
          return (
            <div key={entity.key} className="diagram-row" style={{ paddingLeft: `${(query ? 0 : Math.min(row.depth, 5)) * 16}px` }}>
              <label className="diagram-row-label">
                <input type="checkbox" checked={selected.has(entity.key)} onChange={(e) => onSelect([entity.key], e.target.checked)} />
                <span className={`codicon codicon-${CATEGORIES[entity.category].icon}`} aria-hidden="true" title={CATEGORIES[entity.category].singular} />
                <span className="path-label">{summaryLabel(entity)}</span>
                <span className="muted small">{detailOf(entity)}</span>
              </label>
              {subtree.length > 1 && (
                <IconButton
                  icon="list-tree"
                  label={`Select ${summaryLabel(entity)} and the ${subtree.length - 1} ${subtree.length === 2 ? 'entity' : 'entities'} inside it`}
                  onClick={() => onSelect(subtree, true)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
