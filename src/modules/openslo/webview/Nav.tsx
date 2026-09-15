import { useState } from 'react';
import { NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import { analyzeOpenSlo } from '../core/analysis';
import { appendEntityEdit, newEntity } from '../core/edits';
import { documentsOf, entitiesOfKind, entityLabel, KIND_INFO, KINDS, lowerLabel, str, type EntityInfo, type Kind, type OpenSloLocation } from '../core/model';
import { entityLocation, sameLocation, useOpenSlo } from './state';

/** Sidebar: overview, then one group per kind (Services, SLOs, SLIs, data sources, alert policies…). */
export function Nav({ current }: { current: OpenSloLocation }) {
  const { spec, edit, navigate } = useOpenSlo();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const issues = analyzeOpenSlo(spec);
  const issuesAt = (location: OpenSloLocation) => issues.filter((i) => sameLocation(i.location, location));

  const renderGroup = (kind: Kind) => {
    const entities = entitiesOfKind(spec, kind);
    const shown = entities.filter((e) => !query || [entityLabel(e.entity), e.name, str(e.entity.kind)].some((t) => t.toLowerCase().includes(query)));
    return (
      <NavGroup
        key={kind}
        title={KIND_INFO[kind].plural}
        count={entities.length}
        add={{
          label: `Add ${lowerLabel(KIND_INFO[kind].singular)}`,
          initial: '',
          mono: false,
          validate: (v) => (v.trim() ? undefined : 'Name required'),
          commit: (title) => {
            const index = documentsOf(spec).length;
            edit(appendEntityEdit(spec, newEntity(spec, kind, title)));
            navigate(entityLocation(index));
          },
        }}
      >
        {shown.length === 0 && !query && <p className="muted small nav-hint">{KIND_INFO[kind].hint}</p>}
        {shown.map((info: EntityInfo) => {
          const location: OpenSloLocation = { kind: 'entity', index: info.index };
          return (
            <NavItem key={info.index} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
              <span className={`codicon codicon-${KIND_INFO[kind].icon}`} aria-hidden="true" />
              <span className="path-label">{entityLabel(info.entity, `(unnamed)`)}</span>
            </NavItem>
          );
        })}
      </NavGroup>
    );
  };

  return (
    <nav className="nav" aria-label="OpenSLO outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter services, SLOs…" />
      <NavItem active={current.kind === 'overview'} onClick={() => navigate({ kind: 'overview' })} issues={issuesAt({ kind: 'overview' })}>
        <span className="codicon codicon-list-tree" aria-hidden="true" /> Overview
      </NavItem>
      {KINDS.map(renderGroup)}
    </nav>
  );
}
