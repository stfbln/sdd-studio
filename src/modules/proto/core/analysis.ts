import type { ProtoEdit } from './edits';
import type { ProtoEnum, ProtoField, ProtoFile, ProtoMessage, ProtoPath, ProtoReserved, ProtoRpc, ProtoService } from './model';

/** Page of the form editor. Messages and enums are addressed by their (nested) path. */
export type ProtoLocation =
  | { kind: 'general' }
  | { kind: 'service'; name: string }
  | { kind: 'rpc'; service: string; name: string }
  | { kind: 'message'; path: ProtoPath }
  | { kind: 'enum'; path: ProtoPath };

export interface ProtoIssue {
  severity: 'error' | 'warning';
  message: string;
  location: ProtoLocation;
}

export type TypeKind = 'message' | 'enum';

export interface TypeInfo {
  /** Without leading dot, e.g. `acme.orders.v1.Order.Line`. */
  fullName: string;
  kind: TypeKind;
  /** Path in this file; undefined for imported types. */
  path?: ProtoPath;
  /** Import providing the type. */
  importPath?: string;
}

/** What the extension host found for one import of the file. */
export interface ProtoImportInfo {
  path: string;
  /** Workspace-relative path of the file found for this import. */
  resolved?: string;
  wellKnown?: boolean;
  types: { fullName: string; kind: TypeKind }[];
}

export const SCALAR_TYPES = ['string', 'bool', 'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64', 'double', 'float', 'bytes'];
export const MAP_KEY_TYPES = ['string', 'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64', 'bool'];
export const MAX_FIELD_NUMBER = 536870911;

const message = (name: string) => ({ fullName: `google.protobuf.${name}`, kind: 'message' as const });
const enumType = (name: string) => ({ fullName: `google.protobuf.${name}`, kind: 'enum' as const });

/** Types of the well-known files shipped with protoc. */
export const WELL_KNOWN_IMPORTS: Record<string, { fullName: string; kind: TypeKind }[]> = {
  'google/protobuf/any.proto': [message('Any')],
  'google/protobuf/api.proto': [message('Api'), message('Method'), message('Mixin')],
  'google/protobuf/duration.proto': [message('Duration')],
  'google/protobuf/empty.proto': [message('Empty')],
  'google/protobuf/field_mask.proto': [message('FieldMask')],
  'google/protobuf/source_context.proto': [message('SourceContext')],
  'google/protobuf/struct.proto': [message('Struct'), message('Value'), message('ListValue'), enumType('NullValue')],
  'google/protobuf/timestamp.proto': [message('Timestamp')],
  'google/protobuf/type.proto': [message('Type'), message('Field'), enumType('Field.Kind'), enumType('Field.Cardinality'), message('Enum'), message('EnumValue'), message('Option'), enumType('Syntax')],
  'google/protobuf/wrappers.proto': ['DoubleValue', 'FloatValue', 'Int64Value', 'UInt64Value', 'Int32Value', 'UInt32Value', 'BoolValue', 'StringValue', 'BytesValue'].map(message),
  'google/protobuf/descriptor.proto': ['FileOptions', 'MessageOptions', 'FieldOptions', 'OneofOptions', 'EnumOptions', 'EnumValueOptions', 'ServiceOptions', 'MethodOptions'].map(message),
};

/** Import infos for every import of the file; well-known imports are filled in when the host did not. */
export function importInfos(file: ProtoFile, fromHost: ProtoImportInfo[] = []): ProtoImportInfo[] {
  return file.imports.map((i) => {
    const known = fromHost.find((h) => h.path === i.path);
    if (known) return known;
    const wellKnown = WELL_KNOWN_IMPORTS[i.path];
    return wellKnown ? { path: i.path, wellKnown: true, types: wellKnown } : { path: i.path, types: [] };
  });
}

// ---------------------------------------------------------------------------
// Walking the file

export interface MessageEntry {
  path: ProtoPath;
  fullName: string;
  node: ProtoMessage;
  parent?: ProtoMessage;
}

export interface EnumEntry {
  path: ProtoPath;
  fullName: string;
  node: ProtoEnum;
  parent?: ProtoMessage;
}

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('.');

export function listMessages(file: ProtoFile): MessageEntry[] {
  const result: MessageEntry[] = [];
  const visit = (messages: ProtoMessage[], path: ProtoPath, scope: string, parent?: ProtoMessage) => {
    for (const m of messages) {
      const entry = { path: [...path, `message:${m.name}`], fullName: join(scope, m.name), node: m, parent };
      result.push(entry);
      visit(m.messages, entry.path, entry.fullName, m);
    }
  };
  visit(file.messages, [], file.package?.name ?? '');
  return result;
}

