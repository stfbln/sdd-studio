import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCatalog } from '../../src/modules/backstage/core/analysis';
import {
  appendEntityEdit,
  deleteEntityEdits,
  deleteImpact,
  linkSpecFileEdits,
  newEntity,
  referencedPaths,
  renameEntityEdits,
  setAnnotationListEdits,
  setDefinitionEdits,
} from '../../src/modules/backstage/core/edits';
import {
  ancestors,
  entitiesOf,
  formatRef,
  incoming,
  knownEntities,
  parseRef,
  relativePath,
  resolvePath,
  summarizeEntity,
  type CatalogContext,
} from '../../src/modules/backstage/core/model';
import { looksLikeCatalog, newCatalogTemplate, summarizeCatalog } from '../../src/modules/backstage/core/summary';
import { applyEditsToValue, type SpecEdit } from '../../src/shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const FILE = 'catalog/online-shop.catalog-info.yaml';
const SAMPLE = readFileSync(join(__dirname, 'fixtures/online-shop.catalog-info.yaml'), 'utf8');

const parse = (text: string) => {
  const result = parseYamlDocuments(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const sample = () => parse(SAMPLE);

/** Applies edits to the text and checks the form's local copy ends up identical. */
function apply(text: string, edits: SpecEdit[]) {
  const written = applyYamlDocumentEdits(text, edits);
  expect(parse(written)).toEqual(applyEditsToValue(parse(text), edits));
  return written;
}

const CONTEXT: CatalogContext = {
  file: FILE,
  specFiles: [
    { path: 'api/petstore.openapi.yaml', kind: 'openapi', name: 'Petstore' },
    { path: 'api/order-events.asyncapi.yaml', kind: 'asyncapi', name: 'Order events' },
    { path: 'cli/acme-deploy.opencli.yaml', kind: 'opencli', name: 'acme-deploy' },
    { path: 'specs/payment-service.spec.md', kind: 'spec', name: 'Payment service' },
    { path: 'specs/notifications.spec.md', kind: 'spec', name: 'Notifications' },
    { path: 'features/shop.feature', kind: 'gherkin', name: 'Shop' },
    { path: 'threat-models/online-shop.otm.yaml', kind: 'otm', name: 'Online shop' },
  ],
  entities: [],
  catalogFiles: [],
  threatModels: [],
  files: {
    'api/petstore.openapi.yaml': true,
    'api/order-events.asyncapi.yaml': true,
    'specs/payment-service.spec.md': true,
    'features/shop.feature': true,
    'threat-models/online-shop.otm.yaml': true,
  },
};

const messages = (spec: unknown, context?: CatalogContext) => analyzeCatalog(spec, context).map((i) => `${i.severity}: ${i.message}`);

describe('multi-document YAML', () => {
  const text = '# Header\n\nkind: A\nmetadata:\n  name: a # keep\n\n---\n# about b\nkind: B\nspec:\n  list: [x, y]\n---\nkind: C\n';

  it('rewrites only the edited document', () => {
    const written = apply(text, [{ op: 'set', path: ['documents', 1, 'spec', 'owner'], value: 'team' }]);
    expect(written).toBe('# Header\n\nkind: A\nmetadata:\n  name: a # keep\n\n---\n# about b\nkind: B\nspec:\n  list: [x, y]\n  owner: team\n---\nkind: C\n');
    expect(apply(text, [{ op: 'set', path: ['documents', 0, 'metadata', 'name'], value: 'b' }])).toBe(text.replace('name: a', 'name: b'));
  });

  it('appends, deletes and moves documents', () => {
    expect(apply(text, [{ op: 'set', path: ['documents', 3], value: { kind: 'D' } }])).toBe(`${text}---\nkind: D\n`);
    expect(apply('kind: A', [{ op: 'set', path: ['documents', 1], value: { kind: 'D' } }])).toBe('kind: A\n---\nkind: D\n');
    expect(apply('', [{ op: 'set', path: ['documents', 0], value: { kind: 'D' } }])).toBe('kind: D\n');
    // The file header stays when the first document goes.
    expect(apply(text, [{ op: 'delete', path: ['documents', 0] }])).toBe('# Header\n\n---\n# about b\nkind: B\nspec:\n  list: [x, y]\n---\nkind: C\n');
    expect(apply(text, [{ op: 'delete', path: ['documents', 1] }])).toBe('# Header\n\nkind: A\nmetadata:\n  name: a # keep\n\n---\nkind: C\n');
    expect(apply(text, [{ op: 'move', path: ['documents', 2], to: 0 }])).toBe('---\nkind: C\n---\n# Header\n\nkind: A\nmetadata:\n  name: a # keep\n\n---\n# about b\nkind: B\nspec:\n  list: [x, y]\n');
  });

  it('reports syntax errors with their line', () => {
    const result = parseYamlDocuments('kind: A\n---\na: b: c\nkind: B\n');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0].line).toBe(3);
    expect(parse('kind: A\n---\n')).toEqual({ documents: [{ kind: 'A' }, null] });
  });
});

