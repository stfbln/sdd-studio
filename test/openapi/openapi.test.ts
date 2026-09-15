import { describe, expect, it } from 'vitest';
import { applyEditsToValue } from '../../src/shared/structured/edits';
import {
  analyzeSpec,
  isNullable,
  isSupportedSpec,
  listOperations,
  newSpecTemplate,
  pathTemplateError,
  pathTemplateParameters,
  renameSchemaEdits,
  schemaKind,
  schemaUsages,
  suggestOperationId,
} from '../../src/modules/openapi/core/openapi';
import { parseSpec } from '../../src/shared/structured/specText';

const spec = {
  openapi: '3.0.3',
  info: { title: 'Shop', version: '1' },
  paths: {
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getPet',
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
      delete: { operationId: 'getPet', responses: {} },
    },
    '/orders/{orderId}': {
      post: {
        parameters: [{ name: 'other', in: 'path' }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: { '201': { description: 'created' } },
      },
    },
  },
  components: {
    schemas: {
      Pet: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Pet' } } },
    },
  },
};

describe('OpenAPI helpers', () => {
  it('lists operations and path template parameters', () => {
    expect(listOperations(spec).map((o) => `${o.method} ${o.path}`)).toEqual(['get /pets/{petId}', 'delete /pets/{petId}', 'post /orders/{orderId}']);
    expect(pathTemplateParameters('/a/{x}/b/{y}')).toEqual(['x', 'y']);
    expect(pathTemplateError('pets', [])).toMatch(/start/);
    expect(pathTemplateError('/pets/{id', [])).toMatch(/Unbalanced/);
    expect(pathTemplateError('/pets', ['/pets'])).toMatch(/exists/);
    expect(pathTemplateError('/pets/{id}', ['/pets'])).toBeUndefined();
  });

  it('suggests operation ids', () => {
    expect(suggestOperationId('get', '/pets/{petId}/toys')).toBe('getPetsToysByPetId');
    expect(suggestOperationId('POST', '/user-accounts')).toBe('postUserAccounts');
  });

  it('detects schema kinds and nullability', () => {
    expect(schemaKind({ $ref: '#/x' })).toBe('ref');
    expect(schemaKind({ allOf: [] })).toBe('advanced');
    expect(schemaKind({ type: ['string', 'null'] })).toBe('string');
    expect(schemaKind({ properties: {} })).toBe('object');
    expect(schemaKind({})).toBe('any');
    expect(isNullable({ type: ['integer', 'null'] })).toBe(true);
    expect(isNullable({ type: 'integer', nullable: true })).toBe(true);
  });

  it('renames a schema with all its references', () => {
    const renamed = applyEditsToValue(spec, renameSchemaEdits(spec, 'Pet', 'Animal'));
    expect(Object.keys(renamed.components.schemas)).toEqual(['Animal']);
    expect(JSON.stringify(renamed)).not.toContain('schemas/Pet');
    expect(schemaUsages(renamed, 'Animal').map((u) => u.label)).toEqual(['GET /pets/{petId} · response 200', 'Schema Animal']);
  });

  it('reports common problems', () => {
    expect(analyzeSpec(spec).map((i) => i.message)).toEqual([
      'DELETE /pets/{petId}: at least one response is required',
      'POST /orders/{orderId}: path parameter "orderId" is not declared',
      'POST /orders/{orderId}: parameter "other" is not in the path',
      'GET /pets/{petId}: operationId "getPet" is used more than once',
      'DELETE /pets/{petId}: operationId "getPet" is used more than once',
      'Reference to missing schema "Order"',
    ]);
  });

  it('creates a valid starter spec', () => {
    const result = parseSpec(newSpecTemplate('Pet "store"'), 'yaml');
    expect(result.ok && isSupportedSpec(result.value)).toBe(true);
    expect(result.ok && analyzeSpec(result.value)).toEqual([]);
  });
});
