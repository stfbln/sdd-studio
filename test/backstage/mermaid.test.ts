import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDiagram,
  DEFAULT_DIAGRAM,
  diagramMarkdown,
  escapeLabel,
  hierarchyRows,
  nodeLabel,
  relatedEntities,
  subtreeKeys,
  suggestedTitle,
  wrapText,
  type DiagramOptions,
} from '../../src/modules/backstage/core/mermaid';
import { entitiesOf, summarizeEntity, type EntitySummary } from '../../src/modules/backstage/core/model';
import { parseYamlDocuments } from '../../src/shared/structured/yamlDocuments';

const FILE = 'specs/catalogs/online-shop.catalog-info.yaml';

function entitiesFrom(text: string, file = FILE): EntitySummary[] {
  const parsed = parseYamlDocuments(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return entitiesOf(parsed.value).map((info) => summarizeEntity(info, file));
}

const fixture = (name: string) => entitiesFrom(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

const entity = (kind: string, name: string, spec: string, metadata = '') =>
  `apiVersion: backstage.io/v1alpha1\nkind: ${kind}\nmetadata:\n  name: ${name}\n${metadata}spec:\n${spec}`;

const catalog = (...documents: string[]) => entitiesFrom(documents.join('---\n'));

const options = (selected: EntitySummary[], overrides: Partial<DiagramOptions> = {}): DiagramOptions => ({
  ...DEFAULT_DIAGRAM,
  selected: selected.map((e) => e.key),
  ...overrides,
});

const all = (entities: EntitySummary[], overrides: Partial<DiagramOptions> = {}) => buildDiagram(entities, options(entities, overrides));

/** Lines of the diagram without the init directive and the flowchart line, for readable assertions. */
const body = (text: string) => text.split('\n').slice(2).map((l) => l.trim()).filter(Boolean);

describe('nesting', () => {
  it('draws the hierarchy as boxes inside boxes, never as arrows', () => {
    const entities = fixture('online-shop.catalog-info.yaml');
    const software = entities.filter((e) => ['domain', 'system', 'component', 'api', 'resource', 'dataAsset'].includes(e.category));
    const { text, entities: count } = buildDiagram(entities, options(software));

    expect(count).toBe(software.length);
    expect(text).toContain('subgraph domain_commerce["Commerce"]');
    expect(text).toContain('subgraph system_online_shop["Online shop"]');
    expect(text).toContain('component_shop_api["Shop API"]');
    // The system is inside the domain, the component inside the system.
    const lines = text.split('\n');
    const domain = lines.findIndex((l) => l.includes('subgraph domain_commerce'));
    const system = lines.findIndex((l) => l.includes('subgraph system_online_shop'));
    const component = lines.findIndex((l) => l.includes('component_shop_api['));
    expect(domain).toBeLessThan(system);
    expect(system).toBeLessThan(component);
    expect(component).toBeLessThan(lines.findIndex((l) => l.trim() === 'end'));
    // No arrow stands for "is in this system" or "is in this domain".
    expect(text).not.toMatch(/\|(system|domain|part of)\|/);
  });

  it('puts an entity in the closest entity that is drawn', () => {
    const entities = catalog(
      entity('Domain', 'commerce', '  owner: team\n'),
      entity('System', 'shop', '  owner: team\n  domain: commerce\n'),
      entity('Component', 'api', '  owner: team\n  system: shop\n'),
    );
    const [domain, , component] = entities;
    // The system is left out: the component lands in the domain instead of floating alone.
    const { text } = buildDiagram(entities, options([domain, component]));
    expect(body(text)).toEqual(['subgraph domain_commerce["commerce"]', 'component_api["api"]', 'end', 'classDef component fill:#e0f2fe,stroke:#0284c7,stroke-width:1px,color:#0f172a;', 'class component_api component;', 'style domain_commerce fill:#faf7ff,stroke:#7c3aed,stroke-width:1px,color:#0f172a;']);
  });

  it('nests subcomponents and child networks, without repeating them as arrows', () => {
    const entities = catalog(
      entity('Component', 'shop', '  owner: team\n'),
      entity('Component', 'worker', '  owner: team\n  subcomponentOf: shop\n'),
      entity('Resource', 'internet', '  type: network\n  owner: team\n'),
      entity('Resource', 'private', '  type: network\n  owner: team\n  dependsOn: [resource:internet]\n'),
    );
    const { text, arrows } = all(entities, { relations: ['apis', 'dependencies', 'deployment'] });
    expect(text).toContain('subgraph component_shop["shop"]');
    expect(text).toContain('component_worker["worker"]');
    expect(text).toContain('subgraph network_internet["internet"]');
    expect(text).toContain('network_private{{"private"}}');
    expect(arrows).toBe(0);
  });

  it('leaves out entities the catalog no longer has', () => {
    const entities = catalog(entity('Component', 'shop', '  owner: team\n'));
    const diagram = buildDiagram(entities, { ...DEFAULT_DIAGRAM, selected: [entities[0].key, 'component:default/gone'] });
    expect(diagram.missing).toEqual(['component:default/gone']);
    expect(diagram.entities).toBe(1);
  });

  it('is empty when nothing is selected', () => {
    expect(buildDiagram(fixture('online-shop.catalog-info.yaml'), DEFAULT_DIAGRAM)).toEqual({ text: '', entities: 0, arrows: 0, missing: [] });
  });
});

describe('arrows', () => {
  const entities = catalog(
    entity('System', 'shop', '  owner: team\n'),
    entity('Component', 'web', '  owner: team\n  system: shop\n  consumesApis: [orders-api]\n  dependsOn: [resource:orders-db]\n'),
    entity('Component', 'orders', '  owner: team\n  system: shop\n  providesApis: [orders-api]\n'),
    entity('API', 'orders-api', '  type: openapi\n  owner: team\n  system: shop\n'),
    entity('Resource', 'orders-db', '  type: database\n  owner: team\n  system: shop\n  dependencyOf: [component:orders]\n'),
    entity('Group', 'team', '  type: team\n  children: []\n'),
  );

  it('labels what each relationship says and points the arrow the same way on both sides', () => {
    const { text, arrows } = all(entities);
    expect(body(text).filter((l) => l.includes('-->'))).toEqual([
      'component_web -->|consumes| api_orders_api',
      'component_web -->|uses| resource_orders_db',
      'component_orders -->|provides| api_orders_api',
      // orders-db says it is a dependency of orders: the same arrow as a dependsOn, drawn once.
      'component_orders -->|uses| resource_orders_db',
    ]);
    expect(arrows).toBe(4);
  });

  it('only draws the groups of relationships that are asked for', () => {
    expect(all(entities, { relations: ['apis'] }).arrows).toBe(2);
    expect(all(entities, { relations: [] }).arrows).toBe(0);
    const owners = all(entities, { relations: ['ownership'] });
    expect(owners.text).toContain('group_team -.->|owns| system_shop');
    expect(owners.arrows).toBe(5);
  });

  it('draws deployment and code as dashed arrows', () => {
    const infra = fixture('online-shop-infra.catalog-info.yaml');
    const { text } = buildDiagram(infra, options(infra, { relations: ['deployment', 'code'] }));
    expect(text).toContain('platform_prod_eks_cluster -.->|runs in| network_private');
    expect(text).toContain('platform_prod_eks_cluster -.->|hosted at| site_aws_us_east_1');
    expect(text).toContain('artifact_shop_api_image -.->|code in| repository_shop_repo');
    expect(text).toContain('component_shop_api -.->|builds| artifact_shop_api_image');
  });

  it('never draws an arrow between a box and the box holding it', () => {
    const entities = catalog(
      entity('System', 'shop', '  owner: team\n'),
      // A component of the system that also says it depends on it.
      entity('Component', 'web', '  owner: team\n  system: shop\n  dependsOn: [system:shop]\n'),
    );
    expect(all(entities).arrows).toBe(0);
  });
});

describe('labels', () => {
  const entities = catalog(
    entity(
      'Component',
      'shop-api',
      '  type: service\n  owner: team\n',
      '  title: Shop "API"\n  description: Orders, payments and the product catalog of the shop, end to end.\n',
    ),
  );

  it('shows the display name alone', () => {
    expect(all(entities, { labels: 'name' }).text).toContain('component_shop_api["Shop #quot;API#quot;"]');
  });

  it('adds what the entity is and its description, wrapped', () => {
    expect(all(entities, { labels: 'description' }).text).toContain(
      'component_shop_api["Shop #quot;API#quot;<br/>[Component · service]<br/>Orders, payments and the<br/>product catalog of the shop,<br/>end to end."]',
    );
  });

  it('escapes what would end the label or start a tag', () => {
    expect(escapeLabel('a "b" <c> & #d')).toBe('a #quot;b#quot; #lt;c#gt; #amp; #35;d');
  });

  it('wraps long text and cuts it off after three lines', () => {
    expect(wrapText('one two three four five six')).toEqual(['one two three four five six']);
    expect(wrapText('a'.repeat(70), 10, 3)).toEqual(['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaa…']);
    expect(wrapText('the quick brown fox jumps over the lazy dog and keeps running', 20, 2)).toEqual(['the quick brown fox', 'jumps over the lazy…']);
  });

  it('does not repeat the category as the type of a data asset, network or artifact', () => {
    const [asset, network] = catalog(
      entity('Resource', 'card-data', '  type: data-asset\n  owner: team\n'),
      entity('Resource', 'private', '  type: network\n  owner: team\n'),
    );
    expect(nodeLabel(asset, 'description')).toBe('card-data<br/>[Data asset]');
    expect(nodeLabel(network, 'description')).toBe('private<br/>[Network]');
  });

  it('falls back to the name when an entity has no title', () => {
    const [nameless] = catalog(entity('Component', 'worker', '  owner: team\n'));
    expect(nodeLabel(nameless, 'name')).toBe('worker');
    expect(nodeLabel(nameless, 'description')).toBe('worker<br/>[Component]');
  });
});

describe('what a focus is connected to', () => {
  const entities = fixture('online-shop.catalog-info.yaml');
  const key = (name: string) => entities.find((e) => e.name === name)!.key;
  const related = (...names: string[]) => relatedEntities(entities, names.map(key));
  const row = (list: ReturnType<typeof relatedEntities>, name: string) => list.find((r) => r.entity.name === name);

  it('lists what the focus points to and what points at it, read from the other entity', () => {
    const list = related('shop-api');
    expect(row(list, 'online-shop')).toMatchObject({ groups: ['around'], connections: ['contains Shop API'] });
    expect(row(list, 'petstore-api')).toMatchObject({ groups: ['apis'], connections: ['provided by Shop API'] });
    expect(row(list, 'orders-db')).toMatchObject({ groups: ['dependencies'], connections: ['used by Shop API'] });
    expect(row(list, 'checkout-team')).toMatchObject({ groups: ['ownership'], connections: ['owns Shop API'] });
  });

  it('leaves out entities with no connection to the focus', () => {
    // Both components are in the same system, but nothing links one to the other.
    expect(row(related('shop-api'), 'deploy-cli')).toBeUndefined();
    expect(relatedEntities(entities, [])).toEqual([]);
    expect(relatedEntities(entities, ['component:default/gone'])).toEqual([]);
  });

  it('gathers the connections of a focus of several entities, and never the focus itself', () => {
    const list = related('shop-api', 'online-shop');
    expect(row(list, 'online-shop')).toBeUndefined();
    expect(row(list, 'commerce')).toMatchObject({ groups: ['around'], connections: ['contains Online shop'] });
    // The database is used by the component and part of the system.
    expect(row(list, 'orders-db')!.groups).toEqual(['inside', 'dependencies']);
    expect(row(list, 'orders-db')!.connections).toEqual(['used by Shop API', 'in Online shop']);
  });

  it('reads deployment, code and ownership from both ends', () => {
    const infra = fixture('online-shop-infra.catalog-info.yaml');
    const at = (focus: string, name: string) => relatedEntities(infra, [infra.find((e) => e.name === focus)!.key]).find((r) => r.entity.name === name);
    expect(at('shop-api', 'private')!.connections).toEqual(['hosts Shop API']);
    expect(at('private', 'shop-api')!.connections).toEqual(['runs in Private network']);
    expect(at('shop-api', 'shop-repo')!.connections).toEqual(['holds code for Shop API']);
    expect(at('shop-repo', 'shop-api')!.connections).toEqual(['code in Shop repository']);
    expect(at('shop-api', 'shop-api-image')!.connections).toEqual(['built by Shop API']);
    expect(at('aws-us-east-1', 'prod-eks-cluster')!.connections).toEqual(['hosted at AWS us-east-1']);
    expect(at('checkout-team', 'shop-api')!.connections).toEqual(['owned by Checkout team']);
  });

  it('offers the groups in the order of the wizard, boxes first', () => {
    expect(related('shop-api').map((r) => r.groups[0])).toEqual(['around', 'apis', 'apis', 'dependencies', 'dependencies', 'ownership']);
  });
});

describe('the focus', () => {
  const entities = fixture('online-shop.catalog-info.yaml');
  const key = (name: string) => entities.find((e) => e.name === name)!.key;

  it('gives the entities the diagram is about a stronger outline', () => {
    const { text } = buildDiagram(entities, { ...DEFAULT_DIAGRAM, selected: [key('online-shop'), key('shop-api'), key('deploy-cli')], focus: [key('shop-api')] });
    expect(text).toContain('style component_shop_api fill:#e0f2fe,stroke:#0284c7,stroke-width:2.5px,color:#0f172a;');
    // The other entities keep the outline of their category, the system stays a plain container.
    expect(text).not.toContain('style component_deploy_cli');
    expect(text).toContain('style system_online_shop fill:#f5f9ff,stroke:#2563eb,stroke-width:1px,color:#0f172a;');
  });

  it('outlines a box holding other ones too, and ignores a focus left out of the diagram', () => {
    const { text } = buildDiagram(entities, { ...DEFAULT_DIAGRAM, selected: [key('online-shop'), key('shop-api')], focus: [key('online-shop'), key('orders-db')] });
    expect(text).toContain('style system_online_shop fill:#f5f9ff,stroke:#2563eb,stroke-width:2.5px,color:#0f172a;');
    expect(text).not.toContain('orders_db');
  });
});

describe('the picker', () => {
  const entities = fixture('online-shop.catalog-info.yaml');

  it('lists entities as a tree, children below the entity holding them', () => {
    const rows = hierarchyRows(entities, ['domain', 'system', 'component', 'api', 'resource', 'dataAsset']);
    expect(rows.map((r) => `${'  '.repeat(r.depth)}${r.entity.name}`)).toEqual([
      'commerce',
      '  online-shop',
      '    deploy-cli',
      '    shop-api',
      '    order-events',
      '    petstore-api',
      '    orders-db',
      '    card-data',
    ]);
  });

  it('keeps entities of other groups out, and their children with them', () => {
    expect(hierarchyRows(entities, ['group', 'user']).map((r) => r.entity.name)).toEqual(['checkout-team', 'platform-team']);
  });

  it('gives the keys of an entity and everything inside it', () => {
    const rows = hierarchyRows(entities, ['domain', 'system', 'component', 'api', 'resource', 'dataAsset']);
    const system = entities.find((e) => e.name === 'online-shop')!;
    expect(subtreeKeys(rows, system.key)).toHaveLength(7);
    expect(subtreeKeys(rows, entities.find((e) => e.name === 'shop-api')!.key)).toEqual([entities.find((e) => e.name === 'shop-api')!.key]);
    expect(subtreeKeys(rows, 'component:default/gone')).toEqual([]);
  });

  it('offers the title of the one entity everything hangs from', () => {
    const software = entities.filter((e) => ['system', 'component', 'api', 'resource', 'dataAsset'].includes(e.category));
    expect(suggestedTitle(entities, software.map((e) => e.key))).toBe('Online shop');
    expect(suggestedTitle(entities, entities.map((e) => e.key))).toBe('');
    expect(suggestedTitle(entities, [])).toBe('');
  });
});

describe('the exported file', () => {
  it('wraps the diagram in a markdown file that renders the fence', () => {
    expect(diagramMarkdown('Online shop', 'flowchart LR')).toContain('# Online shop');
    expect(diagramMarkdown('', 'flowchart LR')).toContain('# Software catalog diagram');
    expect(diagramMarkdown('Online shop', 'flowchart LR')).toContain('```mermaid\nflowchart LR\n```');
  });

  it('starts with the layout and colours, so every renderer shows the same thing', () => {
    const { text } = all(catalog(entity('Component', 'shop', '  owner: team\n')));
    expect(text.split('\n')[0]).toMatch(/^%%\{init: .*"flowchart": \{"nodeSpacing"/);
    expect(text.split('\n')[1]).toBe('flowchart LR');
    expect(all(catalog(entity('Component', 'shop', '  owner: team\n')), { direction: 'TB' }).text).toContain('\nflowchart TB\n');
  });

  it('gives every box a unique id', () => {
    const entities = catalog(
      entity('Component', 'shop', '  owner: team\n'),
      entity('Resource', 'shop', '  type: database\n  owner: team\n'),
      entity('Component', 'shop', '  owner: team\n', '  namespace: other\n'),
    );
    const ids = [...all(entities).text.matchAll(/^ {2}(\w+)[[({]/gm)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('component_shop');
    expect(ids).toContain('component_shop_2');
    expect(ids).toContain('resource_shop');
  });
});
