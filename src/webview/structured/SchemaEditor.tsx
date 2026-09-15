import { useState } from 'react';
import { getIn, isObject, type JsonObject, type SpecEdit, type SpecPath } from '../../shared/structured/edits';
import { FORMATS, isNullable, schemaForKind, schemaKind, schemaNames, schemaRef, schemaRefName, SCHEMA_KINDS } from '../../shared/structured/jsonSchema';
import { IconButton } from '../components/IconButton';
import { ChipsField, KeyInput } from './fields';
import { useField, useSpecEditor } from './state';

/** Select covering primitive types, object, array and a reference to each component schema. */
export function TypeSelect({ path, compact }: { path: SpecPath; compact?: boolean }) {
  const { spec, edit } = useSpecEditor();
  const schema = getIn(spec, path);
  const kind = schemaKind(schema);
  const refName = schemaRefName(isObject(schema) ? schema.$ref : undefined);
  const names = schemaNames(spec);
  const value = kind === 'ref' ? `ref:${refName ?? ''}` : kind;

  const onChange = (next: string) => {
    if (next.startsWith('ref:')) {
      edit({ op: 'set', path, value: { $ref: schemaRef(next.slice(4)) } });
    } else {
      edit({ op: 'set', path, value: schemaForKind(next as (typeof SCHEMA_KINDS)[number], schema, spec) });
    }
  };

  return (
    <select className={`keyword-select type-select ${compact ? 'compact' : ''}`} aria-label="Type" value={value} onChange={(e) => onChange(e.target.value)}>
      {kind === 'any' && <option value="any">any</option>}
      {kind === 'advanced' && <option value="advanced">advanced (allOf/oneOf…)</option>}
      {SCHEMA_KINDS.filter((k) => k !== 'ref').map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
      <optgroup label="Reference">
        {kind === 'ref' && refName !== undefined && !names.includes(refName) && <option value={value}>→ {refName} (missing)</option>}
        {kind === 'ref' && refName === undefined && <option value={value}>→ external reference</option>}
        {names.map((name) => (
          <option key={name} value={`ref:${name}`}>
            → {name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Edits a schema (object properties, array items, formats, enums), recursively. */
export function SchemaEditor({ path, depth = 0, hideType }: { path: SpecPath; depth?: number; hideType?: boolean }) {
  const { spec, schemaOptions, openAsText } = useSpecEditor();
  const schema = getIn(spec, path);
  const kind = schemaKind(schema);

  if (kind === 'ref') {
    const name = schemaRefName(isObject(schema) ? schema.$ref : undefined);
    return (
      <div className="schema">
        <div className="schema-line">
          <TypeSelect path={path} />
          {name !== undefined && schemaNames(spec).includes(name) && (
            <button type="button" className="link-button" onClick={() => schemaOptions.open(name)}>
              Open {name} <span className="codicon codicon-arrow-right" />
            </button>
          )}
          {name === undefined && <code className="muted">{String((schema as JsonObject).$ref)}</code>}
        </div>
      </div>
    );
  }

  if (kind === 'advanced') {
    const keywords = ['allOf', 'oneOf', 'anyOf', 'not'].filter((k) => isObject(schema) && k in schema);
    return (
      <div className="schema">
        <p className="notice">
          <span className="codicon codicon-info" /> This schema uses <code>{keywords.join(', ')}</code>, which the form doesn't edit.
          <button type="button" className="link-button" onClick={openAsText}>
            Edit in text
          </button>
          or replace it: <TypeSelect path={path} compact />
        </p>
      </div>
    );
  }

  return (
    <div className="schema">
      <div className="schema-line">
        {!hideType && <TypeSelect path={path} />}
        <SchemaDetails path={path} />
      </div>
      {depth === 0 && <DescriptionInput path={[...path, 'description']} />}
      {kind === 'string' && <ChipsField path={[...path, 'enum']} label="Allowed values (enum)" placeholder="Type a value and press Enter" />}
      {kind === 'object' && <PropertiesTable path={path} depth={depth} />}
      {kind === 'array' && (
        <div className="nested">
          <span className="nested-label">Items</span>
          <SchemaEditor path={[...path, 'items']} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

function DescriptionInput({ path }: { path: SpecPath }) {
  const [value, set] = useField<string>(path);
  return (
    <input
      className="input schema-description"
      placeholder="Description"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => set(e.target.value)}
    />
  );
}

/** Format, nullable: the small modifiers shown next to the type. */
function SchemaDetails({ path }: { path: SpecPath }) {
  const { spec, schemaOptions, edit } = useSpecEditor();
  const schema = getIn(spec, path);
  const kind = schemaKind(schema);
  const [format, setFormat] = useField<string>([...path, 'format']);
  if (!isObject(schema)) return null;

  const nullable = isNullable(schema);
  const toggleNullable = (on: boolean) => {
    if (!schemaOptions.nullableKeyword) {
      const types = (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []).filter((t) => t !== 'null');
      const next = on ? [...types, 'null'] : types;
      edit({ op: 'set', path: [...path, 'type'], value: next.length === 1 ? next[0] : next });
    } else {
      edit(on ? { op: 'set', path: [...path, 'nullable'], value: true } : { op: 'delete', path: [...path, 'nullable'] });
    }
  };

  const formats = FORMATS[kind];
  const listId = `formats-${kind}`;
  return (
    <>
      {formats && (
        <>
          <input
            className="input input-small format-input mono"
            list={listId}
            placeholder="format"
            aria-label="Format"
            value={typeof format === 'string' ? format : ''}
            onChange={(e) => setFormat(e.target.value)}
          />
          <datalist id={listId}>
            {formats.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      )}
      <label className="checkbox small">
        <input type="checkbox" checked={nullable} onChange={(e) => toggleNullable(e.target.checked)} /> nullable
      </label>
    </>
  );
}

function PropertiesTable({ path, depth }: { path: SpecPath; depth: number }) {
  const { spec, edit } = useSpecEditor();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const schema = getIn(spec, path) as JsonObject;
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const names = Object.keys(properties);

  const setRequired = (next: string[]) =>
    edit(next.length ? { op: 'set', path: [...path, 'required'], value: next } : { op: 'delete', path: [...path, 'required'] });

  const rename = (from: string, to: string) => {
    const edits: SpecEdit[] = [{ op: 'renameKey', path: [...path, 'properties', from], newKey: to }];
    const index = required.indexOf(from);
    if (index >= 0) edits.push({ op: 'set', path: [...path, 'required', index], value: to });
    edit(edits);
  };

  const remove = (name: string) => {
    const edits: SpecEdit[] = [{ op: 'delete', path: [...path, 'properties', name] }];
    if (required.includes(name)) {
      const next = required.filter((r) => r !== name);
      edits.push(next.length ? { op: 'set', path: [...path, 'required'], value: next } : { op: 'delete', path: [...path, 'required'] });
    }
    edit(edits);
  };

  const add = () => {
    let name = 'property';
    for (let i = 2; names.includes(name); i++) name = `property${i}`;
    edit({ op: 'set', path: [...path, 'properties', name], value: { type: 'string' } });
  };

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <div className="properties">
      {names.length > 0 && (
        <div className="table properties-table" role="table">
          <div className="table-head" role="row">
            <span />
            <span>Property</span>
            <span>Type</span>
            <span title="Required">Req.</span>
            <span>Description</span>
            <span />
          </div>
          {names.map((name) => {
            const propertyPath = [...path, 'properties', name];
            const kind = schemaKind(properties[name]);
            const expandable = kind === 'object' || kind === 'array' || kind === 'string' || kind === 'integer' || kind === 'number';
            const isOpen = expanded.has(name);
            return (
              <div key={name} className="table-group">
                <div className="table-row" role="row">
                  <span>
                    {expandable && (
                      <IconButton icon={isOpen ? 'chevron-down' : 'chevron-right'} label={isOpen ? 'Hide details' : 'Show details'} onClick={() => toggle(name)} />
                    )}
                  </span>
                  <KeyInput
                    value={name}
                    className="mono"
                    ariaLabel="Property name"
                    validate={(next) => (!next.trim() ? 'Name required' : names.includes(next) ? 'Already exists' : undefined)}
                    onCommit={(next) => rename(name, next)}
                  />
                  <TypeSelect path={propertyPath} compact />
                  <input
                    type="checkbox"
                    aria-label="Required"
                    checked={required.includes(name)}
                    onChange={(e) => setRequired(e.target.checked ? [...required, name] : required.filter((r) => r !== name))}
                  />
                  <DescriptionInput path={[...propertyPath, 'description']} />
                  <IconButton icon="trash" label="Delete property" onClick={() => remove(name)} />
                </div>
                {isOpen && (
                  <div className="nested" style={{ marginLeft: 28 }}>
                    <SchemaEditor path={propertyPath} depth={depth + 1} hideType />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <IconButton icon="add" label="Add property" showLabel onClick={add} />
    </div>
  );
}
