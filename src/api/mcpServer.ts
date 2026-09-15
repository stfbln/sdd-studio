/**
 * MCP server exposing the SDD Studio API to AI assistants (Claude Code, GitHub Copilot...) over
 * Streamable HTTP on the loopback interface. No VS Code dependency: the API is passed in.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { MCP_SERVER_NAME, MCP_TOOLS } from '../shared/mcpTools';
import { SOURCE_OF_TRUTH_RULES } from '../shared/purposes';
import type { SddStudioApi } from './types';

export const MCP_PATH = '/mcp';
const SPEC_FILE_KINDS = ['spec', 'gherkin', 'openapi', 'asyncapi', 'proto', 'opencli', 'otm', 'openslo', 'adr'] as const;

/** Sent to clients when they connect, so assistants know how to use the tools before calling them. */
export const SERVER_INSTRUCTIONS = [
  'SDD Studio manages the specification files of this workspace: a Backstage software catalog (catalog-info.yaml) and the spec files linked from its entities (markdown specs, Gherkin features, OpenAPI, AsyncAPI, Protocol Buffers, OpenCLI, Open Threat Model, OpenSLO, Architecture Decision Records).',
  ...SOURCE_OF_TRUTH_RULES,
  'Workflow: call describe_spec_kinds once to learn what each kind of file is for. Find the entity with list_catalog_entities and read it with get_catalog_entity. Add missing entities by editing catalog files (follow the rules at their top), or start a new catalog file with create_catalog_file. Create each spec file with create_spec_file, passing its complete content, so it is linked from the entity. Edit existing files directly, then run check_spec_file.',
  'Depending on the user\'s settings, created files and catalog changes are left open unsaved for the user to review: the result says whether they were saved. A file that is not saved does not exist on disk yet: do not write it yourself.',
].join('\n\n');

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

async function run(task: () => unknown) {
  try {
    return json(await task());
  } catch (err) {
    return { isError: true, content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }] };
  }
}

const workspaceFolder = z.string().optional().describe('Name of the workspace folder, when several are open.');
const entity = z.string().describe('Catalog entity reference, [kind:][namespace/]name, e.g. "component:shop-api" (see list_catalog_entities).');

