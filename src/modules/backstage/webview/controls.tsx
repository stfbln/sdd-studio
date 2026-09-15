import { useId, useState, type ReactNode } from 'react';
import { getIn, isObject, type SpecPath } from '../../../shared/structured/edits';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import { referencesTo, renameEntityEdits, setAnnotationEdits } from '../core/edits';
import {
  CATEGORIES,
  entityAt,
  entityPath,
  formatRef,
  keyOf,
  parseRef,
  refValuePath,
  refTarget,
  str,
  stringList,
  summaryLabel,
  type EntityInfo,
  type KnownEntity,
  type RefField,
} from '../core/model';
import { entityLocation, useCatalog, useField, useWorkspace } from './state';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* Entities ----------------------------------------------------------------- */

/** Opens the page of an entity of this file, or the catalog file defining it. */
export function EntityLink({ entity, showKind }: { entity: KnownEntity; showKind?: boolean }) {
  const { navigate } = useCatalog();
  const { openFile } = useWorkspace();
  const icon = CATEGORIES[entity.category].icon;
  const local = entity.index !== undefined;
  return (
    <span className="entity-link">
      <span className={`codicon codicon-${icon}`} aria-hidden="true" />
      <button
        type="button"
        className="link-button"
        title={[local ? `Open ${entity.kind} ${entity.name}` : `Open ${entity.file}`, entity.description].filter(Boolean).join('\n')}
        onClick={() => (local ? navigate(entityLocation(entity.index!)) : openFile(entity.file))}
      >
        {summaryLabel(entity)}
      </button>
      {showKind && <span className="muted small">{CATEGORIES[entity.category].singular}</span>}
      {!local && <span className="muted small file-hint">{entity.file}</span>}
    </span>
  );
}

/** Where a reference leads: an entity, or why it leads nowhere. */
function refStatus(text: string, field: RefField, info: EntityInfo, known: KnownEntity[], checked: boolean): { entity?: KnownEntity; problem?: string } {
  if (!text.trim()) return {};
  const ref = parseRef(text);
  if (!ref) return { problem: 'Not an entity reference: [kind:][namespace/]name' };
  if (!ref.kind && !field.defaultKind) return { problem: `Needs a kind, e.g. ${field.allowed[0]}:${ref.name}` };
  if (!field.allowed.includes((ref.kind ?? field.defaultKind)!.toLowerCase())) return { problem: `Must point to ${field.allowed.map((k) => `a ${k}`).join(' or ')}` };
  const key = refTarget(text, field, info.namespace);
  const entity = known.find((e) => e.key === key);
  if (!entity && checked) return { problem: 'Not defined in the catalog files of the workspace' };
  if (entity && field.targetCategories && !field.targetCategories.includes(entity.category)) return { entity, problem: `Not a ${field.targetCategories.map((c) => CATEGORIES[c].singular.toLowerCase()).join(' or ')}` };
  return { entity };
}

/** Entities a reference field may point to, written as the field expects them. */
function candidatesFor(field: RefField, info: EntityInfo, known: KnownEntity[]) {
  const self = keyOf(info);
  return known
    .filter((e) => field.allowed.includes(e.kind.toLowerCase()) && (!field.targetCategories || field.targetCategories.includes(e.category)) && e.key !== self && e.name)
    .map((e) => ({ ref: formatRef(e, field.defaultKind, info.namespace), entity: e }));
}

/** Single reference (owner, system, domain...), typed or picked, with where it leads. */
export function RefInput({ index, field, hint }: { index: number; field: RefField; hint?: string }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const listId = useId();
  const info = entityAt(spec, index)!;
  const [value, setSpec] = useField(entityPath(index, ...refValuePath(field)), { keepEmpty: field.required });
  const set = (next: string) => (field.annotation ? edit(setAnnotationEdits(spec, index, field.annotation, next)) : setSpec(next));
  const text = str(value);
  const candidates = candidatesFor(field, info, known);
  const status = refStatus(text, field, info, known, !!context);
  return (
    <Field
      label={field.label}
      required={field.required}
      hint={
        status.problem ? (
          <span className="warning-text">{status.problem}</span>
        ) : status.entity ? (
          <EntityLink entity={status.entity} showKind />
        ) : (
          hint
        )
      }
    >
      <input
        className={`input mono ${(field.required && !text.trim()) || status.problem ? 'invalid' : ''}`}
        list={listId}
        value={text}
        placeholder={field.allowed.length > 1 ? `${field.allowed.join(' or ')} name` : `${field.allowed[0]} name`}
        spellCheck={false}
        onChange={(e) => set(e.target.value)}
      />
      <datalist id={listId}>
        {candidates.map((c) => (
          <option key={c.entity.key} value={c.ref}>
            {summaryLabel(c.entity)} ({CATEGORIES[c.entity.category].singular})
          </option>
        ))}
      </datalist>
    </Field>
  );
}