export function listEnums(file: ProtoFile): EnumEntry[] {
  const result: EnumEntry[] = file.enums.map((e) => ({ path: [`enum:${e.name}`], fullName: join(file.package?.name, e.name), node: e }));
  for (const m of listMessages(file)) {
    for (const e of m.node.enums) result.push({ path: [...m.path, `enum:${e.name}`], fullName: join(m.fullName, e.name), node: e, parent: m.node });
  }
  return result;
}

export function findMessage(file: ProtoFile, path: ProtoPath): MessageEntry | undefined {
  const key = JSON.stringify(path);
  return listMessages(file).find((m) => JSON.stringify(m.path) === key);
}

export function findEnum(file: ProtoFile, path: ProtoPath): EnumEntry | undefined {
  const key = JSON.stringify(path);
  return listEnums(file).find((e) => JSON.stringify(e.path) === key);
}

/** Every type visible from the file: its own and those of its imports. */
export function knownTypes(file: ProtoFile, imports: ProtoImportInfo[]): Map<string, TypeInfo> {
  const types = new Map<string, TypeInfo>();
  for (const i of imports) for (const t of i.types) types.set(t.fullName, { ...t, importPath: i.path });
  for (const m of listMessages(file)) types.set(m.fullName, { fullName: m.fullName, kind: 'message', path: m.path });
  for (const e of listEnums(file)) types.set(e.fullName, { fullName: e.fullName, kind: 'enum', path: e.path });
  return types;
}

/** Resolves a type reference the way protoc does: from the innermost scope outwards. */
export function resolveType(ref: string, scope: string, types: Map<string, TypeInfo>): TypeInfo | undefined {
  if (ref.startsWith('.')) return types.get(ref.slice(1));
  const parts = scope ? scope.split('.') : [];
  for (let i = parts.length; i >= 0; i--) {
    const found = types.get([...parts.slice(0, i), ref].join('.'));
    if (found) return found;
  }
  return undefined;
}

/** Shortest reference to a type that resolves to it from a scope, e.g. `Order.Line` or `google.protobuf.Timestamp`. */
export function typeReference(fullName: string, scope: string, types: Map<string, TypeInfo>): string {
  const parts = fullName.split('.');
  for (let k = 1; k <= parts.length; k++) {
    const candidate = parts.slice(-k).join('.');
    if (resolveType(candidate, scope, types)?.fullName === fullName) return candidate;
  }
  return `.${fullName}`;
}

export const isScalar = (type: string) => SCALAR_TYPES.includes(type);

/** Scope used to resolve the types of a message's fields. */
export const scopeOf = (entry: MessageEntry) => entry.fullName;

export interface FieldEntry {
  path: ProtoPath;
  message: MessageEntry;
  field: ProtoField;
}

function allFields(file: ProtoFile): FieldEntry[] {
  return listMessages(file).flatMap((message) => message.node.fields.map((field) => ({ path: [...message.path, `field:${field.name}`], message, field })));
}

/** Type names used by a field: the type itself, or the key and value of a map. */
const fieldTypeRefs = (field: ProtoField) => (field.kind === 'map' ? [field.mapValue!] : field.kind === 'group' ? [] : [field.type]).filter((t) => !isScalar(t));

// ---------------------------------------------------------------------------
// Renames and usages

function renamedRef(ref: string, resolvedFullName: string, oldFullName: string, newName: string): string {
  const leadingDot = ref.startsWith('.');
  const refParts = ref.replace(/^\./, '').split('.');
  const fullParts = resolvedFullName.split('.');
  const index = oldFullName.split('.').length - 1 - (fullParts.length - refParts.length);
  if (index < 0) return ref;
  refParts[index] = newName;
  return (leadingDot ? '.' : '') + refParts.join('.');
}

function typeFullName(file: ProtoFile, path: ProtoPath): string {
  return join(file.package?.name, ...path.map((segment) => segment.slice(segment.indexOf(':') + 1)));
}

