import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeProto,
  importInfos,
  knownTypes,
  newProtoTemplate,
  nextEnumNumber,
  nextFieldNumber,
  renameTypeEdits,
  resolveType,
  typeReference,
  typeUsages,
} from '../../src/modules/proto/core/analysis';
import { parseProtoDocument } from '../../src/modules/proto/core/document';
import { applyProtoEdits, type ProtoEdit } from '../../src/modules/proto/core/edits';
import { ProtoSyntaxError } from '../../src/modules/proto/core/model';
import { parseProto, quote, unquote } from '../../src/modules/proto/core/parse';
import { summarizeProto } from '../../src/modules/proto/core/summary';
import { slugify } from '../../src/shared/naming';

const SAMPLE = readFileSync(new URL('../../samples/proto/orders/v1/order_service.proto', import.meta.url), 'utf8');
const MONEY = { path: 'common/v1/money.proto', resolved: 'samples/proto/common/v1/money.proto', types: [{ fullName: 'acme.common.v1.Money', kind: 'message' as const }] };

/** Applies edits one by one, each computed on the latest text (as the form does). */
const edit = (text: string, ...edits: ProtoEdit[]) => applyProtoEdits(text, edits);

describe('parseProto', () => {
  it('reads services, messages, enums, options and comments with positions', () => {
    const file = parseProto(SAMPLE);
    expect(file.syntax?.value).toBe('proto3');
    expect(file.package?.name).toBe('acme.orders.v1');
    expect(file.imports.map((i) => i.path)).toEqual(['common/v1/money.proto', 'google/protobuf/timestamp.proto']);
    expect(file.options.map((o) => [o.name, o.value])).toEqual([
      ['go_package', '"github.com/acme/shop/gen/orders/v1;ordersv1"'],
      ['java_multiple_files', 'true'],
    ]);

    const [service] = file.services;
    expect(service.comment).toBe('Places and follows customer orders.');
    expect(service.rpcs.map((r) => [r.name, r.request.type, r.response.type, r.response.stream])).toEqual([
      ['CreateOrder', 'CreateOrderRequest', 'Order', false],
      ['GetOrder', 'GetOrderRequest', 'Order', false],
      ['WatchOrder', 'GetOrderRequest', 'OrderEvent', true],
    ]);
    expect(service.rpcs[1].options[0]).toMatchObject({ name: 'idempotency_level', value: 'NO_SIDE_EFFECTS' });

    const order = file.messages.find((m) => m.name === 'Order')!;
    expect(order.reserved.map((r) => [r.kind, r.items])).toEqual([
      ['numbers', ['4', '8 to 10']],
      ['names', ['legacy_total']],
    ]);
    expect(order.messages[0].comment).toBe('One product of the order.');
    expect(order.fields.map((f) => [f.label?.value, f.type, f.name, f.number, f.oneof])).toEqual([
      [undefined, 'string', 'id', 1, undefined],
      [undefined, 'Status', 'status', 2, undefined],
      ['repeated', 'Line', 'lines', 3, undefined],
      [undefined, 'google.protobuf.Timestamp', 'created_at', 5, undefined],
      [undefined, 'string', 'note', 6, undefined],
      [undefined, 'string', 'card_token', 11, 'payment'],
      [undefined, 'string', 'voucher_code', 12, 'payment'],
    ]);
    const note = order.fields[4];
    expect(SAMPLE.slice(note.span.start, note.span.end)).toBe('string note = 6 [deprecated = true];');
    const metadata = file.messages[0].fields[2];
    expect([metadata.kind, metadata.mapKey, metadata.mapValue, metadata.type]).toEqual(['map', 'string', 'string', 'map<string, string>']);
  });

  it('handles proto2 groups, extensions, editions, aggregates and keywords used as names', () => {
    const file = parseProto(`edition = "2023";
package x;
option (my.opt).path = { a: 1 b: [1, 2] c: "{" };
message M {
  extensions 100 to max;
  optional group Result = 1 { required string url = 2; }
  string message = 3 [(validate.rules).string = { min_len: 1 }, json_name = "msg"];
  reserved reserved_name;
  enum E { option allow_alias = true; A = 0; B = 0 [deprecated = true]; }
}
extend M { int32 extra = 100; }
service S { rpc Ping (.x.M) returns (stream M) {} ; }
`);
    expect(file.syntax).toMatchObject({ keyword: 'edition', value: '2023' });
    expect(file.options[0]).toMatchObject({ name: '(my.opt).path', value: '{ a: 1 b: [1, 2] c: "{" }' });
    const m = file.messages[0];
    expect(m.extensions).toEqual(['100 to max']);
    expect(m.fields.map((f) => [f.kind, f.name])).toEqual([
      ['group', 'Result'],
      ['field', 'message'],
    ]);
    expect(m.fields[1].options.map((o) => o.name)).toEqual(['(validate.rules).string', 'json_name']);
    expect(m.reserved[0]).toMatchObject({ kind: 'names', items: ['reserved_name'], quoted: false });
    expect(m.enums[0].values.map((v) => v.number)).toEqual([0, 0]);
    expect(file.extends[0]).toMatchObject({ target: 'M' });
    expect(file.services[0].rpcs[0]).toMatchObject({ request: { type: '.x.M', stream: false }, response: { type: 'M', stream: true } });
  });

  it('reports syntax errors with their line', () => {
    const error = (() => {
      try {
        parseProto('syntax = "proto3";\nmessage A {\n  string = 1;\n}\n');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ProtoSyntaxError);
    expect(error).toMatchObject({ line: 3 });
    expect(parseProtoDocument('message {').ok).toBe(false);
  });

  it('only takes comments directly above a declaration as its description', () => {
    const file = parseProto(`// detached

// First line
/* second */
message A {
  int32 a = 1; // trailing
  int32 b = 2;
}`);
    expect(file.messages[0].comment).toBe('First line\nsecond');
    expect(file.messages[0].fields[1].comment).toBe('');
  });

  it('quotes and unquotes strings', () => {
    expect(unquote('"a\\"b\\n\\x41\\101"')).toBe('a"b\nAA');
    expect(unquote(quote('C:\\dir "x"'))).toBe('C:\\dir "x"');
  });
});

describe('applyProtoEdits', () => {
  it('changes only the targeted tokens', () => {
    const out = edit(
      SAMPLE,
      { op: 'rename', target: ['message:Order', 'field:note'], name: 'remark' },
      { op: 'setType', target: ['message:GetOrderRequest', 'field:order_id'], type: 'int64' },
      { op: 'setNumber', target: ['enum:Status', 'value:STATUS_DELIVERED'], number: 9 },
      { op: 'setLabel', target: ['message:Order', 'field:id'], label: 'optional' },
      { op: 'setLabel', target: ['message:Order', 'field:lines'] },
      { op: 'setRpcSide', target: ['service:OrderService', 'rpc:CreateOrder'], side: 'request', type: 'CreateOrderRequest', stream: true },
    );
    const diff = out.split('\n').filter((line, i) => line !== SAMPLE.split('\n')[i]);
    expect(diff).toEqual([
      '  rpc CreateOrder(stream CreateOrderRequest) returns (Order);',
      '  int64 order_id = 1;',
      '  optional string id = 1;',
      '  Line lines = 3;',
      '  string remark = 6 [deprecated = true];',
      '  STATUS_DELIVERED = 9;',
    ]);
  });

  it('adds elements next to their siblings, following indentation and spacing', () => {
    const out = edit(
      SAMPLE,
      { op: 'add', parent: ['service:OrderService'], element: { kind: 'rpc', name: 'CancelOrder', request: 'GetOrderRequest', response: 'Order', comment: 'Cancels.' } },
      { op: 'add', parent: ['enum:Status'], element: { kind: 'value', name: 'STATUS_CANCELLED', number: 5 } },
      { op: 'add', parent: ['message:Order', 'oneof:payment'], element: { kind: 'field', name: 'gift_card', type: 'string', number: 13 } },
      { op: 'add', parent: ['message:GetOrderRequest'], element: { kind: 'field', name: 'view', type: 'View', number: 2 } },
      { op: 'add', parent: [], element: { kind: 'enum', name: 'View', values: [{ name: 'VIEW_UNSPECIFIED', number: 0 }] } },
    );
    expect(out).toContain('  rpc WatchOrder(GetOrderRequest) returns (stream OrderEvent);\n\n  // Cancels.\n  rpc CancelOrder(GetOrderRequest) returns (Order);\n}');
    expect(out).toContain('  STATUS_DELIVERED = 4;\n  STATUS_CANCELLED = 5;\n}');
    expect(out).toContain('    string voucher_code = 12;\n    string gift_card = 13;\n  }');
    expect(out).toContain('message GetOrderRequest {\n  string order_id = 1;\n  View view = 2;\n}');
    expect(out).toContain('  STATUS_DELIVERED = 4;\n  STATUS_CANCELLED = 5;\n}\n\nenum View {\n  VIEW_UNSPECIFIED = 0;\n}\n\nmessage OrderEvent');
    expect(parseProtoDocument(out).ok).toBe(true);
  });

  it('opens empty and one-line bodies, and uses the file indentation', () => {
    const text = 'syntax = "proto3";\n\nmessage A {}\nmessage B {\n    int32 x = 1;\n}\nservice S {}\n';
    const out = edit(
      text,
      { op: 'add', parent: ['message:A'], element: { kind: 'field', name: 'id', type: 'string', number: 1 } },
      { op: 'add', parent: ['service:S'], element: { kind: 'rpc', name: 'Get', request: 'A', response: 'B', responseStream: true } },
      { op: 'setOption', target: ['service:S', 'rpc:Get'], name: 'deprecated', value: 'true' },
    );
    expect(out).toBe('syntax = "proto3";\n\nmessage A {\n    string id = 1;\n}\nmessage B {\n    int32 x = 1;\n}\nservice S {\n    rpc Get(A) returns (stream B) {\n        option deprecated = true;\n    }\n}\n');
  });

  it('deletes declarations with their comments without leaving blank line runs', () => {
    const out = edit(SAMPLE, { op: 'delete', target: ['message:OrderEvent'] }, { op: 'delete', target: ['message:Order', 'message:Line'] }, { op: 'delete', target: ['service:OrderService', 'rpc:CreateOrder'] });
    expect(out).not.toMatch(/\n\s*\n\s*\n/);
    expect(out).not.toContain('One product of the order.');
    expect(out).not.toContain('Creates an order');
    expect(out).toContain('service OrderService {\n  // Returns one order.');
    expect(out.endsWith('  STATUS_DELIVERED = 4;\n}\n')).toBe(true);
  });

  it('writes, replaces and removes comments', () => {
    let out = edit(SAMPLE, { op: 'setComment', target: ['message:GetOrderRequest', 'field:order_id'], comment: 'The order.\n\nRequired.' });
    expect(out).toContain('message GetOrderRequest {\n  // The order.\n  //\n  // Required.\n  string order_id = 1;');
    out = edit(out, { op: 'setComment', target: ['message:GetOrderRequest', 'field:order_id'], comment: 'Id.' });
    expect(out).toContain('{\n  // Id.\n  string order_id = 1;');
    out = edit(out, { op: 'setComment', target: ['message:GetOrderRequest', 'field:order_id'], comment: '' }, { op: 'setComment', target: ['service:OrderService'], comment: '' });
    expect(out).toContain('message GetOrderRequest {\n  string order_id = 1;');
    expect(out).toContain('option java_multiple_files = true;\n\nservice OrderService {');
    expect(edit('/** Doc. */\nmessage A {}', { op: 'setComment', target: ['message:A'], comment: 'New\ndoc' })).toBe('/**\n * New\n * doc\n */\nmessage A {}');
  });

  it('manages inline and statement options', () => {
    const t = ['message:Order', 'field:note'];
    let out = edit(SAMPLE, { op: 'setOption', target: t, name: 'json_name', value: '"memo"' });
    expect(out).toContain('string note = 6 [deprecated = true, json_name = "memo"];');
    out = edit(out, { op: 'setOption', target: t, name: 'deprecated' });
    expect(out).toContain('string note = 6 [json_name = "memo"];');
    out = edit(out, { op: 'setOption', target: t, name: 'json_name' });
    expect(out).toContain('string note = 6;');
    out = edit(out, { op: 'setOption', target: ['enum:Status', 'value:STATUS_PAID'], name: 'deprecated', value: 'true' });
    expect(out).toContain('STATUS_PAID = 2 [deprecated = true];');

    out = edit(out, { op: 'setOption', target: [], name: 'go_package', value: '"x/y"' }, { op: 'setOption', target: [], name: 'java_package', value: '"com.x"' }, { op: 'setOption', target: [], name: 'java_multiple_files' });
    expect(out).toContain('import "google/protobuf/timestamp.proto";\n\noption go_package = "x/y";\noption java_package = "com.x";\n\n// Places');
    out = edit(out, { op: 'setOption', target: ['enum:Status'], name: 'allow_alias', value: 'true' });
    expect(out).toContain('enum Status {\n  option allow_alias = true;\n  STATUS_UNSPECIFIED = 0;');
  });

  it('edits reserved numbers and names', () => {
    let out = edit(SAMPLE, { op: 'setReserved', target: ['message:Order'], kind: 'numbers', items: ['4', '7 to 10'] }, { op: 'setReserved', target: ['message:Order'], kind: 'names', items: [] });
    expect(out).toContain('message Order {\n  reserved 4, 7 to 10;\n\n  // One product');
    out = edit(out, { op: 'setReserved', target: ['enum:Status'], kind: 'names', items: ['STATUS_LOST'] });
    expect(out).toContain('enum Status {\n  reserved "STATUS_LOST";\n  STATUS_UNSPECIFIED = 0;');
  });

  it('moves a field into a oneof with its comment and options', () => {
    const text = edit(SAMPLE, { op: 'setComment', target: ['message:Order', 'field:note'], comment: 'Note.' });
    const out = edit(text, { op: 'move', target: ['message:Order', 'field:note'], parent: ['message:Order', 'oneof:payment'] });
    expect(out).toContain('    string voucher_code = 12;\n    // Note.\n    string note = 6 [deprecated = true];\n  }');
    expect(parseProto(out).messages[2].fields.find((f) => f.name === 'note')?.oneof).toBe('payment');
    const back = edit(out, { op: 'move', target: ['message:Order', 'field:note'], parent: ['message:Order'] });
    expect(back).toContain('  oneof payment {\n    string card_token = 11;\n    string voucher_code = 12;\n  }\n\n  // Note.\n  string note = 6 [deprecated = true];\n}');
  });

  it('updates syntax, package and imports', () => {
    let out = edit('message A {}\n', { op: 'setSyntax', value: 'proto3' }, { op: 'setPackage', value: 'a.v1' }, { op: 'addImport', path: 'google/protobuf/empty.proto' });
    expect(out).toBe('syntax = "proto3";\n\npackage a.v1;\n\nimport "google/protobuf/empty.proto";\n\nmessage A {}\n');
    out = edit(out, { op: 'removeImport', path: 'google/protobuf/empty.proto' }, { op: 'setPackage', value: '' });
    expect(out).toBe('syntax = "proto3";\n\nmessage A {}\n');
  });

  it('keeps CRLF line endings and rejects missing targets', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    const out = edit(crlf, { op: 'add', parent: ['enum:Status'], element: { kind: 'value', name: 'STATUS_X', number: 5 } });
    expect(out).toContain('STATUS_DELIVERED = 4;\r\n  STATUS_X = 5;\r\n}');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
    expect(() => edit(SAMPLE, { op: 'delete', target: ['message:Nope'] })).toThrow(/no longer exists/);
  });
});

describe('analysis', () => {
  const file = parseProto(SAMPLE);
  const imports = importInfos(file, [MONEY]);

  it('resolves references from the innermost scope and writes short references', () => {
    const types = knownTypes(file, imports);
    expect(resolveType('Line', 'acme.orders.v1.Order', types)?.fullName).toBe('acme.orders.v1.Order.Line');
    expect(resolveType('Line', 'acme.orders.v1.CreateOrderRequest', types)).toBeUndefined();
    expect(resolveType('.acme.common.v1.Money', 'x', types)?.kind).toBe('message');
    expect(typeReference('acme.orders.v1.Order.Line', 'acme.orders.v1.CreateOrderRequest', types)).toBe('Order.Line');
    expect(typeReference('acme.common.v1.Money', 'acme.orders.v1.Order', types)).toBe('common.v1.Money');
    expect(typeReference('google.protobuf.Timestamp', 'acme.orders.v1.Order', types)).toBe('google.protobuf.Timestamp');
  });

  it('finds no problem in the sample and reports protoc errors', () => {
    expect(analyzeProto(file, imports)).toEqual([]);
    const bad = parseProto(`syntax = "proto3";
message A {
  required string a = 1;
  int32 b = 1;
  int32 c = 19500;
  map<double, string> d = 4;
  Missing e = 5;
  int32 a = 6;
  reserved 7;
  int32 f = 7;
  oneof o { repeated int32 g = 8; }
}
enum E { E_ONE = 1; E_TWO = 1; }
service S { rpc R(E) returns (int32); }
`);
    const messages = analyzeProto(bad, []).map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        'No package: type names may clash with other files',
        '"a" is defined more than once in A',
        'A: field number 1 is used by a and b',
        'A: field f uses the reserved number 7',
        'A: field a: proto3 has no required fields',
        'A: field c: numbers 19000 to 19999 are reserved by Protocol Buffers',
        'A: field d: double cannot be a map key (integers, bool or string)',
        'A.e: unknown type Missing (missing import?)',
        'A: field g: fields of a oneof cannot be repeated',
        'E: the first value must be 0 in proto3',
        'E: number 1 is used by E_ONE and E_TWO (set allow_alias to share it)',
        'R request: E is an enum, a message is expected',
        'R response: int32 is not a message',
      ]),
    );
  });

  it('does not report unknown types while an import could not be resolved', () => {
    expect(analyzeProto(file, importInfos(file)).filter((i) => i.message.includes('unknown type'))).toEqual([]);
  });

  it('renames a type and its references, nested ones included', () => {
    const edits = renameTypeEdits(file, ['message:Order', 'message:Line'], 'Item', imports);
    const out = applyProtoEdits(SAMPLE, edits);
    expect(out).toContain('repeated Order.Item lines = 2;');
    expect(out).toContain('repeated Item lines = 3;');
    expect(out).toContain('message Item {');

    const renamed = applyProtoEdits(SAMPLE, renameTypeEdits(file, ['message:Order'], 'Purchase', imports));
    expect(renamed).toContain('rpc CreateOrder(CreateOrderRequest) returns (Purchase);');
    expect(renamed).toContain('repeated Purchase.Line lines = 2;');
    expect(analyzeProto(parseProto(renamed), importInfos(parseProto(renamed), [MONEY]))).toEqual([]);

    const self = 'message Node { Node parent = 1; map<string, .Node> children = 2; }';
    expect(applyProtoEdits(self, renameTypeEdits(parseProto(self), ['message:Node'], 'Tree'))).toBe('message Tree { Tree parent = 1; map<string, .Tree> children = 2; }');
  });

  it('lists usages and suggests numbers', () => {
    expect(typeUsages(file, 'acme.orders.v1.GetOrderRequest', imports).map((u) => u.label)).toEqual(['OrderService.GetOrder (request)', 'OrderService.WatchOrder (request)']);
    const order = file.messages.find((m) => m.name === 'Order')!;
    expect(nextFieldNumber(order)).toBe(13);
    expect(nextFieldNumber(parseProto('message A { int32 a = 18999; }').messages[0])).toBe(20000);
    expect(nextEnumNumber(file.enums[0])).toBe(5);
  });

  it('creates a template without problems', () => {
    const template = newProtoTemplate('Order service');
    expect(template).toContain('package order.v1;');
    expect(template).toContain('service OrderService {');
    const parsed = parseProto(template);
    expect(analyzeProto(parsed, importInfos(parsed))).toEqual([]);
    expect(slugify('Order service', '_')).toBe('order_service');
  });

  it('summarizes files for the catalog', () => {
    expect(summarizeProto(SAMPLE)).toEqual({
      summary: { name: 'OrderService', tags: ['acme.orders.v1'], details: ['proto3', '1 service', '3 RPCs', '5 messages', '1 enum'], problems: 0 },
      localImports: 1,
    });
    expect(summarizeProto('package a.b;\nmessage {').summary).toMatchObject({ name: 'a.b', error: expect.stringMatching(/^Line 2: /) });
  });
});

describe('spacing of new fields', () => {
  it('does not copy the blank line around a oneof block', () => {
    const once = applyProtoEdits(SAMPLE, [{ op: 'add', parent: ['message:Order'], element: { kind: 'field', name: 'total', type: 'string', number: 13 } }]);
    const twice = applyProtoEdits(once, [{ op: 'add', parent: ['message:Order'], element: { kind: 'field', name: 'product', type: 'string', number: 14 } }]);
    expect(twice).toContain('  }\n\n  string total = 13;\n  string product = 14;\n}');
  });
});
