/**
 * Open Threat Model (OTM 0.2.0) knowledge used by the form editor, the catalog and the checks.
 *
 * Every element lives in a top-level list and is identified by its `id`. Elements point to each
 * other through ids: parents (trust zone or component), dataflow ends, assets, threats and
 * mitigations, and representations.
 */
import { slugify } from '../../../shared/naming';
import { getIn, isObject, type Json, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';

export const OTM_VERSION = '0.2.0';

export const COLLECTIONS = ['trustZones', 'components', 'dataflows', 'assets', 'threats', 'mitigations'] as const;
export type OtmCollection = (typeof COLLECTIONS)[number];

export type OtmLocation = { kind: 'project' } | { kind: 'item'; collection: OtmCollection; index: number };

export const COLLECTION_LABELS: Record<OtmCollection, { singular: string; plural: string; icon: string }> = {
  trustZones: { singular: 'Trust zone', plural: 'Trust zones', icon: 'shield' },
  components: { singular: 'Component', plural: 'Components', icon: 'server-process' },
  dataflows: { singular: 'Dataflow', plural: 'Dataflows', icon: 'arrow-swap' },
  assets: { singular: 'Asset', plural: 'Assets', icon: 'database' },
  threats: { singular: 'Threat', plural: 'Threats', icon: 'bug' },
  mitigations: { singular: 'Mitigation', plural: 'Mitigations', icon: 'check-all' },
};

export const REPRESENTATION_TYPES = ['diagram', 'code', 'threat-model'];
/** OTM does not fix these values; these are the ones used by its examples and tools. */
export const THREAT_STATES = ['exposed', 'mitigated', 'partly-mitigated', 'not-applicable'];
export const MITIGATION_STATES = ['required', 'recommended', 'implemented', 'rejected', 'not-applicable'];
export const STRIDE = ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'];
export const COMPONENT_TYPES = ['generic', 'web-client', 'mobile-client', 'web-application', 'web-service', 'api-gateway', 'database', 'message-broker', 'storage', 'identity-provider', 'third-party-service'];

/** Risk values of OTM are numbers from 0 to 100. */
export const RISK_HINTS = {
  trustRating: 'How trustworthy is this trust zone? 0 is not trusted at all (e.g. the internet), 100 fully trusted.',
  confidentiality: 'How bad would it be to have an attacker see this information?',
  integrity: 'How bad would it be to have an attacker modify this information?',
  availability: 'How bad would it be to lose this information or have it inaccessible?',
  likelihood: 'How likely is it that this threat will take place?',
  impact: 'How bad would it be if this threat took place?',
  riskReduction: 'How much will the threat risk decrease once this mitigation is implemented?',
};

/* Reading ------------------------------------------------------------------ */

export const otmVersion = (spec: unknown): string | undefined => {
  const value = isObject(spec) ? spec.otmVersion : undefined;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
};

const asString = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** Items of a top-level list (non-objects are kept as empty items so indexes match the file). */
export function itemsOf(spec: unknown, collection: OtmCollection): JsonObject[] {
  const list = getIn(spec, [collection]);
  return Array.isArray(list) ? list.map((item) => (isObject(item) ? item : {})) : [];
}

export const idsOf = (spec: unknown, collection: OtmCollection) => itemsOf(spec, collection).map((item) => asString(item.id));

export const itemId = (item: JsonObject) => asString(item.id);
export const itemName = (item: JsonObject) => asString(item.name);
/** Name, else id, else a placeholder. */
export const itemLabel = (item: JsonObject, fallback = '(unnamed)') => itemName(item).trim() || itemId(item) || fallback;

export function findIndex(spec: unknown, collection: OtmCollection, id: string): number {
  return id ? idsOf(spec, collection).indexOf(id) : -1;
}

export function labelOf(spec: unknown, collection: OtmCollection, id: string): string {
  const index = findIndex(spec, collection, id);
  return index >= 0 ? itemLabel(itemsOf(spec, collection)[index], id) : id;
}

export const representationIds = (spec: unknown) =>
  (Array.isArray(getIn(spec, ['representations'])) ? (getIn(spec, ['representations']) as Json[]) : []).map((r) => (isObject(r) ? asString(r.id) : ''));

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number').map(String) : [];
}

