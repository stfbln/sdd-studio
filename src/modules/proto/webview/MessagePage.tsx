import { Fragment, useState } from 'react';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import {
  findMessage,
  identifierError,
  isScalar,
  namesInMessage,
  nextFieldNumber,
  renameTypeEdits,
  resolveType,
  toUpperSnakeCase,
  topLevelNames,
  type MessageEntry,
} from '../core/analysis';
import type { ProtoEdit } from '../core/edits';
import type { FieldLabel, ProtoField, ProtoOneof, ProtoPath } from '../core/model';
import { AddRow, CommentField, MapKeySelect, NumberInput, OptionCheckbox, OtherOptions, ReservedSection, TypeInput, UsedBy } from './controls';
import { quote, unquote } from '../core/parse';
import { useDraft, useProto } from './state';

type Cardinality = 'single' | FieldLabel | 'map';

function cardinalityOf(field: ProtoField): Cardinality {
  if (field.kind === 'map') return 'map';
  return field.label?.value ?? 'single';
}

const CARDINALITY_HINTS: Record<Cardinality, string> = {
  single: 'One value',
  optional: 'One value, and you can tell whether it was set',
  repeated: 'A list of values',
  required: 'Must always be set (proto2 only, discouraged)',
  map: 'Key → value pairs',
};

function CardinalitySelect({ field, path, inOneof }: { field: ProtoField; path: ProtoPath; inOneof: boolean }) {
  const { edit, syntax } = useProto();
  const current = cardinalityOf(field);
  const choices: Cardinality[] = inOneof ? ['single'] : ['single', ...(syntax === 'editions' ? [] : ['optional' as const]), 'repeated', ...(syntax === 'proto2' ? ['required' as const] : []), 'map'];
  if (!choices.includes(current)) choices.push(current);

  const change = (next: Cardinality) => {
    const edits: ProtoEdit[] = [];
    if (next === 'map') {
      if (field.label) edits.push({ op: 'setLabel', target: path });
      edits.push({ op: 'setType', target: path, type: `map<string, ${field.type}>` });
    } else {
      if (current === 'map') edits.push({ op: 'setType', target: path, type: field.mapValue! });
      edits.push({ op: 'setLabel', target: path, label: next === 'single' ? undefined : next });
    }
    edit(edits);
  };

  return (
    <select
      className="keyword-select compact"
      aria-label="Cardinality"
      title={CARDINALITY_HINTS[current]}
      value={current}
      disabled={field.kind === 'group'}
      onChange={(e) => change(e.target.value as Cardinality)}
    >
      {choices.map((c) => (
        <option key={c} value={c} title={CARDINALITY_HINTS[c]}>
          {c === 'single' ? '—' : c}
        </option>
      ))}
    </select>
  );
}