/** Renames a message or enum and updates every reference to it (or to its nested types) in the file. */
export function renameTypeEdits(file: ProtoFile, path: ProtoPath, newName: string, imports: ProtoImportInfo[] = []): ProtoEdit[] {
  const types = knownTypes(file, imports);
  const oldFullName = typeFullName(file, path);
  const affected = (resolved: TypeInfo | undefined) => !!resolved && (resolved.fullName === oldFullName || resolved.fullName.startsWith(`${oldFullName}.`));
  const edits: ProtoEdit[] = [];

  for (const { path: fieldPath, message, field } of allFields(file)) {
    for (const ref of fieldTypeRefs(field)) {
      const resolved = resolveType(ref, message.fullName, types);
      if (!affected(resolved)) continue;
      const next = renamedRef(ref, resolved!.fullName, oldFullName, newName);
      if (next === ref) continue;
      edits.push({ op: 'setType', target: fieldPath, type: field.kind === 'map' ? `map<${field.mapKey}, ${next}>` : next });
    }
  }
  for (const service of file.services) {
    for (const rpc of service.rpcs) {
      for (const side of ['request', 'response'] as const) {
        const ref = rpc[side].type;
        const resolved = resolveType(ref, file.package?.name ?? '', types);
        if (!affected(resolved)) continue;
        const next = renamedRef(ref, resolved!.fullName, oldFullName, newName);
        if (next !== ref) edits.push({ op: 'setRpcSide', target: [`service:${service.name}`, `rpc:${rpc.name}`], side, type: next, stream: rpc[side].stream });
      }
    }
  }
  edits.push({ op: 'rename', target: path, name: newName });
  return edits;
}

export interface Usage {
  label: string;
  location: ProtoLocation;
}

/** Fields and rpcs using a type. */
export function typeUsages(file: ProtoFile, fullName: string, imports: ProtoImportInfo[]): Usage[] {
  const types = knownTypes(file, imports);
  const usages: Usage[] = [];
  for (const { message, field } of allFields(file)) {
    if (fieldTypeRefs(field).some((ref) => resolveType(ref, message.fullName, types)?.fullName === fullName)) {
      usages.push({ label: `${message.fullName.slice((file.package?.name.length ?? -1) + 1)}.${field.name}`, location: { kind: 'message', path: message.path } });
    }
  }
  for (const service of file.services) {
    for (const rpc of service.rpcs) {
      const sides = (['request', 'response'] as const).filter((side) => resolveType(rpc[side].type, file.package?.name ?? '', types)?.fullName === fullName);
      if (sides.length) usages.push({ label: `${service.name}.${rpc.name} (${sides.join(' and ')})`, location: { kind: 'rpc', service: service.name, name: rpc.name } });
    }
  }
  return usages;
}

// ---------------------------------------------------------------------------
// Numbers and names

function parseRanges(reserved: ProtoReserved[]): [number, number][] {
  return reserved
    .filter((r) => r.kind === 'numbers')
    .flatMap((r) => r.items)
    .map((item) => {
      const [from, to] = item.split(/\s+to\s+/);
      return [Number(from), to === undefined ? Number(from) : to === 'max' ? MAX_FIELD_NUMBER : Number(to)];
    });
}

const inRanges = (n: number, ranges: [number, number][]) => ranges.some(([a, b]) => n >= a && n <= b);

/** First free field number after the highest one used or reserved. */
export function nextFieldNumber(message: ProtoMessage): number {
  const ranges = parseRanges(message.reserved);
  const bounded = ranges.filter(([, to]) => to < MAX_FIELD_NUMBER);
  let n = Math.max(0, ...message.fields.map((f) => f.number), ...bounded.map(([, to]) => to)) + 1;
  while (n < MAX_FIELD_NUMBER && (inRanges(n, ranges) || (n >= 19000 && n <= 19999))) n++;
  return n;
}

