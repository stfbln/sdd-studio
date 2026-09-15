/**
 * First text of a spec file or threat model created from the software catalog: the skeleton of
 * the format, filled with what the catalog knows about the entity (see `brief.ts`).
 */
import { stringify } from 'yaml';
import { slugify } from '../../../shared/naming';
import type { Json, JsonObject } from '../../../shared/structured/edits';
import { newOpenCliDocument } from '../../opencli/core/opencli';
import { API_VERSION as OPENSLO_API_VERSION } from '../../openslo/core/model';
import { OTM_VERSION } from '../../otm/core/otm';
import { toPascalCase, toSnakeCase } from '../../proto/core/analysis';
import { CONFORMANCE_NOTICE } from '../../spec/core/keywords';
import type { BriefRef, EntityBrief, NewSpecFileRequest } from './brief';
import { CATEGORIES, dirOf, relativePath } from './model';

export type ScaffoldFormat = 'yaml' | 'json';

const serialize = (value: JsonObject, format: ScaffoldFormat) => (format === 'json' ? `${JSON.stringify(value, null, 2)}\n` : stringify(value, { lineWidth: 0 }));

const withValue = (key: string, value: Json | undefined): JsonObject => (value === undefined || value === '' || (Array.isArray(value) && !value.length) ? {} : { [key]: value });

/** "service component", "database resource", "system". */
function kindPhrase(ref: BriefRef): string {
  const { singular: label } = CATEGORIES[ref.category];
  const singular = label === 'API' ? label : label.toLowerCase();
  return ref.type && !['dataAsset', 'network', 'artifact', 'repository'].includes(ref.category) ? `${ref.type} ${singular}` : singular;
}

/** Contact of the owning team, as OpenAPI, AsyncAPI and OpenCLI write it. */
const contactOf = (brief: EntityBrief): JsonObject => (brief.owner ? { contact: { name: brief.owner.title, ...withValue('email', brief.owner.email) } } : {});

/** "Shop API is a service component of the Online shop system, owned by Checkout team." */
function aboutSentence(brief: EntityBrief): string {
  const { entity, system, domain, parent, owner } = brief;
  const within = parent ? ` of ${parent.title}` : system ? ` of the ${system.title} system` : domain && entity.category === 'system' ? ` of the ${domain.title} domain` : '';
  return `${entity.title} is ${/^[aeiou]/i.test(kindPhrase(entity)) ? 'an' : 'a'} ${kindPhrase(entity)}${within}${owner ? `, owned by ${owner.title}` : ''}.`;
}

/* Markdown spec -------------------------------------------------------------- */

/**
 * The catalog entry is the entry point and the source of truth for what it says: the spec points to
 * it and only gets the requirements the catalog and the specific spec files cannot express.
 */
function markdownSpec(request: NewSpecFileRequest, path: string): string {
  const { entity } = request.brief;
  const ref = `${entity.kind.toLowerCase()}:${entity.namespace === 'default' ? '' : `${entity.namespace}/`}${entity.name}`;
  const catalog = `[${entity.file.slice(entity.file.lastIndexOf('/') + 1)}](${relativePath(dirOf(path), entity.file)})`;
  return [
    `# ${request.title}`,
    '',
    `Requirements of \`${ref}\` that its catalog entry and its spec files cannot express. The catalog entry in ${catalog} is the source of truth for its owner, system, APIs, dependencies, networks and data, and links its API definitions, features and threat models.`,
    '',
    '## Requirements',
    '',
    CONFORMANCE_NOTICE,
    '',
  ].join('\n');
}

/* Gherkin -------------------------------------------------------------------- */

function feature(request: NewSpecFileRequest): string {
  const { brief } = request;
  const tags = brief.entity.tags.filter((t) => /^[^\s@]+$/.test(t)).map((t) => `@${t}`);
  const description = [brief.entity.description, aboutSentence(brief)].filter(Boolean) as string[];
  return [
    ...(tags.length ? [tags.join(' ')] : []),
    `Feature: ${request.title}`,
    ...description.map((line) => `  ${line}`),
    '',
    '  Scenario: First scenario',
    '    Given a precondition',
    '    When an action happens',
    '    Then an outcome is expected',
    '',
  ].join('\n');
}

/* API specs ------------------------------------------------------------------ */

function openApi(request: NewSpecFileRequest, format: ScaffoldFormat): string {
  const { brief } = request;
  return serialize(
    {
      openapi: '3.0.3',
      info: { title: request.title, ...withValue('description', brief.entity.description), version: '1.0.0', ...contactOf(brief) },
      ...(brief.entity.links[0] ? { externalDocs: { ...withValue('description', brief.entity.links[0].title), url: brief.entity.links[0].url } } : {}),
      paths: {},
      components: { schemas: {} },
    },
    format,
  );
}