export type ParentRef = { kind: 'trustZone' | 'component'; id: string } | undefined;

export function parentOf(item: JsonObject): ParentRef {
  const parent = item.parent;
  if (!isObject(parent)) return undefined;
  if (typeof parent.trustZone === 'string') return { kind: 'trustZone', id: parent.trustZone };
  if (typeof parent.component === 'string') return { kind: 'component', id: parent.component };
  return undefined;
}

/** Trust zone enclosing a component, following component parents. */
export function enclosingTrustZone(spec: unknown, component: JsonObject): string | undefined {
  const seen = new Set<string>();
  let current: JsonObject | undefined = component;
  while (current) {
    const parent = parentOf(current);
    if (!parent) return undefined;
    if (parent.kind === 'trustZone') return parent.id;
    if (seen.has(parent.id)) return undefined;
    seen.add(parent.id);
    const index = findIndex(spec, 'components', parent.id);
    current = index >= 0 ? itemsOf(spec, 'components')[index] : undefined;
  }
  return undefined;
}

/** Depth of an element in its own collection (a trust zone inside a trust zone is 1). */
export function nestingDepth(spec: unknown, collection: 'trustZones' | 'components', item: JsonObject): number {
  const kind = collection === 'trustZones' ? 'trustZone' : 'component';
  const seen = new Set<string>([itemId(item)]);
  let depth = 0;
  let current: JsonObject | undefined = item;
  while (current) {
    const parent = parentOf(current);
    if (!parent || parent.kind !== kind || seen.has(parent.id)) break;
    seen.add(parent.id);
    const index = findIndex(spec, collection, parent.id);
    current = index >= 0 ? itemsOf(spec, collection)[index] : undefined;
    if (current) depth++;
  }
  return depth;
}

/** Ids a dataflow end may point to: components and trust zones. */
export function endpointLabel(spec: unknown, id: string): string {
  if (findIndex(spec, 'components', id) >= 0) return labelOf(spec, 'components', id);
  if (findIndex(spec, 'trustZones', id) >= 0) return labelOf(spec, 'trustZones', id);
  return id || '?';
}

/* Threat instances ------------------------------------------------------------ */

export interface ThreatUse {
  /** Component or dataflow holding the threat instance. */
  collection: 'components' | 'dataflows';
  index: number;
  /** Position in the element's `threats` list. */
  instance: number;
  threat: string;
  state: string;
  mitigations: { mitigation: string; state: string }[];
}

export function threatUses(spec: unknown): ThreatUse[] {
  return (['components', 'dataflows'] as const).flatMap((collection) =>
    itemsOf(spec, collection).flatMap((item, index) =>
      (Array.isArray(item.threats) ? item.threats : []).map((t, instance): ThreatUse => {
        const threat = isObject(t) ? t : {};
        return {
          collection,
          index,
          instance,
          threat: asString(threat.threat),
          state: asString(threat.state),
          mitigations: (Array.isArray(threat.mitigations) ? threat.mitigations : []).map((m) => ({
            mitigation: isObject(m) ? asString(m.mitigation) : '',
            state: isObject(m) ? asString(m.state) : '',
          })),
        };
      }),
    ),
  );
}

