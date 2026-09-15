import { useEffect, useState, type ReactNode } from 'react';
import { getIn, isObject, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import {
  appendEdit,
  COLLECTION_LABELS,
  findIndex,
  idsOf,
  itemId,
  itemLabel,
  itemsOf,
  MITIGATION_STATES,
  newItem,
  parentOf,
  referencePaths,
  renameIdEdits,
  representationIds,
  stringList,
  THREAT_STATES,
  type OtmCollection,
} from '../core/otm';
import { itemLocation, useField, useOtm } from './state';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* Numbers ------------------------------------------------------------------ */

/** Number input keeping what is typed (e.g. an empty box) until it is a valid number. */
export function NumberInput({ path, label, min, max, className = '' }: { path: SpecPath; label: string; min?: number; max?: number; className?: string }) {
  const [value, set] = useField<unknown>(path, { keepEmpty: true });
  const number = typeof value === 'number' ? value : undefined;
  const [draft, setDraft] = useState(number === undefined ? '' : String(number));
  useEffect(() => setDraft((d) => (d.trim() !== '' && Number(d) === number ? d : number === undefined ? '' : String(number))), [number]);
  const invalid = number === undefined || (min !== undefined && number < min) || (max !== undefined && number > max);
  return (
    <input
      className={`input number-input ${invalid ? 'invalid' : ''} ${className}`}
      type="number"
      min={min}
      max={max}
      aria-label={label}
      title={label}
      placeholder={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) set(n);
      }}
    />
  );
}

