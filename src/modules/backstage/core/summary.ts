import type { SpecDetails } from '../../../shared/catalog';
import { stringify } from 'yaml';
import { slugify } from '../../../shared/naming';
import { isObject, type JsonObject } from '../../../shared/structured/edits';
import { parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import { analyzeCatalog } from './analysis';
import { API_VERSION, CATEGORIES, documentsOf, entitiesOf, entityLabel, CODE, HIERARCHY, NETWORKS, ORGANIZATION, type Category } from './model';

/** "2 components", "1 data asset", "3 APIs" (acronyms keep their case). */
const lower = (text: string) => (/^[A-Z]{2,}/.test(text) ? text : text.toLowerCase());
const plural = (n: number, singular: string, pluralText: string) => `${n} ${lower(n === 1 ? singular : pluralText)}`;

/** YAML file declaring a Backstage `apiVersion` near its top. Cheap, no parsing. */
export function looksLikeCatalog(fileName: string, text: string): boolean {
  if (!/\.ya?ml$/i.test(fileName)) return false;
  return /^\s*["']?apiVersion["']?\s*:\s*["']?backstage\.io\//m.test(text.slice(0, 4000));
}

/** Catalog row of a catalog file, and its entities (used to resolve references from other files). */
export function summarizeCatalog(_fileName: string, text: string): { summary: SpecDetails; entities: JsonObject[] } {
  const result = parseYamlDocuments(text);
  if (!result.ok) {
    const first = result.errors[0];
    return {
      summary: { name: '', tags: [], details: [], error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'Syntax error' },
      entities: [],
    };
  }
  const spec = result.value;
  const entities = entitiesOf(spec);
  // Named after its top-most entity: a domain, else a system, else the first entity.
  const main = entities.find((e) => e.category === 'domain') ?? entities.find((e) => e.category === 'system') ?? entities[0];
  const counts = [...HIERARCHY, ...NETWORKS, ...CODE, ...ORGANIZATION, 'location' as Category].flatMap((category) => {
    const n = entities.filter((e) => e.category === category).length;
    return n ? [plural(n, CATEGORIES[category].singular, CATEGORIES[category].plural)] : [];
  });
  const tags = [...new Set(entities.flatMap((e) => (Array.isArray(e.entity.metadata && (e.entity.metadata as JsonObject).tags) ? ((e.entity.metadata as JsonObject).tags as unknown[]).map(String) : [])))];
  return {
    summary: {
      name: main ? entityLabel(main.entity, '') : '',
      tags: tags.slice(0, 8),
      details: counts.length ? counts : ['no entities'],
      problems: analyzeCatalog(spec).length,
    },
    entities: documentsOf(spec).filter(isObject),
  };
}

/** A new catalog file: one System named after `title`. */
export function newCatalogTemplate(title: string): string {
  const name = title.trim();
  const slug = slugify(name).slice(0, 63).replace(/-+$/, '') || 'system';
  // The YAML writer quotes the title only when it needs it (e.g. "Shop: EU").
  return stringify({ apiVersion: API_VERSION, kind: 'System', metadata: { name: slug, ...(name && name !== slug ? { title: name } : {}) }, spec: { owner: '' } });
}
