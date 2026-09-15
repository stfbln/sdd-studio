import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeOpenSlo } from '../../src/modules/openslo/core/analysis';
import { appendEntityEdit, deleteEntityEdits, deleteImpact, newEntity, referencesTo, renameEntityEdits } from '../../src/modules/openslo/core/edits';
import { entitiesOf, entitiesOfKind, entityAt, entityLabel, majorVersion, namesOf } from '../../src/modules/openslo/core/model';
import { looksLikeOpenSlo, newOpenSloTemplate, summarizeOpenSlo } from '../../src/modules/openslo/core/summary';
import { applyEditsToValue, type SpecEdit } from '../../src/shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const YAML = readFileSync(join(__dirname, '../../samples/slos/checkout-service.openslo.yaml'), 'utf8');

const parse = (text: string) => {
  const result = parseYamlDocuments(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const sample = () => parse(YAML);

/** Applies edits to the text and checks the form's local copy ends up identical. */
function apply(text: string, edits: SpecEdit[]) {
  const written = applyYamlDocumentEdits(text, edits);
  expect(parse(written)).toEqual(applyEditsToValue(parse(text), edits));
  return written;
}

describe('OpenSLO detection and summary', () => {
  it('recognizes OpenSLO files', () => {
    expect(looksLikeOpenSlo('checkout.openslo.yaml', YAML)).toBe(true);
    expect(looksLikeOpenSlo('checkout.openslo.yml', YAML)).toBe(true);
    expect(looksLikeOpenSlo('notes.md', YAML)).toBe(false);
    expect(looksLikeOpenSlo('checkout.yaml', 'kind: Something\n')).toBe(false);
  });

  it('summarizes the objects of a file', () => {
    const summary = summarizeOpenSlo('checkout.openslo.yaml', YAML);
    expect(summary.name).toBe('Checkout service');
    expect(summary.details[0]).toBe('OpenSLO v1');
    expect(summary.details).toContain('1 service');
    expect(summary.details).toContain('1 SLO');
    expect(summary.details).toContain('1 SLI');
    expect(summary.problems).toBe(0);
    expect(summarizeOpenSlo('x.yaml', 'apiVersion: openslo/v1\nkind: [').error).toBeTruthy();
  });

  it('reports the major version the form editor understands', () => {
    expect(majorVersion(sample())).toBe('v1');
    expect(majorVersion(parse('apiVersion: openslo/v1alpha\nkind: Service\n'))).toBeUndefined();
  });

  it('builds a starter file with a Service and an SLO', () => {
    const template = newOpenSloTemplate('Payments');
    const spec = parse(template);
    const entities = entitiesOf(spec);
    expect(entities.map((e) => e.kind)).toEqual(['Service', 'SLO']);
    expect(entities[0].name).toBe('payments');
    expect(analyzeOpenSlo(spec).some((i) => i.severity === 'error')).toBe(false);
  });
});

describe('objects and references', () => {
  it('lists objects and finds them by kind', () => {
    const spec = sample();
    expect(entitiesOfKind(spec, 'SLO').map((e) => e.name)).toEqual(['checkout-availability']);
    expect(entitiesOfKind(spec, 'AlertCondition').map((e) => e.name)).toEqual(['checkout-fast-burn']);
    expect(entityLabel(entityAt(spec, 0)!.entity)).toBe('Checkout service');
    expect(namesOf(spec, 'Service')).toEqual(['checkout']);
  });

  it('finds references to an object across kinds', () => {
    const spec = sample();
    const service = entitiesOfKind(spec, 'Service')[0];
    const refs = referencesTo(spec, service.index);
    expect(refs).toHaveLength(1);
    expect(refs[0].field).toBe('service');

    const condition = entitiesOfKind(spec, 'AlertCondition')[0];
    expect(referencesTo(spec, condition.index).map((r) => r.field)).toEqual(['conditions']);
  });

  it('renames an object and every reference to it', () => {
    const spec = sample();
    const service = entitiesOfKind(spec, 'Service')[0];
    const edits = renameEntityEdits(spec, service.index, 'checkout-v2');
    const written = apply(YAML, edits);
    const next = parse(written);
    expect(entityAt(next, service.index)!.name).toBe('checkout-v2');
    const slo = entitiesOfKind(next, 'SLO')[0];
    expect((slo.entity.spec as { service: string }).service).toBe('checkout-v2');
  });

  it('reports what a delete would remove or break, then applies it', () => {
    const spec = sample();
    const condition = entitiesOfKind(spec, 'AlertCondition')[0];
    expect(deleteImpact(spec, condition.index)).toEqual({ removed: 1, broken: 0 });
    const written = apply(YAML, deleteEntityEdits(spec, condition.index));
    const next = parse(written);
    expect(entitiesOfKind(next, 'AlertCondition')).toHaveLength(0);
    const policy = entitiesOfKind(next, 'AlertPolicy')[0];
    expect((policy.entity.spec as { conditions: string[] }).conditions).toEqual([]);
  });

  it('appends a new object with a unique name', () => {
    const spec = sample();
    const entity = newEntity(spec, 'Service', 'checkout');
    expect(entity.metadata).toMatchObject({ name: 'checkout-2', displayName: 'checkout' });
    apply(YAML, [appendEntityEdit(spec, entity)]);
  });
});

describe('checks', () => {
  it('finds no problems in the sample file', () => {
    expect(analyzeOpenSlo(sample())).toEqual([]);
  });

  it('flags missing fields and dangling references', () => {
    const spec = parse(
      [
        'apiVersion: openslo/v1',
        'kind: SLO',
        'metadata:',
        '  name: broken',
        'spec:',
        '  service: missing-service',
        '  budgetingMethod: Weekly',
        '  timeWindow: []',
        '  objectives: []',
      ].join('\n'),
    );
    const messages = analyzeOpenSlo(spec).map((i) => i.message);
    expect(messages).toContain('broken: service "missing-service" does not match any Service of this file');
    expect(messages).toContain('broken: budgetingMethod "Weekly" must be Occurrences or Timeslices');
    expect(messages).toContain('broken: At least one timeWindow is required');
    expect(messages).toContain('broken: At least one objective is required');
    expect(messages).toContain('broken: An indicator (indicatorRef, or an inline indicator) is required');
  });

  it('flags duplicate names within the same kind', () => {
    const spec = parse('apiVersion: openslo/v1\nkind: Service\nmetadata:\n  name: a\n---\napiVersion: openslo/v1\nkind: Service\nmetadata:\n  name: a\n');
    const messages = analyzeOpenSlo(spec).map((i) => i.message);
    expect(messages.filter((m) => m.includes('used by 2 objects'))).toHaveLength(2);
  });
});
