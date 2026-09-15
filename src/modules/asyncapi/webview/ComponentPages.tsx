import { getIn, isObject, type SpecPath } from '../../../shared/structured/edits';
import { renameSchemaEdits, schemaNames, schemaRef } from '../../../shared/structured/jsonSchema';
import { IconButton } from '../../../webview/components/IconButton';
import { KeyInput, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import { componentNameError } from '../../../webview/structured/NavParts';
import { SchemaEditor } from '../../../webview/structured/SchemaEditor';
import { CONTENT_TYPES, messageNames, messageRef, renameMessageEdits, usagesOf } from '../core/asyncapi';
import { useAsync } from './state';

/** Formats whose payload is a JSON Schema the form can edit. */
const JSON_SCHEMA_FORMAT = /^application\/(schema\+json|vnd\.aai\.asyncapi(\+json|\+yaml)?)/;

/** Fields of a message (component or inline): identity, payload and headers. */
export function MessageFields({ path }: { path: SpecPath }) {
  const { spec, edit } = useAsync();
  const message = getIn(spec, path);
  const payload = isObject(message) ? message.payload : undefined;
  const format = isObject(message) && typeof message.schemaFormat === 'string' ? message.schemaFormat : isObject(payload) && typeof payload.schemaFormat === 'string' ? payload.schemaFormat : undefined;
  const editablePayload = !format || JSON_SCHEMA_FORMAT.test(format);

  return (
    <>
      <Section title="Message" icon="mail">
        <div className="form-grid">
          <TextField path={[...path, 'name']} label="Name" mono placeholder="e.g. orderShipped" hint="Machine-friendly name" />
          <TextField path={[...path, 'title']} label="Title" placeholder="e.g. Order shipped" />
          <TextField path={[...path, 'summary']} label="Summary" />
          <TextField path={[...path, 'contentType']} label="Content type" mono list="message-content-types" placeholder="(default content type)" />
          <TextAreaField path={[...path, 'description']} label="Description" />
        </div>
        <datalist id="message-content-types">
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Section>

      <Section
        title="Payload"
        icon="json"
        actions={payload !== undefined && editablePayload && <IconButton icon="trash" label="Remove payload" onClick={() => edit({ op: 'delete', path: [...path, 'payload'] })} />}
      >
        {!editablePayload ? (
          <p className="notice">
            <span className="codicon codicon-info" /> The payload uses <code>{format}</code>, which the form doesn't edit.
          </p>
        ) : payload === undefined ? (
          <button type="button" className="link-button" onClick={() => edit({ op: 'set', path: [...path, 'payload'], value: { type: 'object', properties: {} } })}>
            Add a payload
          </button>
        ) : (
          <SchemaEditor path={[...path, 'payload']} />
        )}
      </Section>

      <Section
        title="Headers"
        icon="list-unordered"
        actions={isObject(message) && message.headers !== undefined && <IconButton icon="trash" label="Remove headers" onClick={() => edit({ op: 'delete', path: [...path, 'headers'] })} />}
      >
        {isObject(message) && message.headers !== undefined ? (
          <SchemaEditor path={[...path, 'headers']} />
        ) : (
          <button type="button" className="link-button" onClick={() => edit({ op: 'set', path: [...path, 'headers'], value: { type: 'object', properties: {} } })}>
            Add headers
          </button>
        )}
      </Section>
    </>
  );
}

function UsedBy({ target, self }: { target: string; self: { kind: 'message' | 'schema'; name: string } }) {
  const { spec, navigate } = useAsync();
  const usages = usagesOf(spec, target).filter((u) => JSON.stringify(u.location) !== JSON.stringify(self));
  return (
    <Section title="Used by" icon="references" count={usages.length}>
      {usages.length === 0 && <p className="muted">Not referenced anywhere yet.</p>}
      {usages.map((u, i) => (
        <button key={i} type="button" className="operation-link" onClick={() => navigate(u.location)}>
          <span className="codicon codicon-arrow-right" aria-hidden="true" /> {u.label}
        </button>
      ))}
    </Section>
  );
}

export function MessagePage({ name }: { name: string }) {
  const { spec, edit, navigate } = useAsync();
  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-mail" aria-hidden="true" />
        <KeyInput
          value={name}
          className="title-input mono"
          ariaLabel="Message component name"
          validate={(v) => componentNameError(v, messageNames(spec))}
          onCommit={(next) => {
            edit(renameMessageEdits(spec, name, next));
            navigate({ kind: 'message', name: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete message"
          onClick={() => {
            edit({ op: 'delete', path: ['components', 'messages', name] });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">Reusable message. Renaming updates every reference to it.</p>
      <MessageFields path={['components', 'messages', name]} />
      <UsedBy target={messageRef(name)} self={{ kind: 'message', name }} />
    </div>
  );
}

export function SchemaPage({ name }: { name: string }) {
  const { spec, edit, navigate } = useAsync();
  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-symbol-structure" aria-hidden="true" />
        <KeyInput
          value={name}
          className="title-input mono"
          ariaLabel="Schema name"
          validate={(v) => componentNameError(v, schemaNames(spec))}
          onCommit={(next) => {
            edit(renameSchemaEdits(spec, name, next));
            navigate({ kind: 'schema', name: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete schema"
          onClick={() => {
            edit({ op: 'delete', path: ['components', 'schemas', name] });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">Renaming updates every reference to this schema.</p>
      <Section title="Definition" icon="symbol-structure">
        <SchemaEditor path={['components', 'schemas', name]} />
      </Section>
      <UsedBy target={schemaRef(name)} self={{ kind: 'schema', name }} />
    </div>
  );
}
