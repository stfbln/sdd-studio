/**
 * AsyncAPI 2.x and 3.0 knowledge used by the form editor, the catalog and the checks.
 *
 * 2.x: channels are keyed by address and hold `publish` / `subscribe` operations.
 * 3.0: channels have an id and an `address`, messages are listed per channel, and
 *      operations are top-level (`action: send | receive`) pointing at a channel.
 */
import { getIn, isObject, type JsonObject, type SpecPath } from '../../../shared/structured/edits';
import { findRefs, keysAt, localRef, refName, refPath, renameEntryEdits } from '../../../shared/structured/jsonSchema';

export type AsyncApiMajor = 2 | 3;

export type AsyncLocation =
  | { kind: 'general' }
  | { kind: 'channel'; id: string }
  /** AsyncAPI 3.0 operation. */
  | { kind: 'operation'; id: string }
  /** AsyncAPI 2.x operation, nested in its channel. */
  | { kind: 'channelOperation'; channel: string; action: V2Action }
  | { kind: 'message'; name: string }
  | { kind: 'schema'; name: string };

export const V2_ACTIONS = ['publish', 'subscribe'] as const;
export const V3_ACTIONS = ['send', 'receive'] as const;
export type V2Action = (typeof V2_ACTIONS)[number];
export type V3Action = (typeof V3_ACTIONS)[number];

export const PROTOCOLS = [
  'amqp', 'amqps', 'anypointmq', 'googlepubsub', 'http', 'https', 'ibmmq', 'jms', 'kafka', 'kafka-secure',
  'mercure', 'mqtt', 'mqtt5', 'nats', 'pulsar', 'redis', 'secure-mqtt', 'sns', 'solace', 'sqs', 'stomp', 'stomps', 'ws', 'wss',
];
export const CONTENT_TYPES = ['application/json', 'application/avro', 'application/xml', 'application/octet-stream', 'text/plain'];

export const ACTION_HINTS: Record<V2Action | V3Action, string> = {
  publish: 'Others publish to this channel: the application receives these messages.',
  subscribe: 'Others subscribe to this channel: the application sends these messages.',
  send: 'The application sends messages to the channel.',
  receive: 'The application receives messages from the channel.',
};

export function asyncApiVersion(spec: unknown): string | undefined {
  const value = isObject(spec) ? spec.asyncapi : undefined;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

export function majorVersion(spec: unknown): AsyncApiMajor | undefined {
  const version = asyncApiVersion(spec) ?? '';
  if (/^2\.\d/.test(version)) return 2;
  if (/^3\.0/.test(version)) return 3;
  return undefined;
}

/* Channels ----------------------------------------------------------------- */

export const channelIds = (spec: unknown) => keysAt(spec, ['channels']);

/** Address of a channel: its key in 2.x, its `address` field in 3.0 (null means dynamic). */
export function channelAddress(spec: unknown, id: string): string | undefined {
  if (majorVersion(spec) === 2) return id;
  const address = getIn(spec, ['channels', id, 'address']);
  return typeof address === 'string' ? address : undefined;
}

/** "orders/{orderId}/created" -> ["orderId"] */
export function addressParameters(address: string | undefined): string[] {
  return address ? [...address.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]) : [];
}

export const channelRef = (id: string) => localRef(['channels', id]);
export const channelRefName = (ref: unknown) => refName(ref, ['channels']);
export const channelMessageRef = (channel: string, message: string) => localRef(['channels', channel, 'messages', message]);

/** Messages declared on a 3.0 channel (name -> referenced component message, if any). */
export function channelMessages(spec: unknown, channel: string): { name: string; component?: string; inline: boolean }[] {
  const messages = getIn(spec, ['channels', channel, 'messages']);
  if (!isObject(messages)) return [];
  return Object.entries(messages).map(([name, value]) => {
    const component = isObject(value) ? messageRefName(value.$ref) : undefined;
    return { name, component, inline: !(isObject(value) && typeof value.$ref === 'string') };
  });
}

export const renameChannelEdits = (spec: unknown, from: string, to: string) => renameEntryEdits(spec, ['channels'], from, to);

/* Operations --------------------------------------------------------------- */

export interface OperationInfo {
  location: Extract<AsyncLocation, { kind: 'operation' | 'channelOperation' }>;
  path: SpecPath;
  action: string;
  channel?: string;
  operation: JsonObject;
  label: string;
}

