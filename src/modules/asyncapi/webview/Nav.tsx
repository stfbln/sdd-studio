import { useState } from 'react';
import { getIn, isObject } from '../../../shared/structured/edits';
import { schemaNames } from '../../../shared/structured/jsonSchema';
import { KindBadge } from '../../../webview/structured/fields';
import { componentNameError, NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import {
  analyzeAsyncApi,
  channelAddress,
  channelIds,
  listOperations,
  messageNames,
  newOperation,
  operationIds,
  type AsyncIssue,
  type AsyncLocation,
} from '../core/asyncapi';
import { idError, sameLocation, useAsync } from './state';

/** Sidebar: General, channels (with 2.x operations), 3.0 operations, messages and schemas. */
export function Nav({ current }: { current: AsyncLocation }) {
  const { spec, edit, navigate, major } = useAsync();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) => !query || texts.some((t) => t?.toLowerCase().includes(query));

  const issues = analyzeAsyncApi(spec);
  const issuesAt = (location: AsyncLocation) => issues.filter((i: AsyncIssue) => sameLocation(i.location, location));
  const channels = channelIds(spec);
  const operations = listOperations(spec);
  const messages = messageNames(spec);
  const schemas = schemaNames(spec);

  const item = (location: AsyncLocation, content: React.ReactNode, nested = false) => (
    <NavItem key={JSON.stringify(location)} nested={nested} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
      {content}
    </NavItem>
  );

  return (
    <nav className="nav" aria-label="Specification outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter channels, messages…" />
      {item({ kind: 'general' }, <><span className="codicon codicon-info" aria-hidden="true" /> General</>)}

      <NavGroup
        title="Channels"
        count={channels.length}
        add={{
          label: 'Add channel',
          initial: major === 2 ? 'events/' : 'newChannel',
          validate: (v) => (major === 2 ? (!v.trim() ? 'Address required' : channels.includes(v) ? 'Already exists' : undefined) : idError(v, channels)),
          commit: (id) => {
            edit({ op: 'set', path: ['channels', id], value: major === 2 ? {} : { address: id, messages: {} } });
            navigate({ kind: 'channel', id });
          },
        }}
      >
        {channels
          .filter((id) => matches(id, channelAddress(spec, id), JSON.stringify(getIn(spec, ['channels', id]))))
          .map((id) => (
            <div key={id} className="nav-path">
              {item(
                { kind: 'channel', id },
                <>
                  <span className="codicon codicon-broadcast" aria-hidden="true" />
                  <span className="mono path-label">{id}</span>
                  {major === 3 && channelAddress(spec, id) && channelAddress(spec, id) !== id && <span className="op-label mono">{channelAddress(spec, id)}</span>}
                </>,
              )}
              {major === 2 &&
                operations
                  .filter((op) => op.channel === id)
                  .map((op) =>
                    item(
                      op.location,
                      <>
                        <KindBadge value={op.action} label={op.action === 'publish' ? 'PUB' : 'SUB'} />
                        <span className="op-label">{op.label}</span>
                      </>,
                      true,
                    ),
                  )}
            </div>
          ))}
      </NavGroup>

      {major === 3 && (
        <NavGroup
          title="Operations"
          count={operations.length}
          add={{
            label: 'Add operation',
            initial: 'newOperation',
            validate: (v) => idError(v, operationIds(spec)),
            commit: (id) => {
              edit({ op: 'set', path: ['operations', id], value: newOperation(spec, 'send', channels[0]) });
              navigate({ kind: 'operation', id });
            },
          }}
        >
          {operations
            .filter((op) => matches(op.label, op.channel))
            .map((op) =>
              item(
                op.location,
                <>
                  <KindBadge value={op.action || 'unknown'} label={(op.action || '?').toUpperCase()} />
                  <span className="path-label">{op.label}</span>
                </>,
              ),
            )}
        </NavGroup>
      )}

      <NavGroup
        title="Messages"
        count={messages.length}
        add={{
          label: 'Add message',
          initial: 'NewMessage',
          validate: (v) => componentNameError(v, messages),
          commit: (name) => {
            edit({ op: 'set', path: ['components', 'messages', name], value: { payload: { type: 'object', properties: {} } } });
            navigate({ kind: 'message', name });
          },
        }}
      >
        {messages
          .filter((name) => matches(name))
          .map((name) => item({ kind: 'message', name }, <><span className="codicon codicon-mail" aria-hidden="true" /> {name}</>))}
      </NavGroup>

      <NavGroup
        title="Schemas"
        count={schemas.length}
        add={{
          label: 'Add schema',
          initial: 'NewSchema',
          validate: (v) => componentNameError(v, schemas),
          commit: (name) => {
            edit({ op: 'set', path: ['components', 'schemas', name], value: { type: 'object', properties: {} } });
            navigate({ kind: 'schema', name });
          },
        }}
      >
        {schemas
          .filter((name) => matches(name))
          .map((name) => item({ kind: 'schema', name }, <><span className="codicon codicon-symbol-structure" aria-hidden="true" /> {name}</>))}
      </NavGroup>
      {!isObject(spec.channels) && channels.length === 0 && <p className="muted small nav-hint">Start by adding a channel.</p>}
    </nav>
  );
}
