import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asyncApiInstructions } from '../../src/modules/asyncapi/core/instructions';
import { analyzeCatalog } from '../../src/modules/backstage/core/analysis';
import { catalogInstructions } from '../../src/modules/backstage/core/instructions';
import { looksLikeCatalog } from '../../src/modules/backstage/core/summary';
import { featureInstructions } from '../../src/modules/gherkin/core/instructions';
import { parseGherkin } from '../../src/modules/gherkin/core/parse';
import { serializeGherkin } from '../../src/modules/gherkin/core/serialize';
import { openApiInstructions } from '../../src/modules/openapi/core/instructions';
import { analyzeSpec as analyzeOpenApi } from '../../src/modules/openapi/core/openapi';
import { looksLikeApiSpec } from '../../src/modules/openapi/core/summary';
import { openCliInstructions } from '../../src/modules/opencli/core/instructions';
import { analyzeOpenCli } from '../../src/modules/opencli/core/opencli';
import { looksLikeOpenCli } from '../../src/modules/opencli/core/summary';
import { otmInstructions } from '../../src/modules/otm/core/instructions';
import { protoInstructions } from '../../src/modules/proto/core/instructions';
import { parseProto } from '../../src/modules/proto/core/parse';
import { applySpecEdits as applyMarkdownEdits } from '../../src/modules/spec/core/edits';
import { specInstructions } from '../../src/modules/spec/core/instructions';
import { parseSpecMarkdown } from '../../src/modules/spec/core/parse';
import { hasInstructions, refreshInstructions, renderInstructions, withInstructions } from '../../src/shared/instructions';
import { parseSpec, applySpecEdits } from '../../src/shared/structured/specText';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const sample = (path: string) => readFileSync(join(__dirname, '../../samples', path), 'utf8');
const value = (text: string, format: 'yaml' | 'json' = 'yaml') => {
  const result = parseSpec(text, format);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

describe('update instructions', () => {
  it('writes a schema modeline and rules above YAML specs, once', () => {
    const text = 'openapi: 3.0.3\ninfo:\n  title: Orders\n  version: 1.0.0\npaths: {}\n';
    const once = withInstructions(text, openApiInstructions('orders.openapi.yaml', text));
    expect(once.startsWith('# yaml-language-server: $schema=https://spec.openapis.org/oas/3.0/schema/2024-10-18\n# How to update this file (for people and AI assistants): an OpenAPI 3.0 document, see\n#   https://spec.openapis.org/oas/v3.0.4.html.\n# - Purpose: The contract of an HTTP API. What belongs in other files:\n#   - Owner, lifecycle')).toBe(true);
    expect(once.endsWith(`\n# - Keep this header and the existing comments.\n\n${text}`)).toBe(true);
    expect(once.split('\n').every((line) => line.length <= 100 || !line.slice(0, 100).includes(' ', 60))).toBe(true);
    expect(withInstructions(once, openApiInstructions('orders.openapi.yaml', once))).toBe(once);
    expect(value(once)).toEqual(value(text));
    expect(looksLikeApiSpec('orders.openapi.yaml', once)).toBe(true);
  });

  it('keeps the header through form edits and follows a version change', () => {
    const text = withInstructions(sample('api/petstore.openapi.yaml'), openApiInstructions('petstore.openapi.yaml', sample('api/petstore.openapi.yaml')));
    expect(text).toContain('# - Keep this header and the existing comments.\n\n# Sample specification for the SDD OpenAPI form editor.\nopenapi: 3.0.3\n');
    const edited = applySpecEdits(text, 'yaml', [{ op: 'set', path: ['openapi'], value: '3.1.0' }]);
    expect(edited.startsWith(text.slice(0, text.indexOf('openapi: 3.0.3')))).toBe(true);
    const refreshed = refreshInstructions(edited, openApiInstructions('petstore.openapi.yaml', edited));
    expect(refreshed).toContain('$schema=https://spec.openapis.org/oas/3.1/schema/2025-09-15\n');
    expect(refreshed).toContain('an OpenAPI 3.1 document');
    expect(refreshed.match(/yaml-language-server/g)).toHaveLength(1);
    expect(analyzeOpenApi(value(refreshed))).toEqual(analyzeOpenApi(value(edited)));
    // Files without a header are left as they are.
    const plain = sample('api/order-events.asyncapi.yaml');
    expect(refreshInstructions(plain, asyncApiInstructions('x.yaml', plain))).toBe(plain);
  });

  it('links JSON files to their schema with a property allowed by the format', () => {
    const openapi = '{\n  "openapi": "3.1.0",\n  "info": { "title": "A", "version": "1" }\n}\n';
    const withSchema = withInstructions(openapi, openApiInstructions('a.openapi.json', openapi));
    expect(withSchema).toBe('{\n  "x-json-schema": "https://spec.openapis.org/oas/3.1/schema/2025-09-15",\n  "openapi": "3.1.0",\n  "info": { "title": "A", "version": "1" }\n}\n');
    expect(analyzeOpenApi(value(withSchema, 'json'))).toEqual(analyzeOpenApi(value(openapi, 'json')));
    expect(renderInstructions(openApiInstructions('a.openapi.json', openapi))).toBe('');

    const cli = sample('cli/todo.opencli.json');
    const cliText = withInstructions(cli, openCliInstructions('todo.opencli.json'));
    expect(cliText.startsWith('{\n  "$schema": "https://opencli.org/draft.json",\n  "opencli": "0.1",')).toBe(true);
    expect(hasInstructions(cliText, openCliInstructions('todo.opencli.json'))).toBe(true);
    expect(looksLikeOpenCli('todo.opencli.json', cliText)).toBe(true);
    expect(analyzeOpenCli(value(cliText, 'json'))).toEqual(analyzeOpenCli(value(cli, 'json')));

    const otm = '{"otmVersion": "0.2.0", "project": {"name": "A", "id": "a"}}';
    expect(JSON.parse(withInstructions(otm, otmInstructions('a.otm.json')))).toEqual({ $schema: otmInstructions('a.otm.json').schema, ...JSON.parse(otm) });
  });

  it('keeps the header of catalog files when entities change', () => {
    const catalog = sample('catalog/online-shop.catalog-info.yaml');
    const text = withInstructions(catalog, catalogInstructions());
    expect(text.indexOf('apiVersion:')).toBeLessThan(4000);
    expect(looksLikeCatalog('online-shop.catalog-info.yaml', text)).toBe(true);
    const before = parseYamlDocuments(catalog);
    const after = parseYamlDocuments(text);
    expect(after).toEqual(before);
    if (!after.ok) throw new Error('parse');
    expect(analyzeCatalog(after.value)).toEqual(analyzeCatalog(before.ok ? before.value : undefined));
    const deleted = applyYamlDocumentEdits(text, [{ op: 'delete', path: ['documents', 0] }]);
    expect(deleted.startsWith(renderInstructions(catalogInstructions()))).toBe(true);
    expect(text).toContain('#   - sdd-studio/specs and sdd-studio/threat-models annotations');
  });

  it('adds comment headers that Gherkin and Protocol Buffers parsers keep apart', () => {
    const feature = '# language: fr\nFonctionnalité: Panier\n\n  Scénario: Ajouter\n    Soit un panier vide\n';
    const withHeader = withInstructions(feature, featureInstructions());
    expect(withHeader.startsWith('# language: fr\n# How to update this file')).toBe(true);
    const parsed = parseGherkin(withHeader, () => 'id');
    if (!parsed.ok) throw new Error('parse');
    expect(parsed.document.language).toBe('fr');
    expect(serializeGherkin(parsed.document)).toBe(withHeader);
    expect(withInstructions(withHeader, featureInstructions())).toBe(withHeader);

    const proto = 'syntax = "proto3";\n\npackage a.v1;\n';
    const protoText = withInstructions(proto, protoInstructions());
    expect(protoText).toMatch(/^\/\/ How to update this file[^\n]*\n(\/\/ [^\n]*\n)+\nsyntax = "proto3";\n/);
    expect(parseProto(protoText).syntax?.comment).toBe('');
    expect(withInstructions(protoText, protoInstructions())).toBe(protoText);
  });

  it('writes an HTML comment above markdown specs that the spec form ignores', () => {
    const spec = '---\nowner: payments\n---\n# Payments\n\nTakes payments.\n\n## Requirements\n\n- The service MUST log payments.\n';
    const text = withInstructions(spec, specInstructions());
    expect(text).toMatch(/^---\nowner: payments\n---\n<!--\nHow to update this file[^\n]*\n(- |  )[\s\S]*\n-->\n\n# Payments\n/);
    expect(text.split('\n').filter((l) => l.startsWith('#'))).toEqual(['# Payments', '## Requirements']);
    const model = parseSpecMarkdown(text);
    expect(model.description.text).toBe('Takes payments.');
    expect(model.requirements?.list.items.map((i) => i.text)).toEqual(['The service MUST log payments.']);
    expect(withInstructions(text, specInstructions())).toBe(text);

    // A spec without a title gets it below the comment, and its description stays out of the comment.
    const untitled = withInstructions('Some notes.\n', specInstructions());
    expect(parseSpecMarkdown(untitled).description.text).toBe('Some notes.');
    const titled = applyMarkdownEdits(untitled, [{ op: 'setTitle', value: 'Notes' }]);
    expect(titled).toMatch(/-->\n\n?# Notes\n\nSome notes\.\n$/);

    // Windows line endings stay.
    const crlf = withInstructions('# A\r\n\r\nText.\r\n', specInstructions());
    expect(crlf.replace(/\r\n/g, '')).not.toContain('\n');
    expect(withInstructions('', specInstructions())).toBe(renderInstructions(specInstructions()));
  });
});
