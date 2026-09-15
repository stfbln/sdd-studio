import { getIn, isObject, type Json, type JsonObject } from '../../../shared/structured/edits';
import { findRefs, schemaNames, schemaRef, schemaRefName } from '../../../shared/structured/jsonSchema';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const PARAMETER_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const;
export const COMMON_STATUS_CODES = ['200', '201', '202', '204', '400', '401', '403', '404', '409', '422', '500', 'default'];
export const COMMON_MEDIA_TYPES = ['application/json', 'application/xml', 'text/plain', 'multipart/form-data', 'application/x-www-form-urlencoded'];

/** What the editor is showing; also used to point problems at the right page. */
export type SpecLocation =
  | { kind: 'general' }
  | { kind: 'path'; path: string }
  | { kind: 'operation'; path: string; method: HttpMethod }
  | { kind: 'schema'; name: string };

export function openApiVersion(spec: unknown): string | undefined {
  return isObject(spec) && typeof spec.openapi === 'string' ? spec.openapi : undefined;
}

export function isSupportedSpec(spec: unknown): boolean {
  return /^3\.[01]/.test(openApiVersion(spec) ?? '');
}

export interface OperationRef {
  path: string;
  method: HttpMethod;
  operation: JsonObject;
}

export function listOperations(spec: unknown): OperationRef[] {
  const paths = getIn(spec, ['paths']);
  if (!isObject(paths)) return [];
  return Object.entries(paths).flatMap(([path, item]) =>
    isObject(item)
      ? HTTP_METHODS.filter((m) => isObject(item[m])).map((method) => ({ path, method, operation: item[method] as JsonObject }))
      : [],
  );
}