/** A 0–100 value of OTM, as a slider and a number. */
export function RiskField({ path, label, hint }: { path: SpecPath; label: string; hint?: string }) {
  const [value, set] = useField<unknown>(path, { keepEmpty: true });
  const number = typeof value === 'number' ? value : undefined;
  return (
    <div className="field risk-field">
      <span className="field-label">
        {label}
        <span className="required" title="Required">*</span>
      </span>
      <span className="risk-control">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          className={`risk-range ${number === undefined ? 'unset' : ''}`}
          aria-label={label}
          value={number ?? 0}
          onChange={(e) => set(Number(e.target.value))}
        />
        <NumberInput path={path} label={`${label} (0 to 100)`} min={0} max={100} />
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

/* Texts -------------------------------------------------------------------- */

/** Text input bound to a path that writes "" instead of removing the key (required values). */
export function RequiredInput({ path, placeholder, mono, list, className = '' }: { path: SpecPath; placeholder: string; mono?: boolean; list?: string; className?: string }) {
  const [value, set] = useField(path, { keepEmpty: true });
  const text = value === undefined || value === null ? '' : String(value);
  return (
    <input
      className={`input ${mono ? 'mono' : ''} ${text.trim() ? '' : 'invalid'} ${className}`}
      placeholder={placeholder}
      aria-label={placeholder}
      list={list}
      value={text}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Id of an element: renamed on Enter or blur, together with every reference to it. */
export function IdField({ collection, index }: { collection: OtmCollection; index: number }) {
  const { spec, edit } = useOtm();
  const id = itemId(itemsOf(spec, collection)[index] ?? {});
  const references = referencePaths(spec, collection, id).length;
  // Trust zones and components share ids: dataflow ends may point to either.
  const taken = [
    ...(collection === 'trustZones' ? idsOf(spec, 'components') : collection === 'components' ? idsOf(spec, 'trustZones') : []),
    ...idsOf(spec, collection).filter((_, i) => i !== index),
  ];
  return (
    <Field label="Id" required hint={references ? `Renaming also updates ${plural(references, 'reference')}.` : 'Used by other elements to point to this one.'}>
      <KeyInput
        value={id}
        className={`mono ${id ? '' : 'invalid'}`}
        ariaLabel="Id"
        placeholder="unique-id"
        validate={(v) => (!v.trim() ? 'Required' : taken.includes(v) ? 'Already used' : undefined)}
        onCommit={(next) => edit(renameIdEdits(spec, collection, index, next))}
      />
    </Field>
  );
}

/* References --------------------------------------------------------------- */

export interface RefOption {
  id: string;
  label: string;
  group?: string;
  /** Id shown next to the label, when `id` is encoded. */
  shownId?: string;
}

export const optionsOf = (spec: unknown, collection: OtmCollection, group?: string): RefOption[] =>
  itemsOf(spec, collection)
    .map((item) => ({ id: itemId(item), label: itemLabel(item), group }))
    .filter((o) => o.id);

/** Select of element ids. A value that matches no option stays visible, marked as missing. */
export function RefSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = 'Choose…',
  allowNone,
  className = '',
}: {
  value: string;
  options: RefOption[];
  onChange(id: string): void;
  ariaLabel: string;
  placeholder?: string;
  /** Offers an empty choice that removes the reference. */
  allowNone?: string;
  className?: string;
}) {
  const known = options.some((o) => o.id === value);
  const groups = [...new Set(options.map((o) => o.group))];
  const render = (list: RefOption[]) =>
    list.map((o) => (
      <option key={`${o.group}:${o.id}`} value={o.id}>
        {o.label === (o.shownId ?? o.id) ? o.label : `${o.label} (${o.shownId ?? o.id})`}
      </option>
    ));
  const invalid = value ? !known : allowNone === undefined;
  return (
    <select className={`keyword-select ref-select ${invalid ? 'invalid' : ''} ${className}`} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {(!value || allowNone !== undefined) && <option value="">{allowNone ?? placeholder}</option>}
      {value && !known && <option value={value}>{value} (missing)</option>}
      {groups.length > 1 || groups[0] ? groups.map((g) => <optgroup key={g} label={g}>{render(options.filter((o) => o.group === g))}</optgroup>) : render(options)}
    </select>
  );
}

/** Parent of a trust zone or component: a trust zone or another component. */
export function ParentField({ collection, index }: { collection: 'trustZones' | 'components'; index: number }) {
  const { spec, edit } = useOtm();
  const item = itemsOf(spec, collection)[index] ?? {};
  const parent = parentOf(item);
  const self = `${collection === 'trustZones' ? 'trustZone' : 'component'}:${itemId(item)}`;
  const options = [
    ...optionsOf(spec, 'trustZones', 'Trust zones').map((o) => ({ ...o, id: `trustZone:${o.id}`, shownId: o.id })),
    ...optionsOf(spec, 'components', 'Components').map((o) => ({ ...o, id: `component:${o.id}`, shownId: o.id })),
  ].filter((o) => o.id !== self);
  const path = [collection, index, 'parent'];
  return (
    <Field label="Parent" required={collection === 'components'} hint={collection === 'components' ? 'Trust zone or component this component runs in.' : 'Optional enclosing trust zone.'}>
      <RefSelect
        value={parent ? `${parent.kind}:${parent.id}` : ''}
        options={options}
        ariaLabel="Parent"
        allowNone={collection === 'trustZones' ? '(none)' : undefined}
        placeholder="Choose a trust zone or component…"
        onChange={(v) => {
          if (!v) return edit({ op: 'delete', path });
          const [kind, ...rest] = v.split(':');
          edit({ op: 'set', path, value: { [kind]: rest.join(':') } });
        }}
      />
    </Field>
  );
}

/** Dataflow end: a component or a trust zone. */
export function EndpointField({ index, end }: { index: number; end: 'source' | 'destination' }) {
  const { spec, edit } = useOtm();
  const value = String(getIn(spec, ['dataflows', index, end]) ?? '');
  return (
    <Field label={end === 'source' ? 'Source' : 'Destination'} required>
      <RefSelect
        value={value}
        options={[...optionsOf(spec, 'components', 'Components'), ...optionsOf(spec, 'trustZones', 'Trust zones')]}
        ariaLabel={end === 'source' ? 'Source' : 'Destination'}
        placeholder="Choose a component…"
        onChange={(id) => edit({ op: 'set', path: ['dataflows', index, end], value: id })}
      />
    </Field>
  );
}

/** Button opening the page of another element. */
export function ItemLink({ collection, id, index, children }: { collection: OtmCollection; id?: string; index?: number; children?: ReactNode }) {
  const { spec, navigate } = useOtm();
  const target = index ?? findIndex(spec, collection, id ?? '');
  if (target < 0) return <span className="muted">{id || '?'}</span>;
  return (
    <button type="button" className="link-button item-link" onClick={() => navigate(itemLocation(collection, target))}>
      {children ?? itemLabel(itemsOf(spec, collection)[target])}
    </button>
  );
}

export function OpenButton({ collection, id }: { collection: OtmCollection; id: string }) {
  const { spec, navigate } = useOtm();
  const index = findIndex(spec, collection, id);
  return (
    <IconButton
      icon="arrow-right"
      label={`Open ${COLLECTION_LABELS[collection].singular.toLowerCase()}`}
      disabled={index < 0}
      onClick={() => navigate(itemLocation(collection, index))}
    />
  );
}

/** Value of the "New…" choice; ids never contain a line break, so it cannot clash with one. */
const NEW_OPTION = '\n new';

/** Name input for a new element: Enter creates, Escape or an empty blur cancels. */
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

/** Button asking for the name of a new element. */
export function CreateButton({ collection, label, onCreate }: { collection: OtmCollection; label: string; onCreate(name: string): void }) {
  const [naming, setNaming] = useState(false);
  const singular = COLLECTION_LABELS[collection].singular.toLowerCase();
  if (naming) return <NamePrompt singular={singular} onDone={(name) => (setNaming(false), name && onCreate(name))} />;
  return <IconButton icon="add" label={label} showLabel onClick={() => setNaming(true)} />;
}

/** Select linking an existing element, whose last choice asks for the name of a new one. */
export function LinkOrCreate({
  collection,
  exclude,
  label,
  onLink,
}: {
  collection: OtmCollection;
  exclude: string[];
  label: string;
  /** Links `id`; `created` is the edit creating the element when it is new. */
  onLink(id: string, created?: SpecEdit): void;
}) {
  const { spec } = useOtm();
  const [naming, setNaming] = useState(false);
  const singular = COLLECTION_LABELS[collection].singular.toLowerCase();
  const available = optionsOf(spec, collection).filter((o) => !exclude.includes(o.id));

  if (naming) {
    return (
      <NamePrompt
        singular={singular}
        onDone={(name) => {
          setNaming(false);
          if (!name) return;
          const item = newItem(spec, collection, name);
          onLink(String(item.id), appendEdit(spec, [collection], item));
        }}
      />
    );
  }
  return (
    <select
      className="keyword-select link-select"
      aria-label={label}
      value=""
      onChange={(e) => {
        if (e.target.value === NEW_OPTION) setNaming(true);
        else if (e.target.value) onLink(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {available.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label === o.id ? o.id : `${o.label} (${o.id})`}
        </option>
      ))}
      <option value={NEW_OPTION}>New {singular}…</option>
    </select>
  );
}

/* Attributes --------------------------------------------------------------- */

function AttributeValue({ path }: { path: SpecPath }) {
  const [value, set] = useField(path, { keepEmpty: true });
  if (isObject(value) || Array.isArray(value)) return <code className="muted attribute-json">{JSON.stringify(value)}</code>;
  return (
    <input
      className="input"
      placeholder="value"
      aria-label="Attribute value"
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Free-form map of attributes (`attributes:`). */
export function AttributesSection({ path }: { path: SpecPath }) {
  const { spec, edit } = useOtm();
  const value = getIn(spec, path);
  const keys = isObject(value) ? Object.keys(value) : [];
  const add = () => {
    let key = 'attribute';
    for (let i = 2; keys.includes(key); i++) key = `attribute${i}`;
    edit({ op: 'set', path: [...path, key], value: '' });
  };
  return (
    <Section title="Attributes" icon="symbol-property" count={keys.length} actions={<IconButton icon="add" label="Add attribute" showLabel onClick={add} />}>
      {keys.length === 0 && <p className="muted">Free-form key/value information (e.g. a CMDB id or an owner team).</p>}
      {keys.map((key) => (
        <div key={key} className="attribute-row">
          <KeyInput
            value={key}
            className="mono"
            ariaLabel="Attribute name"
            validate={(v) => (!v.trim() ? 'Required' : keys.includes(v) ? 'Already exists' : undefined)}
            onCommit={(next) => edit({ op: 'renameKey', path: [...path, key], newKey: next })}
          />
          <AttributeValue path={[...path, key]} />
          <IconButton
            icon="trash"
            label="Remove attribute"
            onClick={() => edit({ op: 'delete', path: keys.length === 1 ? path : [...path, key] })}
          />
        </div>
      ))}
    </Section>
  );
}

/* Assets ------------------------------------------------------------------- */

/** Which assets an element uses: one checkbox column per list (processed, stored, carried). */
export function AssetsSection({ columns, container, hint }: { columns: { label: string; path: SpecPath }[]; container?: SpecPath; hint: string }) {
  const { spec, edit } = useOtm();
  const lists = columns.map((c) => stringList(getIn(spec, c.path)));
  const assets = optionsOf(spec, 'assets');
  const missing = [...new Set(lists.flat())].filter((id) => !assets.some((a) => a.id === id));
  const rows = [...assets, ...missing.map((id) => ({ id, label: `${id} (missing)` }))];
  const used = new Set(lists.flat()).size;

  const toggle = (column: number, id: string, on: boolean) => {
    const next = on ? [...lists[column], id] : lists[column].filter((v) => v !== id);
    const emptyEverywhere = next.length === 0 && lists.every((list, i) => i === column || list.length === 0);
    if (emptyEverywhere && container) edit({ op: 'delete', path: container });
    else if (next.length === 0) edit({ op: 'delete', path: columns[column].path });
    else edit({ op: 'set', path: columns[column].path, value: next });
  };

  return (
    <Section title="Assets" icon="database" count={used}>
      {rows.length === 0 ? (
        <p className="muted">No assets in this threat model yet. Add them from the outline to mark the sensitive data handled here.</p>
      ) : (
        <div className="table assets-table" role="table" style={{ ['--columns' as string]: columns.length }}>
          <div className="table-head" role="row">
            <span>Asset</span>
            {columns.map((c) => (
              <span key={c.label}>{c.label}</span>
            ))}
          </div>
          {rows.map((asset) => (
            <div key={asset.id} className="table-row" role="row">
              {asset.label.endsWith('(missing)') ? <span className="warning-text">{asset.label}</span> : <ItemLink collection="assets" id={asset.id} />}
              {columns.map((c, i) => (
                <label key={c.label} className="checkbox" title={`${c.label}: ${asset.label}`}>
                  <input type="checkbox" checked={lists[i].includes(asset.id)} onChange={(e) => toggle(i, asset.id, e.target.checked)} />
                  <span className="sr-only">{c.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="muted small">{hint}</p>
    </Section>
  );
}

/* Threat instances --------------------------------------------------------- */

function StateInput({ path, list, label }: { path: SpecPath; list: string; label: string }) {
  const [value] = useField(path);
  return (
    <span className={`state state-${String(value ?? '').toLowerCase()}`}>
      <RequiredInput path={path} placeholder={label} list={list} mono className="state-input" />
    </span>
  );
}

/** Threats found on a component or dataflow, with the state of each and its mitigations. */
export function ThreatsSection({ collection, index }: { collection: 'components' | 'dataflows'; index: number }) {
  const { spec, edit } = useOtm();
  const path = [collection, index, 'threats'];
  const instances = (Array.isArray(getIn(spec, path)) ? (getIn(spec, path) as unknown[]) : []).map((t) => (isObject(t) ? t : ({} as JsonObject)));
  const threatOptions = optionsOf(spec, 'threats');
  const mitigationOptions = optionsOf(spec, 'mitigations');

  return (
    <Section title="Threats" icon="bug" count={instances.length}>
      {instances.length === 0 && <p className="muted">No threats linked yet. Link an existing threat or describe a new one.</p>}
      {instances.map((instance, i) => {
        const base = [...path, i];
        const threat = String(instance.threat ?? '');
        const mitigations = Array.isArray(instance.mitigations) ? instance.mitigations.map((m) => (isObject(m) ? m : ({} as JsonObject))) : [];
        return (
          <div key={i} className="threat-instance">
            <div className="threat-instance-head">
              <span className="codicon codicon-bug" aria-hidden="true" />
              <RefSelect value={threat} options={threatOptions} ariaLabel="Threat" placeholder="Choose a threat…" onChange={(id) => edit({ op: 'set', path: [...base, 'threat'], value: id })} />
              <StateInput path={[...base, 'state']} list="otm-threat-states" label="Threat state" />
              <OpenButton collection="threats" id={threat} />
              <IconButton icon="trash" label="Unlink threat" onClick={() => edit({ op: 'delete', path: base })} />
            </div>
            <div className="mitigation-list">
              {mitigations.map((m, j) => (
                <div key={j} className="mitigation-row">
                  <span className="codicon codicon-check-all" aria-hidden="true" />
                  <RefSelect
                    value={String(m.mitigation ?? '')}
                    options={mitigationOptions}
                    ariaLabel="Mitigation"
                    placeholder="Choose a mitigation…"
                    onChange={(id) => edit({ op: 'set', path: [...base, 'mitigations', j, 'mitigation'], value: id })}
                  />
                  <StateInput path={[...base, 'mitigations', j, 'state']} list="otm-mitigation-states" label="Mitigation state" />
                  <OpenButton collection="mitigations" id={String(m.mitigation ?? '')} />
                  <IconButton icon="trash" label="Remove mitigation" onClick={() => edit({ op: 'delete', path: [...base, 'mitigations', j] })} />
                </div>
              ))}
              <div className="mitigation-row add-row">
                <span className="codicon codicon-add" aria-hidden="true" />
                <LinkOrCreate
                  collection="mitigations"
                  exclude={mitigations.map((m) => String(m.mitigation ?? ''))}
                  label="Add a mitigation…"
                  onLink={(id, created) =>
                    edit([...(created ? [created] : []), appendEdit(spec, [...base, 'mitigations'], { mitigation: id, state: 'required' })])
                  }
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="list-row">
        <LinkOrCreate
          collection="threats"
          exclude={instances.map((t) => String(t.threat ?? ''))}
          label="Link a threat…"
          onLink={(id, created) => edit([...(created ? [created] : []), appendEdit(spec, path, { threat: id, state: 'exposed' })])}
        />
      </div>
      <datalist id="otm-threat-states">
        {THREAT_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="otm-mitigation-states">
        {MITIGATION_STATES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </Section>
  );
}

/* Representations ---------------------------------------------------------- */

/** Where an element appears in the project's representations (diagram shape, code location). */
export function RepresentationsSection({ collection, index }: { collection: 'trustZones' | 'components'; index: number }) {
  const { spec, edit } = useOtm();
  const path = [collection, index, 'representations'];
  const elements = Array.isArray(getIn(spec, path)) ? (getIn(spec, path) as unknown[]).map((r) => (isObject(r) ? r : ({} as JsonObject))) : [];
  const representations = Array.isArray(getIn(spec, ['representations'])) ? (getIn(spec, ['representations']) as unknown[]).map((r) => (isObject(r) ? r : ({} as JsonObject))) : [];
  if (!representations.length && !elements.length) return null;
  const options = representations.map((r) => ({ id: String(r.id ?? ''), label: String(r.name ?? r.id ?? '') })).filter((o) => o.id);
  const typeOf = (id: string) => String(representations.find((r) => r.id === id)?.type ?? '');
  const itemIdValue = itemId(itemsOf(spec, collection)[index] ?? {});

  const add = () => {
    const representation = representationIds(spec).find(Boolean) ?? '';
    const element: JsonObject = { representation, id: `${itemIdValue || 'element'}-${representation || 'representation'}`.replace(/\s+/g, '-') };
    if (typeOf(representation) === 'diagram') Object.assign(element, { position: { x: 0, y: 0 }, size: { width: 100, height: 100 } });
    edit(appendEdit(spec, path, element));
  };

  return (
    <Section title="Representations" icon="symbol-misc" count={elements.length} actions={<IconButton icon="add" label="Add representation element" showLabel onClick={add} />}>
      {elements.length === 0 && <p className="muted">Not placed in any representation (diagram, code…) yet.</p>}
      {elements.map((element, i) => {
        const base = [...path, i];
        const type = typeOf(String(element.representation ?? ''));
        return (
          <div key={i} className="representation-row">
            <RefSelect
              value={String(element.representation ?? '')}
              options={options}
              ariaLabel="Representation"
              onChange={(id) => edit({ op: 'set', path: [...base, 'representation'], value: id })}
            />
            <RequiredInput path={[...base, 'id']} placeholder="Element id" mono />
            {type === 'diagram' && (
              <span className="inline-fields numbers">
                <span className="size-label">Position</span>
                <NumberInput path={[...base, 'position', 'x']} label="x" />
                <NumberInput path={[...base, 'position', 'y']} label="y" />
                <span className="size-label">Size</span>
                <NumberInput path={[...base, 'size', 'width']} label="width" />
                <NumberInput path={[...base, 'size', 'height']} label="height" />
              </span>
            )}
            {type === 'code' && (
              <span className="inline-fields">
                <OptionalInput path={[...base, 'file']} placeholder="File" mono />
                <NumberInput path={[...base, 'line']} label="line" />
              </span>
            )}
            <IconButton icon="trash" label="Remove representation element" onClick={() => edit({ op: 'delete', path: base })} />
          </div>
        );
      })}
    </Section>
  );
}

/** Text input bound to a path; emptying it removes the key. */
export function OptionalInput({ path, placeholder, mono }: { path: SpecPath; placeholder: string; mono?: boolean }) {
  const [value, set] = useField(path);
  return (
    <input
      className={`input ${mono ? 'mono' : ''}`}
      placeholder={placeholder}
      aria-label={placeholder}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => set(e.target.value)}
    />
  );
}