/** List of references (provided APIs, dependencies, members...). */
export function RefListField({ index, field, placeholder }: { index: number; field: RefField; placeholder?: string }) {
  const { spec, edit } = useCatalog();
  const { known, context } = useWorkspace();
  const info = entityAt(spec, index)!;
  const path = entityPath(index, ...refValuePath(field));
  const values = stringList(getIn(spec, path));
  const candidates = candidatesFor(field, info, known).map((c) => c.ref);
  return (
    <Field label={field.label} required={field.required}>
      <ChipsInput
        values={values}
        suggestions={candidates}
        placeholder={placeholder ?? `Add ${field.allowed.join(' or ')}…`}
        chipWarning={(v) => refStatus(v, field, info, known, !!context).problem}
        onChange={(next) => {
          if (next.length || field.required) edit({ op: 'set', path, value: next });
          else edit({ op: 'delete', path });
        }}
      />
    </Field>
  );
}

/** `metadata.name`: renamed on Enter or blur, together with the references of this file. */
export function NameField({ index }: { index: number }) {
  const { spec, edit } = useCatalog();
  const { known, consolidated } = useWorkspace();
  const info = entityAt(spec, index)!;
  const references = referencesTo(spec, index).filter((r) => r.index !== index).length;
  const where = consolidated ? 'in the catalog files' : 'in this file';
  const taken = known.filter((e) => e.index !== index && e.kind.toLowerCase() === info.kind.toLowerCase() && e.namespace === info.namespace).map((e) => e.name);
  return (
    <Field label="Name" required hint={references ? `Renaming also updates ${plural(references, 'reference')} ${where}.` : 'Unique id used by references, e.g. shop-api.'}>
      <KeyInput
        value={info.name}
        className={`mono ${info.name ? '' : 'invalid'}`}
        ariaLabel="Name"
        placeholder="entity-name"
        validate={(v) =>
          !v.trim()
            ? 'Required'
            : !/^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/.test(v) || v.length > 63
              ? 'Letters, digits, - _ . (max 63)'
              : taken.includes(v)
                ? 'Already used'
                : undefined
        }
        onCommit={(next) => edit(renameEntityEdits(spec, index, next))}
      />
    </Field>
  );
}

/* Creation ----------------------------------------------------------------- */

