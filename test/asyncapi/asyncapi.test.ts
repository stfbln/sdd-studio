import { describe, expect, it } from 'vitest';
import {
  addressParameters,
  analyzeAsyncApi,
  channelMessages,
  listOperations,
  locationOf,
  majorVersion,
  newAsyncApiTemplate,
  newOperation,
  renameChannelEdits,
  renameMessageEdits,
  usagesOf,
  v2OperationMessage,
} from '../../src/modules/asyncapi/core/asyncapi';
import { looksLikeAsyncApi, summarizeAsyncApi } from '../../src/modules/asyncapi/core/summary';
import { applyEditsToValue } from '../../src/shared/structured/edits';
import { applySpecEdits, parseSpec } from '../../src/shared/structured/specText';

const V2 = {
  asyncapi: '2.6.0',
  info: { title: 'Shop events', version: '1.0.0' },
  channels: {
    'orders/{orderId}/created': {
      subscribe: { operationId: 'onOrderCreated', message: { $ref: '#/components/messages/OrderCreated' } },
      publish: { operationId: 'onOrderCreated', message: { payload: { type: 'string' } } },
    },
    'users/{userId}': {
      parameters: { userId: {}, other: {} },
      subscribe: { message: { oneOf: [{ $ref: '#/components/messages/Missing' }] } },
    },
  },
  components: { messages: { OrderCreated: { payload: { $ref: '#/components/schemas/Order' } } }, schemas: { Order: { type: 'object' } } },
};

const V3 = {
  asyncapi: '3.0.0',
  info: { title: 'Shop events', version: '1.0.0' },
  channels: {
    orders: {
      address: 'orders.{region}',
      parameters: { region: {} },
      messages: { created: { $ref: '#/components/messages/OrderCreated' }, inline: { payload: { type: 'string' } } },
    },
    users: { address: 'users', messages: { updated: { $ref: '#/components/messages/UserUpdated' } } },
  },
  operations: {
    receiveOrders: { action: 'receive', channel: { $ref: '#/channels/orders' }, messages: [{ $ref: '#/channels/orders/messages/created' }] },
    wrong: { action: 'publish', channel: { $ref: '#/channels/orders' }, messages: [{ $ref: '#/channels/users/messages/updated' }] },
    orphan: { action: 'send' },
  },
  components: { messages: { OrderCreated: { payload: { type: 'object' } } } },
};