/** Components and dataflows using an asset. */
export function assetUses(spec: unknown, id: string): { collection: 'components' | 'dataflows'; index: number; how: string }[] {
  const uses: { collection: 'components' | 'dataflows'; index: number; how: string }[] = [];
  itemsOf(spec, 'components').forEach((c, index) => {
    const assets = isObject(c.assets) ? c.assets : {};
    const how = [stringList(assets.processed).includes(id) && 'processed', stringList(assets.stored).includes(id) && 'stored'].filter(Boolean).join(' and ');
    if (how) uses.push({ collection: 'components', index, how });
  });
  itemsOf(spec, 'dataflows').forEach((d, index) => {
    if (stringList(d.assets).includes(id)) uses.push({ collection: 'dataflows', index, how: 'carried' });
  });
  return uses;
}

/* Editing ------------------------------------------------------------------ */

/** "Payment API" -> "payment-api", made unique among `taken`. */
export function uniqueId(name: string, taken: string[], fallback = 'item'): string {
  const base = slugify(name) || fallback;
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** Ids a new element must not reuse: trust zones and components share one space (dataflow ends). */
export function takenIds(spec: unknown, collection: OtmCollection): string[] {
  if (collection === 'trustZones' || collection === 'components') return [...idsOf(spec, 'trustZones'), ...idsOf(spec, 'components')];
  return idsOf(spec, collection);
}

/** Appends to a list, creating it when missing or null (`threats:` with no value is common in OTM files). */
export function appendEdit(spec: unknown, path: SpecPath, value: Json): SpecEdit {
  const list = getIn(spec, path);
  return Array.isArray(list) ? { op: 'set', path: [...path, list.length], value } : { op: 'set', path, value: [value] };
}

/** A new element with the fields OTM requires, filled with neutral values. */
export function newItem(spec: unknown, collection: OtmCollection, name: string): JsonObject {
  const id = uniqueId(name, takenIds(spec, collection), collection === 'dataflows' ? 'dataflow' : 'item');
  const base = { name: name.trim(), id };
  switch (collection) {
    case 'trustZones':
      return { ...base, risk: { trustRating: 50 } };
    case 'components': {
      const zone = idsOf(spec, 'trustZones').find(Boolean);
      return { ...base, type: 'generic', parent: zone ? { trustZone: zone } : { trustZone: '' } };
    }
    case 'dataflows': {
      const [source = '', destination = ''] = idsOf(spec, 'components').filter(Boolean);
      return { ...base, source, destination };
    }
    case 'assets':
      return { ...base, risk: { confidentiality: 50, integrity: 50, availability: 50 } };
    case 'threats':
      return { ...base, risk: { likelihood: 50, impact: 50 } };
    case 'mitigations':
      return { ...base, riskReduction: 50 };
  }
}

const compareDesc = (a: SpecPath, b: SpecPath): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    return typeof a[i] === 'number' && typeof b[i] === 'number' ? (b[i] as number) - (a[i] as number) : String(b[i]).localeCompare(String(a[i]));
  }
  return b.length - a.length;
};

/** Deletes list items from the last to the first, so indexes stay valid. */
export const deleteEdits = (paths: SpecPath[]): SpecEdit[] => [...paths].sort(compareDesc).map((path) => ({ op: 'delete', path }));

