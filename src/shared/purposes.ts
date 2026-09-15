/**
 * What each kind of file is for, and which file is the source of truth for what. Advertised to AI
 * assistants and other extensions (API, MCP server) and written in the update instructions of each file.
 *
 * The software catalog is the entry point: it says what exists and links every entity to its files.
 * Specific specs (API definitions, features, threat models) are the source of truth for what they
 * describe; the markdown spec of an entity only holds what none of them can express.
 */
import type { InstructionRule } from './instructions';

export type PurposeKind = 'backstage' | 'openapi' | 'asyncapi' | 'proto' | 'opencli' | 'gherkin' | 'otm' | 'spec' | 'openslo' | 'adr';

export interface SpecPurpose {
  /** One sentence: what these files are for. */
  summary: string;
  /** What these files are the source of truth for. */
  owns: string[];
  /** What does not belong in these files, and where it goes. */
  elsewhere: string[];
  /** How the catalog links these files to their entity. */
  linkedFrom: string;
}

const API_LINK = 'The definition of an API entity of the catalog (spec.definition: {$text: <path>}); components list that API in providesApis.';
const API_ELSEWHERE = [
  'Owner, lifecycle, system, and which components provide or consume the API: the catalog (info.title and contact only repeat what the format requires).',
  'Behaviour shown by examples (workflows, business rules): Gherkin features.',
  'Quality targets and constraints the format cannot express (latency, availability, rate limit policies, retention): the markdown spec of the entity.',
  'Threats and mitigations: the threat model.',
];

export const SPEC_PURPOSES: Record<PurposeKind, SpecPurpose> = {
  backstage: {
    summary: 'The entry point: what exists, who owns it, how it fits together and which files describe each entity.',
    owns: [
      'Domains, systems, components, APIs and resources, and their hierarchy.',
      'Ownership, type and lifecycle.',
      'Dependencies and provided or consumed APIs.',
      'Networks, data assets and their classification, repositories and artifacts.',
      'Links from each entity to its spec files and threat models.',
    ],
    elsewhere: [
      'Interface details: the API definition files (OpenAPI, AsyncAPI, Protocol Buffers, OpenCLI).',
      'Behaviour: Gherkin features. Threats and mitigations: threat models.',
      'Any other requirement: the markdown spec linked to the entity.',
    ],
    linkedFrom: 'Is the entry point: other catalog files are reached through Location entities and shared references.',
  },
  openapi: {
    summary: 'The contract of an HTTP API.',
    owns: ['Servers, paths and operations, parameters, request and response bodies, status codes, schemas and security schemes.'],
    elsewhere: API_ELSEWHERE,
    linkedFrom: API_LINK,
  },
  asyncapi: {
    summary: 'The contract of an event-driven or messaging API.',
    owns: ['Servers (brokers), channels, send and receive operations, messages, payload schemas and bindings.'],
    elsewhere: API_ELSEWHERE,
    linkedFrom: API_LINK,
  },
  proto: {
    summary: 'The contract of a gRPC API and its Protocol Buffers messages.',
    owns: ['Packages, services, RPCs and their streaming, messages, fields and their numbers, enums.'],
    elsewhere: API_ELSEWHERE,
    linkedFrom: API_LINK,
  },
  opencli: {
    summary: 'The contract of a command line tool.',
    owns: ['Commands and subcommands, arguments, options, exit codes and examples.'],
    elsewhere: API_ELSEWHERE,
    linkedFrom: API_LINK,
  },
  gherkin: {
    summary: 'Behaviour shown by concrete examples: acceptance criteria.',
    owns: ['Scenarios of the behaviour users and other systems can observe, and the business rules they illustrate.'],
    elsewhere: [
      'Fields and shapes of requests, messages and commands: the API definition files.',
      'Qualities and constraints that one example cannot show (performance, availability, compliance): the markdown spec of the entity.',
      'Threats and mitigations: the threat model.',
    ],
    linkedFrom: 'The sdd-studio/specs annotation of the entity.',
  },
  otm: {
    summary: 'The threat model: threats, their mitigations and risk, on a security view of the system.',
    owns: ['Threats, mitigations and their state.', 'Trust zones, components, dataflows and assets as seen for security (ids, trust ratings, representations).'],
    elsewhere: [
      'What exists, where it runs and which data it uses: the catalog. When the threat model and the catalog disagree on those, the catalog wins.',
      'Security requirements that do not mitigate a modelled threat: the markdown spec of the entity.',
    ],
    linkedFrom: 'The sdd-studio/threat-models annotation of the entity; a threat model of a system or domain applies to everything inside it.',
  },
  openslo: {
    summary: 'Service level objectives: the indicators, targets and error budgets a service is held to, and how breaches alert.',
    owns: ['Services, SLIs (indicators), SLOs (targets and budgeting), data sources, alert policies, conditions and notification targets.'],
    elsewhere: [
      'Owner, system and which component the service is: the catalog.',
      'The interface being measured: the API definition files.',
      'Threats and mitigations: the threat model.',
    ],
    linkedFrom: 'The sdd-studio/specs annotation of the entity.',
  },
  spec: {
    summary: 'The general spec of a catalog entity: only the requirements the catalog and the specific spec files cannot express.',
    owns: [
      'Quality requirements: performance, availability, scalability, security and privacy rules, observability, operability.',
      'Compliance and regulatory constraints, business rules and design constraints that are neither an interface contract nor behaviour shown by an example.',
      'Background and rationale of those requirements.',
    ],
    elsewhere: [
      'Owner, system, APIs, dependencies, networks and data: the catalog entry.',
      'Endpoints, messages, RPCs and commands: the API definition files.',
      'Behaviour shown by examples: Gherkin features. Threats and mitigations: the threat model.',
      'Refer to those files with links instead of restating them.',
    ],
    linkedFrom: 'The sdd-studio/specs annotation of the entity; one markdown spec per entity.',
  },
  adr: {
    summary: 'An Architecture Decision Record (mADR): the context, options considered and why one was chosen for a single architectural decision.',
    owns: ['The decision itself: its status, the decision drivers, the options considered and how they compare, the chosen option and its consequences.'],
    elsewhere: [
      'Owner, system and the entities affected: the catalog.',
      'The resulting interface, behaviour or requirement: the API definition files, Gherkin features, threat model or markdown spec, once the decision is implemented.',
    ],
    linkedFrom: 'The sdd-studio/specs annotation of the entity; a decision may apply to a system, a domain or a component.',
  },
};

/** How to work with the files of an SDD Studio workspace, for AI assistants. */
export const SOURCE_OF_TRUTH_RULES = [
  'Start from the software catalog entry of the entity you work on: it says what exists and links every file describing it.',
  'Each fact has one home. The catalog and the specific spec files (OpenAPI, AsyncAPI, Protocol Buffers, OpenCLI, Gherkin features, threat models) are the source of truth for what they describe; the markdown spec of an entity only holds what none of them can express.',
  'Do not restate a fact owned by another file: link to that file. When two files disagree, the file owning the fact wins; update the other one.',
  'Every spec file and threat model is linked from a catalog entity. Create them through SDD Studio so they are linked, and add missing entities to the catalog first.',
  'When a name (entity, API, field, resource) looks like a near-miss typo of one already in the catalog or the files you read, do not silently treat it as either the same thing or a new one: point out the mismatch and ask whether it is intentional.',
];

/** The purpose of the file, first rule of the update instructions at its top. */
export function purposeRule(kind: PurposeKind): InstructionRule {
  const { summary, elsewhere } = SPEC_PURPOSES[kind];
  return [`Purpose: ${summary} What belongs in other files:`, ...elsewhere];
}
