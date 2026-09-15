import { describe, expect, it } from 'vitest';
import {
  implementMissing,
  implementPrompt,
  newSystemMissing,
  newSystemPrompt,
  updateSpecsMissing,
  updateSpecsPrompt,
  type NewSystemInput,
  type PromptEntity,
} from '../../src/modules/prompts/core/prompts';
import { MCP_TOOLS } from '../../src/shared/mcpTools';
import { SOURCE_OF_TRUTH_RULES } from '../../src/shared/purposes';

const SYSTEM: NewSystemInput = {
  name: 'Online shop',
  owner: 'Checkout team',
  domain: '',
  context: 'Customers pay by card.\nPCI DSS applies.',
  assets: [
    { category: 'component', name: 'Shop API', type: 'service', description: 'Takes orders\nand payments.' },
    { category: 'dataAsset', name: 'Card data', type: 'restricted', description: '' },
    { category: 'resource', name: '  ', type: '', description: 'ignored: no name' },
  ],
  askQuestions: true,
  threatModel: true,
};

const SHOP_API: PromptEntity = { ref: 'component:shop-api', category: 'component', kind: 'Component', type: 'service', title: 'Shop API', description: 'Orders and payments.', system: 'system:online-shop', file: 'catalog/online-shop.catalog-info.yaml', workspaceFolder: '' };
const ORDERS_DB: PromptEntity = { ref: 'resource:orders-db', category: 'resource', kind: 'Resource', type: 'database', file: 'catalog/online-shop.catalog-info.yaml', workspaceFolder: 'shop' };
const SYSTEMS = new Map([['system:online-shop', 'Online shop']]);

/** Tool names written in a prompt. */
const toolsIn = (prompt: string) => Object.values(MCP_TOOLS).filter((name) => prompt.includes(`\`${name}\``));

describe('prompts for AI assistants', () => {
  it('designs a new system from its context and assets, catalog first', () => {
    const prompt = newSystemPrompt(SYSTEM);
    expect(prompt.startsWith('# Design a new system: Online shop\n')).toBe(true);
    for (const rule of SOURCE_OF_TRUTH_RULES) expect(prompt).toContain(`- ${rule}`);
    expect(prompt).toContain('Use the tools of the `sdd-studio` MCP server:');
    expect(toolsIn(prompt).sort()).toEqual(Object.values(MCP_TOOLS).sort());
    expect(prompt).toContain('- **Owner:** Checkout team\n- **Domain:** not decided');
    expect(prompt).toContain('<context>\nCustomers pay by card.\nPCI DSS applies.\n</context>');
    expect(prompt).toContain('- **Shop API** (service component): Takes orders and payments.\n- **Card data** (data asset, restricted)\n\n');
    expect(prompt).not.toContain('ignored');
    // The catalog comes before the files linked from it, the markdown spec last.
    const order = ['`create_catalog_file`', '`openapi`', '`gherkin`', '`otm`', '(`spec`)', '`check_spec_file` on every file'].map((s) => prompt.indexOf(s));
    expect(order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1]))).toBe(true);
    expect(prompt).toContain('ask the user the questions');
    expect(prompt).toContain('Write specifications only, not code.');
  });

  it('leaves out the threat model and questions when not wanted', () => {
    const prompt = newSystemPrompt({ ...SYSTEM, askQuestions: false, threatModel: false, assets: [] });
    expect(prompt).not.toContain('`otm`');
    expect(prompt).toContain('note it as an assumption');
    expect(prompt).toContain('The user listed no assets: derive them from the context.');
    expect(prompt).toMatch(/\n1\. Call `describe_spec_kinds`[^]*\n8\. Finish with a summary/);
    expect(newSystemMissing(SYSTEM)).toEqual([]);
    expect(newSystemMissing({ ...SYSTEM, name: ' ', context: '', assets: [] })).toEqual(['the name of the system', 'some context or assets']);
  });

  it('updates the specs of selected entities and checks the impact', () => {
    const prompt = updateSpecsPrompt({ entities: [SHOP_API, ORDERS_DB], change: 'Orders can be cancelled.', askQuestions: false }, SYSTEMS);
    expect(prompt.startsWith('# Update the specifications of Shop API, resource:orders-db\n')).toBe(true);
    expect(prompt).toContain('- **Shop API** (`component:shop-api`): service component, in Online shop, defined in `catalog/online-shop.catalog-info.yaml`. Orders and payments.');
    expect(prompt).toContain('- **resource:orders-db** (`resource:orders-db`): database resource, defined in `catalog/online-shop.catalog-info.yaml` (shop).');
    expect(prompt).toContain('<change>\nOrders can be cancelled.\n</change>');
    expect(prompt).toContain('who consumes the APIs of an entity and who depends on it');
    expect(toolsIn(prompt)).not.toContain(MCP_TOOLS.createCatalogFile);
    expect(updateSpecsMissing({ entities: [], change: '', askQuestions: false })).toEqual(['the entities to update', 'the change to make']);
  });

  it('implements selected entities from their specs, which stay the source of truth', () => {
    const many = [SHOP_API, ORDERS_DB, { ...SHOP_API, ref: 'component:web', title: 'Web' }, { ...SHOP_API, ref: 'component:app', title: 'App' }];
    const prompt = implementPrompt({ entities: many, notes: 'TypeScript, in services/shop.', askQuestions: true }, SYSTEMS);
    expect(prompt.startsWith('# Implement Shop API, resource:orders-db, Web and 1 more from their specifications\n')).toBe(true);
    expect(prompt).toContain('## Notes\n\n<notes>\nTypeScript, in services/shop.\n</notes>');
    expect(prompt).toContain('do not change them to fit the code');
    expect(prompt).toContain('Show this plan to the user and wait for approval');
    expect(prompt).toContain('traceability table');
    // Implementing reads the specs: no tool writing them.
    expect(toolsIn(prompt).sort()).toEqual([MCP_TOOLS.checkSpecFile, MCP_TOOLS.describeSpecKinds, MCP_TOOLS.getCatalogEntity, MCP_TOOLS.listCatalogEntities, MCP_TOOLS.listSpecFiles].sort());
    const without = implementPrompt({ entities: [SHOP_API], notes: ' ', askQuestions: false });
    expect(without).not.toContain('## Notes');
    expect(without).not.toContain('wait for approval');
    expect(implementMissing({ entities: [], notes: '', askQuestions: false })).toEqual(['the entities to implement']);
  });
});
