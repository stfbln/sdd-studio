import { useState, type ReactNode } from 'react';
import { IconButton } from '../components/IconButton';

export interface NavIssue {
  severity: 'error' | 'warning';
  message: string;
}

export function NavSearch({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder: string }) {
  return (
    <label className="search">
      <span className="codicon codicon-search" aria-hidden="true" />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NavItem({
  active,
  nested,
  depth = 0,
  onClick,
  issues = [],
  children,
}: {
  active: boolean;
  nested?: boolean;
  /** Extra indentation levels (nested messages...). */
  depth?: number;
  onClick(): void;
  issues?: NavIssue[];
  children: ReactNode;
}) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <button type="button" className={`nav-item ${active ? 'active' : ''} ${nested ? 'nav-item-nested' : ''}`} onClick={onClick} aria-current={active} style={depth ? { paddingLeft: `${6 + depth * 14}px` } : undefined}>
      {children}
      {issues.length > 0 && (
        <span className={`nav-issues ${errors ? 'error' : 'warning'}`} title={issues.map((i) => i.message).join('\n')}>
          <span className={`codicon codicon-${errors ? 'error' : 'warning'}`} aria-hidden="true" />
          {issues.length}
        </span>
      )}
    </button>
  );
}

/** A titled group of the outline, with an optional inline "add" input. */
export function NavGroup({
  title,
  count,
  add,
  children,
}: {
  title: string;
  count: number;
  add?: {
    label: string;
    initial: string;
    validate(value: string): string | undefined;
    commit(value: string): void;
    placeholder?: string;
    /** Monospace input (ids, names used as keys); default true. */
    mono?: boolean;
  };
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const error = draft !== null && add ? add.validate(draft) : undefined;
  const commit = () => {
    if (draft === null || !add || error) return;
    add.commit(draft);
    setDraft(null);
  };

  return (
    <div className="nav-group">
      <div className="nav-heading">
        <span>{title}</span>
        <span className="count">{count}</span>
        {add && <IconButton icon="add" label={add.label} onClick={() => setDraft(add.initial)} />}
      </div>
      {draft !== null && (
        <div className="nav-add">
          <input
            className={`input input-small ${add?.mono === false ? '' : 'mono'} ${draft && error ? 'invalid' : ''}`}
            autoFocus
            aria-label={add?.label}
            placeholder={add?.placeholder}
            value={draft}
            title={error}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setDraft(null);
            }}
            onBlur={() => !draft.trim() && setDraft(null)}
          />
          <IconButton icon="check" label="Add" disabled={!!error} onClick={commit} />
          <IconButton icon="close" label="Cancel" onClick={() => setDraft(null)} />
          {error && draft && <span className="nav-error">{error}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Validation shared by component names (schemas, messages...). */
export function componentNameError(name: string, existing: string[]): string | undefined {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Letters, digits, . _ - only';
  if (existing.includes(name)) return 'Already exists';
  return undefined;
}
