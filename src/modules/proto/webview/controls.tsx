import { useId, useState, type ReactNode } from 'react';
import { quote, unquote } from '../core/parse';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, Section } from '../../../webview/structured/fields';
import {
  isScalar,
  MAP_KEY_TYPES,
  resolveType,
  SCALAR_TYPES,
  TYPE_REFERENCE,
  typeReference,
  typeUsages,
  WELL_KNOWN_IMPORTS,
} from '../core/analysis';
import type { ProtoEdit } from '../core/edits';
import type { ProtoOption, ProtoPath } from '../core/model';
import { useDraft, useProto } from './state';

const normalizeComment = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\s+$/, '');

/** Leading comment of an element, which protoc and code generators turn into documentation. */
export function CommentField({ target, value, label = 'Description', placeholder }: { target: ProtoPath; value: string; label?: string; placeholder?: string }) {
  const { edit } = useProto();
  const [draft, setDraft] = useDraft(value, normalizeComment);
  return (
    <Field label={label} wide hint="Written as a // comment above the declaration; code generators copy it into the generated docs.">
      <AutoTextarea
        value={draft}
        placeholder={placeholder ?? 'What is it for?'}
        onChange={(next) => {
          setDraft(next);
          if (normalizeComment(next) !== value) edit({ op: 'setComment', target, comment: normalizeComment(next) });
        }}
      />
    </Field>
  );
}

/** Number written as the user types, when it is a valid integer. */
export function NumberInput({ value, onChange, min, className = '', ariaLabel, invalid }: { value: number; onChange(n: number): void; min?: number; className?: string; ariaLabel: string; invalid?: string }) {
  const [draft, setDraft] = useDraft(String(value), (d) => String(Number(d)));
  const valid = /^-?\d+$/.test(draft.trim()) && (min === undefined || Number(draft) >= min);
  return (
    <input
      className={`input mono number-input ${!valid || invalid ? 'invalid' : ''} ${className}`}
      inputMode="numeric"
      aria-label={ariaLabel}
      title={invalid ?? (valid ? undefined : 'Whole number required')}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value.trim());
        if (/^-?\d+$/.test(e.target.value.trim()) && (min === undefined || n >= min) && n !== value) onChange(n);
      }}
      onBlur={() => !valid && setDraft(String(value))}
    />
  );
}

/** Imports a type needs when it comes from a well-known or another workspace file not imported yet. */
function importFor(fullName: string, ctx: ReturnType<typeof useProto>): string | undefined {
  if (ctx.file.imports.some((i) => ctx.imports.find((info) => info.path === i.path)?.types.some((t) => t.fullName === fullName))) return undefined;
  for (const [path, types] of Object.entries(WELL_KNOWN_IMPORTS)) if (types.some((t) => t.fullName === fullName)) return path;
  return ctx.available.find((f) => f.types.some((t) => t.fullName === fullName))?.importPath;
}

interface TypeOption {
  value: string;
  fullName?: string;
  description: string;
  importPath?: string;
}

/** Types offered in a picker: scalars, types of this file, imported types, then importable ones. */
export function useTypeOptions(scope: string, { messagesOnly = false, scalars = true } = {}): TypeOption[] {
  const ctx = useProto();
  const options: TypeOption[] = [];
  if (scalars && !messagesOnly) for (const s of SCALAR_TYPES) options.push({ value: s, description: 'scalar' });
  const seen = new Set<string>();
  for (const type of ctx.types.values()) {
    if (messagesOnly && type.kind !== 'message') continue;
    seen.add(type.fullName);
    options.push({ value: typeReference(type.fullName, scope, ctx.types), fullName: type.fullName, description: `${type.kind}${type.importPath ? ` · ${type.importPath}` : ' · this file'}` });
  }
  const importable = [
    ...ctx.available.flatMap((f) => f.types.map((t) => ({ ...t, importPath: f.importPath }))),
    ...Object.entries(WELL_KNOWN_IMPORTS).flatMap(([importPath, types]) => types.map((t) => ({ ...t, importPath }))),
  ];
  for (const t of importable) {
    if (seen.has(t.fullName) || (messagesOnly && t.kind !== 'message')) continue;
    seen.add(t.fullName);
    options.push({ value: t.fullName, fullName: t.fullName, description: `${t.kind} · adds import "${t.importPath}"`, importPath: t.importPath });
  }
  return options;
}

