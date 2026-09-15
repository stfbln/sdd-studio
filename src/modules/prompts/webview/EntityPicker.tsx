import { useState } from 'react';
import { IconButton } from '../../../webview/components/IconButton';
import type { PromptEntity } from '../core/prompts';

type Scope = 'parts' | 'software' | 'all';

const SCOPES: { value: Scope; label: string; categories?: string[] }[] = [
  { value: 'parts', label: 'Components and resources', categories: ['component', 'resource'] },
  { value: 'software', label: 'Systems, components, APIs, resources and data', categories: ['system', 'component', 'api', 'resource', 'dataAsset'] },
  { value: 'all', label: 'All entities' },
];

const NO_SYSTEM = '';

/** Catalog entities grouped by system, with a filter, to pick the ones a prompt is about. */
export function EntityPicker({
  title,
  entities,
  selected,
  onChange,
  onOpen,
}: {
  title: string;
  entities: PromptEntity[];
  selected: string[];
  onChange: (refs: string[]) => void;
  onOpen: (entity: PromptEntity) => void;
}) {
  const [scope, setScope] = useState<Scope>('parts');
  const [filter, setFilter] = useState('');
  const chosen = new Set(selected);
  const byRef = new Map(entities.map((e) => [e.ref, e]));
  const categories = SCOPES.find((s) => s.value === scope)!.categories;
  const text = filter.trim().toLowerCase();
  const visible = entities.filter(
    (e) => (!categories || categories.includes(e.category)) && (!text || [e.ref, e.title, e.description, e.type].some((v) => v?.toLowerCase().includes(text))),
  );

  const groups = new Map<string, PromptEntity[]>();
  for (const entity of visible) groups.set(entity.system ?? NO_SYSTEM, [...(groups.get(entity.system ?? NO_SYSTEM) ?? []), entity]);
  const groupLabel = (ref: string) => (ref === NO_SYSTEM ? 'Not in a system' : byRef.get(ref)?.title || ref);
  const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === NO_SYSTEM) - Number(b === NO_SYSTEM) || groupLabel(a).localeCompare(groupLabel(b)));

  const toggle = (ref: string) => onChange(chosen.has(ref) ? selected.filter((r) => r !== ref) : [...selected, ref]);
  const missing = selected.filter((ref) => !byRef.has(ref));

  return (
    <div className="field">
      <span className="field-label">{title}</span>
      {!entities.length ? (
        <p className="hint">The software catalog has no entities yet: design a system first (New system tab) and save its catalog file.</p>
      ) : (
        <>
          {selected.length > 0 && (
            <div className="chosen">
              {selected.map((ref) => (
                <span key={ref} className={`tag ${byRef.has(ref) ? '' : 'tag-missing'}`} title={byRef.has(ref) ? ref : `${ref} is no longer in the catalog`}>
                  {byRef.get(ref)?.title || ref}
                  <button type="button" className="tag-remove" aria-label={`Remove ${ref}`} onClick={() => toggle(ref)}>
                    <span className="codicon codicon-close" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <button type="button" className="link-button small" onClick={() => onChange([])}>
                Clear
              </button>
            </div>
          )}
          {missing.length > 0 && <span className="warning-text small">Not in the catalog anymore, left out of the prompt: {missing.join(', ')}</span>}
          <div className="picker-tools">
            <div className="search">
              <span className="codicon codicon-search" aria-hidden="true" />
              <input className="input" type="search" value={filter} placeholder="Filter" aria-label="Filter entities" onChange={(e) => setFilter(e.target.value)} />
            </div>
            <select className="keyword-select" aria-label="Entities shown" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="picker" role="group" aria-label={title}>
            {!ordered.length && <p className="hint">No entity matches.</p>}
            {ordered.map(([system, list]) => (
              <div key={system} className="picker-group">
                <div className="picker-group-label">{groupLabel(system)}</div>
                {list.map((entity) => (
                  <label key={entity.ref} className={`picker-item ${chosen.has(entity.ref) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={chosen.has(entity.ref)} onChange={() => toggle(entity.ref)} />
                    <span className="picker-text">
                      <span>
                        <strong>{entity.title || entity.ref}</strong> <span className="muted small">{[entity.type, entity.category === 'dataAsset' ? 'data asset' : entity.category].filter(Boolean).join(' ')}</span>
                      </span>
                      {entity.description && <span className="muted small picker-description">{entity.description}</span>}
                    </span>
                    <IconButton icon="go-to-file" label={`Open ${entity.file}`} className="picker-open" onClick={(e) => (e.preventDefault(), onOpen(entity))} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