describe('catalog files', () => {
  it('recognizes and summarizes catalog files', () => {
    expect(looksLikeCatalog('catalog-info.yaml', SAMPLE)).toBe(true);
    expect(looksLikeCatalog('x.yaml', 'otmVersion: 0.2.0\n')).toBe(false);
    expect(looksLikeCatalog('x.json', 'apiVersion: backstage.io/v1alpha1')).toBe(false);
    expect(summarizeCatalog(FILE, SAMPLE).summary).toEqual({
      name: 'Commerce',
      tags: ['checkout', 'pci'],
      details: ['1 domain', '1 system', '2 components', '2 APIs', '1 resource', '1 data asset', '2 groups'],
      problems: 0,
    });
    expect(summarizeCatalog(FILE, 'kind: [x').summary.error).toMatch(/^Line 1:/);
  });

  it('creates templates with a system', () => {
    expect(newCatalogTemplate('Payments')).toBe('apiVersion: backstage.io/v1alpha1\nkind: System\nmetadata:\n  name: payments\n  title: Payments\nspec:\n  owner: ""\n');
    expect(newCatalogTemplate('Shop: EU')).toContain('  title: "Shop: EU"\n');
    const spec = parse(newCatalogTemplate('Crème Shop'));
    expect(spec).toEqual({ documents: [{ apiVersion: 'backstage.io/v1alpha1', kind: 'System', metadata: { name: 'creme-shop', title: 'Crème Shop' }, spec: { owner: '' } }] });
    expect(messages(spec)).toEqual(['error: System Crème Shop: owner is required']);
  });
});

describe('references and paths', () => {
  it('parses and formats entity references', () => {
    expect(parseRef('component:payments/shop-api')).toEqual({ kind: 'component', namespace: 'payments', name: 'shop-api' });
    expect(parseRef('orders-db')).toEqual({ kind: undefined, namespace: undefined, name: 'orders-db' });
    expect(parseRef('not a ref')).toBeUndefined();
    expect(formatRef({ kind: 'API', namespace: 'default', name: 'x' }, 'API')).toBe('x');
    expect(formatRef({ kind: 'Resource', namespace: 'ops', name: 'db' }, undefined)).toBe('resource:ops/db');
  });

  it('resolves paths relative to the catalog file', () => {
    expect(resolvePath('catalog', '../api/x.yaml')).toBe('api/x.yaml');
    expect(resolvePath('', './a/b.md')).toBe('a/b.md');
    expect(resolvePath('', '../outside.md')).toBeUndefined();
    expect(resolvePath('catalog', 'https://example.com/x.yaml')).toBeUndefined();
    expect(relativePath('catalog', 'api/x.yaml')).toBe('../api/x.yaml');
    expect(relativePath('', 'api/x.yaml')).toBe('./api/x.yaml');
    expect(relativePath('a/b', 'a/b/c/x.yaml')).toBe('./c/x.yaml');
    expect(referencedPaths(sample(), FILE)).toEqual([
      'threat-models/online-shop.otm.yaml',
      'specs/payment-service.spec.md',
      'features/shop.feature',
      'api/petstore.openapi.yaml',
      'api/order-events.asyncapi.yaml',
    ]);
  });

  it('follows the hierarchy and incoming relations', () => {
    const known = knownEntities(sample(), CONTEXT);
    expect(ancestors('resource:default/card-data', known).map((e) => e.name)).toEqual(['online-shop', 'commerce']);
    expect(incoming('resource:default/orders-db', known).map((r) => `${r.entity.name} ${r.field}`)).toEqual(['shop-api dependsOn', 'card-data dependsOn']);
    expect(incoming('group:default/checkout-team', known).filter((r) => r.field === 'owner')).toHaveLength(7);
  });
});

