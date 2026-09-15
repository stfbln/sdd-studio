import { useState } from 'react';
import { isObject } from '../../../shared/structured/edits';
import { KindBadge } from '../../../webview/structured/fields';
import { componentNameError, NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import { analyzeSpec, HTTP_METHODS, pathTemplateError, schemaNames, type SpecIssue, type SpecLocation } from '../core/openapi';
import { sameLocation, useSpec } from './state';

/** Sidebar: General, every path with its operations, and component schemas. */
export function Nav({ current }: { current: SpecLocation }) {
  const { spec, edit, navigate } = useSpec();
  const [filter, setFilter] = useState('');

  const paths = isObject(spec.paths) ? spec.paths : {};
  const allPaths = Object.keys(paths);
  const schemas = schemaNames(spec);
  const issues = analyzeSpec(spec);
  const query = filter.trim().toLowerCase();
  const issuesAt = (predicate: (i: SpecIssue) => boolean) => issues.filter(predicate);

  return (
    <nav className="nav" aria-label="Specification outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter paths & schemas" />

      <NavItem active={sameLocation(current, { kind: 'general' })} onClick={() => navigate({ kind: 'general' })} issues={issuesAt((i) => i.location.kind === 'general')}>
        <span className="codicon codicon-info" aria-hidden="true" /> General
      </NavItem>

      <NavGroup
        title="Paths"
        count={allPaths.length}
        add={{
          label: 'Add path',
          initial: '/',
          validate: (v) => pathTemplateError(v, allPaths),
          commit: (path) => {
            edit({ op: 'set', path: ['paths', path], value: {} });
            navigate({ kind: 'path', path });
          },
        }}
      >
        {allPaths
          .filter((p) => !query || p.toLowerCase().includes(query) || JSON.stringify(paths[p]).toLowerCase().includes(query))
          .map((path) => {
            const item = paths[path];
            const methods = HTTP_METHODS.filter((m) => isObject(item) && isObject(item[m]));
            return (
              <div key={path} className="nav-path">
                <NavItem
                  active={sameLocation(current, { kind: 'path', path })}
                  onClick={() => navigate({ kind: 'path', path })}
                  issues={issuesAt((i) => i.location.kind === 'path' && i.location.path === path)}
                >
                  <span className="mono path-label">{path}</span>
                </NavItem>
                {methods.map((method) => {
                  const op = (item as Record<string, unknown>)[method] as Record<string, unknown>;
                  return (
                    <NavItem
                      key={method}
                      nested
                      active={sameLocation(current, { kind: 'operation', path, method })}
                      onClick={() => navigate({ kind: 'operation', path, method })}
                      issues={issuesAt((i) => i.location.kind === 'operation' && i.location.path === path && i.location.method === method)}
                    >
                      <KindBadge value={method} />
                      <span className="op-label">{String(op.summary || op.operationId || '')}</span>
                    </NavItem>
                  );
                })}
              </div>
            );
          })}
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
          .filter((s) => !query || s.toLowerCase().includes(query))
          .map((name) => (
            <NavItem
              key={name}
              active={sameLocation(current, { kind: 'schema', name })}
              onClick={() => navigate({ kind: 'schema', name })}
              issues={issuesAt((i) => i.location.kind === 'schema' && i.location.name === name)}
            >
              <span className="codicon codicon-symbol-structure" aria-hidden="true" /> {name}
            </NavItem>
          ))}
      </NavGroup>
    </nav>
  );
}
