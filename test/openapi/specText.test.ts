import { describe, expect, it } from 'vitest';
import { applyEditsToValue, type SpecEdit } from '../../src/shared/structured/edits';
import { applySpecEdits, parseSpec, type SpecFormat } from '../../src/shared/structured/specText';

const YAML = `# Pet store API
openapi: 3.0.3
info:
  title: Petstore # the name shown in docs
  version: '1.0.0'
  description: |
    Multi-line
    description
paths:
  /pets:
    get:
      summary: List pets
      tags:
        - pets
      responses:
        200:
          description: A list of pets

        default:
          description: Error
components:
  schemas:
    Pet:
      type: object
      required: [ id ]
      properties:
        id: { type: integer }
`;

const JSON_SPEC = `{
    "openapi": "3.1.0",
    "info": { "title": "Petstore", "version": "1.0.0" },
    "paths": {
        "/pets": {
            "get": {
                "responses": { "200": { "description": "ok" } }
            }
        }
    }
}
`;

function check(text: string, format: SpecFormat, edits: SpecEdit[]) {
  const before = parseSpec(text, format);
  if (!before.ok) throw new Error('invalid fixture');
  const output = applySpecEdits(text, format, edits);
  const after = parseSpec(output, format);
  if (!after.ok) throw new Error('edit produced invalid text:\n' + output);
  expect(after.value).toEqual(applyEditsToValue(before.value, edits));
  return output;
}