/** Every place holding the id of an element (not the element's own `id`). */
export function referencePaths(spec: unknown, collection: OtmCollection, id: string): SpecPath[] {
  if (!id) return [];
  const paths: SpecPath[] = [];
  const scan = (list: OtmCollection, fn: (item: JsonObject, index: number) => void) => itemsOf(spec, list).forEach(fn);
  const inList = (value: unknown, base: SpecPath) =>
    (Array.isArray(value) ? value : []).forEach((v, i) => {
      if (v === id) paths.push([...base, i]);
    });

  switch (collection) {
    case 'trustZones':
    case 'components': {
      const kind = collection === 'trustZones' ? 'trustZone' : 'component';
      for (const list of ['trustZones', 'components'] as const) {
        scan(list, (item, index) => {
          if (isObject(item.parent) && item.parent[kind] === id) paths.push([list, index, 'parent', kind]);
        });
      }
      scan('dataflows', (item, index) => {
        if (item.source === id) paths.push(['dataflows', index, 'source']);
        if (item.destination === id) paths.push(['dataflows', index, 'destination']);
      });
      break;
    }
    case 'assets':
      scan('components', (item, index) => {
        if (!isObject(item.assets)) return;
        inList(item.assets.processed, ['components', index, 'assets', 'processed']);
        inList(item.assets.stored, ['components', index, 'assets', 'stored']);
      });
      scan('dataflows', (item, index) => inList(item.assets, ['dataflows', index, 'assets']));
      break;
    case 'threats':
      for (const use of threatUses(spec)) if (use.threat === id) paths.push([use.collection, use.index, 'threats', use.instance, 'threat']);
      break;
    case 'mitigations':
      for (const use of threatUses(spec)) {
        use.mitigations.forEach((m, i) => {
          if (m.mitigation === id) paths.push([use.collection, use.index, 'threats', use.instance, 'mitigations', i, 'mitigation']);
        });
      }
      break;
  }
  return paths;
}

/** Changes an element's id and every reference to it. */
export function renameIdEdits(spec: unknown, collection: OtmCollection, index: number, to: string): SpecEdit[] {
  const from = itemId(itemsOf(spec, collection)[index] ?? {});
  return [
    ...referencePaths(spec, collection, from).map((path): SpecEdit => ({ op: 'set', path, value: to })),
    { op: 'set', path: [collection, index, 'id'], value: to },
  ];
}

/** Changes a representation's id and the representation elements using it. */
export function renameRepresentationEdits(spec: unknown, index: number, to: string): SpecEdit[] {
  const from = representationIds(spec)[index];
  const edits: SpecEdit[] = [];
  if (from) {
    for (const list of ['trustZones', 'components'] as const) {
      itemsOf(spec, list).forEach((item, i) =>
        (Array.isArray(item.representations) ? item.representations : []).forEach((r, j) => {
          if (isObject(r) && r.representation === from) edits.push({ op: 'set', path: [list, i, 'representations', j, 'representation'], value: to });
        }),
      );
    }
  }
  return [...edits, { op: 'set', path: ['representations', index, 'id'], value: to }];
}

/**
 * Deletes an element. References that are list entries (assets, threat and mitigation
 * instances) go with it; single references (parents, dataflow ends) stay and are reported.
 */
export function deleteItemEdits(spec: unknown, collection: OtmCollection, index: number): SpecEdit[] {
  const id = itemId(itemsOf(spec, collection)[index] ?? {});
  let dependents: SpecPath[] = [];
  if (collection === 'assets' || collection === 'mitigations') dependents = referencePaths(spec, collection, id);
  if (collection === 'threats') dependents = referencePaths(spec, collection, id).map((path) => path.slice(0, -1));
  return deleteEdits([...dependents, [collection, index]]);
}

/** How many single references would break, and how many list entries would go, when deleting. */
export function deleteImpact(spec: unknown, collection: OtmCollection, index: number): { removed: number; broken: number } {
  const count = referencePaths(spec, collection, itemId(itemsOf(spec, collection)[index] ?? {})).length;
  return collection === 'trustZones' || collection === 'components' ? { removed: 0, broken: count } : { removed: count, broken: 0 };
}

/* Problems ----------------------------------------------------------------- */

export interface OtmIssue {
  severity: 'error' | 'warning';
  message: string;
  location: OtmLocation;
}

const inRange = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 100;