describe('catalog edits', () => {
  it('creates entities with required fields and unique names', () => {
    const spec = sample();
    expect(newEntity(spec, 'component', 'Shop API', { spec: { system: 'online-shop' } })).toEqual({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'shop-api-2', title: 'Shop API' },
      spec: { type: 'service', lifecycle: 'experimental', owner: 'checkout-team', system: 'online-shop' },
    });
    // Names are unique per kind: a resource may be called like a component.
    expect(newEntity(spec, 'dataAsset', 'shop-api')).toMatchObject({ kind: 'Resource', metadata: { name: 'shop-api' }, spec: { type: 'data-asset' } });
    const written = apply(SAMPLE, [appendEntityEdit(spec, newEntity(spec, 'group', 'Payments'))]);
    expect(written.endsWith('  children: []\n---\napiVersion: backstage.io/v1alpha1\nkind: Group\nmetadata:\n  name: payments\n  title: Payments\nspec:\n  type: team\n  children: []\n')).toBe(true);
  });

  it('renames entities with their references, keeping the rest of the file', () => {
    const spec = sample();
    const db = entitiesOf(spec).find((e) => e.name === 'orders-db')!.index;
    let text = apply(SAMPLE, renameEntityEdits(spec, db, 'orders'));
    const team = entitiesOf(parse(text)).find((e) => e.name === 'checkout-team')!.index;
    text = apply(text, renameEntityEdits(parse(text), team, 'checkout'));
    expect(text.split('\n').length).toBe(SAMPLE.split('\n').length);
    expect(text).toContain('# Software catalog of the online shop');
    expect(text.match(/resource:orders$/gm)).toHaveLength(2);
    expect(text.match(/owner: checkout$/gm)).toHaveLength(7);
    expect(messages(parse(text))).toEqual([]);
  });

  it('deletes entities with the list entries pointing to them', () => {
    const spec = sample();
    const db = entitiesOf(spec).find((e) => e.name === 'orders-db')!.index;
    const team = entitiesOf(spec).find((e) => e.name === 'checkout-team')!.index;
    expect(deleteImpact(spec, db)).toEqual({ removed: 2, broken: 0 });
    expect(deleteImpact(spec, team)).toEqual({ removed: 0, broken: 7 });
    const withoutDb = parse(apply(SAMPLE, deleteEntityEdits(spec, db)));
    expect(entitiesOf(withoutDb).find((e) => e.name === 'shop-api')!.entity.spec).toMatchObject({ dependsOn: ['resource:card-data'] });
    expect(entitiesOf(withoutDb).find((e) => e.name === 'card-data')!.entity.spec).toMatchObject({ dependsOn: [] });
    expect(messages(parse(apply(SAMPLE, deleteEntityEdits(spec, team))), CONTEXT)).toHaveLength(7);
  });

  it('links spec files: API specs through API entities, others through annotations', () => {
    const spec = sample();
    const cli = entitiesOf(spec).find((e) => e.name === 'deploy-cli')!.index;
    const api = entitiesOf(spec).find((e) => e.name === 'shop-api')!.index;

    // A new API entity for the OpenCLI file, provided by the CLI.
    let text = apply(SAMPLE, linkSpecFileEdits(spec, cli, CONTEXT.specFiles[2], CONTEXT));
    expect(text).toContain('spec:\n  type: cli\n  lifecycle: experimental\n  owner: platform-team\n  system: online-shop\n  providesApis:\n    - acme-deploy\n---');
    expect(text.endsWith('kind: API\nmetadata:\n  name: acme-deploy\nspec:\n  type: opencli\n  lifecycle: experimental\n  owner: platform-team\n  system: online-shop\n  definition:\n    $text: ../cli/acme-deploy.opencli.yaml\n')).toBe(true);

    // The existing API entity of an OpenAPI file is reused.
    expect(linkSpecFileEdits(spec, cli, CONTEXT.specFiles[0], CONTEXT)).toEqual([{ op: 'set', path: ['documents', cli, 'spec', 'providesApis'], value: ['petstore-api'] }]);
    expect(linkSpecFileEdits(spec, api, CONTEXT.specFiles[0], CONTEXT)).toEqual([]);

    // Markdown specs and threat models go to annotations.
    text = apply(text, linkSpecFileEdits(parse(text), api, CONTEXT.specFiles[4], CONTEXT));
    expect(text).toContain('sdd-studio/specs: ../specs/payment-service.spec.md, ../features/shop.feature, ../specs/notifications.spec.md\n');
    text = apply(text, linkSpecFileEdits(parse(text), cli, CONTEXT.specFiles[6], CONTEXT));
    expect(text).toContain('  title: Deploy CLI\n  annotations:\n    sdd-studio/threat-models: ../threat-models/online-shop.otm.yaml\n');
    text = apply(text, setAnnotationListEdits(parse(text), cli, 'sdd-studio/threat-models', []));
    expect(text).toContain('  title: Deploy CLI\nspec:');

    const newApi = entitiesOf(parse(text)).find((e) => e.name === 'acme-deploy')!.index;
    expect(setDefinitionEdits(parse(text), newApi, CONTEXT.specFiles[1], CONTEXT)).toEqual([
      { op: 'set', path: ['documents', newApi, 'spec', 'type'], value: 'asyncapi' },
      { op: 'set', path: ['documents', newApi, 'spec', 'definition'], value: { $text: '../api/order-events.asyncapi.yaml' } },
    ]);
  });
});