export function createMcpServer(api: SddStudioApi, version: string): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, title: 'SDD Studio', version }, { instructions: SERVER_INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    MCP_TOOLS.describeSpecKinds,
    {
      title: 'Describe spec kinds',
      description:
        'What each kind of file SDD Studio manages is for: what it is the source of truth for, what belongs in other files, how the catalog links it, formats, default folder and the rules to follow when editing it. Call it before creating or editing spec files.',
      annotations: readOnly,
    },
    () => run(() => api.describeSpecKinds()),
  );

  server.registerTool(
    MCP_TOOLS.listCatalogEntities,
    {
      title: 'List catalog entities',
      description: 'Entities of the software catalog files (domains, systems, components, APIs, resources...), with their catalog file and the spec files and threat models they link.',
      inputSchema: {
        category: z.string().optional().describe('Only this category or kind: domain, system, component, api, resource, dataAsset, network, artifact, repository, group, user, location.'),
        query: z.string().optional().describe('Text found in the reference, title or description.'),
        workspaceFolder,
      },
      annotations: readOnly,
    },
    (args) => run(() => api.listCatalogEntities(args)),
  );

  server.registerTool(
    MCP_TOOLS.getCatalogEntity,
    {
      title: 'Get catalog entity',
      description:
        'Everything the catalog knows about an entity: owner and contact, system, domain, parts, provided and consumed APIs with their definitions, dependencies and users, networks, data assets, linked specs and threat models (inherited ones included). Start here: these facts belong to the catalog and are not restated in spec files.',
      inputSchema: { entity, workspaceFolder },
      annotations: readOnly,
    },
    ({ entity: ref, workspaceFolder: folder }) => run(() => api.getCatalogEntity(ref, { workspaceFolder: folder })),
  );

  server.registerTool(
    MCP_TOOLS.listSpecFiles,
    {
      title: 'List spec files',
      description: 'Spec files, threat models and catalog files of the workspace, with their name, key facts, problem count, syntax error and the entities linking them.',
      inputSchema: { kind: z.string().optional().describe('Only this kind: backstage, spec, gherkin, openapi, asyncapi, proto, opencli or otm.'), workspaceFolder },
      annotations: readOnly,
    },
    (args) => run(() => api.listSpecFiles(args)),
  );

  server.registerTool(
    MCP_TOOLS.checkSpecFile,
    {
      title: 'Check spec file',
      description: 'Syntax errors and problems of a spec file, threat model or catalog file, as the SDD Studio forms report them (unsaved changes included), and whether a catalog entity links it.',
      inputSchema: { path: z.string().describe('Path relative to the workspace folder, or absolute.'), workspaceFolder },
      annotations: readOnly,
    },
    ({ path, workspaceFolder: folder }) => run(() => api.checkSpecFile(path, { workspaceFolder: folder })),
  );

  server.registerTool(
    MCP_TOOLS.createCatalogFile,
    {
      title: 'Create catalog file',
      description:
        'Creates a Backstage catalog file (one entity per YAML document, apiVersion backstage.io/v1alpha1) in the catalog folder, with the update instructions header. Use it for a new system or domain; add entities to an existing catalog file by editing it. Without content, the file holds a system named after the title. Spec files can only be created for its entities once the file is saved.',
      inputSchema: {
        title: z.string().describe('Name of the system or domain the file describes; gives the file name.'),
        content: z.string().optional().describe('Complete YAML of the entities (recommended): see describe_spec_kinds for the SDD Studio conventions.'),
        folder: z.string().optional().describe('Folder relative to the workspace folder; defaults to the catalog folder setting.'),
        workspaceFolder,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => run(() => api.createCatalogFile(args)),
  );

  server.registerTool(
    MCP_TOOLS.createSpecFile,
    {
      title: 'Create spec file',
      description:
        'Creates a spec file or threat model for a catalog entity and links it from the entity: API definitions (openapi, asyncapi, proto, opencli) become the definition of an API entity (a component gets a new API entity it provides), other files go to the sdd-studio/specs or sdd-studio/threat-models annotation. The file goes to the default folder of its kind and gets the update instructions header. Without content, it is a skeleton filled from the catalog. An entity has one markdown spec and an API one definition: update those instead of creating another.',
      inputSchema: {
        kind: z.enum(SPEC_FILE_KINDS).describe('spec (markdown requirements), gherkin, openapi, asyncapi, proto, opencli, otm (threat model), openslo or adr (architecture decision record).'),
        entity,
        title: z.string().optional().describe('Title of the file, also giving its name; defaults to one derived from the entity.'),
        content: z.string().optional().describe('Complete text of the file (recommended). It must only hold what this kind of file owns (see describe_spec_kinds).'),
        format: z.string().optional().describe('yaml or json, for kinds offering both.'),
        folder: z.string().optional().describe('Folder relative to the workspace folder; defaults to the folder setting of the kind.'),
        workspaceFolder,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => run(() => api.createSpecFile(args)),
  );

  server.registerTool(
    MCP_TOOLS.linkSpecFile,
    {
      title: 'Link spec file',
      description: 'Links an existing spec file or threat model from a catalog entity, the way create_spec_file does.',
      inputSchema: { entity, path: z.string().describe('Path of the file, relative to the workspace folder or absolute.'), workspaceFolder },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (args) => run(() => api.linkSpecFile(args)),
  );

  return server;
}

export interface McpHttpServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export const newToken = () => randomBytes(32).toString('base64url');

function reply(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

function authorized(header: string | undefined, token: string): boolean {
  const given = Buffer.from(/^Bearer\s+(.+)$/i.exec(header ?? '')?.[1]?.trim() ?? '');
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Listens on 127.0.0.1 (port 0 picks a free one). Every request needs the bearer token, and a Host
 * header naming the loopback interface, which keeps web pages out (DNS rebinding).
 * Stateless: each request gets its own server and transport.
 */
export function startMcpHttpServer(options: { api: SddStudioApi; version: string; token: string; port: number; onError?: (err: unknown) => void }): Promise<McpHttpServer> {
  const handle = async (req: IncomingMessage, res: ServerResponse, port: number) => {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (pathname !== MCP_PATH) return reply(res, 404, 'Not found');
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(req.headers.host ?? '')) return reply(res, 403, 'Forbidden host');
    if (!authorized(req.headers.authorization, options.token)) return reply(res, 401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer' });
    if (req.method !== 'POST') return reply(res, 405, 'Method not allowed', { Allow: 'POST' });

    const server = createMcpServer(options.api, options.version);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };

  return new Promise((resolve, reject) => {
    const http: Server = createServer((req, res) => {
      const { port } = http.address() as AddressInfo;
      handle(req, res, port).catch((err) => {
        options.onError?.(err);
        if (!res.headersSent) reply(res, 500, 'Internal error');
      });
    });
    http.once('error', reject);
    http.listen(options.port, '127.0.0.1', () => {
      http.off('error', reject);
      const { port } = http.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}${MCP_PATH}`,
        port,
        close: () =>
          new Promise<void>((done) => {
            http.closeAllConnections();
            http.close(() => done());
          }),
      });
    });
  });
}
