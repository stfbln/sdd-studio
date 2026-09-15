import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getIn, isObject, type Json, type JsonObject, type SpecPath } from '../../../shared/structured/edits';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { IconButton } from '../../../webview/components/IconButton';
import { useField } from '../../../webview/structured/state';
import { ARITY_PRESETS, arityOf, arityPreset, asArray } from '../core/opencli';
import { useCli } from './state';

/** Checkbox for flags whose default is false: unchecking removes the key. */
export function BoolCell({ path, label, defaultValue = false }: { path: SpecPath; label: string; defaultValue?: boolean }) {
  const [value, set] = useField<boolean>(path);
  const checked = value === undefined ? defaultValue : value === true;
  return (
    <input
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      onChange={(e) => set(e.target.checked === defaultValue ? undefined : e.target.checked)}
    />
  );
}

/** Text input for values that must stay in place while cleared (names, list items). */
export function TextCell({
  path,
  placeholder,
  mono,
  grow,
  ariaLabel,
  autoFocus,
}: {
  path: SpecPath;
  placeholder?: string;
  mono?: boolean;
  grow?: boolean;
  ariaLabel?: string;
  /** Focuses with the caret at the end (new list items). */
  autoFocus?: boolean;
}) {
  const [value, set] = useField(path, { keepEmpty: true });
  const text = value === undefined || value === null ? '' : String(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (autoFocus && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // Only when the input appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      className={`input ${mono ? 'mono' : ''} ${grow ? 'grow' : ''} ${text.trim() ? '' : 'invalid'}`}
      aria-label={ariaLabel ?? placeholder}
      placeholder={placeholder}
      spellCheck={false}
      value={text}
      ref={ref}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Chips bound to a string array; an empty list removes the key. */
export function ChipsCell({ path, placeholder, spaces }: { path: SpecPath; placeholder: string; spaces?: boolean }) {
  const [value, set] = useField<Json[]>(path);
  return (
    <ChipsInput
      values={asArray(value).map(String)}
      onChange={set}
      placeholder={placeholder}
      commitOnSpace={!spaces}
    />
  );
}

/** Whole number committed on blur/Enter; invalid text is shown in red and not written. */
export function IntegerInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  allowEmpty,
  min,
}: {
  value: number | undefined;
  onCommit(value: number | undefined): void;
  placeholder?: string;
  ariaLabel: string;
  allowEmpty?: boolean;
  min?: number;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const parsed = draft.trim() === '' ? undefined : Number(draft);
  const valid = parsed === undefined ? !!allowEmpty : Number.isInteger(parsed) && (min === undefined || parsed >= min);
  const commit = () => {
    if (!valid) return setDraft(value === undefined ? '' : String(value));
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <input
      className={`input mono number-input ${valid ? '' : 'invalid'}`}
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

/** Arity as a plain-language choice, with minimum/maximum inputs for other ranges. */
export function AritySelect({ path }: { path: SpecPath }) {
  const { spec, edit } = useCli();
  const argument = getIn(spec, path);
  const arity = arityOf(argument);
  const preset = arityPreset(arity);
  const [custom, setCustom] = useState(preset === 'custom');
  const selected = custom ? 'custom' : preset;
  const arityPath = [...path, 'arity'];

  return (
    <span className="arity">
      <select
        className="keyword-select compact"
        aria-label="Number of values"
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          if (id === 'custom') return setCustom(true);
          setCustom(false);
          const next = ARITY_PRESETS.find((p) => p.id === id)!.arity;
          const hadArity = isObject(argument) && argument.arity !== undefined;
          // Exactly one is the default: keep the file short unless an arity was already written.
          if (id === 'one' && !hadArity) return;
          edit({ op: 'set', path: arityPath, value: next as unknown as JsonObject });
        }}
      >
        {ARITY_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom range…</option>
      </select>
      {selected === 'custom' && (
        <span className="arity-range">
          <IntegerInput
            ariaLabel="Minimum values"
            value={arity.minimum}
            min={0}
            onCommit={(v) => edit({ op: 'set', path: [...arityPath, 'minimum'], value: v ?? 0 })}
          />
          <span className="muted">to</span>
          <IntegerInput
            ariaLabel="Maximum values"
            value={arity.maximum}
            min={0}
            allowEmpty
            placeholder="∞"
            onCommit={(v) =>
              edit(
                v === undefined
                  ? { op: 'delete', path: [...arityPath, 'maximum'] }
                  : { op: 'set', path: [...arityPath, 'maximum'], value: v },
              )
            }
          />
        </span>
      )}
    </span>
  );
}

/** Up/down buttons for an item of an ordered array (order is meaningful in OpenCLI). */
export function MoveButtons({ path, index, count, label }: { path: SpecPath; index: number; count: number; label: string }) {
  const { edit } = useCli();
  return (
    <span className="move-buttons">
      <IconButton icon="arrow-up" label={`Move ${label} up`} disabled={index === 0} onClick={() => edit({ op: 'move', path: [...path, index], to: index - 1 })} />
      <IconButton
        icon="arrow-down"
        label={`Move ${label} down`}
        disabled={index >= count - 1}
        onClick={() => edit({ op: 'move', path: [...path, index], to: index + 1 })}
      />
    </span>
  );
}

/**
 * Metadata values can be any JSON. Strings are edited as text; other values as JSON,
 * committed on blur when they parse.
 */
function MetadataValue({ path }: { path: SpecPath }) {
  const { spec, edit } = useCli();
  const value = getIn(spec, path);
  const isText = value === undefined || typeof value === 'string';
  const shown = isText ? ((value as string | undefined) ?? '') : JSON.stringify(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  let valid = true;
  if (!isText) {
    try {
      JSON.parse(draft);
    } catch {
      valid = false;
    }
  }
  const commit = () => {
    if (draft === shown) return;
    if (isText) edit(draft === '' ? { op: 'delete', path } : { op: 'set', path, value: draft });
    else if (valid) edit({ op: 'set', path, value: JSON.parse(draft) });
    else setDraft(shown);
  };
  return (
    <input
      className={`input grow ${isText ? '' : 'mono'} ${valid ? '' : 'invalid'}`}
      aria-label="Metadata value"
      placeholder="value"
      title={isText ? undefined : 'JSON value'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export function MetadataEditor({ path }: { path: SpecPath }) {
  const { spec, edit } = useCli();
  const items = asArray(getIn(spec, path));
  return (
    <div className="metadata">
      {items.map((_, i) => (
        <div key={i} className="list-row">
          <MetadataName path={[...path, i, 'name']} />
          <MetadataValue path={[...path, i, 'value']} />
          <IconButton icon="trash" label="Remove metadata" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
        </div>
      ))}
      <IconButton icon="add" label="Add metadata" showLabel onClick={() => edit({ op: 'set', path: [...path, items.length], value: { name: `key${items.length + 1}`, value: '' } })} />
    </div>
  );
}

function MetadataName({ path }: { path: SpecPath }) {
  const [value, set] = useField<string>(path, { keepEmpty: true });
  return (
    <input
      className={`input mono metadata-name ${value ? '' : 'invalid'}`}
      aria-label="Metadata name"
      placeholder="name"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Name input typed in a small row, added on Enter. */
export function AddInput({
  label,
  placeholder,
  validate,
  onAdd,
  normalize = (v) => v.trim(),
  children,
}: {
  /** Extra controls between the input and the button. */
  children?: ReactNode;
  label: string;
  placeholder: string;
  validate(value: string): string | undefined;
  onAdd(value: string): void;
  normalize?: (value: string) => string;
}) {
  const [draft, setDraft] = useState('');
  const value = normalize(draft);
  const error = draft.trim() ? validate(value) : undefined;
  const add = () => {
    if (!draft.trim() || error) return;
    onAdd(value);
    setDraft('');
  };
  return (
    <span className="add-row">
      <input
        className={`input mono ${error ? 'invalid' : ''}`}
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        title={error}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      {children}
      <IconButton icon="add" label={label} showLabel disabled={!draft.trim() || !!error} onClick={add} />
      {error ? <span className="key-error">{error}</span> : value && value !== draft.trim() && <span className="muted small">adds {value}</span>}
    </span>
  );
}

/** Labelled block holding several controls (a `<label>` would forward clicks to the first one). */
export function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field field-wide group">
      <span className="field-label">{label}</span>
      <div className="group-control">{children}</div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