/**
 * Type reference input with suggestions. Picking a type from a file that is not imported yet
 * also adds the import.
 */
export function TypeInput({
  value,
  scope,
  onCommit,
  messagesOnly,
  scalars = true,
  ariaLabel = 'Type',
  className = '',
}: {
  value: string;
  scope: string;
  onCommit(type: string, extra: ProtoEdit[]): void;
  messagesOnly?: boolean;
  scalars?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const ctx = useProto();
  const listId = useId();
  const options = useTypeOptions(scope, { messagesOnly, scalars });
  const [draft, setDraft] = useDraft(value);
  const error = draft === value ? undefined : !draft.trim() ? 'Type required' : isScalar(draft.trim()) || TYPE_REFERENCE.test(draft.trim()) ? undefined : 'Not a valid type name';

  const commit = (next = draft.trim()) => {
    if (next === value) return;
    if (!next || (!isScalar(next) && !TYPE_REFERENCE.test(next))) {
      setDraft(value);
      return;
    }
    const option = options.find((o) => o.value === next);
    const resolved = isScalar(next) ? undefined : resolveType(next, scope, ctx.types);
    const fullName = option?.fullName ?? resolved?.fullName ?? next.replace(/^\./, '');
    const importPath = !resolved && !isScalar(next) ? (option?.importPath ?? importFor(fullName, ctx)) : undefined;
    const reference = importPath ? fullName : next;
    setDraft(reference);
    onCommit(reference, importPath ? [{ op: 'addImport', path: importPath }] : []);
  };

  const known = isScalar(value) || !!resolveType(value, scope, ctx.types);
  return (
    <span className={`type-input ${className}`}>
      <input
        className={`input mono ${error ? 'invalid' : ''} ${!known && draft === value ? 'unknown-type' : ''}`}
        list={listId}
        aria-label={ariaLabel}
        title={error ?? (known ? undefined : `${value} is not defined in this file or its imports`)}
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value);
          // A suggestion picked from the list is applied at once.
          if (options.some((o) => o.value === e.target.value)) commit(e.target.value);
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={`${o.value} ${o.importPath ?? ''}`} value={o.value}>
            {o.description}
          </option>
        ))}
      </datalist>
    </span>
  );
}

