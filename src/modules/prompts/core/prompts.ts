/**
 * Prompts for LLM assistants working on an SDD Studio workspace: designing a new system, updating
 * the specs of catalog entities, implementing them. They refer to the tools of the SDD Studio MCP
 * server and carry its source of truth rules. No VS Code dependency (used by the prompt page).
 */
import { MCP_SERVER_NAME, MCP_TOOLS } from '../../../shared/mcpTools';
import { SOURCE_OF_TRUTH_RULES } from '../../../shared/purposes';

export type AssetCategory = 'component' | 'api' | 'resource' | 'dataAsset' | 'network' | 'group';

export const ASSET_CATEGORIES: { value: AssetCategory; label: string; types: string[] }[] = [
  { value: 'component', label: 'Component', types: ['service', 'website', 'mobile-app', 'cli', 'worker', 'library'] },
  { value: 'api', label: 'API', types: ['openapi', 'asyncapi', 'grpc', 'opencli'] },
  { value: 'resource', label: 'Resource', types: ['database', 'queue', 'topic', 's3-bucket', 'cache', 'external-service', 'saas'] },
  { value: 'dataAsset', label: 'Data asset', types: ['public', 'internal', 'confidential', 'restricted'] },
  { value: 'network', label: 'Network', types: ['internet', 'dmz', 'private', 'vpc', 'subnet'] },
  { value: 'group', label: 'Team', types: ['team', 'business-unit'] },
];

export interface SystemAsset {
  category: AssetCategory;
  name: string;
  /** Component, API or resource type, data classification, network kind. */
  type: string;
  description: string;
}

export interface NewSystemInput {
  name: string;
  owner: string;
  domain: string;
  context: string;
  assets: SystemAsset[];
  /** Ask the user questions before writing files, instead of listing assumptions. */
  askQuestions: boolean;
  threatModel: boolean;
}

/** A catalog entity as the prompts present it. */
export interface PromptEntity {
  ref: string;
  category: string;
  kind: string;
  type?: string;
  title?: string;
  description?: string;
  system?: string;
  file: string;
  workspaceFolder: string;
}

export interface UpdateSpecsInput {
  entities: PromptEntity[];
  change: string;
  askQuestions: boolean;
}

export interface ImplementInput {
  entities: PromptEntity[];
  notes: string;
  askQuestions: boolean;
}

export interface ScanRepoInput {
  notes: string;
  askQuestions: boolean;
  threatModel: boolean;
}

const TOOL_USES: Record<keyof typeof MCP_TOOLS, string> = {
  describeSpecKinds: 'what each kind of file is for, what belongs in other files, and the rules to follow when writing it',
  listCatalogEntities: 'the entities of the software catalog',
  getCatalogEntity: 'everything the catalog knows about an entity: owner, system, APIs and their definitions, dependencies and users, networks, data, specs and threat models',
  listSpecFiles: 'the spec files of the workspace and the entities linking them',
  checkSpecFile: 'the problems of a file, as SDD Studio reports them',
  createCatalogFile: 'a new catalog file',
  createSpecFile: 'a spec file or threat model for a catalog entity, linked from it',
  linkSpecFile: 'links an existing file from a catalog entity',
};

const READ_TOOLS: (keyof typeof MCP_TOOLS)[] = ['describeSpecKinds', 'listCatalogEntities', 'getCatalogEntity', 'listSpecFiles', 'checkSpecFile'];
const tool = (name: keyof typeof MCP_TOOLS) => `\`${MCP_TOOLS[name]}\``;
const numbered = (steps: (string | false | undefined)[]) =>
  steps
    .filter((s): s is string => !!s)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

/** User text, delimited so it is not taken for instructions of the prompt. */
function block(tag: string, text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? [`<${tag}>`, trimmed, `</${tag}>`] : [];
}

function workspaceSection(tools: (keyof typeof MCP_TOOLS)[]): string[] {
  return [
    '## How this workspace works',
    '',
    'This workspace follows specification-driven development (SDD) with SDD Studio. A Backstage software catalog (`*.catalog-info.yaml`) describes the systems and links each entity to the files specifying it: API definitions (OpenAPI, AsyncAPI, Protocol Buffers, OpenCLI), Gherkin features, Open Threat Model files and markdown specs with RFC 2119 requirements.',
    '',
    ...SOURCE_OF_TRUTH_RULES.map((rule) => `- ${rule}`),
    '',
    `Use the tools of the \`${MCP_SERVER_NAME}\` MCP server:`,
    '',
    ...tools.map((name) => `- ${tool(name)}: ${TOOL_USES[name]}.`),
    '',
    `If these tools are not available, stop and ask the user to connect the SDD Studio MCP server (in VS Code: **SDD Studio: Configure Claude Code (MCP)**).`,
    '',
    'Every spec file starts with instructions on how to update it: follow them.',
  ];
}

