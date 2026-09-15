import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeAsyncApi } from '../../src/modules/asyncapi/core/asyncapi';
import { analyzeCatalog } from '../../src/modules/backstage/core/analysis';
import { entityBrief, entityLinkEdits, linkConflict, newSpecFileRequest, suggestedTitle, threatModelDraft, trustZoneLinkEdits } from '../../src/modules/backstage/core/brief';
import { linkSpecFileEdits, setDefinitionEdits } from '../../src/modules/backstage/core/edits';
import { entitiesOf, matchEntities, type CatalogContext, type SpecFileKind } from '../../src/modules/backstage/core/model';
import { scaffoldSpecFile } from '../../src/modules/backstage/core/scaffold';
import { parseGherkin } from '../../src/modules/gherkin/core/parse';
import { analyzeSpec as analyzeOpenApi } from '../../src/modules/openapi/core/openapi';
import { analyzeOpenCli } from '../../src/modules/opencli/core/opencli';
import { analyzeOtm } from '../../src/modules/otm/core/otm';
import { outlineOtm } from '../../src/modules/otm/core/summary';
import { analyzeProto } from '../../src/modules/proto/core/analysis';
import { parseProto } from '../../src/modules/proto/core/parse';
import { parseSpecMarkdown } from '../../src/modules/spec/core/parse';
import { analyzeSpec } from '../../src/modules/spec/core/summary';
import { applyEditsToValue } from '../../src/shared/structured/edits';
import { parseSpec } from '../../src/shared/structured/specText';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const FILE = 'catalog/online-shop.catalog-info.yaml';
const SAMPLE = readFileSync(join(__dirname, 'fixtures/online-shop-infra.catalog-info.yaml'), 'utf8');
const OTM = readFileSync(join(__dirname, '../otm/fixtures/online-shop.otm.yaml'), 'utf8');
const OTM_PATH = 'threat-models/online-shop.otm.yaml';

const CONTEXT: CatalogContext = {
  file: FILE,
  specFiles: [
    { path: 'api/petstore.openapi.yaml', kind: 'openapi', name: 'Petstore' },
    { path: 'specs/payment-service.spec.md', kind: 'spec', name: 'Payment service' },
    { path: OTM_PATH, kind: 'otm', name: 'Online shop' },
  ],
  entities: [],
  catalogFiles: [],
  threatModels: [{ path: OTM_PATH, name: 'Online shop', ...outlineOtm(OTM_PATH, OTM) }],
  files: {},
};

