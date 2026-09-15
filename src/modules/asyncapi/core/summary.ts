import type { SpecDetails } from '../../../shared/catalog';
import { getIn, isObject } from '../../../shared/structured/edits';
import { findRefs } from '../../../shared/structured/jsonSchema';
import { detectFormat, parseSpec } from '../../../shared/structured/specText';
import { analyzeAsyncApi, asyncApiVersion, channelIds, listOperations, majorVersion, messageNames } from './asyncapi';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** YAML/JSON file whose first lines declare `asyncapi:`. Cheap, no parsing. */
export function looksLikeAsyncApi(fileName: string, text: string): boolean {
  if (!/\.(ya?ml|json)$/i.test(fileName)) return false;
  return /^\s*["']?asyncapi["']?\s*:/m.test(text.slice(0, 4000));
}

/** Catalog row of an AsyncAPI document, and how many references point to other files. */
export function summarizeAsyncApi(fileName: string, text: string): { summary: SpecDetails; relativeRefs: number } {
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
  const major = majorVersion(spec);
  const tags = getIn(spec, major === 3 ? ['info', 'tags'] : ['tags']);
  const relativeRefs = findRefs(spec, (ref) => !ref.startsWith('#')).length;
  const summary: SpecDetails = {
    name: typeof title === 'string' ? title : '',
    tags: Array.isArray(tags) ? tags.flatMap((t) => (isObject(t) && typeof t.name === 'string' ? [t.name] : [])) : [],
    details: [],
    warning: relativeRefs ? `Uses ${plural(relativeRefs, 'reference')} to other files: moving it may break them` : undefined,
  };
  if (!major) {
    summary.error = `AsyncAPI ${asyncApiVersion(spec) ?? '?'}: not supported by the form editor (2.x and 3.0 are)`;
    return { summary, relativeRefs };
  }
  summary.details = [
    `AsyncAPI ${asyncApiVersion(spec)}`,
    ...(version !== undefined ? [`v${String(version)}`] : []),
    plural(channelIds(spec).length, 'channel'),
    plural(listOperations(spec).length, 'operation'),
    plural(messageNames(spec).length, 'message'),
  ];
  summary.problems = analyzeAsyncApi(spec).length;
  return { summary, relativeRefs };
}