export function analyzeOtm(spec: unknown): OtmIssue[] {
  const issues: OtmIssue[] = [];
  const project: OtmLocation = { kind: 'project' };
  const add = (severity: OtmIssue['severity'], message: string, location: OtmLocation) => issues.push({ severity, message, location });

  if (!otmVersion(spec)) add('error', 'otmVersion is required', project);
  const info = getIn(spec, ['project']);
  if (!isObject(info) || !asString(info.name).trim()) add('error', 'Project name is required', project);
  if (!isObject(info) || !asString(info.id).trim()) add('error', 'Project id is required', project);

  const representations = representationIds(spec);
  (Array.isArray(getIn(spec, ['representations'])) ? (getIn(spec, ['representations']) as Json[]) : []).forEach((r, i) => {
    const rep = isObject(r) ? r : {};
    const label = `Representation ${asString(rep.name) || i + 1}`;
    if (!asString(rep.id)) add('error', `${label}: id is required`, project);
    if (!asString(rep.name)) add('error', `Representation ${i + 1}: name is required`, project);
    if (!asString(rep.type)) add('error', `${label}: type is required`, project);
  });
  representations.forEach((id, i) => {
    if (id && representations.indexOf(id) !== i) add('error', `Representation id "${id}" is used more than once`, project);
  });

  const zoneIds = idsOf(spec, 'trustZones');
  const componentIds = idsOf(spec, 'components');

  for (const collection of COLLECTIONS) {
    const { singular } = COLLECTION_LABELS[collection];
    const items = itemsOf(spec, collection);
    const ids = items.map(itemId);
    items.forEach((item, index) => {
      const location: OtmLocation = { kind: 'item', collection, index };
      const label = `${singular} ${itemLabel(item, String(index + 1))}`;
      const error = (message: string) => add('error', `${label}: ${message}`, location);
      const warning = (message: string) => add('warning', `${label}: ${message}`, location);
      const id = itemId(item);

      if (!id) error('id is required');
      else if (ids.indexOf(id) !== index) error(`id "${id}" is used by another ${singular.toLowerCase()}`);
      if (!itemName(item).trim()) error('name is required');
      if (collection === 'components' && id && zoneIds.includes(id)) warning(`id "${id}" is also a trust zone id, so dataflows using it are ambiguous`);

      if (collection === 'trustZones' || collection === 'components') {
        const parent = parentOf(item);
        if (!parent) {
          if (collection === 'components') error('parent (trust zone or component) is required');
        } else if (!parent.id) {
          error('parent is empty');
        } else if (!(parent.kind === 'trustZone' ? zoneIds : componentIds).includes(parent.id)) {
          error(`parent ${parent.kind === 'trustZone' ? 'trust zone' : 'component'} "${parent.id}" does not exist`);
        } else if (parentCycle(spec, collection, item)) {
          error('parents form a loop');
        }
        (Array.isArray(item.representations) ? item.representations : []).forEach((r, i) => {
          const ref = isObject(r) ? asString(r.representation) : '';
          if (!ref) error(`representation element ${i + 1} has no representation`);
          else if (!representations.includes(ref)) error(`representation "${ref}" does not exist`);
          if (!isObject(r) || !asString(r.id)) error(`representation element ${i + 1} has no id`);
        });
      }

      switch (collection) {
        case 'trustZones':
          if (!inRange(getIn(item, ['risk', 'trustRating']))) error('trust rating must be a number from 0 to 100');
          break;
        case 'components':
          if (!asString(item.type).trim()) error('type is required');
          if (isObject(item.assets)) {
            for (const asset of [...stringList(item.assets.processed), ...stringList(item.assets.stored)]) {
              if (findIndex(spec, 'assets', asset) < 0) error(`asset "${asset}" does not exist`);
            }
          }
          break;
        case 'dataflows':
          for (const end of ['source', 'destination'] as const) {
            const ref = asString(item[end]);
            if (!ref) error(`${end} is required`);
            else if (!componentIds.includes(ref) && !zoneIds.includes(ref)) error(`${end} "${ref}" is not a component or trust zone`);
          }
          if (item.source && item.source === item.destination) warning('source and destination are the same');
          for (const asset of stringList(item.assets)) if (findIndex(spec, 'assets', asset) < 0) error(`asset "${asset}" does not exist`);
          break;
        case 'assets':
          for (const key of ['confidentiality', 'integrity', 'availability']) {
            if (!inRange(getIn(item, ['risk', key]))) error(`${key} must be a number from 0 to 100`);
          }
          if (!assetUses(spec, id).length) warning('not used by any component or dataflow');
          break;
        case 'threats': {
          const likelihood = getIn(item, ['risk', 'likelihood']);
          if (likelihood !== null && !inRange(likelihood)) error('likelihood must be a number from 0 to 100');
          if (!inRange(getIn(item, ['risk', 'impact']))) error('impact must be a number from 0 to 100');
          if (id && !threatUses(spec).some((u) => u.threat === id)) warning('not linked to any component or dataflow');
          for (const cwe of stringList(item.cwes)) if (!/^CWE-\d+$/.test(cwe)) warning(`"${cwe}" does not look like a CWE id (CWE-79)`);
          break;
        }
        case 'mitigations':
          if (!inRange(item.riskReduction)) error('risk reduction must be a number from 0 to 100');
          if (id && !threatUses(spec).some((u) => u.mitigations.some((m) => m.mitigation === id))) warning('not applied to any threat');
          break;
      }
    });
  }

  for (const use of threatUses(spec)) {
    const item = itemsOf(spec, use.collection)[use.index];
    const location: OtmLocation = { kind: 'item', collection: use.collection, index: use.index };
    const label = `${COLLECTION_LABELS[use.collection].singular} ${itemLabel(item, String(use.index + 1))}`;
    const threat = use.threat ? `threat "${labelOf(spec, 'threats', use.threat)}"` : `threat ${use.instance + 1}`;
    if (!use.threat) add('error', `${label}: threat ${use.instance + 1} has no threat selected`, location);
    else if (findIndex(spec, 'threats', use.threat) < 0) add('error', `${label}: threat "${use.threat}" does not exist`, location);
    if (!use.state) add('error', `${label}: ${threat} has no state`, location);
    use.mitigations.forEach((m, i) => {
      if (!m.mitigation) add('error', `${label}: ${threat} has a mitigation with none selected`, location);
      else if (findIndex(spec, 'mitigations', m.mitigation) < 0) add('error', `${label}: mitigation "${m.mitigation}" does not exist`, location);
      if (!m.state) add('error', `${label}: mitigation ${m.mitigation ? `"${labelOf(spec, 'mitigations', m.mitigation)}"` : i + 1} of ${threat} has no state`, location);
    });
  }
  return issues;
}

