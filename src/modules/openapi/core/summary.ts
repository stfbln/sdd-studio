import type { SpecDetails } from '../../../shared/catalog';
import { getIn, isObject } from '../../../shared/structured/edits';
import { analyzeSpec, findRefs, isSupportedSpec, listOperations, schemaNames } from './openapi';
import { detectFormat, parseSpec } from '../../../shared/structured/specText';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** YAML/JSON file whose first lines declare `openapi:` (or `swagger:`). Cheap, no parsing. */
export function looksLikeApiSpec(fileName: string, text: string): boolean {
  if (!/\.(ya?ml|json)$/i.test(fileName)) return false;
  return /^\s*["']?(openapi|swagger)["']?\s*:/m.test(text.slice(0, 4000));
}

/** Catalog row of an OpenAPI document, and whether it points at other files. */
export function summarizeApiSpec(fileName: string, text: string): { summary: SpecDetails; relativeRefs: number } {
  const result = parseSpec(text, detectFormat(fileName, text));
  if (!result.ok) {
    const first = result.errors[0];
    return {
      summary: {
        name: /^\s*["']?title["']?\s*:\s*["']?([^"'\n,]+)/m.exec(text)?.[1]?.trim() ?? '',
        tags: [],
        details: [],
        error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'Syntax error',
      },
      relativeRefs: 0,
    };
  }

  const spec = result.value;
  const title = getIn(spec, ['info', 'title']);
  const version = getIn(spec, ['info', 'version']);
  const tags = getIn(spec, ['tags']);
  const relativeRefs = findRefs(spec, (ref) => !ref.startsWith('#')).length;
  const summary: SpecDetails = {
    name: typeof title === 'string' ? title : '',
    tags: Array.isArray(tags) ? tags.flatMap((t) => (isObject(t) && typeof t.name === 'string' ? [t.name] : [])) : [],
    details: [],
    warning: relativeRefs ? `Uses ${plural(relativeRefs, 'reference')} to other files: moving it may break them` : undefined,
  };

  if (!isSupportedSpec(spec)) {
    const swagger = getIn(spec, ['swagger']);
    summary.error = typeof swagger === 'string' ? `Swagger ${swagger}: not supported by the form editor` : 'Not an OpenAPI 3.x document';
    return { summary, relativeRefs };
  }

  summary.details = [
    `OpenAPI ${String(getIn(spec, ['openapi']))}`,
    ...(version !== undefined ? [`v${String(version)}`] : []),
    plural(listOperations(spec).length, 'operation'),
    plural(schemaNames(spec).length, 'schema'),
  ];
  summary.problems = analyzeSpec(spec).length;
  return { summary, relativeRefs };
}