describe('YAML specs', () => {
  it('round-trips without formatting drift', () => {
    const result = parseSpec(YAML, 'yaml');
    expect(result.ok && result.formattingDrift).toBe(false);
  });

  it('edits scalars in place, keeping comments, quotes and blank lines', () => {
    const out = check(YAML, 'yaml', [
      { op: 'set', path: ['info', 'title'], value: 'Pet Store' },
      { op: 'set', path: ['info', 'version'], value: '2.0.0' },
    ]);
    expect(out).toBe(YAML.replace('title: Petstore', 'title: Pet Store').replace("'1.0.0'", "'2.0.0'"));
  });

  it('matches numeric response codes and follows their style for new codes', () => {
    const out = check(YAML, 'yaml', [
      { op: 'set', path: ['paths', '/pets', 'get', 'responses', '200', 'description'], value: 'Pets' },
      { op: 'set', path: ['paths', '/pets', 'get', 'responses', '404'], value: { description: 'Not found' } },
    ]);
    expect(out).toContain('        200:\n          description: Pets');
    expect(out).toContain('        404:\n          description: Not found');
  });

  it('renames keys in place and deletes entries', () => {
    const out = check(YAML, 'yaml', [
      { op: 'renameKey', path: ['paths', '/pets'], newKey: '/animals' },
      { op: 'delete', path: ['paths', '/animals', 'get', 'tags', 0] },
      { op: 'set', path: ['paths', '/animals', 'post'], value: { summary: 'Add', responses: { '201': { description: 'Created' } } } },
      { op: 'delete', path: ['components'] },
    ]);
    expect(out).toContain('# Pet store API');
    expect(out).toContain('title: Petstore # the name shown in docs');
    expect(out.indexOf('/animals')).toBeLessThan(out.indexOf('post:'));
  });

  it('creates missing parents and appends to lists', () => {
    check(YAML, 'yaml', [
      { op: 'set', path: ['servers'], value: [{ url: 'https://api.example.com' }] },
      { op: 'set', path: ['servers', 1], value: { url: 'https://staging.example.com' } },
      { op: 'set', path: ['components', 'schemas', 'Pet', 'required', 1], value: 'name' },
      { op: 'set', path: ['x-new', 'nested', 'deep'], value: true },
    ]);
  });

  it('keeps inline lists inline and expands empty inline maps that receive content', () => {
    const out = check(YAML, 'yaml', [
      { op: 'set', path: ['components', 'schemas', 'Pet', 'required'], value: ['id', 'name'] },
      { op: 'set', path: ['paths', '/orders'], value: {} },
      { op: 'set', path: ['paths', '/orders', 'get'], value: { responses: { '200': { description: 'OK' } } } },
    ]);
    expect(out).toContain('required: [ id, name ]');
    expect(out).toContain('  /orders:\n    get:\n      responses:\n');
  });

  it('quotes new strings like the rest of the file', () => {
    const single = check("a: '1'\nb: 'x'\n", 'yaml', [{ op: 'set', path: ['ref'], value: '#/components/schemas/Pet' }]);
    expect(single).toContain("ref: '#/components/schemas/Pet'");
    const double = check('a: "1"\n', 'yaml', [{ op: 'set', path: ['ref'], value: '#/components/schemas/Pet' }]);
    expect(double).toContain('ref: "#/components/schemas/Pet"');
  });

  it('fills empty values without losing the blank line after them or keeping needless quotes', () => {
    const text = 'a:\n  - id: x\n    list:\n\n  - id: y\n    name:\nb: 1\n';
    expect(check(text, 'yaml', [{ op: 'set', path: ['a', 0, 'list'], value: ['one'] }])).toBe('a:\n  - id: x\n    list:\n      - one\n\n  - id: y\n    name:\nb: 1\n');
    expect(check(text, 'yaml', [{ op: 'set', path: ['a', 0, 'list'], value: 'set' }])).toBe('a:\n  - id: x\n    list: set\n\n  - id: y\n    name:\nb: 1\n');
    const empty = check('title: ""\nother: ""\n', 'yaml', [{ op: 'set', path: ['title'], value: 'Pets' }]);
    expect(empty).toBe('title: Pets\nother: ""\n');
    expect(check(empty, 'yaml', [{ op: 'set', path: ['other'], value: 'a: b' }])).toBe('title: Pets\nother: "a: b"\n');
  });

  it('starts an empty file', () => {
    expect(check('', 'yaml', [{ op: 'set', path: ['openapi'], value: '3.0.3' }])).toBe('openapi: 3.0.3\n');
  });

  it('reports syntax errors with lines', () => {
    const result = parseSpec('openapi: 3.0.0\ninfo:\n  title: [unclosed\n', 'yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].line).toBeGreaterThan(0);
  });
});

describe('JSON specs', () => {
  it('applies minimal edits keeping the indentation', () => {
    const out = check(JSON_SPEC, 'json', [
      { op: 'set', path: ['info', 'title'], value: 'Pet Store' },
      { op: 'set', path: ['paths', '/pets', 'get', 'summary'], value: 'List' },
    ]);
    expect(out).toContain('"info": { "title": "Pet Store", "version": "1.0.0" }');
    expect(out).toContain('            "get": {\n                "responses"');
  });

  it('renames keys, appends to arrays and deletes', () => {
    check(JSON_SPEC, 'json', [
      { op: 'renameKey', path: ['paths', '/pets'], newKey: '/pets/{id}' },
      { op: 'set', path: ['tags'], value: [{ name: 'a' }] },
      { op: 'set', path: ['tags', 1], value: { name: 'b' } },
      { op: 'delete', path: ['tags', 0] },
      { op: 'delete', path: ['paths', '/pets/{id}', 'get', 'responses', '200'] },
    ]);
  });

  it('writes inside null values', () => {
    const text = '{\n  "info": null,\n  "list": null\n}\n';
    expect(JSON.parse(check(text, 'json', [{ op: 'set', path: ['info', 'title'], value: 'A' }, { op: 'set', path: ['list', 0], value: 1 }]))).toEqual({ info: { title: 'A' }, list: [1] });
  });

  it('accepts comments and trailing commas', () => {
    const result = parseSpec('{\n  // comment\n  "openapi": "3.0.0",\n}\n', 'json');
    expect(result.ok && result.value).toEqual({ openapi: '3.0.0' });
  });
});