function parentCycle(spec: unknown, collection: 'trustZones' | 'components', item: JsonObject): boolean {
  const seen = new Set<string>();
  let current: { collection: 'trustZones' | 'components'; item: JsonObject } | undefined = { collection, item };
  while (current) {
    const key = `${current.collection}:${itemId(current.item)}`;
    if (seen.has(key)) return true;
    seen.add(key);
    const parent = parentOf(current.item);
    if (!parent) return false;
    const list = parent.kind === 'trustZone' ? 'trustZones' : 'components';
    const index = findIndex(spec, list, parent.id);
    current = index >= 0 ? { collection: list, item: itemsOf(spec, list)[index] } : undefined;
  }
  return false;
}

/* Templates ---------------------------------------------------------------- */

export function newOtmTemplate(name: string, format: 'yaml' | 'json' = 'yaml'): string {
  const title = name.trim();
  const id = slugify(title) || 'project';
  if (format === 'json') {
    const spec = { otmVersion: OTM_VERSION, project: { name: title, id }, trustZones: [], components: [], dataflows: [], assets: [], threats: [], mitigations: [] };
    return JSON.stringify(spec, null, 2) + '\n';
  }
  return `otmVersion: ${OTM_VERSION}
project:
  name: ${JSON.stringify(title)}
  id: ${id}
trustZones: []
components: []
dataflows: []
assets: []
threats: []
mitigations: []
`;
}