const entityLine = (e: PromptEntity, systems: Map<string, string>) => {
  const system = e.system ? systems.get(e.system) ?? e.system : undefined;
  const what = [e.type, e.category === 'dataAsset' ? 'data asset' : e.category].filter(Boolean).join(' ');
  const details = [what, system ? `in ${system}` : '', `defined in \`${e.file}\`${e.workspaceFolder ? ` (${e.workspaceFolder})` : ''}`].filter(Boolean).join(', ');
  return `- **${e.title || e.ref}** (\`${e.ref}\`): ${details}.${e.description ? ` ${e.description}` : ''}`;
};

const titles = (entities: PromptEntity[]) => {
  const names = entities.map((e) => e.title || e.ref);
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
};

/* New system ------------------------------------------------------------------ */

export function newSystemMissing(input: NewSystemInput): string[] {
  return [
    !input.name.trim() && 'the name of the system',
    !input.context.trim() && !input.assets.some((a) => a.name.trim()) && 'some context or assets',
  ].filter((m): m is string => !!m);
}

function assetLine(asset: SystemAsset): string {
  const category = ASSET_CATEGORIES.find((c) => c.value === asset.category)!;
  const type = asset.type.trim();
  const what = asset.category === 'dataAsset' ? `data asset${type ? `, ${type}` : ''}` : `${type ? `${type} ` : ''}${category.label.toLowerCase()}`;
  const description = asset.description.trim().replace(/\s*\n\s*/g, ' ');
  return `- **${asset.name.trim()}** (${what})${description ? `: ${description}` : ''}`;
}

