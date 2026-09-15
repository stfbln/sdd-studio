import { useId, useState, type ReactNode } from 'react';
import { getIn, isObject, type SpecPath } from '../../../shared/structured/edits';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import { candidatesFor, deleteImpact, renameEntityEdits, referencesTo } from '../core/edits';
import { entityAt, entityPath, namesOf, str, type Kind } from '../core/model';
import { useField, useOpenSlo } from './state';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `metadata.name`: renamed on Enter or blur, together with the references of this file. */
export function NameField({ index }: { index: number }) {
  const { spec, edit } = useOpenSlo();
  const info = entityAt(spec, index)!;
  const taken = namesOf(spec, info.kind as Kind, index);
  const references = referencesTo(spec, index).filter((r) => r.index !== index).length;
  return (
    <Field label="Name" required hint={references ? `Renaming also updates ${plural(references, 'reference')} in this file.` : 'Unique id used by references, e.g. checkout-availability.'}>
      <KeyInput
        value={info.name}
        className={`mono ${info.name ? '' : 'invalid'}`}
        ariaLabel="Name"
        placeholder="object-name"
        validate={(v) => (!v.trim() ? 'Required' : taken.includes(v) ? 'Already used by another object of the same kind' : undefined)}
        onCommit={(next) => edit(renameEntityEdits(spec, index, next))}
      />
    </Field>
  );
}

