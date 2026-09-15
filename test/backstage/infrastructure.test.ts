import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeCatalog } from '../../src/modules/backstage/core/analysis';
import {
  addRefEdits,
  deleteEntityEdits,
  importNetworksEdits,
  newEntity,
  placeLikeThreatModelEdits,
  referencedPaths,
  renameEntityEdits,
  setAnnotationEdits,
  setParentNetworkEdits,
  sourceLocationEdits,
  unlinkAnnotationEdits,
} from '../../src/modules/backstage/core/edits';
import {
  ancestors,
  annotationList,
  entitiesOf,
  entityAt,
  incoming,
  knownEntities,
  placementsOf,
  refField,
  sourceLocation,
  type CatalogContext,
} from '../../src/modules/backstage/core/model';
import { summarizeCatalog } from '../../src/modules/backstage/core/summary';
import { outlineOtm } from '../../src/modules/otm/core/summary';
import { applyEditsToValue, type SpecEdit } from '../../src/shared/structured/edits';
import { applyYamlDocumentEdits, parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const FILE = 'catalog/online-shop.catalog-info.yaml';
const SAMPLE = readFileSync(join(__dirname, 'fixtures/online-shop-infra.catalog-info.yaml'), 'utf8');
const OTM = readFileSync(join(__dirname, '../otm/fixtures/online-shop.otm.yaml'), 'utf8');
const OTM_PATH = 'threat-models/online-shop.otm.yaml';

const parse = (text: string) => {
  const result = parseYamlDocuments(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const sample = () => parse(SAMPLE);

/** Applies edits (plus the source locations they imply, as the form does) to the text. */
function apply(text: string, edits: SpecEdit[], context: CatalogContext = CONTEXT) {
  const before = parse(text);
  const all = [...edits, ...sourceLocationEdits(before, applyEditsToValue(before, edits), context)];
  const written = applyYamlDocumentEdits(text, all);
  expect(parse(written)).toEqual(applyEditsToValue(before, all));
  return written;
}

const CONTEXT: CatalogContext = {
  file: FILE,
  specFiles: [
    { path: 'api/petstore.openapi.yaml', kind: 'openapi', name: 'Petstore' },
    { path: 'api/order-events.asyncapi.yaml', kind: 'asyncapi', name: 'Order events' },
    { path: 'specs/payment-service.spec.md', kind: 'spec', name: 'Payment service' },
    { path: 'features/shop.feature', kind: 'gherkin', name: 'Shop' },
    { path: OTM_PATH, kind: 'otm', name: 'Online shop' },
  ],
  entities: [],
  catalogFiles: [],
  threatModels: [{ path: OTM_PATH, name: 'Online shop', ...outlineOtm(OTM_PATH, OTM) }],
  files: Object.fromEntries(['api/petstore.openapi.yaml', 'api/order-events.asyncapi.yaml', 'specs/payment-service.spec.md', 'features/shop.feature', OTM_PATH].map((p) => [p, true])),
};

const messages = (spec: unknown, context: CatalogContext | undefined = CONTEXT) => analyzeCatalog(spec, context).map((i) => `${i.severity}: ${i.message}`);
const indexOf = (spec: unknown, name: string) => entitiesOf(spec).find((e) => e.name === name)!.index;
const docOf = (text: string, name: string) => text.split(/^---$/m).find((d) => new RegExp(`^  name: ${name}$`, 'm').test(d)) ?? '';

describe('networks, artifacts and repositories', () => {
  it('reads the threat model outline and the sample', () => {
    expect(CONTEXT.threatModels[0]).toMatchObject({
      trustZones: [
        { id: 'internet', name: 'Internet', type: 'internet', trustRating: 10, description: 'Anything outside our network.' },
        { id: 'private', name: 'Private network', type: 'private', trustRating: 90 },
      ],
      components: [
        { id: 'browser', name: 'Browser', trustZone: 'internet' },
        { id: 'shop-api', name: 'Shop API', trustZone: 'private' },
        { id: 'orders-db', name: 'Orders database', trustZone: 'private' },
      ],
    });
    expect(summarizeCatalog(FILE, SAMPLE).summary.details).toEqual([
      '1 domain',
      '1 system',
      '2 components',
      '2 APIs',
      '1 resource',
      '1 data asset',
      '2 networks',
      '1 platform',
      '1 infrastructure',
      '1 site',
      '1 repository',
      '3 artifacts',
      '2 groups',
    ]);
    expect(messages(sample())).toEqual([]);
    expect(referencedPaths(sample(), FILE)).toContain(OTM_PATH);
  });

  it('relates repositories, artifacts and networks', () => {
    const known = knownEntities(sample(), CONTEXT);
    expect(incoming('resource:default/shop-repo', known).map((r) => `${r.entity.name} ${r.field}`)).toEqual([
      'shop-api repository',
      'deploy-cli repository',
      'shop-api-image repository',
      'deploy-cli-image producedBy',
    ]);
    expect(incoming('component:default/shop-api', known).filter((r) => r.field === 'producedBy').map((r) => r.entity.name)).toEqual(['shop-api-image']);
    expect(incoming('resource:default/private', known).map((r) => r.entity.name)).toEqual(['shop-api', 'orders-db', 'prod-eks-cluster', 'db-host']);
    expect(known.find((e) => e.name === 'private')).toMatchObject({ category: 'network', trustZone: { path: OTM_PATH, id: 'private' } });
  });
});

describe('networks and trust zones', () => {
  it('compares where entities run with the threat model', () => {
    const spec = sample();
    const known = knownEntities(spec, CONTEXT);
    expect(placementsOf('component:default/shop-api', known, CONTEXT).map((p) => [p.component.id, p.matches, p.expected.map((n) => n.name)])).toEqual([['shop-api', true, ['private']]]);
    expect(placementsOf('component:default/deploy-cli', known, CONTEXT)).toEqual([]);

    // Move the API to the internet: reported, and fixed in one click.
    const api = indexOf(spec, 'shop-api');
    const moved = parse(apply(SAMPLE, [{ op: 'set', path: ['documents', api, 'spec', 'dependsOn', 2], value: 'resource:internet' }]));
    expect(messages(moved)).toEqual(['warning: Component Shop API: runs in Internet but threat-models/online-shop.otm.yaml places it in trust zone Private network (Private network)']);
    const [placement] = placementsOf('component:default/shop-api', knownEntities(moved, CONTEXT), CONTEXT);
    const fixed = applyEditsToValue(moved, placeLikeThreatModelEdits(moved, api, placement));
    expect(entitiesOf(fixed)[api].entity.spec).toMatchObject({ dependsOn: ['resource:orders-db', 'resource:card-data', 'resource:private'] });
    expect(messages(fixed)).toEqual([]);
  });

  it('imports networks from the trust zones of a threat model', () => {
    const text = 'apiVersion: backstage.io/v1alpha1\nkind: System\nmetadata:\n  name: shop\nspec:\n  owner: team\n';
    const context = { ...CONTEXT, file: 'catalog-info.yaml' };
    const outline = { ...context.threatModels[0], trustZones: [...context.threatModels[0].trustZones, { id: 'cards', name: 'Card vault', parent: 'private' }] };
    const written = apply(text, importNetworksEdits(parse(text), outline, context), context);
    expect(written).toBe(
      `${text}---\napiVersion: backstage.io/v1alpha1\nkind: Resource\nmetadata:\n  name: internet\n  title: Internet\n  description: Anything outside our network.\n  annotations:\n    sdd-studio/trust-zone: ./threat-models/online-shop.otm.yaml#internet\nspec:\n  type: network\n  owner: team\n` +
        `---\napiVersion: backstage.io/v1alpha1\nkind: Resource\nmetadata:\n  name: private\n  title: Private network\n  annotations:\n    sdd-studio/trust-zone: ./threat-models/online-shop.otm.yaml#private\nspec:\n  type: network\n  owner: team\n` +
        `---\napiVersion: backstage.io/v1alpha1\nkind: Resource\nmetadata:\n  name: cards\n  title: Card vault\n  annotations:\n    sdd-studio/trust-zone: ./threat-models/online-shop.otm.yaml#cards\nspec:\n  type: network\n  owner: team\n  dependsOn:\n    - resource:private\n`,
    );
    const spec = parse(written);
    expect(ancestors('resource:default/cards', knownEntities(spec, context)).map((e) => e.name)).toEqual(['private']);
    // Nothing left to import.
    expect(importNetworksEdits(spec, outline, context)).toEqual([]);
  });

  it('nests networks and reports broken trust zones', () => {
    const spec = sample();
    const known = knownEntities(spec, CONTEXT);
    const priv = indexOf(spec, 'private');
    const internet = known.find((e) => e.name === 'internet')!;
    const nested = applyEditsToValue(spec, setParentNetworkEdits(spec, priv, internet, known));
    expect(entitiesOf(nested)[priv].entity.spec).toMatchObject({ dependsOn: ['resource:internet'] });
    expect(ancestors('resource:default/private', knownEntities(nested, CONTEXT)).map((e) => e.name)).toEqual(['internet']);
    expect(entitiesOf(applyEditsToValue(nested, setParentNetworkEdits(nested, priv, undefined, known)))[priv].entity.spec).not.toHaveProperty('dependsOn');

    const broken = applyEditsToValue(spec, [
      ...setAnnotationEdits(spec, priv, 'sdd-studio/trust-zone', '../threat-models/online-shop.otm.yaml#vault'),
      ...setAnnotationEdits(spec, priv, 'sdd-studio/cidr', '10.20.0.0/16, 10.300.0'),
    ]);
    expect(messages(broken)).toEqual([
      'warning: Network Private network: trust zone "vault" is not defined in threat-models/online-shop.otm.yaml',
      'warning: Network Private network: "10.300.0" is not an IP range (e.g. 10.0.0.0/16 or 2001:db8::/32)',
    ]);
  });
});

describe('repositories and source locations', () => {
  it('writes Backstage source locations for each provider', () => {
    const repo = { provider: 'gitlab', url: 'https://gitlab.com/acme/shop.git', branch: 'main' };
    expect(sourceLocation(repo, 'services/api')).toBe('url:https://gitlab.com/acme/shop/-/tree/main/services/api/');
    expect(sourceLocation({ ...repo, provider: 'github' }, './services/api/')).toBe('url:https://gitlab.com/acme/shop/tree/main/services/api/');
    expect(sourceLocation({ ...repo, provider: 'bitbucket', branch: '' }, 'x')).toBe('url:https://gitlab.com/acme/shop/src/HEAD/x/');
    expect(sourceLocation({ url: 'https://svn.example.com/shop' })).toBe('url:https://svn.example.com/shop/');
    expect(sourceLocation({ url: 'https://svn.example.com/shop' }, 'trunk/api')).toBeUndefined();
    expect(sourceLocation({ provider: 'perforce', url: 'ssl:perforce.example.com:1666' })).toBeUndefined();
  });

  it('keeps source locations in line with the repository, but not those written by hand', () => {
    const spec = sample();
    const repo = indexOf(spec, 'shop-repo');
    let text = apply(SAMPLE, setAnnotationEdits(spec, repo, 'sdd-studio/repository-url', 'https://gitlab.example.com/acme/shop'));
    expect(text.match(/backstage\.io\/source-location: url:https:\/\/gitlab\.example\.com\/acme\/shop\/-\/tree\/main\/\S+/g)).toEqual([
      'backstage.io/source-location: url:https://gitlab.example.com/acme/shop/-/tree/main/services/shop-api/',
      'backstage.io/source-location: url:https://gitlab.example.com/acme/shop/-/tree/main/tools/deploy/',
      'backstage.io/source-location: url:https://gitlab.example.com/acme/shop/-/tree/main/services/shop-api/',
    ]);

    // A value written by hand stays; unlinking removes the one the repository gave.
    const cli = indexOf(parse(text), 'deploy-cli');
    text = apply(text, setAnnotationEdits(parse(text), cli, 'backstage.io/source-location', 'url:https://mirror.example.com/deploy/'));
    text = apply(text, setAnnotationEdits(parse(text), cli, 'sdd-studio/repository-path', 'tools/deploy-v2'));
    expect(docOf(text, 'deploy-cli')).toContain('backstage.io/source-location: url:https://mirror.example.com/deploy/');
    const api = indexOf(parse(text), 'shop-api');
    text = apply(text, setAnnotationEdits(parse(text), api, 'sdd-studio/repository', undefined));
    expect(docOf(text, 'shop-api')).not.toContain('source-location');

    // Linking an entity writes it.
    const db = indexOf(parse(text), 'orders-db');
    text = apply(text, setAnnotationEdits(parse(text), db, 'sdd-studio/repository', 'shop-repo'));
    expect(docOf(text, 'orders-db')).toContain(
      '  title: Orders database\n  annotations:\n    sdd-studio/deployed-on: db-host\n    sdd-studio/repository: shop-repo\n    backstage.io/source-location: url:https://gitlab.example.com/acme/shop/-/tree/main/\n',
    );
  });

  it('renames and deletes repositories with their references', () => {
    const spec = sample();
    const text = apply(SAMPLE, renameEntityEdits(spec, indexOf(spec, 'shop-repo'), 'monorepo'));
    expect(text.match(/sdd-studio\/repository: monorepo$/gm)).toHaveLength(3);
    const withoutRepo = parse(apply(text, deleteEntityEdits(parse(text), indexOf(parse(text), 'monorepo'))));
    expect(messages(withoutRepo)).toEqual([
      'warning: Component Shop API: repository "monorepo" is not defined in the catalog files of the workspace',
      'warning: Component Deploy CLI: repository "monorepo" is not defined in the catalog files of the workspace',
      'warning: Artifact Shop API image: repository "monorepo" is not defined in the catalog files of the workspace',
      'warning: Artifact Deploy CLI image: produced by "resource:monorepo" is not defined in the catalog files of the workspace',
    ]);
  });

  it('checks artifacts and repositories', () => {
    const spec = sample();
    const artifact = newEntity(spec, 'artifact', 'Web bundle', { metadata: { annotations: { 'sdd-studio/purl': 'npm:web-bundle', 'sdd-studio/repository': 'orders-db' } } });
    const repository = newEntity(spec, 'repository', 'Legacy');
    const text = `${SAMPLE}---\n${JSON.stringify(artifact)}\n---\n${JSON.stringify(repository)}\n`;
    expect(messages(parse(text))).toEqual([
      'warning: Artifact Web bundle: repository "orders-db" must point to a repository',
      'warning: Artifact Web bundle: package URL "npm:web-bundle" does not look like a purl (pkg:type/namespace/name@version)',
      'warning: Repository Legacy: the repository has no URL or address',
    ]);
  });
});

describe('platforms, infrastructure and sites', () => {
  it('reads the fixture with no issues', () => {
    expect(messages(sample())).toEqual([]);
  });

  it('creates platforms, infrastructure and sites with their fixed type', () => {
    const spec = sample();
    expect(newEntity(spec, 'platform', 'Staging cluster')).toMatchObject({ spec: { type: 'platform', owner: 'checkout-team' } });
    expect(newEntity(spec, 'infrastructure', 'Bastion host')).toMatchObject({ spec: { type: 'infrastructure', owner: 'checkout-team' } });
    expect(newEntity(spec, 'site', 'Azure West Europe')).toMatchObject({ spec: { type: 'site', owner: 'checkout-team' } });
  });

  it('reads and links deployedOn (a comma-separated annotation, not a spec list)', () => {
    const spec = sample();
    const api = indexOf(spec, 'shop-api');
    expect(annotationList(entityAt(spec, api)!.entity, 'sdd-studio/deployed-on')).toEqual(['prod-eks-cluster']);
    const dbHost = knownEntities(spec, CONTEXT).find((e) => e.name === 'db-host')!;
    let text = apply(SAMPLE, addRefEdits(spec, api, 'deployedOn', dbHost));
    expect(docOf(text, 'shop-api')).toContain('sdd-studio/deployed-on: prod-eks-cluster, db-host');
    // Adding the same target again is a no-op; removing one entry keeps the others.
    expect(apply(text, addRefEdits(parse(text), api, 'deployedOn', dbHost))).toBe(text);
    text = apply(text, unlinkAnnotationEdits(entityAt(parse(text), api)!, parse(text), 'sdd-studio/deployed-on', 'prod-eks-cluster'));
    expect(docOf(text, 'shop-api')).toContain('sdd-studio/deployed-on: db-host');
  });

  it('relates deployments and sites, with their reverse labels', () => {
    const known = knownEntities(sample(), CONTEXT);
    expect(incoming('resource:default/prod-eks-cluster', known).map((r) => `${r.entity.name} ${r.field}`)).toEqual(['shop-api deployedOn']);
    expect(incoming('resource:default/db-host', known).map((r) => `${r.entity.name} ${r.field}`)).toEqual(['orders-db deployedOn']);
    expect(incoming('resource:default/aws-us-east-1', known).map((r) => `${r.entity.name} ${r.field}`)).toEqual(['prod-eks-cluster site', 'db-host site']);
    expect(refField('resource', 'deployedOn')?.reverse).toBe('Deployed here');
    expect(refField('resource', 'site')?.reverse).toBe('Hosts');
  });

  it('checks deployedOn and site references point to the right category', () => {
    const spec = sample();
    const text = apply(SAMPLE, [
      ...addRefEdits(spec, indexOf(spec, 'shop-api'), 'deployedOn', { kind: 'Resource', namespace: 'default', name: 'orders-db' }),
      ...setAnnotationEdits(spec, indexOf(spec, 'prod-eks-cluster'), 'sdd-studio/site', 'shop-api-image'),
    ]);
    expect(messages(parse(text))).toEqual([
      'warning: Component Shop API: deployed on "orders-db" must point to a platform or a infrastructure',
      'warning: Platform Prod EKS cluster: site "shop-api-image" must point to a site',
    ]);
  });
});