export function listOperations(spec: unknown): OperationInfo[] {
  const label = (op: JsonObject, fallback: string) =>
    String((typeof op.title === 'string' && op.title) || (typeof op.summary === 'string' && op.summary) || (typeof op.operationId === 'string' && op.operationId) || fallback);

  if (majorVersion(spec) === 2) {
    return channelIds(spec).flatMap((channel) =>
      V2_ACTIONS.flatMap((action): OperationInfo[] => {
        const operation = getIn(spec, ['channels', channel, action]);
        return isObject(operation)
          ? [{ location: { kind: 'channelOperation', channel, action }, path: ['channels', channel, action], action, channel, operation, label: label(operation, '') }]
          : [];
      }),
    );
  }
  const operations = getIn(spec, ['operations']);
  if (!isObject(operations)) return [];
  return Object.entries(operations).flatMap(([id, operation]): OperationInfo[] =>
    isObject(operation)
      ? [
          {
            location: { kind: 'operation', id },
            path: ['operations', id],
            action: String(operation.action ?? ''),
            channel: isObject(operation.channel) ? channelRefName(operation.channel.$ref) : undefined,
            operation,
            label: id,
          },
        ]
      : [],
  );
}

export const operationIds = (spec: unknown) => keysAt(spec, ['operations']);
export const renameOperationEdits = (spec: unknown, from: string, to: string) => renameEntryEdits(spec, ['operations'], from, to);

/** New 3.0 operation on a channel, using all the channel's messages. */
export function newOperation(spec: unknown, action: V3Action, channel?: string): JsonObject {
  if (!channel) return { action };
  return {
    action,
    channel: { $ref: channelRef(channel) },
    ...(channelMessages(spec, channel).length ? { messages: channelMessages(spec, channel).map((m) => ({ $ref: channelMessageRef(channel, m.name) })) } : {}),
  };
}

/* Messages ----------------------------------------------------------------- */

const MESSAGES = ['components', 'messages'];
export const messageNames = (spec: unknown) => keysAt(spec, MESSAGES);
export const messageRef = (name: string) => localRef([...MESSAGES, name]);
export const messageRefName = (ref: unknown) => refName(ref, MESSAGES);
export const renameMessageEdits = (spec: unknown, from: string, to: string) => renameEntryEdits(spec, MESSAGES, from, to);

/** How a 2.x operation defines its message. */
export function v2OperationMessage(operation: unknown): { kind: 'none' } | { kind: 'ref'; name?: string; ref: string } | { kind: 'inline' } | { kind: 'oneOf'; count: number } {
  const message = isObject(operation) ? operation.message : undefined;
  if (!isObject(message)) return { kind: 'none' };
  if (typeof message.$ref === 'string') return { kind: 'ref', ref: message.$ref, name: messageRefName(message.$ref) };
  if (Array.isArray(message.oneOf)) return { kind: 'oneOf', count: message.oneOf.length };
  return { kind: 'inline' };
}

/* Locations & usages ------------------------------------------------------- */

/** Page showing a document path. */
export function locationOf(spec: unknown, path: SpecPath): AsyncLocation {
  const [a, b, c] = path.map(String);
  if (a === 'channels' && b !== undefined) {
    if (majorVersion(spec) === 2 && (c === 'publish' || c === 'subscribe')) return { kind: 'channelOperation', channel: b, action: c };
    return { kind: 'channel', id: b };
  }
  if (a === 'operations' && b !== undefined) return { kind: 'operation', id: b };
  if (a === 'components' && b === 'messages' && c !== undefined) return { kind: 'message', name: c };
  if (a === 'components' && b === 'schemas' && c !== undefined) return { kind: 'schema', name: c };
  return { kind: 'general' };
}

export function locationLabel(spec: unknown, location: AsyncLocation): string {
  switch (location.kind) {
    case 'channel':
      return `Channel ${location.id}`;
    case 'operation': {
      const action = getIn(spec, ['operations', location.id, 'action']);
      return `${typeof action === 'string' ? action.toUpperCase() + ' ' : ''}${location.id}`;
    }
    case 'channelOperation':
      return `${location.action.toUpperCase()} ${location.channel}`;
    case 'message':
      return `Message ${location.name}`;
    case 'schema':
      return `Schema ${location.name}`;
    default:
      return 'General';
  }
}

