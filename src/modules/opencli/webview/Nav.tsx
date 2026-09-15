import { useState } from 'react';
import { NavGroup, NavItem, NavSearch } from '../../../webview/structured/NavParts';
import { analyzeOpenCli, asArray, cliName, commandNameError, commandNames, getCommand, listCommands, newCommand, toCommandName, type CliLocation } from '../core/opencli';
import { sameLocation, useCli } from './state';

/** Sidebar: General and the command tree. */
export function Nav({ current }: { current: CliLocation }) {
  const { spec, edit, navigate } = useCli();
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const issues = analyzeOpenCli(spec);
  const issuesAt = (location: CliLocation) => issues.filter((i) => sameLocation(i.location, location));
  const commands = listCommands(spec);
  const root = getCommand(spec, []);
  const rootChildren = asArray(root?.commands).flatMap(commandNames);

  // While filtering, keep the ancestors of matching commands so the tree stays readable.
  const matches = (c: (typeof commands)[number]) =>
    [c.names.join(' '), ...commandNames(c.command), String(c.command.description ?? '')].some((t) => t.toLowerCase().includes(query)) ||
    asArray(c.command.options).some((o) => JSON.stringify(o).toLowerCase().includes(query));
  const shown = new Set<string>();
  for (const c of commands) {
    if (query && !matches(c)) continue;
    for (let depth = 0; depth <= c.names.length; depth++) shown.add(JSON.stringify(c.names.slice(0, depth)));
  }

  return (
    <nav className="nav" aria-label="CLI outline">
      <NavSearch value={filter} onChange={setFilter} placeholder="Filter commands, options…" />
      <NavItem active={current.kind === 'general'} onClick={() => navigate({ kind: 'general' })} issues={issuesAt({ kind: 'general' })}>
        <span className="codicon codicon-info" aria-hidden="true" /> General
      </NavItem>

      <NavGroup
        title="Commands"
        count={Math.max(commands.length - 1, 0)}
        add={
          root
            ? {
                label: 'Add command',
                initial: '',
                validate: (v) => commandNameError(toCommandName(v), rootChildren),
                commit: (value) => {
                  const name = toCommandName(value);
                  edit({ op: 'set', path: [...(commands[0]?.path ?? ['command']), 'commands', asArray(root.commands).length], value: newCommand(name) });
                  navigate({ kind: 'command', names: [name] });
                },
              }
            : undefined
        }
      >
        {commands
          .filter((c) => shown.has(JSON.stringify(c.names)))
          .map((c) => {
            const location: CliLocation = { kind: 'command', names: c.names };
            const isRoot = c.names.length === 0;
            const name = isRoot ? cliName(spec) || '(root)' : String(c.command.name ?? '') || '(no name)';
            const aliases = asArray(c.command.aliases).map(String);
            return (
              <NavItem key={c.path.join('/')} depth={c.names.length} active={sameLocation(current, location)} onClick={() => navigate(location)} issues={issuesAt(location)}>
                <span className={`codicon codicon-${isRoot ? 'terminal' : asArray(c.command.commands).length ? 'folder' : 'symbol-event'}`} aria-hidden="true" />
                <span className="mono path-label">{name}</span>
                {aliases.length > 0 && <span className="op-label mono">{aliases.join(', ')}</span>}
                {c.command.hidden === true && <span className="codicon codicon-eye-closed muted" title="Hidden" />}
              </NavItem>
            );
          })}
        {!root && <p className="muted small nav-hint">No root command: create it from the General page.</p>}
      </NavGroup>
    </nav>
  );
}
