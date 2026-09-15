import { stringify } from 'yaml';
import type { SpecDetails } from '../../../shared/catalog';
import { parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import { analyzeOpenSlo } from './analysis';
import { apiVersion, API_VERSION, entitiesOf, entityLabel, KIND_INFO, KINDS, lowerLabel } from './model';

const count = (n: number, singular: string, pluralText: string) => `${n} ${lowerLabel(n === 1 ? singular : pluralText)}`;

/** YAML file declaring an `apiVersion: openslo/...` in one of its documents. Cheap, no parsing. */
export function looksLikeOpenSlo(fileName: string, text: string): boolean {
  if (!/\.ya?ml$/i.test(fileName)) return false;
  return /^\s*["']?apiVersion["']?\s*:\s*["']?openslo\//m.test(text.slice(0, 8000));
}

/** Catalog row of an OpenSLO file. */
export function summarizeOpenSlo(_fileName: string, text: string): SpecDetails {
  const result = parseYamlDocuments(text);
  if (!result.ok) {
    const first = result.errors[0];
    return { name: '', tags: [], details: [], error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'Syntax error' };
  }
  const spec = result.value;
  const entities = entitiesOf(spec);
  const main = entities.find((e) => e.kind === 'Service') ?? entities.find((e) => e.kind === 'SLO') ?? entities[0];
  const counts = KINDS.flatMap((kind) => {
    const n = entities.filter((e) => e.kind === kind).length;
    return n ? [count(n, KIND_INFO[kind].singular, KIND_INFO[kind].plural)] : [];
  });
  return {
    name: main ? entityLabel(main.entity, '') : '',
    tags: [],
    details: [`OpenSLO ${apiVersion(spec)?.replace(/^openslo\//, '') ?? '?'}`, ...(counts.length ? counts : ['no objects'])],
    problems: analyzeOpenSlo(spec).length,
  };
}

/** A new OpenSLO file: a Service and an SLO with an inline ratio SLI, named after `title`. */
export function newOpenSloTemplate(title: string): string {
  const name = title.trim();
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'service';
  const service = { apiVersion: API_VERSION, kind: 'Service', metadata: { name: slug, ...(name && name !== slug ? { displayName: name } : {}) }, spec: { description: '' } };
  const slo = {
    apiVersion: API_VERSION,
    kind: 'SLO',
    metadata: { name: `${slug}-availability` },
    spec: {
      description: 'Availability of the service, measured by successful requests.',
      service: slug,
      indicator: {
        metadata: { name: `${slug}-availability` },
        spec: { ratioMetric: { counter: true, good: { metricSource: { type: '', spec: {} } }, total: { metricSource: { type: '', spec: {} } } } },
      },
      budgetingMethod: 'Occurrences',
      timeWindow: [{ duration: '28d', isRolling: true }],
      objectives: [{ displayName: 'Availability', target: 0.99, op: 'gte' }],
    },
  };
  return [service, slo].map((doc) => stringify(doc)).join('---\n');
}
