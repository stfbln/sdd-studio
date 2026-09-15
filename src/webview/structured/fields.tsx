import { useEffect, useState, type ReactNode } from 'react';
import type { SpecPath } from '../../shared/structured/edits';
import { AutoTextarea } from '../components/AutoTextarea';
import { ChipsInput } from '../components/ChipsInput';
import { useField } from './state';

interface FieldProps {
  path: SpecPath;
  label: string;
  placeholder?: string;
  required?: boolean;
  hint?: ReactNode;
}

export function Field({ label, required, hint, children, wide }: { label: string; required?: boolean; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'field-wide' : ''}`}>
      <span className="field-label">
        {label}
        {required && <span className="required" title="Required">*</span>}
      </span>
      <span className="field-control">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextField({ path, label, placeholder, required, hint, mono, type = 'text', list }: FieldProps & { mono?: boolean; type?: string; list?: string }) {
  const [value, set] = useField(path, { keepEmpty: required });
  const text = value === undefined || value === null ? '' : String(value);
  return (
    <Field label={label} required={required} hint={hint}>
      <input
        className={`input ${mono ? 'mono' : ''} ${required && !text.trim() ? 'invalid' : ''}`}
        type={type}
        list={list}
        value={text}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({ path, label, placeholder, hint }: FieldProps) {
  const [value, set] = useField<string>(path);
  return (
    <Field label={label} hint={hint} wide>
      <AutoTextarea value={typeof value === 'string' ? value : ''} placeholder={placeholder} onChange={set} />
    </Field>
  );
}

export function CheckboxField({ path, label, hint }: { path: SpecPath; label: string; hint?: string }) {
  const [value, set] = useField<boolean>(path);
  return (
    <label className="checkbox" title={hint}>
      <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked ? true : undefined)} /> {label}
    </label>
  );
}

export function ChipsField({
  path,
  label,
  placeholder,
  suggestions,
  chipWarning,
}: FieldProps & { suggestions?: string[]; chipWarning?: (v: string) => string | undefined }) {
  const [value, set] = useField<unknown[]>(path);
  const values = Array.isArray(value) ? value.map(String) : [];
  return (
    <Field label={label}>
      <ChipsInput values={values} onChange={set} placeholder={placeholder} suggestions={suggestions} chipWarning={chipWarning} commitOnSpace={false} />
    </Field>
  );
}

/**
 * Input for names used as object keys (paths, status codes, schema names): edited locally
 * and committed on Enter/blur, so renames don't happen on every keystroke.
 */
export function KeyInput({
  value,
  onCommit,
  validate,
  className = '',
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (next: string) => void;
  validate?: (next: string) => string | undefined;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = draft !== value ? validate?.(draft) : undefined;
  const commit = () => {
    if (draft === value) return;
    if (error) setDraft(value);
    else onCommit(draft);
  };
  return (
    <span className="key-input">
      <input
        className={`input ${className} ${error ? 'invalid' : ''}`}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        title={error}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {error && <span className="key-error">{error}</span>}
    </span>
  );
}

export function Section({ title, icon, actions, children, count }: { title: string; icon: string; actions?: ReactNode; children: ReactNode; count?: number }) {
  return (
    <section className="section">
      <header className="section-header">
        <span className={`codicon codicon-${icon}`} aria-hidden="true" />
        <h2>{title}</h2>
        {count !== undefined && <span className="count">{count}</span>}
        <span className="section-actions">{actions}</span>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

/** Small colored label (HTTP method, send/receive...). Colors come from the `badge-<value>` class. */
export function KindBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`kind-badge badge-${value}`}>{label ?? value.toUpperCase()}</span>;
}

/** Input bound to a path, without label (table rows, lists). */
export function InlineInput({ path, placeholder, mono, grow, list }: { path: SpecPath; placeholder?: string; mono?: boolean; grow?: boolean; list?: string }) {
  const [value, set] = useField(path);
  return (
    <input
      className={`input ${mono ? 'mono' : ''} ${grow ? 'grow' : ''}`}
      placeholder={placeholder}
      aria-label={placeholder}
      list={list}
      value={value === undefined ? '' : String(value)}
      onChange={(e) => set(e.target.value)}
    />
  );
}
