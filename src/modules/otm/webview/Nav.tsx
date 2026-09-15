import { useState } from 'react';
import { isObject } from '../../../shared/structured/edits';
import { NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import {
  analyzeOtm,
  appendEdit,
  COLLECTION_LABELS,
  COLLECTIONS,
  endpointLabel,
  enclosingTrustZone,
  itemId,
  itemLabel,
  itemsOf,
  labelOf,
  nestingDepth,
  newItem,
  type OtmCollection,
  type OtmLocation,
} from '../core/otm';
import { itemLocation, sameLocation, useOtm } from './state';

/** Short text shown after an element's name in the outline. */
function detail(spec: unknown, collection: OtmCollection, item: Record<string, unknown>): string | undefined {
  switch (collection) {
    case 'trustZones': {
      const rating = isObject(item.risk) ? item.risk.trustRating : undefined;
      return typeof rating === 'number' ? `trust ${rating}` : undefined;
    }
    case 'components': {
      const zone = enclosingTrustZone(spec, item as never);
      return zone ? labelOf(spec, 'trustZones', zone) : undefined;
    }
    case 'dataflows':
      return `${endpointLabel(spec, String(item.source ?? ''))} ${item.bidirectional === true ? '↔' : '→'} ${endpointLabel(spec, String(item.destination ?? ''))}`;
    default:
      return undefined;
  }
}

/** Sidebar: the project, then one group per kind of element. */
export function Nav({ current }: { current: OtmLocation }) {
  const { spec, edit, navigate } = useOtm();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const issues = analyzeOtm(spec);
  const issuesAt = (location: OtmLocation) => issues.filter((i) => sameLocation(i.location, location));

  return (
    <nav className="nav" aria-label="Threat model outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter elements…" />
      <NavItem active={current.kind === 'project'} onClick={() => navigate({ kind: 'project' })} issues={issuesAt({ kind: 'project' })}>
        <span className="codicon codicon-project" aria-hidden="true" />
        <span className="path-label">Project</span>
      </NavItem>

      {COLLECTIONS.map((collection) => {
        const { plural, singular, icon } = COLLECTION_LABELS[collection];
        const items = itemsOf(spec, collection);
        return (
          <NavGroup
            key={collection}
            title={plural}
            count={items.length}
            add={{
              label: `Add ${singular.toLowerCase()}`,
              initial: '',
              placeholder: `${singular} name`,
              mono: false,
              validate: (name) => (name.trim() ? undefined : 'Name required'),
              commit: (name) => {
                edit(appendEdit(spec, [collection], newItem(spec, collection, name)));
                navigate(itemLocation(collection, items.length));
              },
            }}
          >
            {items.map((item, index) => {
              const text = detail(spec, collection, item);
              if (query && ![itemLabel(item), itemId(item), text].some((t) => t?.toLowerCase().includes(query))) return null;
              const location = itemLocation(collection, index);
              const depth = collection === 'trustZones' || collection === 'components' ? Math.min(nestingDepth(spec, collection, item), 4) : 0;
              return (
                <NavItem key={index} depth={query ? 0 : depth} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
                  <span className={`codicon codicon-${icon}`} aria-hidden="true" />
                  <span className="path-label">{itemLabel(item, `${singular} ${index + 1}`)}</span>
                  {text && <span className="op-label">{text}</span>}
                </NavItem>
              );
            })}
          </NavGroup>
        );
      })}
    </nav>
  );
}
