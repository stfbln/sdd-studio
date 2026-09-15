import { describe, expect, it } from 'vitest';
import { summarizeFeature } from '../../src/modules/gherkin/core/summary';
import { newSpecTemplate } from '../../src/modules/openapi/core/openapi';
import { looksLikeApiSpec, summarizeApiSpec } from '../../src/modules/openapi/core/summary';

describe('feature summaries', () => {
  it('describes a valid feature', () => {
    const { summary, steps } = summarizeFeature(
      '@smoke\nFeature: Cart\n  Scenario Outline: add\n    Given <n> items\n\n    Examples:\n      | n |\n      | 1 |\n      | 2 |\n',
    );
    expect(summary).toEqual({ name: 'Cart', tags: ['@smoke'], details: ['1 scenario', '2 examples'] });
    expect(steps).toEqual(['<n> items']);
  });

  it('keeps the name of a broken feature and reports the error', () => {
    const { summary } = summarizeFeature('Feature: Broken\n  Scenario: x\n    Given a\nnope: here\n  | a |\n');
    expect(summary.name).toBe('Broken');
    expect(summary.error).toMatch(/^Line 4: /);
  });
});

describe('API spec summaries', () => {
  it('recognizes OpenAPI and Swagger documents without parsing', () => {
    expect(looksLikeApiSpec('a/orders.yaml', '# comment\nopenapi: 3.0.0\n')).toBe(true);
    expect(looksLikeApiSpec('api.json', '{\n  "swagger": "2.0"\n}')).toBe(true);
    expect(looksLikeApiSpec('package.json', '{ "name": "x" }')).toBe(false);
    expect(looksLikeApiSpec('notes.md', 'openapi: 3.0.0')).toBe(false);
  });

  it('describes a spec from the starter templates', () => {
    expect(summarizeApiSpec('orders.openapi.yaml', newSpecTemplate('Orders API')).summary).toEqual({
      name: 'Orders API',
      tags: [],
      details: ['OpenAPI 3.0.3', 'v1.0.0', '1 operation', '0 schemas'],
      problems: 0,
      warning: undefined,
    });
    expect(summarizeApiSpec('orders.openapi.json', newSpecTemplate('Orders API', 'json')).summary.details[0]).toBe('OpenAPI 3.0.3');
  });

  it('counts problems and relative references', () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: X\npaths:\n  /a:\n    get:\n      responses:\n        200:\n          $ref: ./responses.yaml#/Ok\n';
    const { summary, relativeRefs } = summarizeApiSpec('x.yaml', text);
    expect(relativeRefs).toBe(1);
    expect(summary.problems).toBe(1); // missing info.version
    expect(summary.warning).toMatch(/1 reference to other files/);
  });

  it('flags Swagger 2 and syntax errors', () => {
    expect(summarizeApiSpec('s.yaml', 'swagger: "2.0"\ninfo:\n  title: Old\n').summary).toMatchObject({ name: 'Old', error: 'Swagger 2.0: not supported by the form editor' });
    expect(summarizeApiSpec('b.yaml', 'openapi: 3.0.0\ninfo:\n  title: [unclosed\n').summary.error).toMatch(/^Line \d+: /);
  });
});
