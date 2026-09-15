import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeOtm,
  appendEdit,
  deleteImpact,
  deleteItemEdits,
  enclosingTrustZone,
  itemsOf,
  nestingDepth,
  newItem,
  newOtmTemplate,
  referencePaths,
  renameIdEdits,
  renameRepresentationEdits,
  threatUses,
  uniqueId,
} from '../../src/modules/otm/core/otm';
import { looksLikeOtm, summarizeOtm } from '../../src/modules/otm/core/summary';
import { applyEditsToValue, type Json, type SpecEdit } from '../../src/shared/structured/edits';
import { applySpecEdits, parseSpec, type SpecFormat } from '../../src/shared/structured/specText';

const SAMPLE = readFileSync(join(__dirname, 'fixtures/online-shop.otm.yaml'), 'utf8');

const parse = (text: string, format: SpecFormat = 'yaml') => {
  const result = parseSpec(text, format);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const sample = () => parse(SAMPLE);

/** Applies edits to the text and checks the form's local copy ends up identical. */
function apply(text: string, edits: SpecEdit[], format: SpecFormat = 'yaml') {
  const before = parse(text, format);
  const written = applySpecEdits(text, format, edits);
  expect(parse(written, format)).toEqual(applyEditsToValue(before, edits));
  return written;
}

const messages = (spec: unknown) => analyzeOtm(spec).map((i) => `${i.severity}: ${i.message}`);

describe('OTM detection and summary', () => {
  it('recognizes threat models and summarizes them', () => {
    expect(looksLikeOtm('shop.otm.yaml', SAMPLE)).toBe(true);
    expect(looksLikeOtm('any.json', '{\n  "otmVersion": "0.2.0"\n}')).toBe(true);
    expect(looksLikeOtm('openapi.yaml', 'openapi: 3.1.0\n')).toBe(false);
    expect(looksLikeOtm('notes.md', 'otmVersion: 0.2.0')).toBe(false);

    expect(summarizeOtm('shop.otm.yaml', SAMPLE)).toEqual({
      name: 'Online shop',
      tags: ['checkout', 'pci'],
      details: ['OTM 0.2.0', '3 components', '2 dataflows', '2 threats', '1 exposed'],
      problems: 0,
    });
    expect(summarizeOtm('broken.otm.yaml', 'otmVersion: 0.2.0\nproject:\n  name: Broken\n  - x').error).toMatch(/^Line \d+:/);
  });

  it('creates templates that are valid and follow the format', () => {
    for (const format of ['yaml', 'json'] as const) {
      const spec = parse(newOtmTemplate('Crème Shop', format), format);
      expect(spec).toMatchObject({ otmVersion: '0.2.0', project: { name: 'Crème Shop', id: 'creme-shop' }, components: [] });
      expect(analyzeOtm(spec)).toEqual([]);
    }
  });
});

describe('OTM model helpers', () => {
  it('follows parents and threat instances', () => {
    const spec = sample();
    const nested = applyEditsToValue(spec, [
      appendEdit(spec, ['components'], { name: 'Worker', id: 'worker', type: 'generic', parent: { component: 'shop-api' } }),
    ]);
    const worker = itemsOf(nested, 'components')[3];
    expect(enclosingTrustZone(nested, worker)).toBe('private');
    expect(nestingDepth(nested, 'components', worker)).toBe(1);
    expect(threatUses(spec).map((u) => [u.collection, u.index, u.threat, u.state, u.mitigations.length])).toEqual([
      ['components', 1, 'card-data-leak', 'exposed', 1],
      ['components', 1, 'session-hijacking', 'mitigated', 1],
      ['dataflows', 0, 'session-hijacking', 'mitigated', 0],
    ]);
  });

  it('creates elements with the required fields and unique ids', () => {
    const spec = sample();
    expect(uniqueId('Shop API', ['shop-api', 'shop-api-2'])).toBe('shop-api-3');
    // Trust zones and components share ids.
    expect(newItem(spec, 'components', 'Internet')).toEqual({ name: 'Internet', id: 'internet-2', type: 'generic', parent: { trustZone: 'internet' } });
    expect(newItem(spec, 'dataflows', 'Sync')).toEqual({ name: 'Sync', id: 'sync', source: 'browser', destination: 'shop-api' });
    expect(newItem(spec, 'threats', 'XSS')).toEqual({ name: 'XSS', id: 'xss', risk: { likelihood: 50, impact: 50 } });
    expect(newItem({}, 'components', 'Lonely')).toMatchObject({ parent: { trustZone: '' } });
  });

  it('appends to missing and empty (null) lists, in YAML and JSON', () => {
    const spec = sample();
    // `threats:` without value on the orders database.
    const edit = appendEdit(spec, ['components', 2, 'threats'], { threat: 'card-data-leak', state: 'exposed' });
    expect(edit).toEqual({ op: 'set', path: ['components', 2, 'threats'], value: [{ threat: 'card-data-leak', state: 'exposed' }] });
    const written = apply(SAMPLE, [edit]);
    expect(written).toContain('    threats:\n      - threat: card-data-leak\n        state: exposed\n\ndataflows:');

    const json = '{\n  "otmVersion": "0.2.0",\n  "project": { "name": "A", "id": "a", "attributes": null },\n  "components": [{ "id": "c", "threats": null }]\n}\n';
    const jsonSpec = parse(json, 'json');
    apply(json, [appendEdit(jsonSpec, ['components', 0, 'threats'], { threat: 't', state: 'exposed' })], 'json');
    apply(json, [{ op: 'set', path: ['project', 'attributes', 'team'], value: 'blue' }], 'json');
    expect(applyEditsToValue(jsonSpec, [{ op: 'set', path: ['project', 'attributes', 'team'], value: 'blue' }])).toMatchObject({ project: { attributes: { team: 'blue' } } });
    expect(applyEditsToValue({ list: null } as Json, [{ op: 'set', path: ['list', 0], value: 1 }])).toEqual({ list: [1] });
  });
});

describe('OTM ids and references', () => {
  it('renames ids together with their references, keeping comments', () => {
    const spec = sample();
    expect(referencePaths(spec, 'trustZones', 'private')).toEqual([
      ['components', 1, 'parent', 'trustZone'],
      ['components', 2, 'parent', 'trustZone'],
    ]);
    let text = apply(SAMPLE, renameIdEdits(spec, 'trustZones', 1, 'backend'));
    text = apply(text, renameIdEdits(parse(text), 'components', 1, 'api'));
    text = apply(text, renameIdEdits(parse(text), 'assets', 1, 'customers'));
    text = apply(text, renameIdEdits(parse(text), 'threats', 1, 'hijack'));
    text = apply(text, renameIdEdits(parse(text), 'mitigations', 1, 'cookies'));
    text = apply(text, renameRepresentationEdits(parse(text), 0, 'diagram'));

    expect(text.startsWith('# Threat model of the online shop checkout')).toBe(true);
    const renamed = parse(text);
    expect(analyzeOtm(renamed)).toEqual([]);
    expect(renamed).toMatchObject({
      representations: [{ id: 'diagram' }],
      components: [
        { representations: [{ representation: 'diagram' }] },
        { id: 'api', parent: { trustZone: 'backend' }, assets: { processed: ['card-data', 'customers'] }, threats: [{}, { threat: 'hijack', mitigations: [{ mitigation: 'cookies' }] }] },
        { parent: { trustZone: 'backend' }, assets: { stored: ['customers'] } },
      ],
      dataflows: [{ destination: 'api', threats: [{ threat: 'hijack' }] }, { source: 'api', assets: ['customers'] }],
    });
    // Only the renamed values changed.
    expect(text.split('\n').length).toBe(SAMPLE.split('\n').length);
  });

  it('deletes elements with the links to them, but keeps broken parents visible', () => {
    const spec = sample();
    expect(deleteImpact(spec, 'threats', 1)).toEqual({ removed: 2, broken: 0 });
    expect(deleteImpact(spec, 'trustZones', 1)).toEqual({ removed: 0, broken: 2 });

    const withoutThreat = parse(apply(SAMPLE, deleteItemEdits(spec, 'threats', 1)));
    expect(threatUses(withoutThreat).map((u) => u.threat)).toEqual(['card-data-leak']);
    expect(messages(withoutThreat)).toEqual(['warning: Mitigation Secure, HTTP-only cookies: not applied to any threat']);

    const withoutAsset = parse(apply(SAMPLE, deleteItemEdits(spec, 'assets', 1)));
    expect(withoutAsset).toMatchObject({ components: [{}, { assets: { processed: ['card-data'] } }, { assets: { stored: [] } }], dataflows: [{}, { assets: [] }] });
    expect(analyzeOtm(withoutAsset)).toEqual([]);

    const withoutZone = parse(apply(SAMPLE, deleteItemEdits(spec, 'trustZones', 1)));
    expect(messages(withoutZone)).toEqual([
      'error: Component Shop API: parent trust zone "private" does not exist',
      'error: Component Orders database: parent trust zone "private" does not exist',
    ]);
  });
});

describe('OTM checks', () => {
  it('reports what OTM requires and broken references', () => {
    const spec = {
      otmVersion: '0.2.0',
      project: { name: '', id: 'p' },
      representations: [{ name: 'Diagram', id: 'd', type: 'diagram' }],
      trustZones: [
        { id: 'zone', name: 'Zone', risk: { trustRating: 120 } },
        { id: 'zone', name: 'Copy', risk: { trustRating: 5 }, parent: { trustZone: 'nowhere' } },
      ],
      components: [
        { id: 'a', name: 'A', type: 'x', parent: { component: 'b' }, representations: [{ representation: 'missing', id: 'r' }] },
        { id: 'b', name: 'B', type: '', parent: { component: 'a' }, assets: { processed: ['ghost'] } },
        { id: 'zone', name: 'Clash', type: 'x', threats: [{ threat: 'nope', state: '', mitigations: [{ mitigation: 'm', state: 'required' }, { mitigation: 'gone' }] }] },
      ],
      dataflows: [{ id: 'f', name: 'F', source: 'a', destination: 'a' }, { id: 'g', name: 'G', source: 'unknown' }],
      assets: [{ id: 'asset', name: 'Asset', risk: { confidentiality: 10, integrity: 10 } }],
      threats: [{ id: 't', name: 'T', risk: { likelihood: null, impact: 50 }, cwes: ['79'] }],
      mitigations: [{ id: 'm', name: 'M', riskReduction: -1 }],
    };
    expect(messages(spec)).toEqual([
      'error: Project name is required',
      'error: Trust zone Zone: trust rating must be a number from 0 to 100',
      'error: Trust zone Copy: id "zone" is used by another trust zone',
      'error: Trust zone Copy: parent trust zone "nowhere" does not exist',
      'error: Component A: parents form a loop',
      'error: Component A: representation "missing" does not exist',
      'error: Component B: parents form a loop',
      'error: Component B: type is required',
      'error: Component B: asset "ghost" does not exist',
      'warning: Component Clash: id "zone" is also a trust zone id, so dataflows using it are ambiguous',
      'error: Component Clash: parent (trust zone or component) is required',
      'warning: Dataflow F: source and destination are the same',
      'error: Dataflow G: source "unknown" is not a component or trust zone',
      'error: Dataflow G: destination is required',
      'error: Asset Asset: availability must be a number from 0 to 100',
      'warning: Asset Asset: not used by any component or dataflow',
      'warning: Threat T: not linked to any component or dataflow',
      'warning: Threat T: "79" does not look like a CWE id (CWE-79)',
      'error: Mitigation M: risk reduction must be a number from 0 to 100',
      'error: Component Clash: threat "nope" does not exist',
      'error: Component Clash: threat "nope" has no state',
      'error: Component Clash: mitigation "gone" does not exist',
      'error: Component Clash: mitigation "gone" of threat "nope" has no state',
    ]);
    expect(analyzeOtm(sample())).toEqual([]);
  });
});