const parse = (text: string) => {
  const result = parseYamlDocuments(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const parseValue = (text: string, format: 'yaml' | 'json') => {
  const result = parseSpec(text, format);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const indexOf = (spec: unknown, name: string) => entitiesOf(spec).find((e) => e.name === name)!.index;
const errors = (issues: { severity: string; message: string }[]) => issues.filter((i) => i.severity === 'error').map((i) => i.message);

function scaffold(spec: unknown, name: string, kind: SpecFileKind, path: string, format: 'yaml' | 'json' = 'yaml', context = CONTEXT) {
  const index = indexOf(spec, name);
  const request = newSpecFileRequest(spec, index, context, kind, suggestedTitle(kind, entityBrief(spec, index, context)!))!;
  return { request, text: scaffoldSpecFile(request, path, format) };
}

describe('files created from the catalog', () => {
  it('gathers what the catalog knows about an entity', () => {
    const spec = parse(SAMPLE);
    const brief = entityBrief(spec, indexOf(spec, 'shop-api'), CONTEXT)!;
    expect(brief.entity).toMatchObject({ title: 'Shop API', type: 'service', lifecycle: 'production', file: FILE });
    expect(brief.owner).toMatchObject({ title: 'Checkout team', email: 'checkout@example.com' });
    expect(brief.system?.title).toBe('Online shop');
    expect(brief.domain?.title).toBe('Commerce');
    expect(brief.code).toBe('https://gitlab.com/acme/shop/-/tree/main/services/shop-api/');
    expect(brief.providesApis.map((a) => [a.title, a.definition])).toEqual([
      ['Petstore API', 'api/petstore.openapi.yaml'],
      ['Order events', 'api/order-events.asyncapi.yaml'],
    ]);
    expect(brief.dependsOn.map((d) => d.name)).toEqual(['orders-db']);
    expect(brief.networks.map((n) => n.name)).toEqual(['private']);
    expect(brief.dataAssets).toMatchObject([{ name: 'card-data', classification: 'restricted' }]);
    // API definitions are listed with the APIs, not again with the specs.
    expect(brief.specs.map((s) => s.path)).toEqual(['specs/payment-service.spec.md', 'features/shop.feature']);
    expect(brief.threatModels.map((t) => t.title)).toEqual(['Online shop']);

    const system = entityBrief(spec, indexOf(spec, 'online-shop'), CONTEXT)!;
    expect(system.parts.map((p) => p.name)).toContain('shop-api');
    expect(system.domain?.name).toBe('commerce');
  });

  it('suggests names that read well for the kind of file', () => {
    const spec = parse(SAMPLE);
    const brief = entityBrief(spec, indexOf(spec, 'shop-api'), CONTEXT)!;
    expect(suggestedTitle('openapi', brief)).toBe('Shop API');
    expect(suggestedTitle('asyncapi', brief)).toBe('Shop API events');
    expect(suggestedTitle('spec', brief)).toBe('Shop API');
    const cli = entityBrief(spec, indexOf(spec, 'deploy-cli'), CONTEXT)!;
    expect(suggestedTitle('openapi', cli)).toBe('Deploy CLI API');
    const api = entityBrief(spec, indexOf(spec, 'order-events'), CONTEXT)!;
    expect(suggestedTitle('asyncapi', api)).toBe('Order events');
  });

  it('writes a markdown spec pointing to the catalog entry instead of copying it', () => {
    const spec = parse(SAMPLE);
    const { text } = scaffold(spec, 'shop-api', 'spec', 'specs/shop-api.spec.md');
    const model = parseSpecMarkdown(text);
    expect(model.title?.text).toBe('Shop API');
    expect(analyzeSpec(model)).toEqual([]);
    expect(model.requirements?.notice).toBeDefined();
    expect(model.context).toBeUndefined();
    expect(text).toContain('Requirements of `component:shop-api` that its catalog entry and its spec files cannot express. The catalog entry in [online-shop.catalog-info.yaml](../catalog/online-shop.catalog-info.yaml) is the source of truth');
    // Catalog facts stay in the catalog.
    expect(text).not.toContain('Checkout team');
    expect(text).not.toContain('petstore.openapi.yaml');
  });

  it('writes a feature with the tags and description of the entity', () => {
    const spec = parse(SAMPLE);
    const { text } = scaffold(spec, 'online-shop', 'gherkin', 'features/online-shop.feature');
    expect(text.split('\n').slice(0, 4)).toEqual([
      '@checkout @pci',
      'Feature: Online shop',
      '  Customers browse the catalog and pay for their orders by card.',
      '  Online shop is a system of the Commerce domain, owned by Checkout team.',
    ]);
    const parsed = parseGherkin(text);
    expect(parsed.ok).toBe(true);
  });

  it('writes valid API specs with the title, description and contact of the entity', () => {
    const spec = parse(SAMPLE);
    const openapi = parseValue(scaffold(spec, 'shop-api', 'openapi', 'api/shop-api.openapi.yaml').text, 'yaml');
    expect(errors(analyzeOpenApi(openapi))).toEqual([]);
    expect(openapi).toMatchObject({ openapi: '3.0.3', info: { title: 'Shop API', description: 'Orders, payments and the product catalog.', contact: { name: 'Checkout team', email: 'checkout@example.com' } }, paths: {} });

    const asyncapi = parseValue(scaffold(spec, 'order-events', 'asyncapi', 'api/order-events.asyncapi.yaml').text, 'yaml');
    expect(errors(analyzeAsyncApi(asyncapi))).toEqual([]);
    expect(asyncapi).toMatchObject({ asyncapi: '3.0.0', info: { title: 'Order events', version: '1.0.0' }, channels: {}, operations: {} });

    const opencli = parseValue(scaffold(spec, 'deploy-cli', 'opencli', 'cli/deploy-cli.opencli.json', 'json').text, 'json');
    expect(errors(analyzeOpenCli(opencli))).toEqual([]);
    expect(opencli).toMatchObject({ info: { title: 'Deploy CLI', description: 'Command line tool deploying the shop to the clusters.', contact: { name: 'Platform team' } }, command: { name: 'deploy-cli' } });

    const { text: protoText } = scaffold(spec, 'shop-api', 'proto', 'proto/shop_api.proto');
    const file = parseProto(protoText);
    expect(errors(analyzeProto(file, []))).toEqual([]);
    expect(protoText).toContain('package online_shop.shop.v1;');
    expect(protoText).toContain('// Orders, payments and the product catalog.\n//\n// Shop API is a service component of the Online shop system, owned by Checkout team.\nservice ShopService {\n}');
  });

  it('links created API specs through API entities or as the definition of an API', () => {
    const spec = parse(SAMPLE);
    const file = { path: 'api/shop-api-events.asyncapi.yaml', kind: 'asyncapi' as const, name: 'Shop API events' };
    const linked = applyEditsToValue(spec, linkSpecFileEdits(spec, indexOf(spec, 'shop-api'), file, CONTEXT));
    const api = entitiesOf(linked).find((e) => e.name === 'shop-api-events')!;
    expect(api.entity.spec).toMatchObject({ type: 'asyncapi', owner: 'checkout-team', system: 'online-shop', definition: { $text: '../api/shop-api-events.asyncapi.yaml' } });

    const definition = applyEditsToValue(spec, setDefinitionEdits(spec, indexOf(spec, 'order-events'), file, CONTEXT));
    expect(entitiesOf(definition)[indexOf(spec, 'order-events')].entity.spec).toMatchObject({ definition: { $text: '../api/shop-api-events.asyncapi.yaml' } });
  });
});

describe('linking files from the API', () => {
  const entities = [
    { kind: 'Component', namespace: 'default', name: 'shop-api' },
    { kind: 'API', namespace: 'default', name: 'shop-api' },
    { kind: 'Component', namespace: 'payments', name: 'ledger' },
  ];

  it('resolves references with optional kind and namespace', () => {
    expect(matchEntities('component:shop-api', entities)).toEqual([entities[0]]);
    expect(matchEntities('API:Shop-API', entities)).toEqual([entities[1]]);
    expect(matchEntities('shop-api', entities)).toHaveLength(2);
    expect(matchEntities('ledger', entities)).toEqual([entities[2]]);
    expect(matchEntities('default/ledger', entities)).toEqual([]);
    expect(matchEntities('not a ref!', entities)).toEqual([]);
  });

  it('makes API specs the definition of API entities and links other files like the form', () => {
    const spec = parse(SAMPLE);
    const file = { path: 'api/order-events-2.asyncapi.yaml', kind: 'asyncapi' as const, name: 'Order events' };
    const onApi = applyEditsToValue(spec, entityLinkEdits(spec, indexOf(spec, 'order-events'), file, CONTEXT));
    expect(entitiesOf(onApi)[indexOf(spec, 'order-events')].entity.spec).toMatchObject({ definition: { $text: '../api/order-events-2.asyncapi.yaml' } });
    const onComponent = applyEditsToValue(spec, entityLinkEdits(spec, indexOf(spec, 'shop-api'), file, CONTEXT));
    expect(entitiesOf(onComponent)).toHaveLength(entitiesOf(spec).length + 1);
    const feature = { path: 'features/checkout.feature', kind: 'gherkin' as const, name: 'Checkout' };
    expect(entityLinkEdits(spec, indexOf(spec, 'shop-api'), feature, CONTEXT)).toEqual(linkSpecFileEdits(spec, indexOf(spec, 'shop-api'), feature, CONTEXT));
  });

  it('points networks to the trust zones of a threat model written from the catalog', () => {
    const spec = parse(INFRA);
    const context: CatalogContext = { file: 'catalog/shop.catalog-info.yaml', specFiles: [], entities: [], catalogFiles: [], threatModels: [], files: {} };
    const index = indexOf(spec, 'shop');
    const request = newSpecFileRequest(spec, index, context, 'otm', 'Shop')!;
    const file = { path: 'threat-models/shop.otm.yaml', kind: 'otm' as const, name: 'Shop' };
    const written = applyYamlDocumentEdits(INFRA, entityLinkEdits(spec, index, file, context, request));
    expect(written).toContain('sdd-studio/threat-models: ../threat-models/shop.otm.yaml');
    expect(written).toContain('sdd-studio/trust-zone: ../threat-models/shop.otm.yaml#dmz');
    // Without the threat model written from the catalog, only the link.
    expect(entityLinkEdits(spec, index, file, context)).toEqual(linkSpecFileEdits(spec, index, file, context));
  });

  it('keeps one markdown spec per entity and one definition per API', () => {
    const spec = parse(SAMPLE);
    const shop = indexOf(spec, 'shop-api');
    expect(linkConflict(spec, shop, { path: 'specs/shop-api.spec.md', kind: 'spec', name: 'Shop API' }, CONTEXT)).toBe(
      'Shop API already has a markdown spec: specs/payment-service.spec.md. An entity has one markdown spec: add the requirements there.',
    );
    expect(linkConflict(spec, shop, { path: 'specs/payment-service.spec.md', kind: 'spec', name: 'Payment service' }, CONTEXT)).toBeUndefined();
    expect(linkConflict(spec, shop, { path: 'features/checkout.feature', kind: 'gherkin', name: '' }, CONTEXT)).toBeUndefined();
    expect(linkConflict(spec, indexOf(spec, 'petstore-api'), { path: 'api/other.openapi.yaml', kind: 'openapi', name: '' }, CONTEXT)).toMatch(/already has a definition: api\/petstore\.openapi\.yaml/);
  });
});

const INFRA = `apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: shop
  title: Shop
  tags: [checkout]
spec:
  owner: team
---
apiVersion: backstage.io/v1alpha1
kind: Group
metadata:
  name: team
  title: Shop team
spec:
  type: team
  profile:
    email: team@example.com
  children: []
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: web
  title: Web shop
spec:
  type: website
  lifecycle: production
  owner: team
  system: shop
  consumesApis: [orders-api]
  dependsOn: [resource:dmz]
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: orders
  title: Orders service
spec:
  type: service
  lifecycle: production
  owner: team
  system: shop
  providesApis: [orders-api]
  dependsOn: [resource:private, resource:orders-db, resource:customer-data, component:payments]
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: orders-api
  title: Orders API
spec:
  type: openapi
  lifecycle: production
  owner: team
  system: shop
  definition: ''
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: orders-db
  title: Orders database
spec:
  type: database
  owner: team
  system: shop
  dependsOn: [resource:private]
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: customer-data
  title: Customer data
  description: Names and addresses.
  labels:
    sdd-studio/data-classification: confidential
spec:
  type: data-asset
  owner: team
  system: shop
  dependsOn: [resource:orders-db]
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: vpc
  title: VPC
spec:
  type: network
  owner: team
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: private
  title: Private subnet
spec:
  type: network
  owner: team
  dependsOn: [resource:vpc]
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: dmz
  title: DMZ
  description: Reachable from the internet.
spec:
  type: network
  owner: team
  dependsOn: [resource:vpc]
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payments
  title: Payments
spec:
  type: service
  lifecycle: production
  owner: team
`;

describe('threat models created from the catalog', () => {
  const context: CatalogContext = { file: 'catalog/shop.catalog-info.yaml', specFiles: [], entities: [], catalogFiles: [], threatModels: [], files: {} };

  it('turns networks, components, data assets and dependencies into a threat model', () => {
    const spec = parse(INFRA);
    const draft = threatModelDraft(spec, indexOf(spec, 'shop'), context)!;
    expect(draft.trustZones).toEqual([
      { name: 'VPC', id: 'vpc', risk: { trustRating: 50 } },
      { name: 'DMZ', id: 'dmz', description: 'Reachable from the internet.', parent: { trustZone: 'vpc' }, risk: { trustRating: 50 } },
      { name: 'Private subnet', id: 'private', parent: { trustZone: 'vpc' }, risk: { trustRating: 50 } },
      { name: 'Not placed yet', id: 'not-placed', description: expect.any(String), risk: { trustRating: 50 } },
    ]);
    expect(draft.components).toEqual([
      { name: 'Web shop', id: 'web', type: 'web-application', parent: { trustZone: 'dmz' } },
      { name: 'Orders service', id: 'orders', type: 'web-service', parent: { trustZone: 'private' }, assets: { processed: ['customer-data'] } },
      { name: 'Orders database', id: 'orders-db', type: 'database', parent: { trustZone: 'private' }, assets: { stored: ['customer-data'] } },
      // Outside the system, used by it, and in no network.
      { name: 'Payments', id: 'payments', type: 'web-service', parent: { trustZone: 'not-placed' } },
    ]);
    expect(draft.dataflows).toEqual([
      { name: 'Orders API', id: 'web-to-orders', description: 'Web shop uses Orders API.', source: 'web', destination: 'orders' },
      { name: 'Orders service to Orders database', id: 'orders-to-orders-db', source: 'orders', destination: 'orders-db' },
      { name: 'Orders service to Payments', id: 'orders-to-payments', source: 'orders', destination: 'payments' },
    ]);
    expect(draft.assets).toEqual([
      { name: 'Customer data', id: 'customer-data', description: 'Names and addresses.', risk: { confidentiality: 70, integrity: 50, availability: 50, comment: 'Classified confidential in the software catalog.' } },
    ]);
    expect(draft.networkLinks.map((l) => l.zoneId)).toEqual(['vpc', 'dmz', 'private']);
  });

  it('covers a component with what it talks to', () => {
    const spec = parse(INFRA);
    const draft = threatModelDraft(spec, indexOf(spec, 'web'), context)!;
    expect(draft.components.map((c) => c.id)).toEqual(['web', 'orders']);
    expect(draft.trustZones.map((z) => z.id)).toEqual(['vpc', 'dmz', 'private']);
  });

  it('writes a valid threat model, applies it and places networks in its trust zones', () => {
    const spec = parse(INFRA);
    const path = 'threat-models/shop.otm.yaml';
    const { request, text } = scaffold(spec, 'shop', 'otm', path, 'yaml', context);
    const otm = parseValue(text, 'yaml');
    expect(errors(analyzeOtm(otm))).toEqual([]);
    expect(otm).toMatchObject({ otmVersion: '0.2.0', project: { name: 'Shop', id: 'shop', owner: 'Shop team', ownerContact: 'team@example.com', tags: ['checkout'] }, threats: [], mitigations: [] });

    const index = indexOf(spec, 'shop');
    const file = { path, kind: 'otm' as const, name: 'Shop' };
    const edits = [...linkSpecFileEdits(spec, index, file, context), ...trustZoneLinkEdits(spec, request, path, context)];
    const written = applyYamlDocumentEdits(INFRA, edits);
    const linked = parse(written);
    expect(written).toContain('sdd-studio/threat-models: ../threat-models/shop.otm.yaml');
    expect(written).toContain('sdd-studio/trust-zone: ../threat-models/shop.otm.yaml#dmz');

    const after: CatalogContext = { ...context, specFiles: [file], threatModels: [{ path, name: 'Shop', ...outlineOtm(path, text) }], files: { [path]: true } };
    expect(analyzeCatalog(linked, after).map((i) => i.message)).toEqual([
      expect.stringContaining('definition'),
    ]);
  });

  it('keeps the trust zones networks already stand for', () => {
    const spec = parse(SAMPLE);
    const draft = threatModelDraft(spec, indexOf(spec, 'shop-api'), CONTEXT)!;
    expect(draft.trustZones).toEqual([{ name: 'Private network', id: 'private', type: 'private', risk: { trustRating: 90 } }]);
    expect(draft.networkLinks).toEqual([]);
    expect(draft.representations).toEqual([{ name: 'Shop repository', id: 'shop-repo', type: 'code', repository: { url: 'https://gitlab.com/acme/shop' } }]);
  });
});