function asyncApi(request: NewSpecFileRequest, format: ScaffoldFormat): string {
  const { brief } = request;
  return serialize(
    {
      asyncapi: '3.0.0',
      info: {
        title: request.title,
        version: '1.0.0',
        ...withValue('description', brief.entity.description),
        ...contactOf(brief),
        ...withValue('tags', brief.entity.tags.map((name) => ({ name }))),
      },
      channels: {},
      operations: {},
      components: { messages: {}, schemas: {} },
    },
    format,
  );
}

function proto(request: NewSpecFileRequest): string {
  const { brief } = request;
  const words = request.title.trim().split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  const core = words.length > 1 && /^(service|api)$/i.test(words[words.length - 1]) ? words.slice(0, -1) : words;
  const base = toPascalCase(core.join(' ')) || 'My';
  const system = brief.system ? `${toSnakeCase(brief.system.name)}.` : '';
  const pkg = `${system}${toSnakeCase(core.join(' ')) || 'my'}.v1`.replace(/(^|\.)(\d)/g, '$1_$2');
  const comment = [request.title.trim(), ...(brief.entity.description ? ['', brief.entity.description] : []), '', aboutSentence(brief)];
  return [`syntax = "proto3";`, '', `package ${pkg};`, '', ...comment.map((line) => (line ? `// ${line}` : '//')), `service ${base}Service {`, '}', ''].join('\n');
}

function openCli(request: NewSpecFileRequest, format: ScaffoldFormat): string {
  const { brief } = request;
  const doc = newOpenCliDocument(request.title.trim());
  const info = doc.info as JsonObject;
  doc.info = {
    ...info,
    ...withValue('description', brief.entity.description),
    ...contactOf(brief),
  };
  return serialize(doc, format);
}

/* OpenSLO ---------------------------------------------------------------------- */

function openSlo(request: NewSpecFileRequest): string {
  const { brief } = request;
  return serialize(
    {
      apiVersion: OPENSLO_API_VERSION,
      kind: 'Service',
      metadata: { name: slugify(request.title) || 'service', displayName: request.title.trim() },
      spec: { ...withValue('description', brief.entity.description) },
    },
    'yaml',
  );
}

/* Threat model --------------------------------------------------------------- */

function threatModel(request: NewSpecFileRequest, format: ScaffoldFormat): string {
  const { brief, threatModel: draft } = request;
  return serialize(
    {
      otmVersion: OTM_VERSION,
      project: {
        name: request.title.trim(),
        id: slugify(request.title) || 'project',
        ...withValue('description', brief.entity.description),
        ...withValue('owner', brief.owner?.title),
        ...withValue('ownerContact', brief.owner?.email),
        ...withValue('tags', brief.entity.tags),
      },
      ...withValue('representations', draft?.representations),
      trustZones: draft?.trustZones ?? [],
      components: draft?.components ?? [],
      dataflows: draft?.dataflows ?? [],
      assets: draft?.assets ?? [],
      threats: [],
      mitigations: [],
    },
    format,
  );
}

/* ADR -------------------------------------------------------------------------- */

function adr(request: NewSpecFileRequest, path: string): string {
  const { entity } = request.brief;
  const catalog = `[${entity.file.slice(entity.file.lastIndexOf('/') + 1)}](${relativePath(dirOf(path), entity.file)})`;
  return [
    '---',
    'status: "proposed"',
    `date: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
    `# ${request.title}`,
    '',
    '## Context and Problem Statement',
    '',
    `Decision for \`${entity.title}\` (see its catalog entry in ${catalog}).`,
    '',
    '## Decision Drivers',
    '',
    '## Considered Options',
    '',
    '## Decision Outcome',
    '',
  ].join('\n');
}

/** Text of the new file at workspace path `path`. */
export function scaffoldSpecFile(request: NewSpecFileRequest, path: string, format: ScaffoldFormat): string {
  switch (request.kind) {
    case 'spec':
      return markdownSpec(request, path);
    case 'gherkin':
      return feature(request);
    case 'openapi':
      return openApi(request, format);
    case 'asyncapi':
      return asyncApi(request, format);
    case 'proto':
      return proto(request);
    case 'opencli':
      return openCli(request, format);
    case 'otm':
      return threatModel(request, format);
    case 'openslo':
      return openSlo(request);
    case 'adr':
      return adr(request, path);
  }
}