describe('catalog checks', () => {
  it('accepts the sample and resolves references across files', () => {
    expect(messages(sample(), CONTEXT)).toEqual([]);
    const other = summarizeEntity(entitiesOf(parse('apiVersion: backstage.io/v1alpha1\nkind: Group\nmetadata:\n  name: ops\nspec:\n  type: team\n  children: []\n'))[0], 'teams/ops.yaml');
    const text = 'apiVersion: backstage.io/v1alpha1\nkind: Resource\nmetadata:\n  name: cache\nspec:\n  type: cache\n  owner: ops\n';
    expect(messages(parse(text), { ...CONTEXT, entities: [] })).toEqual(['warning: Resource cache: owner "ops" is not defined in the catalog files of the workspace']);
    expect(messages(parse(text), { ...CONTEXT, entities: [other] })).toEqual([]);
  });

  it('reports what Backstage rejects', () => {
    const text = `apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: Bad name!
  tags: [Ok, fine]
  annotations:
    sdd-studio/specs: ../specs/missing.md
    bad key/x: y
  links:
    - title: no url
spec:
  type: service
  lifecycle: beta
  system: component:shop-api
  dependsOn: [orders-db]
  providesApis: not-a-list
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: api
spec:
  type: openapi
  lifecycle: production
  owner: team
  definition:
    $text: ../api/gone.yaml
---
apiVersion: backstage.io/v1alpha1
kind: Domain
metadata:
  name: a
spec:
  owner: team
  subdomainOf: b
---
apiVersion: backstage.io/v1alpha1
kind: Domain
metadata:
  name: b
spec:
  owner: team
  subdomainOf: a
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: team
spec:
  type: team
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: team
spec:
  type: team
  children: []
---
apiVersion: backstage.io/v1alpha1
kind: Location
metadata:
  name: all
spec:
  type: url
`;
    const context = { ...CONTEXT, files: { 'specs/missing.md': false, 'api/gone.yaml': false } };
    expect(messages(parse(text), context)).toEqual([
      'error: Component Bad name!: name "Bad name!" must be at most 63 letters, digits, "-", "_" or ".", starting and ending with a letter or digit',
      'error: Component Bad name!: tag "Ok" must be lowercase letters, digits, ":", "+" or "#", separated by "-"',
      'error: Component Bad name!: link 1 needs a URL',
      'error: Component Bad name!: annotation key "bad key/x" is not valid (optional "prefix/" then letters, digits, "-", "_" or ".")',
      'error: Component Bad name!: owner is required',
      'warning: Component Bad name!: lifecycle "beta" is not one of experimental, production, deprecated',
      'error: Component Bad name!: system "component:shop-api" must point to a system',
      'error: Component Bad name!: provides apis must be a list',
      'error: Component Bad name!: depends on "orders-db" needs a kind, e.g. component:orders-db',
      'warning: Component Bad name!: spec "../specs/missing.md" does not exist',
      'warning: API api: definition file "../api/gone.yaml" does not exist',
      'error: Domain a: parents form a loop',
      'error: Domain b: parents form a loop',
      'error: Group team: child groups is required (it may be an empty list)',
      'error: Group team: another Group named "team" is defined in this file',
      'error: Location all: target or targets is required',
    ]);
  });
});

describe('specs and threat models of entities', () => {
  it('lists implemented specs and inherited threat models', async () => {
    const { specsFor, threatModelsFor } = await import('../../src/modules/backstage/core/model');
    const known = knownEntities(sample(), CONTEXT);
    expect(specsFor('component:default/shop-api', known).map((s) => [s.path, s.api?.name])).toEqual([
      ['api/petstore.openapi.yaml', 'petstore-api'],
      ['api/order-events.asyncapi.yaml', 'order-events'],
      ['specs/payment-service.spec.md', undefined],
      ['features/shop.feature', undefined],
    ]);
    expect(threatModelsFor('resource:default/card-data', known).map((t) => [t.path, t.from?.name])).toEqual([['threat-models/online-shop.otm.yaml', 'online-shop']]);
    expect(threatModelsFor('domain:default/commerce', known)).toEqual([]);
  });
});