export function nextEnumNumber(enumNode: ProtoEnum): number {
  if (!enumNode.values.length) return 0;
  let n = Math.max(...enumNode.values.map((v) => v.number)) + 1;
  while (inRanges(n, parseRanges(enumNode.reserved))) n++;
  return n;
}

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const TYPE_REFERENCE = /^\.?[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
export const PACKAGE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export function identifierError(name: string, taken: string[]): string | undefined {
  if (!IDENTIFIER.test(name)) return 'Letters, digits and _ only, not starting with a digit';
  if (taken.includes(name)) return 'Already used';
  return undefined;
}

/** "Order line" -> "OrderLine" */
export function toPascalCase(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/** "OrderLine" -> "order_line" */
export function toSnakeCase(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .join('_');
}

/** "Order status" -> "ORDER_STATUS" */
export const toUpperSnakeCase = (text: string) => toSnakeCase(text).toUpperCase();

/** "orders" -> "orders2" when taken. */
export function uniqueName(base: string, taken: string[], separator = ''): string {
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}${separator}${i}`;
  return name;
}

/** Names declared in a message scope: fields, oneofs, nested types and values of nested enums. */
export function namesInMessage(message: ProtoMessage): string[] {
  return [...message.fields.map((f) => f.name), ...message.oneofs.map((o) => o.name), ...message.messages.map((m) => m.name), ...message.enums.flatMap((e) => [e.name, ...e.values.map((v) => v.name)])];
}

/** Names declared at the top of the file. */
export function topLevelNames(file: ProtoFile): string[] {
  return [...file.messages.map((m) => m.name), ...file.enums.flatMap((e) => [e.name, ...e.values.map((v) => v.name)]), ...file.services.map((s) => s.name)];
}

export const optionValue = (options: { name: string; value: string }[], name: string) => options.find((o) => o.name === name)?.value;
export const isTrueOption = (options: { name: string; value: string }[], name: string) => optionValue(options, name) === 'true';

// ---------------------------------------------------------------------------
// Checks

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function duplicates<T>(items: T[], key: (item: T) => string | number): Map<string | number, T[]> {
  const groups = new Map<string | number, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return new Map([...groups].filter(([, list]) => list.length > 1));
}

function checkReserved(reserved: ProtoReserved[], members: { name: string; number: number }[], what: string, add: (message: string) => void) {
  const ranges = parseRanges(reserved);
  const names = reserved.filter((r) => r.kind === 'names').flatMap((r) => r.items);
  for (const m of members) {
    if (inRanges(m.number, ranges)) add(`${what} ${m.name} uses the reserved number ${m.number}`);
    if (names.includes(m.name)) add(`${what} name ${m.name} is reserved`);
  }
}

/** Problems protoc would report (or that usually are mistakes), attached to the page to fix them on. */
export function analyzeProto(file: ProtoFile, imports: ProtoImportInfo[]): ProtoIssue[] {
  const issues: ProtoIssue[] = [];
  const types = knownTypes(file, imports);
  const allImportsKnown = imports.every((i) => i.wellKnown || i.resolved);
  const syntax = file.syntax?.keyword === 'edition' ? 'editions' : (file.syntax?.value ?? 'proto2');
  const general: ProtoLocation = { kind: 'general' };

  if (!file.syntax) issues.push({ severity: 'warning', message: 'No syntax declared: protoc treats the file as proto2', location: general });
  else if (file.syntax.keyword === 'syntax' && !['proto2', 'proto3'].includes(file.syntax.value)) {
    issues.push({ severity: 'error', message: `Unknown syntax "${file.syntax.value}" (proto2 or proto3)`, location: general });
  }
  if (!file.package) issues.push({ severity: 'warning', message: 'No package: type names may clash with other files', location: general });
  for (const [path] of duplicates(file.imports, (i) => i.path)) issues.push({ severity: 'warning', message: `"${path}" is imported twice`, location: general });

  const checkType = (ref: string, scope: string, where: string, location: ProtoLocation, expect?: TypeKind) => {
    if (isScalar(ref)) {
      if (expect === 'message') issues.push({ severity: 'error', message: `${where}: ${ref} is not a message`, location });
      return;
    }
    const resolved = resolveType(ref, scope, types);
    if (!resolved) {
      if (allImportsKnown) issues.push({ severity: 'error', message: `${where}: unknown type ${ref}${imports.length ? '' : ' (missing import?)'}`, location });
    } else if (expect && resolved.kind !== expect) {
      issues.push({ severity: 'error', message: `${where}: ${ref} is an enum, a message is expected`, location });
    }
  };

  const checkNames = (names: string[], scope: string, location: ProtoLocation) => {
    for (const [name] of duplicates(names, (n) => n)) issues.push({ severity: 'error', message: `"${name}" is defined more than once in ${scope}`, location });
  };
  checkNames(topLevelNames(file), 'the file', general);

  for (const entry of listMessages(file)) {
    const m = entry.node;
    const location: ProtoLocation = { kind: 'message', path: entry.path };
    const add = (message: string, severity: 'error' | 'warning' = 'error') => issues.push({ severity, message: `${m.name}: ${message}`, location });

    checkNames(namesInMessage(m), m.name, location);
    for (const [number, fields] of duplicates(m.fields, (f) => f.number)) add(`field number ${number} is used by ${fields.map((f) => f.name).join(' and ')}`);
    checkReserved(m.reserved, m.fields, 'field', add);
    for (const oneof of m.oneofs) if (!m.fields.some((f) => f.oneof === oneof.name)) add(`oneof ${oneof.name} has no fields`);

    for (const f of m.fields) {
      const where = `field ${f.name}`;
      if (f.number < 1 || f.number > MAX_FIELD_NUMBER) add(`${where}: number ${f.number} is out of range (1 to ${MAX_FIELD_NUMBER})`);
      else if (f.number >= 19000 && f.number <= 19999) add(`${where}: numbers 19000 to 19999 are reserved by Protocol Buffers`);
      if (f.label?.value === 'required' && syntax === 'proto3') add(`${where}: proto3 has no required fields`);
      if (f.label && f.label.value !== 'repeated' && syntax === 'editions') add(`${where}: editions don't use the ${f.label.value} label (use features.field_presence)`);
      if (f.kind === 'group' && syntax !== 'proto2') add(`${where}: groups only exist in proto2`);
      if (f.oneof && f.label) add(`${where}: fields of a oneof cannot be ${f.label.value}`);
      if (f.kind === 'map') {
        if (f.label) add(`${where}: map fields cannot be ${f.label.value}`);
        if (f.oneof) add(`${where}: map fields cannot be in a oneof`);
        if (!MAP_KEY_TYPES.includes(f.mapKey!)) add(`${where}: ${f.mapKey} cannot be a map key (integers, bool or string)`);
      }
      for (const ref of fieldTypeRefs(f)) checkType(ref, entry.fullName, `${m.name}.${f.name}`, location);
    }
  }

  for (const entry of listEnums(file)) {
    const e = entry.node;
    const location: ProtoLocation = { kind: 'enum', path: entry.path };
    const add = (message: string, severity: 'error' | 'warning' = 'error') => issues.push({ severity, message: `${e.name}: ${message}`, location });
    if (!e.values.length) add('an enum needs at least one value');
    else if (syntax !== 'proto2' && e.values[0].number !== 0) add(`the first value must be 0 in ${syntax}`);
    const aliases = duplicates(e.values, (v) => v.number);
    const allowAlias = isTrueOption(e.options, 'allow_alias');
    if (!allowAlias) for (const [number, values] of aliases) add(`number ${number} is used by ${values.map((v) => v.name).join(' and ')} (set allow_alias to share it)`);
    else if (!aliases.size) add('allow_alias is set but no values share a number', 'warning');
    checkReserved(e.reserved, e.values, 'value', add);
  }

  for (const service of file.services) {
    const location: ProtoLocation = { kind: 'service', name: service.name };
    for (const [name] of duplicates(service.rpcs, (r) => r.name)) issues.push({ severity: 'error', message: `${service.name}: rpc ${name} is defined more than once`, location });
    for (const rpc of service.rpcs) {
      const rpcLocation: ProtoLocation = { kind: 'rpc', service: service.name, name: rpc.name };
      checkType(rpc.request.type, file.package?.name ?? '', `${rpc.name} request`, rpcLocation, 'message');
      checkType(rpc.response.type, file.package?.name ?? '', `${rpc.name} response`, rpcLocation, 'message');
    }
  }
  return issues;
}

