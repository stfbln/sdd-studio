/** Checks of a catalog file: what Backstage rejects (errors) and what is probably wrong (warnings). */
import { getIn, isObject } from '../../../shared/structured/edits';
import {
  ancestors,
  annotationList,
  CATEGORIES,
  definitionRef,
  dirOf,
  documentFiles,
  documentsOf,
  fileOfDocument,
  entityLabel,
  isUrl,
  keyOf,
  knownEntities,
  LIFECYCLES,
  parentKey,
  parseRef,
  refFieldsOf,
  refTarget,
  resolvePath,
  SPECS_ANNOTATION,
  str,
  summarizeEntity,
  THREAT_MODELS_ANNOTATION,
  type CatalogContext,
  type CatalogLocation,
  type Category,
  type EntityInfo,
  categoryOf,
  DEFAULT_NAMESPACE,
  CIDR_ANNOTATION,
  placementsOf,
  PURL_ANNOTATION,
  refValuePath,
  relationshipEntries,
  REPOSITORY_URL_ANNOTATION,
  splitList,
  stringList,
  trustZoneRef,
} from './model';

export interface CatalogIssue {
  severity: 'error' | 'warning';
  message: string;
  location: CatalogLocation;
}

const NAME = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const NAMESPACE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[a-z0-9:+#]+(-[a-z0-9:+#]+)*$/;
const CIDR = /^(\d{1,3}(\.\d{1,3}){3}\/\d{1,2}|[0-9a-fA-F:]+:[0-9a-fA-F:]*\/\d{1,3})$/;
const KEY_PREFIX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

const validName = (name: string) => name.length <= 63 && NAME.test(name);

function validKey(key: string): boolean {
  const slash = key.indexOf('/');
  if (slash < 0) return validName(key);
  const prefix = key.slice(0, slash);
  return prefix.length <= 253 && KEY_PREFIX.test(prefix) && validName(key.slice(slash + 1));
}

const REQUIRED: Partial<Record<Category, string[]>> = {
  component: ['type', 'lifecycle', 'owner'],
  api: ['type', 'lifecycle', 'owner'],
  resource: ['type', 'owner'],
  dataAsset: ['type', 'owner'],
  network: ['type', 'owner'],
  artifact: ['type', 'owner'],
  repository: ['type', 'owner'],
  platform: ['type', 'owner'],
  infrastructure: ['type', 'owner'],
  site: ['type', 'owner'],
  system: ['owner'],
  domain: ['owner'],
  group: ['type'],
};

const FIELD_LABELS: Record<string, string> = { type: 'type', lifecycle: 'lifecycle', owner: 'owner' };

export function analyzeCatalog(spec: unknown, context?: CatalogContext): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const known = knownEntities(spec, context);
  const others = context?.entities ?? [];
  const files = documentFiles(spec);
  const seen = new Map<string, number>();

  documentsOf(spec).forEach((doc, index) => {
    const location: CatalogLocation = { kind: 'entity', index };
    const file = fileOfDocument(spec, index, context);
    const dir = dirOf(file);
    if (doc === null) return;
    if (!isObject(doc)) {
      issues.push({ severity: 'error', message: `Document ${index + 1} is not an entity (expected apiVersion, kind, metadata and spec)`, location: { kind: 'overview' } });
      return;
    }
    const category = categoryOf(doc);
    const kind = str(doc.kind);
    const namespace = str(getIn(doc, ['metadata', 'namespace'])) || DEFAULT_NAMESPACE;
    const name = str(getIn(doc, ['metadata', 'name']));
    const info: EntityInfo = { index, entity: doc, kind, category, name, namespace };
    const label = `${category === 'other' ? kind || 'Entity' : CATEGORIES[category].singular} ${entityLabel(doc, `#${index + 1}`)}`;
    const error = (message: string) => issues.push({ severity: 'error', message: `${label}: ${message}`, location });
    const warning = (message: string) => issues.push({ severity: 'warning', message: `${label}: ${message}`, location });

    // Envelope and metadata.
    const apiVersion = str(doc.apiVersion);
    if (!apiVersion) error('apiVersion is required');
    else if (category !== 'other' && !/^backstage\.io\/v1(alpha1|beta1)$/.test(apiVersion)) warning(`apiVersion "${apiVersion}" is not a Backstage version (${'backstage.io/v1alpha1'})`);
    if (!kind) error('kind is required');
    if (!name) error('name is required');
    else if (!validName(name)) error(`name "${name}" must be at most 63 letters, digits, "-", "_" or ".", starting and ending with a letter or digit`);
    if (getIn(doc, ['metadata', 'namespace']) !== undefined && !NAMESPACE.test(namespace)) error(`namespace "${namespace}" must be lowercase letters, digits and "-"`);

    const tags = getIn(doc, ['metadata', 'tags']);
    if (tags !== undefined && !Array.isArray(tags)) error('tags must be a list');
    for (const tag of Array.isArray(tags) ? tags : []) {
      if (typeof tag !== 'string' || tag.length > 63 || !TAG.test(tag)) error(`tag "${str(tag)}" must be lowercase letters, digits, ":", "+" or "#", separated by "-"`);
    }
    const links = getIn(doc, ['metadata', 'links']);
    (Array.isArray(links) ? links : []).forEach((link, i) => {
      if (!str(getIn(link, ['url'])).trim()) error(`link ${i + 1} needs a URL`);
    });
    for (const [mapName, singular] of [['labels', 'label'], ['annotations', 'annotation']] as const) {
      const map = getIn(doc, ['metadata', mapName]);
      if (map === undefined || map === null) continue;
      if (!isObject(map)) {
        error(`${mapName} must be a map`);
        continue;
      }
      for (const [key, value] of Object.entries(map)) {
        if (!validKey(key)) error(`${singular} key "${key}" is not valid (optional "prefix/" then letters, digits, "-", "_" or ".")`);
        if (typeof value !== 'string') error(`${singular} "${key}" must be a text value`);
        else if (mapName === 'labels' && value !== '' && !validName(value)) error(`label "${key}" value "${value}" must be letters, digits, "-", "_" or "."`);
      }
    }

    // Required spec fields.
    for (const field of REQUIRED[category] ?? []) {
      if (!str(getIn(doc, ['spec', field])).trim()) error(`${FIELD_LABELS[field]} is required`);
    }
    const lifecycle = str(getIn(doc, ['spec', 'lifecycle']));
    if (lifecycle && (category === 'component' || category === 'api') && !LIFECYCLES.includes(lifecycle)) {
      warning(`lifecycle "${lifecycle}" is not one of ${LIFECYCLES.join(', ')}`);
    }

    // References.
    for (const field of refFieldsOf(kind, category)) {
      const value = getIn(doc, refValuePath(field));
      let texts: string[];
      // A many-valued annotation (e.g. deployedOn) is a comma-separated string, not a JSON list.
      if (field.many && field.annotation) {
        texts = splitList(value);
        if (field.required && !texts.length) error(`${field.label.toLowerCase()} is required (it may be an empty list)`);
      } else if (field.many) {
        if (value === undefined || value === null) {
          if (field.required) error(`${field.label.toLowerCase()} is required (it may be an empty list)`);
          continue;
        }
        if (!Array.isArray(value)) {
          error(`${field.label.toLowerCase()} must be a list`);
          continue;
        }
        texts = (value as unknown[]).map(str);
      } else {
        texts = value === undefined ? [] : [str(value)];
      }
      for (const text of texts) {
        if (!text.trim()) {
          if (field.many) error(`${field.label.toLowerCase()} has an empty entry`);
          continue;
        }
        const ref = parseRef(text);
        if (!ref) {
          error(`${field.label.toLowerCase()} "${text}" is not an entity reference ([kind:][namespace/]name)`);
          continue;
        }
        if (!ref.kind && !field.defaultKind) {
          error(`${field.label.toLowerCase()} "${text}" needs a kind, e.g. ${field.allowed[0]}:${ref.name}`);
          continue;
        }
        const targetKind = (ref.kind ?? field.defaultKind!).toLowerCase();
        if (!field.allowed.includes(targetKind)) {
          error(`${field.label.toLowerCase()} "${text}" must point to ${field.allowed.map((k) => `a ${k}`).join(' or ')}`);
          continue;
        }
        const target = refTarget(text, field, namespace)!;
        const entity = known.find((e) => e.key === target);
        if (context && !entity) warning(`${field.label.toLowerCase()} "${text}" is not defined in the catalog files of the workspace`);
        if (entity && field.targetCategories && !field.targetCategories.includes(entity.category)) {
          warning(`${field.label.toLowerCase()} "${text}" must point to ${field.targetCategories.map((c) => `a ${CATEGORIES[c].singular.toLowerCase()}`).join(' or ')}`);
        }
      }
    }

    // Relationships: each one names a dependency, with its kind as dependsOn writes it.
    const dependsOn = refFieldsOf(kind, category).find((f) => f.field === 'dependsOn');
    const dependencies = new Set(dependsOn ? stringList(getIn(doc, ['spec', 'dependsOn'])).map((text) => refTarget(text, dependsOn, namespace)) : []);
    for (const entry of relationshipEntries(doc)) {
      const ref = entry.label ? parseRef(entry.text) : undefined;
      if (!ref) warning(`relationship "${entry.written}" must be written as the relationship then the dependency, e.g. "uses resource:internet"`);
      else if (!ref.kind) warning(`relationship "${entry.written}" needs the kind of the dependency, e.g. "${entry.label} resource:${ref.name}"`);
      else if (!dependsOn || !dependencies.has(refTarget(entry.text, dependsOn, namespace))) warning(`relationship "${entry.written}" is about ${entry.text}, which is not in its dependencies (dependsOn)`);
    }

    // Kind-specific values.
    if (category === 'api') {
      const definition = getIn(doc, ['spec', 'definition']);
      const path = definitionRef(doc);
      if (definition === undefined || definition === null || (typeof definition === 'string' && !definition.trim())) error('definition is required (the spec file or its text)');
      else if (isObject(definition) && path === undefined) error('definition must be a text or a $text / $json / $yaml file reference');
      else if (path !== undefined) checkPath(dir, path, 'definition file', warning);
    }
    if (category === 'location') {
      const target = str(getIn(doc, ['spec', 'target']));
      const targets = getIn(doc, ['spec', 'targets']);
      const list = Array.isArray(targets) ? targets.map(str) : [];
      if (!target.trim() && !list.some((t) => t.trim())) error('target or targets is required');
      for (const t of [target, ...list].filter((t) => t.trim() && !t.includes('*'))) checkPath(dir, t, 'target', warning);
    }
    if (category === 'network') {
      const zone = trustZoneRef(doc, dir);
      if (zone) {
        if (!zone.id) error(`trust zone "${zone.written}" must be written file#trust-zone-id`);
        else if (checkPath(dir, zone.written.replace(/#.*$/, ''), 'threat model', warning) && context && zone.path) {
          const outline = context.threatModels.find((t) => t.path === zone.path);
          if (!outline && context.files[zone.path]) warning(`threat model "${zone.written.replace(/#.*$/, '')}" is not an Open Threat Model file`);
          else if (outline && !outline.trustZones.some((z) => z.id === zone.id)) warning(`trust zone "${zone.id}" is not defined in ${outline.path}`);
        }
      }
      for (const cidr of splitList(getIn(doc, ['metadata', 'annotations', CIDR_ANNOTATION]))) {
        if (!CIDR.test(cidr)) warning(`"${cidr}" is not an IP range (e.g. 10.0.0.0/16 or 2001:db8::/32)`);
      }
    }
    if (category === 'artifact') {
      const purl = str(getIn(doc, ['metadata', 'annotations', PURL_ANNOTATION])).trim();
      if (purl && !/^pkg:[a-zA-Z][a-zA-Z0-9.+-]*\/./.test(purl)) warning(`package URL "${purl}" does not look like a purl (pkg:type/namespace/name@version)`);
    }
    if (category === 'repository' && !str(getIn(doc, ['metadata', 'annotations', REPOSITORY_URL_ANNOTATION])).trim()) {
      warning('the repository has no URL or address');
    }
    if (context && name && kind) {
      for (const placement of placementsOf(keyOf(info), known, context)) {
        if (placement.matches) continue;
        const zone = placement.outline.trustZones.find((z) => z.id === placement.component.trustZone);
        warning(
          `runs in ${placement.actual.map((n) => n.title || n.name).join(', ')} but ${placement.outline.path} places it in trust zone ${zone?.name ?? placement.component.trustZone}` +
            (placement.expected.length ? ` (${placement.expected.map((n) => n.title || n.name).join(', ')})` : ''),
        );
      }
    }
    for (const path of annotationList(doc, SPECS_ANNOTATION)) checkPath(dir, path, 'spec', warning);
    for (const path of annotationList(doc, THREAT_MODELS_ANNOTATION)) {
      if (!checkPath(dir, path, 'threat model', warning)) continue;
      const resolved = resolvePath(dir, path);
      if (context && resolved && context.files[resolved] && !context.specFiles.some((f) => f.kind === 'otm' && f.path === resolved)) {
        warning(`threat model "${path}" is not an Open Threat Model file`);
      }
    }

    // Uniqueness and hierarchy.
    if (name && kind) {
      const key = keyOf(info);
      const first = seen.get(key);
      if (first !== undefined) {
        const where = files && files[first] !== file ? files[first] : 'this file';
        error(`another ${kind} named "${name}" is defined in ${where}`);
      }
      if (first === undefined) seen.set(key, index);
      const elsewhere = others.find((e) => e.key === key);
      if (elsewhere) warning(`a ${kind} named "${name}" is also defined in ${elsewhere.file}`);
      const summary = summarizeEntity(info, file);
      const all = [summary, ...known.filter((e) => e.index !== index)];
      const parent = parentKey(summary, all);
      if (parent && (parent === key || ancestors(key, all).some((a) => parentKey(a, all) === key))) {
        error('parents form a loop');
      }
    }
  });
  return issues;

  /** Warns about a missing file; returns false when the path cannot be checked or is missing. */
  function checkPath(dir: string, path: string, what: string, warning: (message: string) => void): boolean {
    if (isUrl(path)) return false;
    const resolved = resolvePath(dir, path);
    if (resolved === undefined) {
      if (context) warning(`${what} "${path}" is outside the workspace folder`);
      return false;
    }
    if (context && context.files[resolved] === false) {
      warning(`${what} "${path}" does not exist`);
      return false;
    }
    return true;
  }
}
