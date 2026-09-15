/**
 * JSON Schema and `$ref` helpers shared by the API modules (OpenAPI, AsyncAPI).
 * Both keep reusable schemas under `components.schemas`.
 */
import { isObject, type JsonObject, type SpecEdit, type SpecPath } from './edits';

const escapePointer = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const unescapePointer = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** Local reference to a document path: ["components", "schemas", "Pet"] -> "#/components/schemas/Pet". */
export const localRef = (path: string[]) => '#/' + path.map(escapePointer).join('/');

/** Name of the entry a local reference points to, when it is directly under `prefix` (e.g. components/schemas). */
export function refName(ref: unknown, prefix: string[]): string | undefined {
  const start = localRef(prefix) + '/';
  if (typeof ref !== 'string' || !ref.startsWith(start)) return undefined;
  const rest = ref.slice(start.length);
  return rest.includes('/') ? undefined : unescapePointer(rest);
}

/** Path segments of a local reference ("#/a/b~1c" -> ["a", "b/c"]), undefined for external ones. */
export function refPath(ref: unknown): string[] | undefined {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').map(unescapePointer);
}

const SCHEMAS = ['components', 'schemas'];
export const schemaRef = (name: string) => localRef([...SCHEMAS, name]);
export const schemaRefName = (ref: unknown) => refName(ref, SCHEMAS);

export function keysAt(spec: unknown, path: string[]): string[] {
  let node: unknown = spec;
  for (const segment of path) node = isObject(node) ? node[segment] : undefined;
  return isObject(node) ? Object.keys(node) : [];
}

export const schemaNames = (spec: unknown) => keysAt(spec, SCHEMAS);

/** Paths of every `$ref` string in the document (pointing to the `$ref` key itself). */
export function findRefs(spec: unknown, predicate: (ref: string) => boolean): SpecPath[] {
  const found: SpecPath[] = [];
  const walk = (node: unknown, path: SpecPath) => {
    if (Array.isArray(node)) node.forEach((child, i) => walk(child, [...path, i]));
    else if (isObject(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string' && predicate(value)) found.push([...path, key]);
        else walk(value, [...path, key]);
      }
    }
  };
  walk(spec, []);
  return found;
}

/**
 * Renames the entry `container/from` to `container/to` and rewrites every reference to it,
 * including references to things nested inside it ("#/channels/a/messages/m").
 */
export function renameEntryEdits(spec: unknown, container: string[], from: string, to: string): SpecEdit[] {
  const oldRef = localRef([...container, from]);
  const newRef = localRef([...container, to]);
  // References first: some live inside the renamed entry and use its old path.
  return [
    ...findRefs(spec, (r) => r === oldRef || r.startsWith(oldRef + '/')).map(
      (path): SpecEdit => ({ op: 'set', path, value: newRef + String(getRef(spec, path)).slice(oldRef.length) }),
    ),
    { op: 'renameKey', path: [...container, from], newKey: to },
  ];
}

function getRef(spec: unknown, path: SpecPath): unknown {
  let node: unknown = spec;
  for (const segment of path) node = Array.isArray(node) ? node[Number(segment)] : isObject(node) ? node[String(segment)] : undefined;
  return node;
}

export const renameSchemaEdits = (spec: unknown, from: string, to: string) => renameEntryEdits(spec, SCHEMAS, from, to);

/* Schema kinds ------------------------------------------------------------- */

export const SCHEMA_KINDS = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'ref'] as const;
export type SchemaKind = (typeof SCHEMA_KINDS)[number] | 'advanced' | 'any';
const ADVANCED_KEYWORDS = ['allOf', 'oneOf', 'anyOf', 'not'];

export function schemaKind(schema: unknown): SchemaKind {
  if (!isObject(schema)) return 'any';
  if (typeof schema.$ref === 'string') return 'ref';
  if (ADVANCED_KEYWORDS.some((k) => k in schema)) return 'advanced';
  const type = primaryType(schema);
  if (type && (SCHEMA_KINDS as readonly string[]).includes(type)) return type as SchemaKind;
  if (isObject(schema.properties)) return 'object';
  if (schema.items !== undefined) return 'array';
  return 'any';
}

function primaryType(schema: JsonObject): string | undefined {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) return schema.type.find((t): t is string => typeof t === 'string' && t !== 'null');
  return undefined;
}

/** Nullable either as OpenAPI 3.0 `nullable: true` or JSON Schema `type: [x, "null"]`. */
export function isNullable(schema: unknown): boolean {
  if (!isObject(schema)) return false;
  return schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'));
}

/** Minimal schema for a kind, keeping the description. */
export function schemaForKind(kind: (typeof SCHEMA_KINDS)[number], previous: unknown, spec: unknown): JsonObject {
  const description: JsonObject = isObject(previous) && typeof previous.description === 'string' ? { description: previous.description } : {};
  switch (kind) {
    case 'ref':
      return { $ref: schemaRef(schemaNames(spec)[0] ?? 'NewSchema') };
    case 'object':
      return { type: 'object', ...description, properties: {} };
    case 'array':
      return { type: 'array', ...description, items: { type: 'string' } };
    default:
      return { type: kind, ...description };
  }
}

export const FORMATS: Record<string, string[]> = {
  string: ['date', 'date-time', 'email', 'uuid', 'uri', 'hostname', 'ipv4', 'ipv6', 'byte', 'binary', 'password'],
  integer: ['int32', 'int64'],
  number: ['float', 'double'],
};
