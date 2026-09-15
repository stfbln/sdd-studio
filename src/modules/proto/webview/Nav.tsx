import { useState, type ReactNode } from 'react';
import { NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import { identifierError, toUpperSnakeCase, topLevelNames, type ProtoIssue, type ProtoLocation } from '../core/analysis';
import type { ProtoEnum, ProtoMessage, ProtoPath } from '../core/model';
import { StreamingBadge } from './ServicePages';
import { sameLocation, useProto } from './state';

/** Sidebar: General, services with their rpcs, messages (with nested types) and top-level enums. */
export function Nav({ current }: { current: ProtoLocation }) {
  const { file, edit, navigate, issues } = useProto();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const matches = (...texts: string[]) => !query || texts.some((t) => t.toLowerCase().includes(query));
  const taken = topLevelNames(file);

  const issuesAt = (location: ProtoLocation) => issues.filter((i: ProtoIssue) => sameLocation(i.location, location));
  const item = (location: ProtoLocation, content: ReactNode, depth = 0) => (
    <NavItem key={JSON.stringify(location)} depth={depth} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
      {content}
    </NavItem>
  );

  /** A message matches when it or one of its nested types does. */
  const messageMatches = (m: ProtoMessage): boolean => matches(m.name, ...m.fields.map((f) => f.name)) || m.messages.some(messageMatches) || m.enums.some((e) => matches(e.name));

  const enumItem = (e: ProtoEnum, path: ProtoPath, depth: number) =>
    item({ kind: 'enum', path }, <><span className="codicon codicon-symbol-enum" aria-hidden="true" /> <span className="path-label">{e.name}</span></>, depth);

  const messageTree = (m: ProtoMessage, parent: ProtoPath, depth: number): ReactNode[] => {
    if (!messageMatches(m)) return [];
    const path = [...parent, `message:${m.name}`];
    return [
      item({ kind: 'message', path }, <><span className="codicon codicon-symbol-structure" aria-hidden="true" /> <span className="path-label">{m.name}</span></>, depth),
      ...m.messages.flatMap((child) => messageTree(child, path, depth + 1)),
      ...m.enums.filter((e) => !query || matches(e.name) || matches(m.name)).map((e) => enumItem(e, [...path, `enum:${e.name}`], depth + 1)),
    ];
  };

  return (
    <nav className="nav" aria-label="Proto file outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter services, messages…" />
      {item({ kind: 'general' }, <><span className="codicon codicon-info" aria-hidden="true" /> General</>)}

      <NavGroup
        title="Services"
        count={file.services.length}
        add={{
          label: 'Add service',
          initial: 'NewService',
          validate: (v) => identifierError(v, taken),
          commit: (name) => {
            edit({ op: 'add', parent: [], element: { kind: 'service', name } });
            navigate({ kind: 'service', name });
          },
        }}
      >
        {file.services
          .filter((s) => matches(s.name, ...s.rpcs.map((r) => r.name)))
          .map((s) => (
            <div key={s.name} className="nav-path">
              {item({ kind: 'service', name: s.name }, <><span className="codicon codicon-server-process" aria-hidden="true" /> <span className="path-label">{s.name}</span></>)}
              {s.rpcs
                .filter((r) => matches(s.name, r.name))
                .map((r) =>
                  item(
                    { kind: 'rpc', service: s.name, name: r.name },
                    <>
                      <StreamingBadge rpc={r} />
                      <span className="path-label">{r.name}</span>
                    </>,
                    1,
                  ),
                )}
            </div>
          ))}
      </NavGroup>

      <NavGroup
        title="Messages"
        count={file.messages.length}
        add={{
          label: 'Add message',
          initial: 'NewMessage',
          validate: (v) => identifierError(v, taken),
          commit: (name) => {
            edit({ op: 'add', parent: [], element: { kind: 'message', name } });
            navigate({ kind: 'message', path: [`message:${name}`] });
          },
        }}
      >
        {file.messages.flatMap((m) => messageTree(m, [], 0))}
      </NavGroup>

      <NavGroup
        title="Enums"
        count={file.enums.length}
        add={{
          label: 'Add enum',
          initial: 'NewEnum',
          validate: (v) => identifierError(v, taken),
          commit: (name) => {
            edit({ op: 'add', parent: [], element: { kind: 'enum', name, values: [{ name: `${toUpperSnakeCase(name)}_UNSPECIFIED`, number: 0 }] } });
            navigate({ kind: 'enum', path: [`enum:${name}`] });
          },
        }}
      >
        {file.enums.filter((e) => matches(e.name, ...e.values.map((v) => v.name))).map((e) => enumItem(e, [`enum:${e.name}`], 0))}
      </NavGroup>
    </nav>
  );
}
