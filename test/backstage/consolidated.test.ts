import { describe, expect, it } from 'vitest';
import { analyzeCatalog } from '../../src/modules/backstage/core/analysis';
import { mergeCatalogFiles, moveEntityEdits, splitConsolidatedEdits, withFileEdits } from '../../src/modules/backstage/core/consolidated';
import { appendEntityEdit, deleteEntityEdits, linkSpecFileEdits, newEntity, referencedPaths, renameEntityEdits } from '../../src/modules/backstage/core/edits';
import { entitiesOf, knownEntities, type CatalogContext } from '../../src/modules/backstage/core/model';
import { applyEditsToValue, type SpecEdit } from '../../src/shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const COMMON = 'catalog/common.catalog-info.yaml';
const SHOP = 'catalog/shop/shop.catalog-info.yaml';

const TEXTS: Record<string, string> = {
  [COMMON]: `# Shared by every team.
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: platform
spec:
  type: team
  children: []
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: private
  annotations:
    sdd-studio/trust-zone: ../threat-models/shop.otm.yaml#private
spec:
  type: network
  owner: platform
`,
  [SHOP]: `apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: shop
spec:
  owner: platform
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: api
  annotations:
    sdd-studio/specs: ../../specs/api.spec.md
spec:
  type: service
  lifecycle: production
  owner: platform
  system: shop
  dependsOn:
    - resource:private
`,
};

const CONTEXT: CatalogContext = {
  file: '',
  specFiles: [{ path: 'specs/api.spec.md', kind: 'spec', name: 'API' }],
  entities: [],
  catalogFiles: [COMMON, SHOP],
  threatModels: [],
  files: {},
  consolidated: { folder: 'ws', brokenFiles: [] },
};

const parse = (text: string) => {
  const result = parseYamlDocuments(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value as { documents: unknown[] };
};
const merged = (texts = TEXTS, previous?: string[]) =>
  mergeCatalogFiles(
    Object.entries(texts).map(([path, text]) => ({ path, documents: parse(text).documents as never })),
    previous,
  );

/** Applies edits made on the consolidated value to the file texts, checking both stay in line. */
function apply(texts: Record<string, string>, edits: SpecEdit[], target = SHOP) {
  const value = merged(texts);
  const full = withFileEdits(value, edits, target);
  const next = { ...texts };
  for (const [file, fileEdits] of splitConsolidatedEdits(value.files, full)) next[file] = applyYamlDocumentEdits(next[file] ?? '', fileEdits);
  expect(merged(next, applyEditsToValue(value, full).files)).toEqual(applyEditsToValue(value, full));
  return next;
}

const indexOf = (spec: unknown, name: string) => entitiesOf(spec).find((e) => e.name === name)!.index;

describe('consolidated catalog', () => {
  it('merges catalog files, resolving references and paths per file', () => {
    const value = merged();
    expect(value.files).toEqual([COMMON, COMMON, SHOP, SHOP]);
    expect(analyzeCatalog(value, CONTEXT)).toEqual([]);
    const api = knownEntities(value, CONTEXT).find((e) => e.name === 'api')!;
    expect(api).toMatchObject({ file: SHOP, specs: ['specs/api.spec.md'], relations: expect.arrayContaining([{ field: 'owner', target: 'group:default/platform' }]) });
    expect(referencedPaths(value, '')).toEqual(['threat-models/shop.otm.yaml', 'specs/api.spec.md']);
    // A reload keeps the order the form knows.
    expect(merged(TEXTS, [SHOP, SHOP, COMMON, COMMON]).files).toEqual([SHOP, SHOP, COMMON, COMMON]);
  });

  it('renames across files', () => {
    const value = merged();
    const texts = apply(TEXTS, renameEntityEdits(value, indexOf(value, 'platform'), 'platform-team'));
    expect(texts[COMMON]).toBe(TEXTS[COMMON].replace('name: platform\n', 'name: platform-team\n').replace('owner: platform\n', 'owner: platform-team\n'));
    expect(texts[SHOP]).toBe(TEXTS[SHOP].replaceAll('owner: platform\n', 'owner: platform-team\n'));
  });

  it('adds entities to the chosen file and deletes with references in other files', () => {
    let value = merged();
    let texts = apply(TEXTS, [appendEntityEdit(value, newEntity(value, 'group', 'Payments'))], COMMON);
    expect(texts[COMMON].endsWith('---\napiVersion: backstage.io/v1alpha1\nkind: Group\nmetadata:\n  name: payments\n  title: Payments\nspec:\n  type: team\n  children: []\n')).toBe(true);
    expect(texts[SHOP]).toBe(TEXTS[SHOP]);

    value = merged(texts);
    texts = apply(texts, deleteEntityEdits(value, indexOf(value, 'private')));
    expect(texts[COMMON]).not.toContain('name: private');
    expect(texts[SHOP]).toContain('  system: shop\n  dependsOn: []\n');

    // A new entity writes its paths relative to its own file.
    value = merged(texts);
    const edits = linkSpecFileEdits(value, indexOf(value, 'shop'), CONTEXT.specFiles[0], CONTEXT);
    expect(edits).toEqual([{ op: 'set', path: ['documents', indexOf(value, 'shop'), 'metadata', 'annotations', 'sdd-studio/specs'], value: '../../specs/api.spec.md' }]);
  });

  it('moves entities between files, keeping their links working', () => {
    const value = merged();
    const texts = apply(TEXTS, moveEntityEdits(value, indexOf(value, 'api'), COMMON));
    expect(texts[SHOP]).toBe('apiVersion: backstage.io/v1alpha1\nkind: System\nmetadata:\n  name: shop\nspec:\n  owner: platform\n');
    expect(texts[COMMON]).toContain('---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: api\n  annotations:\n    sdd-studio/specs: ../specs/api.spec.md\n');
    const after = merged(texts);
    expect(analyzeCatalog(after, CONTEXT)).toEqual([]);
    expect(knownEntities(after, CONTEXT).find((e) => e.name === 'api')).toMatchObject({ file: COMMON, specs: ['specs/api.spec.md'] });
    // The network link to the threat model follows too.
    const network = merged(apply(TEXTS, moveEntityEdits(value, indexOf(value, 'private'), SHOP)));
    expect(knownEntities(network, CONTEXT).find((e) => e.name === 'private')).toMatchObject({ file: SHOP, trustZone: { path: 'threat-models/shop.otm.yaml', id: 'private' } });
  });

  it('reports the same entity in two files', () => {
    const texts = { ...TEXTS, [SHOP]: `${TEXTS[SHOP]}---\napiVersion: backstage.io/v1alpha1\nkind: Group\nmetadata:\n  name: platform\nspec:\n  type: team\n  children: []\n` };
    expect(analyzeCatalog(merged(texts), CONTEXT).map((i) => i.message)).toEqual([`Group platform: another Group named "platform" is defined in ${COMMON}`]);
  });

  it('refuses edits it cannot place', () => {
    expect(() => splitConsolidatedEdits([COMMON], [{ op: 'set', path: ['documents', 1], value: {} }])).toThrow('no catalog file');
    expect(() => splitConsolidatedEdits([COMMON], [{ op: 'set', path: ['files', 0], value: SHOP }])).toThrow('moving it');
  });
});