export function MapKeySelect({ value, onChange }: { value: string; onChange(key: string): void }) {
  return (
    <select className="keyword-select compact mono map-key" aria-label="Map key type" title="Map key type" value={value} onChange={(e) => onChange(e.target.value)}>
      {!MAP_KEY_TYPES.includes(value) && <option value={value}>{value}</option>}
      {MAP_KEY_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Boolean option such as `deprecated = true` (unchecked removes it). */
export function OptionCheckbox({ target, options, name, label, hint }: { target: ProtoPath; options: ProtoOption[]; name: string; label: string; hint?: string }) {
  const { edit } = useProto();
  const current = options.find((o) => o.name === name)?.value;
  return (
    <label className="checkbox" title={hint}>
      <input type="checkbox" checked={current === 'true'} onChange={(e) => edit({ op: 'setOption', target, name, value: e.target.checked ? 'true' : undefined })} /> {label}
    </label>
  );
}

/** String option such as `go_package = "..."` (empty removes it). */
export function OptionTextField({ target, options, name, label, placeholder, hint }: { target: ProtoPath; options: ProtoOption[]; name: string; label: string; placeholder?: string; hint?: ReactNode }) {
  const { edit } = useProto();
  const raw = options.find((o) => o.name === name)?.value;
  const value = raw && /^["']/.test(raw) ? unquote(raw) : (raw ?? '');
  const [draft, setDraft] = useDraft(value);
  return (
    <Field label={label} hint={hint}>
      <input
        className="input mono"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          edit({ op: 'setOption', target, name, value: e.target.value ? quote(e.target.value) : undefined });
        }}
      />
    </Field>
  );
}

/** Enum-valued option such as `optimize_for = SPEED`. */
export function OptionSelect({ target, options, name, label, choices, hint }: { target: ProtoPath; options: ProtoOption[]; name: string; label: string; choices: string[]; hint?: ReactNode }) {
  const { edit } = useProto();
  const value = options.find((o) => o.name === name)?.value ?? '';
  return (
    <Field label={label} hint={hint}>
      <select className="keyword-select" value={value} onChange={(e) => edit({ op: 'setOption', target, name, value: e.target.value || undefined })}>
        <option value="">(default)</option>
        {value && !choices.includes(value) && <option value={value}>{value}</option>}
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Options the form has no field for, shown read-only. */
export function OtherOptions({ options, handled }: { options: ProtoOption[]; handled: string[] }) {
  const { openAsText } = useProto();
  const others = options.filter((o) => !handled.includes(o.name));
  if (!others.length) return null;
  return (
    <div className="other-options">
      <span className="field-label">Other options (edit as text)</span>
      {others.map((o, i) => (
        <button key={i} type="button" className="option-line mono" title="Open this line as text" onClick={() => openAsText(o.line)}>
          <span className="option-name">{o.name}</span> = <span className="option-value">{o.value.length > 160 ? `${o.value.slice(0, 160)}…` : o.value}</span>
        </button>
      ))}
    </div>
  );
}

const RANGE = /^(\d+)(?:\s*(?:to|-|\.\.)\s*(\d+|max))?$/;

/** Reserved numbers and names of a message or enum. */
export function ReservedSection({ target, reserved, what }: { target: ProtoPath; reserved: { kind: 'numbers' | 'names'; items: string[] }[]; what: 'field' | 'value' }) {
  const { edit } = useProto();
  const numbers = reserved.filter((r) => r.kind === 'numbers').flatMap((r) => r.items);
  const names = reserved.filter((r) => r.kind === 'names').flatMap((r) => r.items);
  return (
    <Section title="Reserved" icon="lock" count={numbers.length + names.length}>
      <p className="muted small">
        Numbers and names of deleted {what}s, so they are never reused: old clients would misread the data.
      </p>
      <div className="form-grid">
        <Field label="Numbers" hint='e.g. 4, 9 to 11, 100 to max'>
          <ChipsInput
            values={numbers}
            commitOnSpace={false}
            placeholder="Add a number or range…"
            normalize={(raw) =>
              raw
                .split(',')
                .map((v) => RANGE.exec(v.trim()))
                .filter((m): m is RegExpExecArray => !!m)
                .map((m) => (m[2] ? `${m[1]} to ${m[2]}` : m[1]))
            }
            onChange={(items) => edit({ op: 'setReserved', target, kind: 'numbers', items })}
          />
        </Field>
        <Field label="Names">
          <ChipsInput
            values={names}
            placeholder="Add a name…"
            normalize={(raw) => raw.split(/[,\s]+/).map((v) => v.replace(/["']/g, '')).filter((v) => /^[A-Za-z_]\w*$/.test(v))}
            onChange={(items) => edit({ op: 'setReserved', target, kind: 'names', items })}
          />
        </Field>
      </div>
    </Section>
  );
}

export function UsedBy({ fullName }: { fullName: string }) {
  const { file, imports, navigate } = useProto();
  const usages = typeUsages(file, fullName, imports);
  return (
    <Section title="Used by" icon="references" count={usages.length}>
      {usages.length === 0 && <p className="muted">Not used in this file.</p>}
      {usages.map((u, i) => (
        <button key={i} type="button" className="operation-link" onClick={() => navigate(u.location)}>
          <span className="codicon codicon-arrow-right" aria-hidden="true" /> <span className="mono">{u.label}</span>
        </button>
      ))}
    </Section>
  );
}

/** Inline "name + Add" form used to append fields, values, rpcs... */
export function AddRow({
  label,
  placeholder,
  initial = '',
  validate,
  onAdd,
  children,
}: {
  label: string;
  placeholder: string;
  initial?: string;
  validate(name: string): string | undefined;
  onAdd(name: string): void;
  children?: ReactNode;
}) {
  const [name, setName] = useState(initial);
  const error = name && name !== initial ? validate(name) : undefined;
  const submit = () => {
    if (!name || name === initial || validate(name)) return;
    onAdd(name);
    setName(initial);
  };
  return (
    <div className="add-row">
      <input
        className={`input mono ${error ? 'invalid' : ''}`}
        aria-label={label}
        placeholder={placeholder}
        value={name}
        title={error}
        spellCheck={false}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {children}
      <IconButton icon="add" label={label} showLabel variant="secondary" disabled={!name || name === initial || !!validate(name)} onClick={submit} />
      {error && <span className="key-error">{error}</span>}
    </div>
  );
}