/** One-line description of an rpc: `CreateOrder(CreateOrderRequest) → Order`. */
export function rpcSignature(rpc: ProtoRpc): string {
  const side = (s: ProtoRpc['request']) => `${s.stream ? 'stream ' : ''}${s.type}`;
  return `(${side(rpc.request)}) → ${side(rpc.response)}`;
}

export function streamingKind(rpc: ProtoRpc): 'unary' | 'server' | 'client' | 'bidi' {
  if (rpc.request.stream && rpc.response.stream) return 'bidi';
  if (rpc.request.stream) return 'client';
  if (rpc.response.stream) return 'server';
  return 'unary';
}

export const STREAMING_LABELS = {
  unary: 'Unary: one request, one response',
  server: 'Server streaming: one request, a stream of responses',
  client: 'Client streaming: a stream of requests, one response',
  bidi: 'Bidirectional streaming: both sides stream',
};

export function countRpcs(services: ProtoService[]): number {
  return services.reduce((n, s) => n + s.rpcs.length, 0);
}

export { plural };

/** Starter file for a new service, e.g. "Order service". */
export function newProtoTemplate(name: string): string {
  const words = name.trim().split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  const core = words.length > 1 && /^(service|api)$/i.test(words[words.length - 1]) ? words.slice(0, -1) : words;
  const base = toPascalCase(core.join(' ')) || 'My';
  const pkg = `${toSnakeCase(core.join(' ')).replace(/^(\d)/, '_$1') || 'my'}.v1`;
  return `syntax = "proto3";

package ${pkg};

// ${name.trim() || `${base} service`}
service ${base}Service {
  // Returns the ${base} with the given id.
  rpc Get${base}(Get${base}Request) returns (${base});
}

message Get${base}Request {
  string id = 1;
}

message ${base} {
  string id = 1;
  string name = 2;
}
`;
}
