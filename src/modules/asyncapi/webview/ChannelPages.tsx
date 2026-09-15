import { getIn, isObject, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import { renameEntryEdits } from '../../../shared/structured/jsonSchema';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { InlineInput, KeyInput, KindBadge, Section, TextAreaField, TextField, Field } from '../../../webview/structured/fields';
import {
  ACTION_HINTS,
  addressParameters,
  analyzeAsyncApi,
  channelAddress,
  channelIds,
  channelMessageRef,
  channelMessages,
  listOperations,
  messageNames,
  messageRef,
  newOperation,
  operationIds,
  renameChannelEdits,
  renameOperationEdits,
  V2_ACTIONS,
  V3_ACTIONS,
  v2OperationMessage,
  type V2Action,
  type V3Action,
} from '../core/asyncapi';
import { MessageFields } from './ComponentPages';
import { idError, pascal, sameLocation, uniqueName, useAsync, useField } from './state';

/* Channel ------------------------------------------------------------------ */

export function ChannelPage({ id }: { id: string }) {
  const { spec, major, edit, navigate } = useAsync();
  const channels = channelIds(spec);
  const base = ['channels', id];
  const issues = analyzeAsyncApi(spec).filter((i) => sameLocation(i.location, { kind: 'channel', id }));

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-broadcast" aria-hidden="true" />
        <KeyInput
          value={id}
          className="mono title-input"
          ariaLabel={major === 2 ? 'Channel address' : 'Channel id'}
          validate={(v) => (major === 2 ? (!v.trim() ? 'Address required' : channels.includes(v) ? 'Already exists' : undefined) : idError(v, channels))}
          onCommit={(next) => {
            edit(renameChannelEdits(spec, id, next));
            navigate({ kind: 'channel', id: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete channel"
          onClick={() => {
            edit({ op: 'delete', path: base });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">
        {major === 2 ? 'The channel address. Use {name} for parameters, e.g. orders/{orderId}.' : 'Channel id used by operations. Renaming updates every reference.'} Press Enter to rename.
      </p>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Channel" icon="note">
        <div className="form-grid">
          {major === 3 && <TextField path={[...base, 'address']} label="Address" mono placeholder="orders.{region}.created" hint="Use {name} for parameters. Leave empty for a dynamic address." />}
          {major === 3 && <TextField path={[...base, 'title']} label="Title" />}
          {major === 3 && <TextField path={[...base, 'summary']} label="Summary" />}
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>

      <Section title="Parameters" icon="symbol-parameter">
        <ParametersEditor path={[...base, 'parameters']} address={channelAddress(spec, id)} withSchema={major === 2} />
      </Section>

      {major === 3 ? <ChannelMessages id={id} /> : <V2ChannelOperations channel={id} />}
      {major === 3 && <ChannelOperations id={id} />}
    </div>
  );
}

function ParametersEditor({ path, address, withSchema }: { path: SpecPath; address?: string; withSchema: boolean }) {
  const { spec, edit } = useAsync();
  const parameters = getIn(spec, path);
  const names = isObject(parameters) ? Object.keys(parameters) : [];
  const used = addressParameters(address);
  const missing = used.filter((p) => !names.includes(p));
  const declare = (name: string): SpecEdit => ({ op: 'set', path: [...path, name], value: withSchema ? { schema: { type: 'string' } } : {} });

  return (
    <div className="parameters">
      {missing.length > 0 && (
        <div className="notice notice-warning">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            {missing.map((m) => `{${m}}`).join(', ')} {missing.length > 1 ? 'are' : 'is'} used in the address but not declared.
          </span>
          <button type="button" className="btn btn-primary btn-labelled" onClick={() => edit(missing.map(declare))}>
            Declare {missing.length > 1 ? 'them' : 'it'}
          </button>
        </div>
      )}
      {names.length === 0 && missing.length === 0 && <p className="muted">No parameters. Use {'{name}'} in the address to add one.</p>}
      {names.map((name) => (
        <div key={name} className="list-row">
          <KeyInput
            value={name}
            className="mono"
            ariaLabel="Parameter name"
            validate={(v) => (!v.trim() ? 'Name required' : names.includes(v) ? 'Already exists' : undefined)}
            onCommit={(v) => edit({ op: 'renameKey', path: [...path, name], newKey: v })}
          />
          {!used.includes(name) && <span className="codicon codicon-warning warning-text" title="Not used in the address" />}
          <InlineInput path={[...path, name, 'description']} placeholder="Description" grow />
          <IconButton icon="trash" label="Remove parameter" onClick={() => edit({ op: 'delete', path: [...path, name] })} />
        </div>
      ))}
    </div>
  );
}

/** 3.0: messages that can travel on the channel. */
function ChannelMessages({ id }: { id: string }) {
  const { spec, edit, navigate } = useAsync();
  const path = ['channels', id, 'messages'];
  const messages = channelMessages(spec, id);
  const names = messages.map((m) => m.name);
  const components = messageNames(spec);

  const add = (value: string) => {
    if (value === '__new__') {
      const component = uniqueName(`${pascal(id)}Message`, components);
      edit([
        { op: 'set', path: ['components', 'messages', component], value: { payload: { type: 'object', properties: {} } } },
        { op: 'set', path: [...path, uniqueName(component.charAt(0).toLowerCase() + component.slice(1), names)], value: { $ref: messageRef(component) } },
      ]);
      navigate({ kind: 'message', name: component });
      return;
    }
    edit({ op: 'set', path: [...path, uniqueName(value.charAt(0).toLowerCase() + value.slice(1), names)], value: { $ref: messageRef(value) } });
  };

  return (
    <Section title="Messages" icon="mail" count={messages.length}>
      {messages.length === 0 && <p className="muted">No message yet. Operations on this channel can only use messages listed here.</p>}
      {messages.map((m) => (
        <div key={m.name} className="list-row">
          <KeyInput
            value={m.name}
            className="mono"
            ariaLabel="Message key"
            validate={(v) => idError(v, names.filter((n) => n !== m.name))}
            onCommit={(v) => edit(renameEntryEdits(spec, path, m.name, v))}
          />
          <span className="codicon codicon-arrow-right muted" aria-hidden="true" />
          {m.inline ? (
            <span className="muted grow">inline message (edit in text)</span>
          ) : (
            <select
              className="keyword-select grow"
              aria-label="Component message"
              value={m.component ?? ''}
              onChange={(e) => edit({ op: 'set', path: [...path, m.name, '$ref'], value: messageRef(e.target.value) })}
            >
              {m.component === undefined && <option value="">{String(getIn(spec, [...path, m.name, '$ref']))}</option>}
              {components.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {m.component && components.includes(m.component) && (
            <IconButton icon="go-to-file" label={`Open ${m.component}`} onClick={() => navigate({ kind: 'message', name: m.component! })} />
          )}
          <IconButton icon="trash" label="Remove from channel" onClick={() => edit({ op: 'delete', path: [...path, m.name] })} />
        </div>
      ))}
      <select className="keyword-select add-media" aria-label="Add message" value="" onChange={(e) => e.target.value && add(e.target.value)}>
        <option value="">+ Add message…</option>
        {components.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__new__">New message…</option>
      </select>
    </Section>
  );
}

/** 3.0: operations using the channel. */
function ChannelOperations({ id }: { id: string }) {
  const { spec, edit, navigate } = useAsync();
  const operations = listOperations(spec).filter((op) => op.channel === id);
  const add = (action: V3Action) => {
    const opId = uniqueName(`${action}${pascal(id)}`, operationIds(spec));
    edit({ op: 'set', path: ['operations', opId], value: newOperation(spec, action, id) });
    navigate({ kind: 'operation', id: opId });
  };
  return (
    <Section title="Operations" icon="arrow-swap" count={operations.length}>
      {operations.map((op) => (
        <button key={op.label} type="button" className="operation-link" onClick={() => navigate(op.location)}>
          <KindBadge value={op.action || 'unknown'} />
          <span>{op.label}</span>
          <span className="codicon codicon-arrow-right" aria-hidden="true" />
        </button>
      ))}
      <div className="add-methods">
        {V3_ACTIONS.map((action) => (
          <button key={action} type="button" className={`btn btn-secondary btn-labelled kind-add badge-${action}`} title={ACTION_HINTS[action]} onClick={() => add(action)}>
            <span className="codicon codicon-add" aria-hidden="true" /> {action}
          </button>
        ))}
      </div>
    </Section>
  );
}

/** 2.x: the publish / subscribe operations of the channel. */
function V2ChannelOperations({ channel }: { channel: string }) {
  const { spec, edit, navigate } = useAsync();
  const components = messageNames(spec);
  return (
    <Section title="Operations" icon="arrow-swap">
      {V2_ACTIONS.map((action) => {
        const operation = getIn(spec, ['channels', channel, action]);
        if (isObject(operation)) {
          const label = String(operation.summary || operation.operationId || '(no summary)');
          return (
            <button key={action} type="button" className="operation-link" title={ACTION_HINTS[action]} onClick={() => navigate({ kind: 'channelOperation', channel, action })}>
              <KindBadge value={action} />
              <span>{label}</span>
              <span className="codicon codicon-arrow-right" aria-hidden="true" />
            </button>
          );
        }
        return (
          <div key={action} className="list-row">
            <button
              type="button"
              className={`btn btn-secondary btn-labelled kind-add badge-${action}`}
              onClick={() => {
                edit({
                  op: 'set',
                  path: ['channels', channel, action],
                  value: { operationId: `${action}${pascal(channel)}`, ...(components[0] ? { message: { $ref: messageRef(components[0]) } } : {}) },
                });
                navigate({ kind: 'channelOperation', channel, action });
              }}
            >
              <span className="codicon codicon-add" aria-hidden="true" /> {action}
            </button>
            <span className="muted small">{ACTION_HINTS[action]}</span>
          </div>
        );
      })}
    </Section>
  );
}

/* Operation (3.0) ---------------------------------------------------------- */

export function OperationPage({ id }: { id: string }) {
  const { spec, edit, navigate } = useAsync();
  const base = ['operations', id];
  const operation = getIn(spec, base) as JsonObject;
  const action = String(operation.action ?? '');
  const op = listOperations(spec).find((o) => o.location.kind === 'operation' && o.location.id === id);
  const channel = op?.channel;
  const channels = channelIds(spec);
  const selected = new Set((Array.isArray(operation.messages) ? operation.messages : []).map((m) => (isObject(m) ? String(m.$ref) : '')));
  const available = channel ? channelMessages(spec, channel) : [];
  const issues = analyzeAsyncApi(spec).filter((i) => sameLocation(i.location, { kind: 'operation', id }));

  const toggleMessage = (ref: string, on: boolean) => {
    const refs = on ? [...selected, ref] : [...selected].filter((r) => r !== ref);
    edit(refs.length ? { op: 'set', path: [...base, 'messages'], value: refs.map(($ref) => ({ $ref })) } : { op: 'delete', path: [...base, 'messages'] });
  };

  return (
    <div className="page">
      <div className="page-title-row">
        <select
          className={`keyword-select kind-select badge-${action}`}
          aria-label="Action"
          value={action}
          onChange={(e) => edit({ op: 'set', path: [...base, 'action'], value: e.target.value })}
        >
          {!(V3_ACTIONS as readonly string[]).includes(action) && <option value={action}>{action || '?'}</option>}
          {V3_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.toUpperCase()}
            </option>
          ))}
        </select>
        <KeyInput
          value={id}
          className="mono title-input"
          ariaLabel="Operation id"
          validate={(v) => idError(v, operationIds(spec))}
          onCommit={(next) => {
            edit(renameOperationEdits(spec, id, next));
            navigate({ kind: 'operation', id: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete operation"
          onClick={() => {
            edit({ op: 'delete', path: base });
            navigate(channel ? { kind: 'channel', id: channel } : { kind: 'general' });
          }}
        />
      </div>
      {(V3_ACTIONS as readonly string[]).includes(action) && <p className="muted small">{ACTION_HINTS[action as V3Action]}</p>}
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Operation" icon="note">
        <div className="form-grid">
          <Field label="Channel" required>
            <span className="field-row">
              <select
                className="keyword-select grow"
                value={channel ?? ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  // The messages belong to the channel: start from the new channel's ones.
                  const { messages: _old, ...rest } = operation;
                  edit({ op: 'set', path: base, value: { ...rest, ...newOperation(spec, action as V3Action, e.target.value), action } });
                }}
              >
                {!channel && <option value="">Choose a channel…</option>}
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                    {channelAddress(spec, c) && channelAddress(spec, c) !== c ? ` (${channelAddress(spec, c)})` : ''}
                  </option>
                ))}
              </select>
              {channel && <IconButton icon="go-to-file" label="Open channel" onClick={() => navigate({ kind: 'channel', id: channel })} />}
            </span>
          </Field>
          <TextField path={[...base, 'title']} label="Title" />
          <TextField path={[...base, 'summary']} label="Summary" />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>

      <Section title="Messages" icon="mail">
        {!channel && <p className="muted">Choose a channel first.</p>}
        {channel && available.length === 0 && (
          <p className="muted">
            Channel {channel} has no message.{' '}
            <button type="button" className="link-button" onClick={() => navigate({ kind: 'channel', id: channel })}>
              Add messages to the channel
            </button>
          </p>
        )}
        {channel &&
          available.map((m) => {
            const ref = channelMessageRef(channel, m.name);
            return (
              <label key={m.name} className="checkbox list-row">
                <input type="checkbox" checked={selected.has(ref)} onChange={(e) => toggleMessage(ref, e.target.checked)} />
                <span className="mono">{m.name}</span>
                {m.component && <span className="muted">→ {m.component}</span>}
              </label>
            );
          })}
        {channel && available.length > 0 && selected.size === 0 && <p className="muted small">No message selected: every message of the channel applies.</p>}
      </Section>

    </div>
  );
}

/* Operation (2.x) ---------------------------------------------------------- */

export function ChannelOperationPage({ channel, action }: { channel: string; action: V2Action }) {
  const { spec, edit, navigate } = useAsync();
  const base = ['channels', channel, action];
  const operation = getIn(spec, base);
  const other: V2Action = action === 'publish' ? 'subscribe' : 'publish';
  const otherExists = isObject(getIn(spec, ['channels', channel, other]));
  const message = v2OperationMessage(operation);
  const components = messageNames(spec);
  const [operationId, setOperationId] = useField<string>([...base, 'operationId']);
  const issues = analyzeAsyncApi(spec).filter((i) => sameLocation(i.location, { kind: 'channelOperation', channel, action }));

  const setMessage = (value: string) => {
    if (value === '__inline__') edit({ op: 'set', path: [...base, 'message'], value: { payload: { type: 'object', properties: {} } } });
    else if (value === '__none__') edit({ op: 'delete', path: [...base, 'message'] });
    else edit({ op: 'set', path: [...base, 'message'], value: { $ref: messageRef(value) } });
  };

  return (
    <div className="page">
      <div className="page-title-row">
        <select
          className={`keyword-select kind-select badge-${action}`}
          aria-label="Operation kind"
          value={action}
          onChange={(e) => {
            edit({ op: 'renameKey', path: base, newKey: e.target.value });
            navigate({ kind: 'channelOperation', channel, action: e.target.value as V2Action });
          }}
        >
          {V2_ACTIONS.filter((a) => a === action || !otherExists).map((a) => (
            <option key={a} value={a}>
              {a.toUpperCase()}
            </option>
          ))}
        </select>
        <button type="button" className="link-button mono path-link" onClick={() => navigate({ kind: 'channel', id: channel })}>
          {channel}
        </button>
        <span className="grow" />
        <IconButton
          icon="trash"
          label="Delete operation"
          onClick={() => {
            edit({ op: 'delete', path: base });
            navigate({ kind: 'channel', id: channel });
          }}
        />
      </div>
      <p className="muted small">{ACTION_HINTS[action]}</p>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Operation" icon="note">
        <div className="form-grid">
          <Field label="Operation ID" hint="Unique name used by code generators">
            <span className="field-row">
              <input className="input mono grow" value={typeof operationId === 'string' ? operationId : ''} onChange={(e) => setOperationId(e.target.value)} />
              <IconButton icon="sparkle" label="Generate from the channel" onClick={() => setOperationId(`${action}${pascal(channel)}`)} />
            </span>
          </Field>
          <TextField path={[...base, 'summary']} label="Summary" />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>

      <Section title="Message" icon="mail">
        {message.kind === 'oneOf' ? (
          <p className="notice">
            <span className="codicon codicon-info" /> This operation accepts one of {message.count} messages (oneOf), which the form doesn't edit.
          </p>
        ) : (
          <div className="field-row">
            <select
              className="keyword-select grow"
              aria-label="Message"
              value={message.kind === 'ref' ? (message.name ?? message.ref) : message.kind === 'inline' ? '__inline__' : '__none__'}
              onChange={(e) => setMessage(e.target.value)}
            >
              <option value="__none__">No message</option>
              {message.kind === 'ref' && !message.name && <option value={message.ref}>{message.ref}</option>}
              {message.kind === 'ref' && message.name && !components.includes(message.name) && <option value={message.name}>{message.name} (missing)</option>}
              {components.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__inline__">Inline message (defined here)</option>
            </select>
            {message.kind === 'ref' && message.name && components.includes(message.name) && (
              <IconButton icon="go-to-file" label={`Open ${message.name}`} onClick={() => navigate({ kind: 'message', name: message.name! })} />
            )}
          </div>
        )}
      </Section>
      {message.kind === 'inline' && <MessageFields path={[...base, 'message']} />}
    </div>
  );
}
