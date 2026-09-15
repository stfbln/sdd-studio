import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS, startMcpHttpServer, type McpHttpServer } from '../../src/api/mcpServer';
import type { SddStudioApi } from '../../src/api/types';
import { MCP_TOOLS } from '../../src/shared/mcpTools';
import { purposeRule, SPEC_PURPOSES } from '../../src/shared/purposes';

const TOKEN = 'test-token';

function fakeApi(calls: unknown[][]): SddStudioApi {
  const record =
    (name: string, value: unknown) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      if (value instanceof Error) throw value;
      return value;
    };
  return {
    version: 1,
    describeSpecKinds: () => ({ sourceOfTruth: ['Start from the catalog.'], kinds: [] }),
    listCatalogEntities: record('listCatalogEntities', [{ ref: 'component:shop-api' }]) as SddStudioApi['listCatalogEntities'],
    getCatalogEntity: record('getCatalogEntity', new Error('No catalog entity matches "nope".')) as SddStudioApi['getCatalogEntity'],
    listSpecFiles: record('listSpecFiles', []) as SddStudioApi['listSpecFiles'],
    checkSpecFile: record('checkSpecFile', { problems: [] }) as SddStudioApi['checkSpecFile'],
    createCatalogFile: record('createCatalogFile', { path: 'catalog/shop.catalog-info.yaml', saved: false }) as SddStudioApi['createCatalogFile'],
    createSpecFile: record('createSpecFile', { path: 'specs/shop-api.spec.md', saved: false }) as SddStudioApi['createSpecFile'],
    linkSpecFile: record('linkSpecFile', { saved: true }) as SddStudioApi['linkSpecFile'],
  };
}

const text = (result: unknown) => (result as { content: { text: string }[] }).content[0].text;

describe('MCP server', () => {
  let server: McpHttpServer;
  let calls: unknown[][];

  beforeEach(async () => {
    calls = [];
    server = await startMcpHttpServer({ api: fakeApi(calls), version: '1.2.3', token: TOKEN, port: 0 });
  });
  afterEach(() => server.close());

  const connect = async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
    return client;
  };

  it('advertises the tools and how to work with the files', async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'sdd-studio', version: '1.2.3' });
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.values(MCP_TOOLS).sort());
    const create = tools.find((t) => t.name === 'create_spec_file')!;
    expect(create.inputSchema.required).toEqual(['kind', 'entity']);
    expect(tools.find((t) => t.name === 'list_spec_files')!.annotations?.readOnlyHint).toBe(true);
    await client.close();
  });

  it('passes arguments to the API and reports its errors', async () => {
    const client = await connect();
    const created = await client.callTool({ name: 'create_spec_file', arguments: { kind: 'spec', entity: 'shop-api', content: '# Shop API\n' } });
    expect(JSON.parse(text(created))).toEqual({ path: 'specs/shop-api.spec.md', saved: false });
    expect(calls).toEqual([['createSpecFile', { kind: 'spec', entity: 'shop-api', content: '# Shop API\n' }]]);

    const failed = await client.callTool({ name: 'get_catalog_entity', arguments: { entity: 'nope' } });
    expect(failed.isError).toBe(true);
    expect(text(failed)).toBe('No catalog entity matches "nope".');

    const invalid = await client.callTool({ name: 'create_spec_file', arguments: { kind: 'backstage', entity: 'shop-api' } });
    expect(invalid.isError).toBe(true);
    await client.close();
  });

  it('refuses requests without the token or from another host', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    expect((await fetch(server.url, { method: 'POST', headers, body })).status).toBe(401);
    expect((await fetch(server.url, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' }, body })).status).toBe(401);
    expect((await fetch(server.url.replace('/mcp', '/other'), { method: 'POST', headers: { ...headers, Authorization: `Bearer ${TOKEN}` }, body })).status).toBe(404);
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(server.url, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${TOKEN}`, Host: 'evil.example:80' } }, (res) => resolve(res.statusCode ?? 0));
      req.on('error', reject);
      req.end(body);
    });
    expect(status).toBe(403);
  });
});

describe('purposes', () => {
  it('describe every kind of file and what belongs elsewhere', () => {
    expect(Object.keys(SPEC_PURPOSES).sort()).toEqual(['adr', 'asyncapi', 'backstage', 'gherkin', 'openapi', 'opencli', 'openslo', 'otm', 'proto', 'spec']);
    for (const purpose of Object.values(SPEC_PURPOSES)) {
      expect(purpose.summary).toMatch(/\.$/);
      expect(purpose.owns.length).toBeGreaterThan(0);
      expect(purpose.elsewhere.length).toBeGreaterThan(0);
    }
    expect(purposeRule('spec')[0]).toBe('Purpose: The general spec of a catalog entity: only the requirements the catalog and the specific spec files cannot express. What belongs in other files:');
  });
});
