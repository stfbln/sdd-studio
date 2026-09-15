import { useState } from 'react';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, KindBadge, Section } from '../../../webview/structured/fields';
import { identifierError, resolveType, STREAMING_LABELS, streamingKind, toPascalCase, topLevelNames } from '../core/analysis';
import type { NewElement, ProtoEdit } from '../core/edits';
import type { ProtoRpc } from '../core/model';
import { AddRow, CommentField, OptionCheckbox, OptionSelect, OtherOptions, TypeInput } from './controls';
import { useProto } from './state';

export const STREAMING_BADGES = { unary: 'UNARY', server: 'SERVER', client: 'CLIENT', bidi: 'BIDI' };

export function StreamingBadge({ rpc }: { rpc: ProtoRpc }) {
  const kind = streamingKind(rpc);
  return (
    <span title={STREAMING_LABELS[kind]}>
      <KindBadge value={kind} label={STREAMING_BADGES[kind]} />
    </span>
  );
}

export function ServicePage({ name }: { name: string }) {
  const { file, edit, navigate } = useProto();
  const service = file.services.find((s) => s.name === name);
  const [createMessages, setCreateMessages] = useState(true);
  if (!service) return null;
  const path = [`service:${name}`];
  const taken = topLevelNames(file);
  const pkg = file.package?.name ?? '';

  const addRpc = (rpcName: string) => {
    const edits: ProtoEdit[] = [];
    let request = 'google.protobuf.Empty';
    let response = 'google.protobuf.Empty';
    if (createMessages) {
      request = `${rpcName}Request`;
      response = `${rpcName}Response`;
      for (const message of [request, response]) {
        if (!file.messages.some((m) => m.name === message)) edits.push({ op: 'add', parent: [], element: { kind: 'message', name: message } satisfies NewElement });
      }
    } else if (!file.imports.some((i) => i.path === 'google/protobuf/empty.proto')) {
      edits.push({ op: 'addImport', path: 'google/protobuf/empty.proto' });
    }
    edits.push({ op: 'add', parent: path, element: { kind: 'rpc', name: rpcName, request, response } });
    edit(edits);
  };

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-server-process" aria-hidden="true" />
        <KeyInput
          value={name}
          className="title-input mono"
          ariaLabel="Service name"
          validate={(v) => identifierError(v, taken)}
          onCommit={(next) => {
            edit({ op: 'rename', target: path, name: next });
            navigate({ kind: 'service', name: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete service"
          onClick={() => {
            edit({ op: 'delete', target: path });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">
        <span className="mono">{pkg ? `${pkg}.${name}` : name}</span> · gRPC service
      </p>

      <Section title="Service" icon="server-process">
        <CommentField target={path} value={service.comment} />
        <div className="inline-fields">
          <OptionCheckbox target={path} options={service.options} name="deprecated" label="Deprecated" />
        </div>
        <OtherOptions options={service.options} handled={['deprecated']} />
      </Section>

      <Section title="Methods (RPCs)" icon="symbol-method" count={service.rpcs.length}>
        {service.rpcs.map((rpc) => (
          <button key={rpc.name} type="button" className="operation-link rpc-link" onClick={() => navigate({ kind: 'rpc', service: name, name: rpc.name })}>
            <StreamingBadge rpc={rpc} />
            <span>
              <span className="mono rpc-name">{rpc.name}</span>
              <span className="mono muted">
                ({rpc.request.stream ? 'stream ' : ''}
                {rpc.request.type}) → {rpc.response.stream ? 'stream ' : ''}
                {rpc.response.type}
              </span>
              {rpc.comment && <span className="rpc-comment muted">{rpc.comment.split('\n')[0]}</span>}
            </span>
            <span className="codicon codicon-chevron-right" aria-hidden="true" />
          </button>
        ))}
        {service.rpcs.length === 0 && <p className="muted">No methods yet.</p>}
        <AddRow
          label="Add RPC"
          placeholder="MethodName, e.g. CreateOrder"
          validate={(v) => identifierError(v, service.rpcs.map((r) => r.name)) ?? (createMessages ? identifierError(`${v}Request`, []) : undefined)}
          onAdd={(rpcName) => {
            addRpc(rpcName);
            navigate({ kind: 'rpc', service: name, name: rpcName });
          }}
        >
          <label className="checkbox small" title="Creates empty <Name>Request and <Name>Response messages, the recommended style">
            <input type="checkbox" checked={createMessages} onChange={(e) => setCreateMessages(e.target.checked)} /> Create request &amp; response messages
          </label>
        </AddRow>
      </Section>
    </div>
  );
}

function SideEditor({ service, rpc, side }: { service: string; rpc: ProtoRpc; side: 'request' | 'response' }) {
  const { file, edit, navigate, types } = useProto();
  const path = [`service:${service}`, `rpc:${rpc.name}`];
  const current = rpc[side];
  const scope = file.package?.name ?? '';
  const target = resolveType(current.type, scope, types);
  const set = (type: string, stream: boolean, extra: ProtoEdit[] = []) => edit([...extra, { op: 'setRpcSide', target: path, side, type, stream }]);

  return (
    <Field label={side === 'request' ? 'Request message' : 'Response message'} hint={side === 'request' ? 'What the client sends' : 'What the server returns'}>
      <span className="field-row">
        <TypeInput value={current.type} scope={scope} messagesOnly ariaLabel={`${side} type`} onCommit={(type, extra) => set(type, current.stream, extra)} />
        <label className="checkbox" title={side === 'request' ? 'The client sends a stream of messages' : 'The server sends a stream of messages'}>
          <input type="checkbox" checked={current.stream} onChange={(e) => set(current.type, e.target.checked)} /> stream
        </label>
        {target?.path && (
          <IconButton icon="arrow-right" label={`Open ${current.type}`} onClick={() => navigate({ kind: 'message', path: target.path! })} />
        )}
        {!target && /^[A-Za-z_]\w*$/.test(current.type) && (
          <button
            type="button"
            className="link-button small"
            onClick={() => {
              edit({ op: 'add', parent: [], element: { kind: 'message', name: current.type } });
              navigate({ kind: 'message', path: [`message:${current.type}`] });
            }}
          >
            <span className="codicon codicon-add" aria-hidden="true" /> Create message {current.type}
          </button>
        )}
      </span>
    </Field>
  );
}

export function RpcPage({ service, name }: { service: string; name: string }) {
  const { file, edit, navigate } = useProto();
  const svc = file.services.find((s) => s.name === service);
  const rpc = svc?.rpcs.find((r) => r.name === name);
  if (!svc || !rpc) return null;
  const path = [`service:${service}`, `rpc:${name}`];
  const kind = streamingKind(rpc);

  return (
    <div className="page">
      <div className="page-title-row">
        <StreamingBadge rpc={rpc} />
        <KeyInput
          value={name}
          className="title-input mono"
          ariaLabel="RPC name"
          validate={(v) => identifierError(v, svc.rpcs.map((r) => r.name))}
          onCommit={(next) => {
            edit({ op: 'rename', target: path, name: next });
            navigate({ kind: 'rpc', service, name: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete RPC"
          onClick={() => {
            edit({ op: 'delete', target: path });
            navigate({ kind: 'service', name: service });
          }}
        />
      </div>
      <p className="muted small">
        Method of{' '}
        <button type="button" className="link-button" onClick={() => navigate({ kind: 'service', name: service })}>
          {service}
        </button>
        {' · '}
        {STREAMING_LABELS[kind]}
        {name !== toPascalCase(name) && ' · method names are usually PascalCase'}
      </p>

      <Section title="Method" icon="symbol-method">
        <CommentField target={path} value={rpc.comment} />
        <div className="form-grid">
          <SideEditor service={service} rpc={rpc} side="request" />
          <SideEditor service={service} rpc={rpc} side="response" />
        </div>
      </Section>

      <Section title="Options" icon="settings">
        <div className="form-grid">
          <OptionSelect
            target={path}
            options={rpc.options}
            name="idempotency_level"
            label="Idempotency"
            choices={['NO_SIDE_EFFECTS', 'IDEMPOTENT', 'IDEMPOTENCY_UNKNOWN']}
            hint="NO_SIDE_EFFECTS lets clients use GET-like caching and retries"
          />
          <div className="field">
            <span className="field-label">&nbsp;</span>
            <OptionCheckbox target={path} options={rpc.options} name="deprecated" label="Deprecated" />
          </div>
        </div>
        <OtherOptions options={rpc.options} handled={['idempotency_level', 'deprecated']} />
      </Section>
    </div>
  );
}