/** "/users/{id}/orders/{orderId}" -> ["id", "orderId"] */
export function pathTemplateParameters(path: string): string[] {
  return [...path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
}

export function pathTemplateError(path: string, existing: string[]): string | undefined {
  if (!path.startsWith('/')) return 'Paths must start with "/"';
  if (/\s/.test(path)) return 'Paths cannot contain spaces';
  if (path.replace(/\{[^{}/]+\}/g, '').match(/[{}]/)) return 'Unbalanced { } in path template';
  if (existing.includes(path)) return 'This path already exists';
  return undefined;
}

/** GET /pets/{petId}/toys -> getPetsToysByPetId */
export function suggestOperationId(method: string, path: string): string {
  const pascal = (s: string) =>
    s
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('');
  const segments = path.split('/').filter((s) => s && !s.startsWith('{'));
  const params = pathTemplateParameters(path);
  return method.toLowerCase() + segments.map(pascal).join('') + (params.length ? 'By' + params.map(pascal).join('And') : '');
}

/* References --------------------------------------------------------------- */

export {
  findRefs,
  FORMATS,
  isNullable,
  renameSchemaEdits,
  SCHEMA_KINDS,
  schemaForKind,
  schemaKind,
  schemaNames,
  schemaRef,
  schemaRefName,
  type SchemaKind,
} from '../../../shared/structured/jsonSchema';

const SCHEMA_REF_PREFIX = '#/components/schemas/';
const unescapePointer = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** Human readable places where a schema is referenced. */
export function schemaUsages(spec: unknown, name: string): { label: string; location: SpecLocation }[] {
  const ref = schemaRef(name);
  return findRefs(spec, (r) => r === ref).map((path) => {
    const [root, a, b] = path;
    if (root === 'paths' && typeof a === 'string' && HTTP_METHODS.includes(b as HttpMethod)) {
      const where = path.includes('requestBody') ? 'request body' : path.includes('responses') ? `response ${path[path.indexOf('responses') + 1]}` : 'parameter';
      return { label: `${String(b).toUpperCase()} ${a} · ${where}`, location: { kind: 'operation', path: a, method: b as HttpMethod } };
    }
    if (root === 'components' && a === 'schemas' && typeof b === 'string') {
      return { label: `Schema ${b}`, location: { kind: 'schema', name: b } };
    }
    return { label: path.join(' › '), location: { kind: 'general' } };
  });
}

/* Problems ----------------------------------------------------------------- */

export interface SpecIssue {
  severity: 'error' | 'warning';
  message: string;
  location: SpecLocation;
}

export function analyzeSpec(spec: unknown): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const general: SpecLocation = { kind: 'general' };
  const info = getIn(spec, ['info']);
  if (!isObject(info) || typeof info.title !== 'string' || !info.title.trim()) {
    issues.push({ severity: 'error', message: 'info.title is required', location: general });
  }
  if (!isObject(info) || info.version === undefined || String(info.version).trim() === '') {
    issues.push({ severity: 'error', message: 'info.version is required', location: general });
  }

  const operationIds = new Map<string, number>();
  for (const { path, method, operation } of listOperations(spec)) {
    const location: SpecLocation = { kind: 'operation', path, method };
    const label = `${method.toUpperCase()} ${path}`;
    if (typeof operation.operationId === 'string') {
      operationIds.set(operation.operationId, (operationIds.get(operation.operationId) ?? 0) + 1);
    }
    const responses = operation.responses;
    if (!isObject(responses) || Object.keys(responses).length === 0) {
      issues.push({ severity: 'error', message: `${label}: at least one response is required`, location });
    }
    const declared = pathParameterNames(spec, path, operation);
    for (const name of pathTemplateParameters(path)) {
      if (!declared.includes(name)) issues.push({ severity: 'error', message: `${label}: path parameter "${name}" is not declared`, location });
    }
    for (const name of declared) {
      if (!pathTemplateParameters(path).includes(name)) {
        issues.push({ severity: 'warning', message: `${label}: parameter "${name}" is not in the path`, location });
      }
    }
  }
  for (const { path, method, operation } of listOperations(spec)) {
    if (typeof operation.operationId === 'string' && (operationIds.get(operation.operationId) ?? 0) > 1) {
      issues.push({
        severity: 'error',
        message: `${method.toUpperCase()} ${path}: operationId "${operation.operationId}" is used more than once`,
        location: { kind: 'operation', path, method },
      });
    }
  }

  const names = schemaNames(spec);
  for (const refPath of findRefs(spec, (r) => r.startsWith(SCHEMA_REF_PREFIX))) {
    const name = schemaRefName(getIn(spec, refPath));
    if (name === undefined || names.includes(name)) continue;
    const [root, a, b] = refPath;
    const location: SpecLocation =
      root === 'paths' && HTTP_METHODS.includes(b as HttpMethod)
        ? { kind: 'operation', path: String(a), method: b as HttpMethod }
        : root === 'components' && a === 'schemas'
          ? { kind: 'schema', name: String(b) }
          : general;
    issues.push({ severity: 'error', message: `Reference to missing schema "${name}"`, location });
  }
  return issues;
}

/** Names of `in: path` parameters declared on the operation or on its path item. */
export function pathParameterNames(spec: unknown, path: string, operation: JsonObject): string[] {
  const resolve = (p: Json): Json => {
    if (isObject(p) && typeof p.$ref === 'string' && p.$ref.startsWith('#/components/parameters/')) {
      return getIn(spec, ['components', 'parameters', unescapePointer(p.$ref.split('/').pop()!)]) as Json;
    }
    return p;
  };
  const all = [
    ...(Array.isArray(getIn(spec, ['paths', path, 'parameters'])) ? (getIn(spec, ['paths', path, 'parameters']) as Json[]) : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ].map(resolve);
  return all.filter((p): p is JsonObject => isObject(p) && p.in === 'path' && typeof p.name === 'string').map((p) => p.name as string);
}

export function newSpecTemplate(title: string, format: 'yaml' | 'json' = 'yaml'): string {
  if (format === 'json') {
    const spec = { openapi: '3.0.3', info: { title: title.trim(), version: '1.0.0' }, paths: {}, components: { schemas: {} } };
    return JSON.stringify(spec, null, 2) + '\n';
  }
  return `openapi: 3.0.3
info:
  title: ${JSON.stringify(title.trim())}
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /health:
    get:
      summary: Health check
      operationId: getHealth
      responses:
        '200':
          description: The service is up
components:
  schemas: {}
`;
}