/** Single name reference to an object of another kind (service, indicatorRef…), typed or picked. */
export function RefInput({ index, from, field, label, required, hint }: { index: number; from: Kind; field: string; label: string; required?: boolean; hint?: ReactNode }) {
  const { spec } = useOpenSlo();
  const listId = useId();
  const [value, set] = useField<string>(entityPath(index, 'spec', field), { keepEmpty: required });
  const text = str(value);
  const candidates = candidatesFor(spec, from, field);
  const problem = text.trim() && !candidates.includes(text) ? `Not defined in this file` : undefined;
  return (
    <Field label={label} required={required} hint={problem ? <span className="warning-text">{problem}</span> : hint}>
      <input
        className={`input mono ${(required && !text.trim()) || problem ? 'invalid' : ''}`}
        list={listId}
        value={text}
        placeholder={candidates[0] ? `e.g. ${candidates[0]}` : 'name'}
        spellCheck={false}
        onChange={(e) => set(e.target.value)}
      />
      <datalist id={listId}>
        {candidates.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Field>
  );
}

/** List of name references to objects of another kind (alertPolicies, conditions, notificationTargets). */
export function RefListField({ index, from, field, label }: { index: number; from: Kind; field: string; label: string }) {
  const { spec, edit } = useOpenSlo();
  const path = entityPath(index, 'spec', field);
  const value = getIn(spec, path);
  const values = Array.isArray(value) ? value.map(String) : [];
  const candidates = candidatesFor(spec, from, field).filter((c) => !values.includes(c));
  return (
    <Field label={label}>
      <ChipsInput
        values={values}
        suggestions={candidates}
        placeholder={`Add ${label.toLowerCase()}…`}
        chipWarning={(v) => (candidatesFor(spec, from, field).includes(v) ? undefined : 'Not defined in this file')}
        onChange={(next) => (next.length ? edit({ op: 'set', path, value: next }) : edit({ op: 'delete', path }))}
      />
    </Field>
  );
}

/** Free-form string map (connectionDetails, a metric source's spec). */
export function MapSection({ path, title, icon, empty }: { path: SpecPath; title: string; icon: string; empty: ReactNode }) {
  const { spec, edit } = useOpenSlo();
  const value = getIn(spec, path);
  const keys = isObject(value) ? Object.keys(value) : [];
  const add = () => {
    let key = 'key';
    for (let i = 2; keys.includes(key); i++) key = `key-${i}`;
    edit({ op: 'set', path: [...path, key], value: '' });
  };
  return (
    <Section title={title} icon={icon} count={keys.length} actions={<IconButton icon="add" label="Add entry" showLabel onClick={add} />}>
      {keys.length === 0 && <p className="muted small">{empty}</p>}
      {keys.map((key) => (
        <div key={key} className="attribute-row">
          <KeyInput
            value={key}
            className="mono"
            ariaLabel="Key"
            validate={(v) => (!v.trim() ? 'Required' : keys.includes(v) ? 'Already exists' : undefined)}
            onCommit={(next) => edit({ op: 'renameKey', path: [...path, key], newKey: next })}
          />
          <MapValue path={[...path, key]} />
          <IconButton icon="trash" label="Remove entry" onClick={() => edit({ op: 'delete', path: keys.length === 1 ? path : [...path, key] })} />
        </div>
      ))}
    </Section>
  );
}

function MapValue({ path }: { path: SpecPath }) {
  const [value, set] = useField(path, { keepEmpty: true });
  return <input className="input mono" placeholder="value" aria-label="Value" value={value === undefined || value === null ? '' : String(value)} onChange={(e) => set(e.target.value)} />;
}

/** Numeric input bound to a path (objective target, alert threshold…), decimals allowed. */
export function NumberField({ path, label, required, hint, step, min, max }: { path: SpecPath; label: string; required?: boolean; hint?: ReactNode; step?: number; min?: number; max?: number }) {
  const [value, set] = useField<number>(path, { keepEmpty: required });
  const text = value === undefined || value === null ? '' : String(value);
  return (
    <Field label={label} required={required} hint={hint}>
      <input
        className={`input mono ${required && text === '' ? 'invalid' : ''}`}
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    </Field>
  );
}

/** Up/down buttons reordering an array item (objectives, time windows…). */
export function MoveButtons({ path, index, count, label }: { path: SpecPath; index: number; count: number; label: string }) {
  const { edit } = useOpenSlo();
  return (
    <span className="move-buttons">
      <IconButton icon="arrow-up" label={`Move ${label} up`} disabled={index === 0} onClick={() => edit({ op: 'move', path: [...path, index], to: index - 1 })} />
      <IconButton icon="arrow-down" label={`Move ${label} down`} disabled={index >= count - 1} onClick={() => edit({ op: 'move', path: [...path, index], to: index + 1 })} />
    </span>
  );
}

/** Name input for a new object: Enter creates, Escape or an empty blur cancels. */
function NamePrompt({ singular, onDone }: { singular: string; onDone(name: string | null): void }) {
  const [name, setName] = useState('');
  const create = () => name.trim() && onDone(name);
  return (
    <span className="link-create">
      <input
        className="input"
        autoFocus
        value={name}
        aria-label={`Name of the new ${singular}`}
        placeholder={`Name of the new ${singular}`}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') create();
          if (e.key === 'Escape') onDone(null);
        }}
        onBlur={() => !name.trim() && onDone(null)}
      />
      <IconButton icon="check" label={`Create ${singular}`} disabled={!name.trim()} onClick={create} />
      <IconButton icon="close" label="Cancel" onClick={() => onDone(null)} />
    </span>
  );
}

/** Button asking for the name of a new object of a kind, shown on the overview page. */
export function CreateButton({ label, singular, onCreate }: { label: string; singular: string; onCreate(name: string): void }) {
  const [naming, setNaming] = useState(false);
  if (naming) return <NamePrompt singular={singular} onDone={(name) => (setNaming(false), name && onCreate(name))} />;
  return <IconButton icon="add" label={label} showLabel onClick={() => setNaming(true)} />;
}

/** What deleting an object would break, shown before the delete button. */
export function DeleteImpactHint({ spec, index }: { spec: unknown; index: number }) {
  const impact = deleteImpact(spec, index);
  if (!impact.removed && !impact.broken) return null;
  return (
    <span className="muted small">
      {impact.removed > 0 && `Removes ${plural(impact.removed, 'reference')}. `}
      {impact.broken > 0 && `Leaves ${plural(impact.broken, 'reference')} pointing to nothing.`}
    </span>
  );
}
