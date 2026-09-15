import type { SpecDetails } from '../../../shared/catalog';
import { getIn } from '../../../shared/structured/edits';
import { detectFormat, parseSpec } from '../../../shared/structured/specText';
import { analyzeOtm, enclosingTrustZone, itemId, itemName, itemsOf, otmVersion, parentOf, stringList, threatUses } from './otm';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** YAML/JSON file whose first lines declare `otmVersion:`. Cheap, no parsing. */
export function looksLikeOtm(fileName: string, text: string): boolean {
  if (!/\.(ya?ml|json)$/i.test(fileName)) return false;
  return /^\s*["']?otmVersion["']?\s*:/m.test(text.slice(0, 4000));
}

/** Catalog row of a threat model. */
export function summarizeOtm(fileName: string, text: string): SpecDetails {
  const result = parseSpec(text, detectFormat(fileName, text));
  if (!result.ok) {
    const first = result.errors[0];
    return {
      name: /^\s*["']?name["']?\s*:\s*["']?([^"'\n,]+)/m.exec(text)?.[1]?.trim() ?? '',
      tags: [],
      details: [],
      error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'Syntax error',
    };
  }
  const spec = result.value;
  const name = getIn(spec, ['project', 'name']);
  const exposed = threatUses(spec).filter((u) => u.state === 'exposed').length;
  return {
    name: typeof name === 'string' ? name : '',
    tags: stringList(getIn(spec, ['project', 'tags'])),
    details: [
      `OTM ${otmVersion(spec) ?? '?'}`,
      plural(itemsOf(spec, 'components').length, 'component'),
      plural(itemsOf(spec, 'dataflows').length, 'dataflow'),
      plural(itemsOf(spec, 'threats').length, 'threat'),
      ...(exposed ? [`${exposed} exposed`] : []),
    ],
    problems: analyzeOtm(spec).length,
  };
}

/** Trust zones and components of a threat model, used by other modules (e.g. to link networks to trust zones). */
export interface OtmOutline {
  trustZones: { id: string; name: string; type?: string; trustRating?: number; parent?: string; description?: string }[];
  components: { id: string; name: string; trustZone?: string }[];
}

export function outlineOtm(fileName: string, text: string): OtmOutline {
  const result = parseSpec(text, detectFormat(fileName, text));
  if (!result.ok) return { trustZones: [], components: [] };
  const spec = result.value;
  const optional = <T>(key: string, value: T | undefined) => (value === undefined || value === '' ? {} : { [key]: value });
  return {
    trustZones: itemsOf(spec, 'trustZones').map((zone) => {
      const parent = parentOf(zone);
      const rating = getIn(zone, ['risk', 'trustRating']);
      return {
        id: itemId(zone),
        name: itemName(zone),
        ...optional('type', typeof zone.type === 'string' ? zone.type : undefined),
        ...optional('trustRating', typeof rating === 'number' ? rating : undefined),
        ...optional('parent', parent?.kind === 'trustZone' ? parent.id : undefined),
        ...optional('description', typeof zone.description === 'string' ? zone.description : undefined),
      };
    }),
    components: itemsOf(spec, 'components').map((component) => ({
      id: itemId(component),
      name: itemName(component),
      ...optional('trustZone', enclosingTrustZone(spec, component)),
    })),
  };
}