/** Name input for a new entity: Enter creates, Escape or an empty blur cancels. */
export function NamePrompt({ singular, initial = '', onDone }: { singular: string; initial?: string; onDone(name: string | null): void }) {
  const [name, setName] = useState(initial);
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
        onFocus={(e) => e.target.select()}
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

/** Button asking for the name of a new entity. */
export function CreateButton({ label, singular, onCreate }: { label: string; singular: string; onCreate(name: string): void }) {
  const [naming, setNaming] = useState(false);
  if (naming) return <NamePrompt singular={singular} onDone={(name) => (setNaming(false), name && onCreate(name))} />;
  return <IconButton icon="add" label={label} showLabel onClick={() => setNaming(true)} />;
}

/* Metadata ----------------------------------------------------------------- */

function MapValue({ path, label }: { path: SpecPath; label: string }) {
  const [value, set] = useField(path, { keepEmpty: true });
  if (isObject(value) || Array.isArray(value)) return <code className="muted attribute-json">{JSON.stringify(value)}</code>;
  return <input className="input mono" placeholder="value" aria-label={label} value={value === undefined || value === null ? '' : String(value)} onChange={(e) => set(e.target.value)} />;
}

/** Labels or annotations: key/value rows. Keys edited by dedicated fields are hidden. */
export function KeyValueSection({ index, map, title, icon, hidden = [], empty }: { index: number; map: 'labels' | 'annotations'; title: string; icon: string; hidden?: string[]; empty: ReactNode }) {
  const { spec, edit } = useCatalog();
  const path = entityPath(index, 'metadata', map);
  const value = getIn(spec, path);
  const allKeys = isObject(value) ? Object.keys(value) : [];
  const keys = allKeys.filter((k) => !hidden.includes(k));
  const singular = map === 'labels' ? 'label' : 'annotation';
  const add = () => {
    let key = `example.com/${singular}`;
    for (let i = 2; allKeys.includes(key); i++) key = `example.com/${singular}-${i}`;
    edit({ op: 'set', path: [...path, key], value: '' });
  };
  return (
    <Section title={title} icon={icon} count={keys.length} actions={<IconButton icon="add" label={`Add ${singular}`} showLabel onClick={add} />}>
      {keys.length === 0 && <p className="muted">{empty}</p>}
      {keys.map((key) => (
        <div key={key} className="attribute-row">
          <KeyInput
            value={key}
            className="mono"
            ariaLabel={`${singular} key`}
            validate={(v) => (!v.trim() ? 'Required' : allKeys.includes(v) ? 'Already exists' : undefined)}
            onCommit={(next) => edit({ op: 'renameKey', path: [...path, key], newKey: next })}
          />
          <MapValue path={[...path, key]} label={`Value of ${key}`} />
          <IconButton icon="trash" label={`Remove ${singular}`} onClick={() => edit({ op: 'delete', path: allKeys.length === 1 ? path : [...path, key] })} />
        </div>
      ))}
    </Section>
  );
}

/** `metadata.links`: URL, title and icon. */
export function LinksSection({ index }: { index: number }) {
  const { spec, edit } = useCatalog();
  const path = entityPath(index, 'metadata', 'links');
  const value = getIn(spec, path);
  const links = Array.isArray(value) ? value : [];
  const add = () => edit({ op: 'set', path: Array.isArray(value) ? [...path, links.length] : path, value: Array.isArray(value) ? { url: '', title: '' } : [{ url: '', title: '' }] });
  return (
    <Section title="Links" icon="link" count={links.length} actions={<IconButton icon="add" label="Add link" showLabel onClick={add} />}>
      {links.length === 0 && <p className="muted">Dashboards, runbooks, documentation… shown on the entity page in Backstage.</p>}
      {links.map((_, i) => (
        <div key={i} className="attribute-row link-row">
          <LinkInput path={[...path, i, 'url']} placeholder="https://…" mono required />
          <LinkInput path={[...path, i, 'title']} placeholder="Title" />
          <IconButton icon="trash" label="Remove link" onClick={() => edit({ op: 'delete', path: links.length === 1 ? path : [...path, i] })} />
        </div>
      ))}
    </Section>
  );
}

function LinkInput({ path, placeholder, mono, required }: { path: SpecPath; placeholder: string; mono?: boolean; required?: boolean }) {
  const [value, set] = useField(path, { keepEmpty: required });
  const text = str(value);
  return (
    <input
      className={`input ${mono ? 'mono' : ''} ${required && !text.trim() ? 'invalid' : ''}`}
      placeholder={placeholder}
      aria-label={placeholder}
      value={text}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Text stored in an annotation; emptying it removes the annotation (and an empty map). */
export function AnnotationField({
  index,
  annotation,
  label,
  placeholder,
  hint,
  mono,
  suggestions,
  invalid,
}: {
  index: number;
  annotation: string;
  label: string;
  placeholder?: string;
  hint?: ReactNode;
  mono?: boolean;
  suggestions?: string[];
  invalid?: boolean;
}) {
  const { spec, edit } = useCatalog();
  const listId = useId();
  const value = str(getIn(spec, entityPath(index, 'metadata', 'annotations', annotation)));
  return (
    <Field label={label} hint={hint}>
      <input
        className={`input ${mono ? 'mono' : ''} ${invalid ? 'invalid' : ''}`}
        value={value}
        placeholder={placeholder}
        list={suggestions ? listId : undefined}
        spellCheck={false}
        onChange={(e) => edit(setAnnotationEdits(spec, index, annotation, e.target.value))}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </Field>
  );
}