/** Pages referencing a given local target (e.g. "#/components/messages/OrderCreated"). */
export function usagesOf(spec: unknown, target: string): { label: string; location: AsyncLocation }[] {
  const seen = new Set<string>();
  return findRefs(spec, (r) => r === target || r.startsWith(target + '/'))
    .map((path) => locationOf(spec, path))
    .filter((location) => {
      const key = JSON.stringify(location);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((location) => ({ label: locationLabel(spec, location), location }));
}

/* Problems ----------------------------------------------------------------- */

export interface AsyncIssue {
  severity: 'error' | 'warning';
  message: string;
  location: AsyncLocation;
}

export function analyzeAsyncApi(spec: unknown): AsyncIssue[] {
  const issues: AsyncIssue[] = [];
  const general: AsyncLocation = { kind: 'general' };
  const major = majorVersion(spec);
  const info = getIn(spec, ['info']);
  if (!isObject(info) || typeof info.title !== 'string' || !info.title.trim()) issues.push({ severity: 'error', message: 'info.title is required', location: general });
  if (!isObject(info) || info.version === undefined || String(info.version).trim() === '') {
    issues.push({ severity: 'error', message: 'info.version is required', location: general });
  }

  for (const id of channelIds(spec)) {
    const location: AsyncLocation = { kind: 'channel', id };
    const inAddress = addressParameters(channelAddress(spec, id));
    const declared = keysAt(spec, ['channels', id, 'parameters']);
    for (const name of inAddress) {
      if (!declared.includes(name)) issues.push({ severity: 'error', message: `Channel ${id}: parameter "${name}" is not declared`, location });
    }
    for (const name of declared) {
      if (!inAddress.includes(name)) issues.push({ severity: 'warning', message: `Channel ${id}: parameter "${name}" is not in the address`, location });
    }
  }

  const ids = new Map<string, number>();
  for (const op of listOperations(spec)) {
    const where = locationLabel(spec, op.location);
    if (major === 2) {
      if (typeof op.operation.operationId === 'string') ids.set(op.operation.operationId, (ids.get(op.operation.operationId) ?? 0) + 1);
      continue;
    }
    if (!(V3_ACTIONS as readonly string[]).includes(op.action)) {
      issues.push({ severity: 'error', message: `Operation ${op.location.kind === 'operation' ? op.location.id : ''}: action must be "send" or "receive"`, location: op.location });
    }
    if (!op.channel) {
      issues.push({ severity: 'error', message: `${where}: no channel`, location: op.location });
      continue;
    }
    const messages = Array.isArray(op.operation.messages) ? op.operation.messages : [];
    messages.forEach((m) => {
      const ref = isObject(m) ? m.$ref : undefined;
      if (typeof ref === 'string' && ref.startsWith('#/') && !ref.startsWith(channelRef(op.channel!) + '/messages/')) {
        issues.push({ severity: 'error', message: `${where}: message ${ref} is not a message of channel ${op.channel}`, location: op.location });
      }
    });
  }
  for (const op of listOperations(spec)) {
    const id = op.operation.operationId;
    if (major === 2 && typeof id === 'string' && (ids.get(id) ?? 0) > 1) {
      issues.push({ severity: 'error', message: `${locationLabel(spec, op.location)}: operationId "${id}" is used more than once`, location: op.location });
    }
  }

  for (const path of findRefs(spec, (r) => r.startsWith('#/'))) {
    const ref = getIn(spec, path) as string;
    const target = refPath(ref);
    if (target && getIn(spec, target) === undefined) {
      issues.push({ severity: 'error', message: `Broken reference ${ref}`, location: locationOf(spec, path) });
    }
  }
  return issues;
}

/* Templates ---------------------------------------------------------------- */

export function newAsyncApiTemplate(title: string, format: 'yaml' | 'json' = 'yaml'): string {
  const spec = {
    asyncapi: '3.0.0',
    info: { title: title.trim(), version: '1.0.0' },
    servers: { production: { host: 'broker.example.com', protocol: 'kafka' } },
    channels: {
      events: { address: 'events', messages: { event: { $ref: '#/components/messages/Event' } } },
    },
    operations: {
      receiveEvents: { action: 'receive', channel: { $ref: '#/channels/events' }, messages: [{ $ref: '#/channels/events/messages/event' }] },
    },
    components: {
      messages: { Event: { contentType: 'application/json', payload: { $ref: '#/components/schemas/Event' } } },
      schemas: { Event: { type: 'object', properties: { id: { type: 'string' } } } },
    },
  };
  if (format === 'json') return JSON.stringify(spec, null, 2) + '\n';
  return `asyncapi: 3.0.0
info:
  title: ${JSON.stringify(title.trim())}
  version: 1.0.0
servers:
  production:
    host: broker.example.com
    protocol: kafka
channels:
  events:
    address: events
    messages:
      event:
        $ref: '#/components/messages/Event'
operations:
  receiveEvents:
    action: receive
    channel:
      $ref: '#/channels/events'
    messages:
      - $ref: '#/channels/events/messages/event'
components:
  messages:
    Event:
      contentType: application/json
      payload:
        $ref: '#/components/schemas/Event'
  schemas:
    Event:
      type: object
      properties:
        id:
          type: string
`;
}