describe('AsyncAPI helpers', () => {
  it('detects versions and parameters', () => {
    expect(majorVersion(V2)).toBe(2);
    expect(majorVersion(V3)).toBe(3);
    expect(majorVersion({ asyncapi: '1.2.0' })).toBeUndefined();
    expect(addressParameters('a/{x}/b/{y}')).toEqual(['x', 'y']);
  });

  it('lists operations of both versions', () => {
    expect(listOperations(V2).map((o) => `${o.action} ${o.channel}`)).toEqual([
      'publish orders/{orderId}/created',
      'subscribe orders/{orderId}/created',
      'subscribe users/{userId}',
    ]);
    expect(listOperations(V3).map((o) => `${o.label}:${o.action}:${o.channel ?? '-'}`)).toEqual(['receiveOrders:receive:orders', 'wrong:publish:orders', 'orphan:send:-']);
    expect(v2OperationMessage(V2.channels['orders/{orderId}/created'].subscribe)).toEqual({ kind: 'ref', ref: '#/components/messages/OrderCreated', name: 'OrderCreated' });
    expect(v2OperationMessage(V2.channels['orders/{orderId}/created'].publish)).toEqual({ kind: 'inline' });
    expect(channelMessages(V3, 'orders')).toEqual([
      { name: 'created', component: 'OrderCreated', inline: false },
      { name: 'inline', component: undefined, inline: true },
    ]);
    expect(newOperation(V3, 'send', 'orders')).toEqual({
      action: 'send',
      channel: { $ref: '#/channels/orders' },
      messages: [{ $ref: '#/channels/orders/messages/created' }, { $ref: '#/channels/orders/messages/inline' }],
    });
  });

  it('maps document paths to pages', () => {
    expect(locationOf(V2, ['channels', 'users/{userId}', 'subscribe', 'message'])).toEqual({ kind: 'channelOperation', channel: 'users/{userId}', action: 'subscribe' });
    expect(locationOf(V3, ['channels', 'orders', 'messages', 'created'])).toEqual({ kind: 'channel', id: 'orders' });
    expect(locationOf(V3, ['components', 'messages', 'OrderCreated', 'payload'])).toEqual({ kind: 'message', name: 'OrderCreated' });
  });

  it('renames channels and messages with every reference, nested ones included', () => {
    const step = applyEditsToValue(V3, renameChannelEdits(V3, 'orders', 'purchases'));
    const renamed = applyEditsToValue(step, renameMessageEdits(step, 'OrderCreated', 'PurchaseMade'));
    expect(Object.keys(renamed.channels)).toEqual(['purchases', 'users']);
    expect(renamed.operations.receiveOrders).toEqual({
      action: 'receive',
      channel: { $ref: '#/channels/purchases' },
      messages: [{ $ref: '#/channels/purchases/messages/created' }],
    });
    expect(JSON.stringify(renamed)).not.toMatch(/OrderCreated|channels\/orders/);
    expect(usagesOf(renamed, '#/channels/purchases').map((u) => u.label)).toEqual(['RECEIVE receiveOrders', 'PUBLISH wrong']);
  });

  it('reports AsyncAPI 2.x problems', () => {
    expect(analyzeAsyncApi(V2).map((i) => i.message)).toEqual([
      'Channel orders/{orderId}/created: parameter "orderId" is not declared',
      'Channel users/{userId}: parameter "other" is not in the address',
      'PUBLISH orders/{orderId}/created: operationId "onOrderCreated" is used more than once',
      'SUBSCRIBE orders/{orderId}/created: operationId "onOrderCreated" is used more than once',
      'Broken reference #/components/messages/Missing',
    ]);
  });

  it('reports AsyncAPI 3.0 problems', () => {
    expect(analyzeAsyncApi(V3).map((i) => i.message)).toEqual([
      'Operation wrong: action must be "send" or "receive"',
      'PUBLISH wrong: message #/channels/users/messages/updated is not a message of channel orders',
      'SEND orphan: no channel',
      'Broken reference #/components/messages/UserUpdated',
    ]);
  });
});

describe('AsyncAPI files', () => {
  it('creates valid starter documents in YAML and JSON', () => {
    for (const format of ['yaml', 'json'] as const) {
      const result = parseSpec(newAsyncApiTemplate('Order "events"', format), format);
      expect(result.ok && analyzeAsyncApi(result.value)).toEqual([]);
      expect(result.ok && majorVersion(result.value)).toBe(3);
    }
  });

  it('renames a channel in YAML text, keeping comments', () => {
    const text = newAsyncApiTemplate('Orders').replace('channels:\n', 'channels:\n  # main channel\n');
    const parsed = parseSpec(text, 'yaml');
    if (!parsed.ok) throw new Error('invalid');
    const out = applySpecEdits(text, 'yaml', renameChannelEdits(parsed.value, 'events', 'orderEvents'));
    expect(out).toContain('  # main channel\n  orderEvents:\n');
    expect(out).toContain("$ref: '#/channels/orderEvents/messages/event'");
    const reparsed = parseSpec(out, 'yaml');
    expect(reparsed.ok && analyzeAsyncApi(reparsed.value)).toEqual([]);
  });

  it('summarizes documents for the catalog', () => {
    expect(looksLikeAsyncApi('events.yaml', 'asyncapi: 3.0.0\n')).toBe(true);
    expect(looksLikeAsyncApi('api.yaml', 'openapi: 3.0.0\n')).toBe(false);
    expect(summarizeAsyncApi('e.asyncapi.yaml', newAsyncApiTemplate('Orders')).summary).toEqual({
      name: 'Orders',
      tags: [],
      details: ['AsyncAPI 3.0.0', 'v1.0.0', '1 channel', '1 operation', '1 message'],
      problems: 0,
      warning: undefined,
    });
    expect(summarizeAsyncApi('old.yaml', 'asyncapi: 1.2.0\ninfo:\n  title: Old\n').summary.error).toMatch(/not supported/);
    expect(summarizeAsyncApi('v2.json', JSON.stringify(V2)).summary.details).toEqual(['AsyncAPI 2.6.0', 'v1.0.0', '2 channels', '3 operations', '1 message']);
  });
});