export function newSystemPrompt(input: NewSystemInput): string {
  const name = input.name.trim() || 'the new system';
  const assets = input.assets.filter((a) => a.name.trim());
  const lines = [
    `# Design a new system: ${name}`,
    '',
    'Design the specifications of a new system, starting from its catalog entry. Write specifications only, not code.',
    '',
    ...workspaceSection([...READ_TOOLS, 'createCatalogFile', 'createSpecFile', 'linkSpecFile']),
    '',
    '## The system',
    '',
    `- **Name:** ${name}`,
    `- **Owner:** ${input.owner.trim() || 'not decided: reuse a group of the catalog or propose a team'}`,
    `- **Domain:** ${input.domain.trim() || 'not decided: reuse a domain of the catalog when one fits'}`,
    '',
    ...block('context', input.context),
    ...(input.context.trim() ? [''] : []),
    '## Assets',
    '',
    ...(assets.length
      ? [
          'The user listed these assets. Take them as a starting point: add the entities the design needs (for example the APIs components use to talk to each other, the data they store, the networks they run in) and say why.',
          '',
          ...assets.map(assetLine),
        ]
      : ['The user listed no assets: derive them from the context.']),
    '',
    '## Steps',
    '',
    numbered([
      `Call ${tool('describeSpecKinds')}, then ${tool('listCatalogEntities')}: reuse the domains, groups, systems and resources that already exist instead of creating them again.`,
      input.askQuestions
        ? 'Before writing any file, ask the user the questions whose answers change the design (boundaries, protocols, who uses the system, data classification, hosting) and wait for the answers.'
        : 'Where the context leaves a decision open, choose what fits best and note it as an assumption.',
      `Write the catalog first with ${tool('createCatalogFile')}, passing its complete content: the system, then each component, API, resource, data asset and network, one entity per YAML document. Give every entity a title, a short description, an owner and \`lifecycle: experimental\`; relate them with \`system\`, \`dependsOn\`, \`providesApis\` and \`consumesApis\`; classify data assets and place components and resources in their networks. If the result says the file is not saved, ask the user to review and save it, and wait: spec files can only be created for saved entities.`,
      `Write the definition of each API with ${tool('createSpecFile')} on the API entity, with its complete content: \`openapi\` for HTTP, \`asyncapi\` for events and messages, \`proto\` for gRPC, \`opencli\` for command line tools.`,
      `Write Gherkin features (\`gherkin\`) for the behaviour of each component that users and other systems observe: one feature per capability, scenarios with concrete examples.`,
      input.threatModel &&
        `Write the threat model of the system (\`otm\` on the system entity): trust zones from the networks, components, dataflows from dependencies and API use, assets from data assets, then the threats (STRIDE) and their mitigations.`,
      `Only then, write a markdown spec (\`spec\`) for the entities that still have requirements no other file can hold: quality targets, compliance, business rules and constraints, with RFC 2119 key words. Skip it when nothing is left, and never restate the catalog or the other files.`,
      `Run ${tool('checkSpecFile')} on every file you wrote and fix the problems.`,
      `Finish with a summary: the entities and files created, the assumptions you made and the open questions.`,
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

/* Update specs ---------------------------------------------------------------- */

export function updateSpecsMissing(input: UpdateSpecsInput): string[] {
  return [!input.entities.length && 'the entities to update', !input.change.trim() && 'the change to make'].filter((m): m is string => !!m);
}

export function updateSpecsPrompt(input: UpdateSpecsInput, systems: Map<string, string> = new Map()): string {
  const lines = [
    `# Update the specifications of ${input.entities.length ? titles(input.entities) : 'catalog entities'}`,
    '',
    'Update the specifications of existing catalog entities. Change specifications only, not code.',
    '',
    ...workspaceSection([...READ_TOOLS, 'createSpecFile', 'linkSpecFile']),
    '',
    '## Entities to update',
    '',
    ...(input.entities.length ? input.entities.map((e) => entityLine(e, systems)) : ['- (none selected)']),
    '',
    '## Change',
    '',
    ...(input.change.trim() ? block('change', input.change) : ['(not described yet)']),
    '',
    '## Steps',
    '',
    numbered([
      `Call ${tool('describeSpecKinds')}. For each entity, call ${tool('getCatalogEntity')} and read the files it links, threat models inherited from its system or domain included, before changing anything.`,
      input.askQuestions
        ? 'Before editing, ask the user the questions whose answers change the result and wait for the answers.'
        : 'Where the change leaves a decision open, choose what fits best and note it as an assumption.',
      'Decide which file owns each part of the change: entities, ownership, dependencies, networks and data belong to the catalog; interfaces to the API definitions; observable behaviour to the features; threats and mitigations to the threat model; the other requirements to the markdown spec. Write each fact once.',
      'Update the catalog first when the change adds, removes or rewires entities.',
      `Edit the existing files directly. Create the files an entity is missing with ${tool('createSpecFile')} and link unlinked files with ${tool('linkSpecFile')}, so the catalog keeps linking everything.`,
      'Keep interfaces compatible unless the change requires otherwise; for a breaking change, say so and raise the version of the definition.',
      `Check the impact: ${tool('getCatalogEntity')} lists who consumes the APIs of an entity and who depends on it. Update the specs of those entities when the change affects them, or list them when they are not part of the request.`,
      'Update the threat model when dataflows, data, networks or trust boundaries change.',
      `Run ${tool('checkSpecFile')} on every file you changed and fix the problems.`,
      'Finish with a summary: for each file, what changed and why; the impacted entities; the assumptions you made and the open questions.',
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

/* Implement specs ------------------------------------------------------------- */

export function implementMissing(input: ImplementInput): string[] {
  return input.entities.length ? [] : ['the entities to implement'];
}

export function implementPrompt(input: ImplementInput, systems: Map<string, string> = new Map()): string {
  const lines = [
    `# Implement ${input.entities.length ? titles(input.entities) : 'catalog entities'} from their specifications`,
    '',
    'Implement catalog entities as their specifications define them.',
    '',
    ...workspaceSection(READ_TOOLS),
    '',
    '## Entities to implement',
    '',
    ...(input.entities.length ? input.entities.map((e) => entityLine(e, systems)) : ['- (none selected)']),
    '',
    ...(input.notes.trim() ? ['## Notes', '', ...block('notes', input.notes), ''] : []),
    '## Rules',
    '',
    '- The specifications are the source of truth: implement what they say, and do not change them to fit the code.',
    '- When a specification is ambiguous, contradicts another one or cannot be implemented, do not decide silently: ask the user, or report it with a proposed change of the specification.',
    '- Stay within the selected entities: reach the others only through their API definitions.',
    '',
    '## Steps',
    '',
    numbered([
      `For each entity, call ${tool('getCatalogEntity')} and read: the definitions of the APIs it provides (to implement) and consumes (to call), its features, the requirements of its markdown spec, the threat models that apply to it (inherited ones included) and their mitigations, its dependencies, networks and data assets with their classification, and its code location.`,
      'Find where the code goes: the code location of the entity, or the repository and path the catalog gives. When the catalog has none, ask the user. Follow the language, structure, conventions and build tools of the code already there.',
      `List what to implement and how it will be tested: each operation, channel, RPC or command; each scenario; each MUST, SHOULD and MAY requirement; each mitigation.${input.askQuestions ? ' Show this plan to the user and wait for approval before writing code.' : ''}`,
      'Implement the interfaces exactly as their definitions say: paths, parameters, status codes, schemas, channels, payloads, field numbers, options and exit codes. Generate code from the definitions when the project already does.',
      'Turn the features into automated acceptance tests (with the BDD tool of the project, or tests named after the scenarios). Cover every MUST and MUST NOT requirement with tests; implement SHOULD requirements unless there is a reason not to, and give it.',
      'Implement the mitigations of the threat models, and handle data according to its classification.',
      'Build and run the tests until they pass.',
      `Run ${tool('checkSpecFile')} on the specs you read, and finish with a traceability table (requirement, scenario, operation or mitigation → code → test), what is not implemented and why, and the specification problems you found with the changes you propose.`,
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

/* Scan an existing repository ------------------------------------------------- */

export function scanRepoMissing(_input: ScanRepoInput): string[] {
  return [];
}

export function scanRepoPrompt(input: ScanRepoInput): string {
  const lines = [
    `# Create specifications from the existing code`,
    '',
    'Scan this repository and create the software catalog entries and spec files for what it already contains. Write specifications only, not code.',
    '',
    ...workspaceSection([...READ_TOOLS, 'createCatalogFile', 'createSpecFile', 'linkSpecFile']),
    '',
    '## Notes',
    '',
    ...(input.notes.trim() ? block('notes', input.notes) : ['(none: explore the whole repository)']),
    '',
    '## Steps',
    '',
    numbered([
      `Call ${tool('describeSpecKinds')}, then ${tool('listCatalogEntities')}: reuse the domains, groups, systems and resources that already exist instead of creating them again, and only add what is missing.`,
      'Explore the repository: its layout (single project, monorepo, one repo per service), the language and framework of each part, READMEs and docs, existing interface definitions (OpenAPI, AsyncAPI, `.proto`, OpenCLI or other API descriptions, message or event schemas, database migrations), infrastructure as code, CI/CD and deployment config, and existing tests.',
      'Group what you find into domains, systems and components; infer their owners from CODEOWNERS, package manifests or repository metadata when possible.',
      input.askQuestions
        ? 'Before writing any file, show the user the systems, components, APIs and resources you found and ask about boundaries, ownership and anything the code leaves ambiguous, and wait for the answers.'
        : 'Where the code leaves a decision open (boundaries, ownership, data classification), choose what fits best and note it as an assumption.',
      `Write the catalog first with ${tool('createCatalogFile')}, passing its complete content: the system, then each component, API, resource, data asset and network it depends on, one entity per YAML document. Give every entity a title, a short description, an owner and \`lifecycle: production\` (or \`experimental\` when the code says so); relate them with \`system\`, \`dependsOn\`, \`providesApis\` and \`consumesApis\`. If the result says the file is not saved, ask the user to review and save it, and wait: spec files can only be created for saved entities.`,
      `For each API a component exposes or defines, capture its contract from the code itself (route handlers, message schemas, \`.proto\` files, command line argument parsers) rather than guessing, and write it with ${tool('createSpecFile')}: \`openapi\` for HTTP, \`asyncapi\` for events and messages, \`proto\` for gRPC, \`opencli\` for command line tools.`,
      'Write Gherkin features (`gherkin`) for the behaviour users and other systems observe; existing tests are a good source, turned into scenarios with concrete examples rather than restated as prose.',
      input.threatModel &&
        `Write the threat model of the system (\`otm\` on the system entity) from what the code and infrastructure config reveal: trust zones from the networks, components, dataflows from dependencies and API use, assets from data assets, then the threats (STRIDE) and their mitigations.`,
      `Only then, write a markdown spec (\`spec\`) for the entities that still have requirements no other file can hold: quality targets, compliance and business rules found in docs, comments or config, with RFC 2119 key words. Skip it when nothing is left, and never restate the catalog or the other files.`,
      `Run ${tool('checkSpecFile')} on every file you wrote and fix the problems.`,
      'Finish with a summary: the entities and files created, the assumptions you made, and the parts of the code you could not confidently map to a spec.',
    ]),
  ];
  return `${lines.join('\n')}\n`;
}