function FieldRow({ entry, field, oneofs }: { entry: MessageEntry; field: ProtoField; oneofs: ProtoOneof[] }) {
  const { edit, openAsText, types, navigate } = useProto();
  const [open, setOpen] = useState(false);
  const m = entry.node;
  const path = [...entry.path, `field:${field.name}`];
  const numberUsers = m.fields.filter((f) => f.number === field.number && f !== field);
  const typeRef = field.kind === 'map' ? field.mapValue! : field.type;
  const target = isScalar(typeRef) ? undefined : resolveType(typeRef, entry.fullName, types);

  return (
    <div className={`field-block ${field.oneof ? 'in-oneof' : ''}`}>
      <div className="table-row">
        <NumberInput
          value={field.number}
          min={1}
          ariaLabel="Field number"
          invalid={numberUsers.length ? `Also used by ${numberUsers.map((f) => f.name).join(', ')}` : undefined}
          onChange={(number) => edit({ op: 'setNumber', target: path, number })}
        />
        <CardinalitySelect field={field} path={path} inOneof={!!field.oneof} />
        <span className="field-type">
          {field.kind === 'group' ? (
            <span className="mono muted" title="proto2 group: edit as text">
              group
            </span>
          ) : field.kind === 'map' ? (
            <>
              <MapKeySelect value={field.mapKey!} onChange={(key) => edit({ op: 'setType', target: path, type: `map<${key}, ${field.mapValue}>` })} />
              <TypeInput
                value={field.mapValue!}
                scope={entry.fullName}
                ariaLabel="Map value type"
                className="map-value"
                onCommit={(type, extra) => edit([...extra, { op: 'setType', target: path, type: `map<${field.mapKey}, ${type}>` }])}
              />
            </>
          ) : (
            <TypeInput value={field.type} scope={entry.fullName} onCommit={(type, extra) => edit([...extra, { op: 'setType', target: path, type }])} />
          )}
          <IconButton
            icon="arrow-right"
            label={target?.path ? `Open ${typeRef}` : ''}
            className={target?.path ? '' : 'placeholder-button'}
            tabIndex={target?.path ? undefined : -1}
            aria-hidden={target?.path ? undefined : true}
            onClick={() => target?.path && navigate(target.kind === 'message' ? { kind: 'message', path: target.path } : { kind: 'enum', path: target.path })}
          />
        </span>
        <KeyInput
          value={field.name}
          className="mono"
          ariaLabel="Field name"
          validate={(v) => identifierError(v, namesInMessage(m))}
          onCommit={(name) => edit({ op: 'rename', target: path, name })}
        />
        <span className="row-buttons">
          {field.comment && !open && <span className="codicon codicon-comment muted" title={field.comment} aria-hidden="true" />}
          {field.options.some((o) => o.name === 'deprecated' && o.value === 'true') && <span className="deprecated-badge">deprecated</span>}
          <IconButton icon={open ? 'chevron-up' : 'chevron-down'} label={open ? 'Hide details' : 'Details: description, options, oneof'} onClick={() => setOpen(!open)} />
          <IconButton icon="trash" label="Delete field" onClick={() => edit({ op: 'delete', target: path })} />
        </span>
      </div>
      {open && (
        <div className="field-details">
          <CommentField target={path} value={field.comment} />
          <div className="inline-fields">
            {field.kind !== 'group' && (
              <Field label="Part of oneof">
                <select
                  className="keyword-select"
                  value={field.oneof ?? ''}
                  onChange={(e) => {
                    const edits: ProtoEdit[] = [];
                    if (e.target.value && field.label) edits.push({ op: 'setLabel', target: path });
                    edits.push({ op: 'move', target: path, parent: e.target.value ? [...entry.path, `oneof:${e.target.value}`] : entry.path });
                    edit(edits);
                  }}
                  disabled={field.kind === 'map'}
                >
                  <option value="">(none)</option>
                  {oneofs.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <JsonNameField path={path} field={field} />
            <OptionCheckbox target={path} options={field.options} name="deprecated" label="Deprecated" hint="Generated code marks the field as deprecated" />
          </div>
          <OtherOptions options={field.options} handled={['deprecated', 'json_name']} />
          <button type="button" className="link-button small" onClick={() => openAsText(field.line)}>
            <span className="codicon codicon-go-to-file" aria-hidden="true" /> Line {field.line}
          </button>
        </div>
      )}
    </div>
  );
}

function JsonNameField({ path, field }: { path: ProtoPath; field: ProtoField }) {
  const { edit } = useProto();
  const raw = field.options.find((o) => o.name === 'json_name')?.value;
  const [draft, setDraft] = useDraft(raw && /^["']/.test(raw) ? unquote(raw) : '');
  const camel = field.name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return (
    <Field label="JSON name">
      <input
        className="input mono"
        value={draft}
        placeholder={camel}
        onChange={(e) => {
          setDraft(e.target.value);
          edit({ op: 'setOption', target: path, name: 'json_name', value: e.target.value ? quote(e.target.value) : undefined });
        }}
      />
    </Field>
  );
}

function OneofHeader({ entry, oneof }: { entry: MessageEntry; oneof: ProtoOneof }) {
  const { edit } = useProto();
  const path = [...entry.path, `oneof:${oneof.name}`];
  return (
    <div className="oneof-header" title="Only one of these fields can be set at a time">
      <span className="kind-badge badge-oneof">ONEOF</span>
      <KeyInput value={oneof.name} className="mono" ariaLabel="Oneof name" validate={(v) => identifierError(v, namesInMessage(entry.node))} onCommit={(name) => edit({ op: 'rename', target: path, name })} />
      <span className="muted small">only one of these fields is set</span>
      <span className="row-buttons">
        <IconButton
          icon="add"
          label="Add a field to this oneof"
          onClick={() => {
            const number = nextFieldNumber(entry.node);
            const name = uniqueFieldName(entry, `${oneof.name}_option`);
            edit({ op: 'add', parent: path, element: { kind: 'field', name, type: 'string', number } });
          }}
        />
        <IconButton icon="trash" label="Delete the oneof and its fields" onClick={() => edit({ op: 'delete', target: path })} />
      </span>
    </div>
  );
}

function uniqueFieldName(entry: MessageEntry, base: string): string {
  const taken = namesInMessage(entry.node);
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}_${i}`;
  return name;
}

function FieldsSection({ entry }: { entry: MessageEntry }) {
  const { edit } = useProto();
  const m = entry.node;
  const [newType, setNewType] = useState('string');
  // Regular fields and oneof blocks, in file order.
  const items: { start: number; field?: ProtoField; oneof?: ProtoOneof }[] = [
    ...m.fields.filter((f) => !f.oneof).map((f) => ({ start: f.span.start, field: f })),
    ...m.oneofs.map((o) => ({ start: o.span.start, oneof: o })),
  ].sort((a, b) => a.start - b.start);

  return (
    <Section title="Fields" icon="symbol-field" count={m.fields.length}>
      {m.fields.length > 0 && (
        <div className="table fields-table">
          <div className="table-head">
            <span title="Field number: identifies the field on the wire, never change it once in use">#</span>
            <span>Cardinality</span>
            <span>Type</span>
            <span>Name</span>
            <span />
          </div>
          {items.map((item) =>
            item.field ? (
              <FieldRow key={`f:${item.field.name}`} entry={entry} field={item.field} oneofs={m.oneofs} />
            ) : (
              <Fragment key={`o:${item.oneof!.name}`}>
                <OneofHeader entry={entry} oneof={item.oneof!} />
                {m.fields
                  .filter((f) => f.oneof === item.oneof!.name)
                  .map((f) => (
                    <FieldRow key={`f:${f.name}`} entry={entry} field={f} oneofs={m.oneofs} />
                  ))}
              </Fragment>
            ),
          )}
        </div>
      )}
      {m.fields.length === 0 && <p className="muted">No fields yet.</p>}
      <AddRow
        label="Add field"
        placeholder="new field name, e.g. created_at"
        validate={(v) => identifierError(v, namesInMessage(m))}
        onAdd={(name) => edit({ op: 'add', parent: entry.path, element: { kind: 'field', name, type: newType, number: nextFieldNumber(m) } })}
      >
        <TypeInput value={newType} scope={entry.fullName} ariaLabel="New field type" onCommit={(type, extra) => {
          setNewType(type);
          if (extra.length) edit(extra);
        }} />
        <span className="muted small">#{nextFieldNumber(m)}</span>
      </AddRow>
      <div className="row-buttons">
        <button
          type="button"
          className="link-button"
          onClick={() => {
            const name = uniqueFieldName(entry, 'choice');
            edit({ op: 'add', parent: entry.path, element: { kind: 'oneof', name, field: { name: uniqueFieldName(entry, `${name}_option`), type: 'string', number: nextFieldNumber(m) } } });
          }}
        >
          <span className="codicon codicon-add" aria-hidden="true" /> Add a oneof
        </button>
      </div>
    </Section>
  );
}

function NestedTypes({ entry }: { entry: MessageEntry }) {
  const { edit, navigate } = useProto();
  const m = entry.node;
  const taken = namesInMessage(m);
  return (
    <Section title="Nested types" icon="symbol-namespace" count={m.messages.length + m.enums.length}>
      <p className="muted small">Types only meaningful inside {m.name}; other messages refer to them as {m.name}.Name.</p>
      {m.messages.map((child) => (
        <button key={`m:${child.name}`} type="button" className="operation-link" onClick={() => navigate({ kind: 'message', path: [...entry.path, `message:${child.name}`] })}>
          <span className="codicon codicon-symbol-structure" aria-hidden="true" /> <span className="mono">{child.name}</span>
          <span className="muted small">{child.fields.length} fields</span>
        </button>
      ))}
      {m.enums.map((child) => (
        <button key={`e:${child.name}`} type="button" className="operation-link" onClick={() => navigate({ kind: 'enum', path: [...entry.path, `enum:${child.name}`] })}>
          <span className="codicon codicon-symbol-enum" aria-hidden="true" /> <span className="mono">{child.name}</span>
          <span className="muted small">{child.values.length} values</span>
        </button>
      ))}
      <div className="inline-fields">
        <AddRow
          label="Add nested message"
          placeholder="NestedMessage"
          validate={(v) => identifierError(v, taken)}
          onAdd={(name) => {
            edit({ op: 'add', parent: entry.path, element: { kind: 'message', name } });
            navigate({ kind: 'message', path: [...entry.path, `message:${name}`] });
          }}
        />
        <AddRow
          label="Add nested enum"
          placeholder="NestedEnum"
          validate={(v) => identifierError(v, taken)}
          onAdd={(name) => {
            edit({ op: 'add', parent: entry.path, element: { kind: 'enum', name, values: [{ name: `${toUpperSnakeCase(name)}_UNSPECIFIED`, number: 0 }] } });
            navigate({ kind: 'enum', path: [...entry.path, `enum:${name}`] });
          }}
        />
      </div>
    </Section>
  );
}

export function MessagePage({ path }: { path: ProtoPath }) {
  const { file, edit, navigate, imports } = useProto();
  const entry = findMessage(file, path);
  if (!entry) return null;
  const m = entry.node;
  const parentPath = path.slice(0, -1);
  const siblings = parentPath.length ? namesInMessage(findMessage(file, parentPath)!.node) : topLevelNames(file);

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-symbol-structure" aria-hidden="true" />
        <KeyInput
          value={m.name}
          className="title-input mono"
          ariaLabel="Message name"
          validate={(v) => identifierError(v, siblings)}
          onCommit={(name) => {
            edit(renameTypeEdits(file, path, name, imports));
            navigate({ kind: 'message', path: [...parentPath, `message:${name}`] });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete message"
          onClick={() => {
            edit({ op: 'delete', target: path });
            navigate(parentPath.length ? { kind: 'message', path: parentPath } : { kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">
        <span className="mono">{entry.fullName}</span>
        {parentPath.length > 0 && (
          <>
            {' · nested in '}
            <button type="button" className="link-button" onClick={() => navigate({ kind: 'message', path: parentPath })}>
              {findMessage(file, parentPath)?.node.name}
            </button>
          </>
        )}
        {' · renaming updates the references in this file'}
      </p>

      <Section title="Message" icon="symbol-structure">
        <CommentField target={path} value={m.comment} />
        <div className="inline-fields">
          <OptionCheckbox target={path} options={m.options} name="deprecated" label="Deprecated" />
        </div>
        <OtherOptions options={m.options} handled={['deprecated']} />
      </Section>

      <FieldsSection entry={entry} />
      <NestedTypes entry={entry} />
      <ReservedSection target={path} reserved={m.reserved} what="field" />
      {m.extensions.length > 0 && (
        <p className="notice">
          <span className="codicon codicon-info" /> Extension ranges ({m.extensions.join('; ')}) are kept but edited as text.
        </p>
      )}
      <UsedBy fullName={entry.fullName} />
    </div>
  );
}
