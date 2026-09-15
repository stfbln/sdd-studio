/**
 * Specs that extend other specs: a generic spec (e.g. data storage) holds the requirements shared
 * by its children, and each child spec ("Extends: [Data storage](...)" under its title) adds the
 * requirements of its own case. A spec can extend several specs at once (storage rules and audit
 * rules), so the specs form a graph, walked closest first: the requirements of every spec reached
 * apply to the child, are shown in its form read-only, and are not copied into it.
 */
import { dirOf, resolvePath } from '../../../shared/files';
import { normalizeTitle } from './edits';
import { findKeyword, type Keyword } from './keywords';
import type { SpecModel } from './parse';
import { allRequirements, type SpecIssue } from './summary';

/** How deep a chain of specs is followed, and how many specs are read in total. */
export const MAX_INHERITANCE_DEPTH = 10;
export const MAX_INHERITED_SPECS = 25;

export interface InheritedRequirement {
  /** Name of the `###` group it belongs to in its own spec, null when it has none. */
  group: string | null;
  text: string;
  keyword?: Keyword;
  examples: string[];
}

/** One spec the edited one inherits from, directly or through another. */
export interface InheritedSpec {
  /** Workspace-relative path of the file. */
  path: string;
  title: string;
  requirements: InheritedRequirement[];
  /** 1 for a spec the edited one extends, 2 for a spec one of those extends... */
  depth: number;
  /** Path of the spec that extends it, when it is not extended by the edited spec itself. */
  via?: string;
}

export interface SpecInheritance {
  /** Every spec inherited from, closest first: the specs extended in the order they are written, then theirs. */
  chain: InheritedSpec[];
  /** Specs that could not be read: not found, outside the workspace folder, circular... */
  problems: string[];
}

/** Extra data the host sends to the spec form. */
export interface SpecEditorContext {
  /** Workspace-relative path of the edited file. */
  file: string;
  /** The other specs of the workspace folder, to pick the specs this one extends. */
  specs: { path: string; title: string }[];
  inheritance: SpecInheritance;
}

/** Workspace path of a spec `file` extends, from the path written in it. */
export function parentPath(file: string, written: string | undefined): string | undefined {
  const target = written?.split('#')[0].trim();
  return target ? resolvePath(dirOf(file), target) : undefined;
}

/** The requirements of a spec, flattened with the name of the group holding each one. */
export function requirementsOf(model: SpecModel): InheritedRequirement[] {
  const groups = model.requirements?.groups ?? [];
  return allRequirements(model)
    .filter((r) => normalizeTitle(r.item.text))
    .map(({ group, item }) => ({
      group: group === null ? null : (groups[group]?.heading.text ?? null),
      text: item.text,
      keyword: item.keyword,
      examples: item.examples.map((e) => e.text),
    }));
}

/**
 * What a requirement says without its key word, so that a spec raising or lowering the level of an
 * inherited requirement ("SHOULD be encrypted" → "MUST be encrypted") is seen as its override, and
 * two inherited specs stating the same thing at different levels are seen as a conflict.
 */
export function overrideKey(text: string): string {
  const match = findKeyword(text);
  const sentence = match ? text.slice(0, match.index) + text.slice(match.index + match.written.length) : text;
  return sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Inherited requirements by what they say, each list closest first: the first one is the one that applies. */
export function inheritedByKey(inheritance: SpecInheritance | undefined): Map<string, { spec: InheritedSpec; requirement: InheritedRequirement }[]> {
  const byKey = new Map<string, { spec: InheritedSpec; requirement: InheritedRequirement }[]>();
  for (const spec of inheritance?.chain ?? []) {
    for (const requirement of spec.requirements) {
      const key = overrideKey(requirement.text);
      if (!key) continue;
      const found = byKey.get(key);
      if (found) found.push({ spec, requirement });
      else byKey.set(key, [{ spec, requirement }]);
    }
  }
  return byKey;
}

export const specName = (spec: InheritedSpec) => spec.title || spec.path;

/** Requirements are grouped by the name of their `###` group, whatever its case; "" is the list without a group. */
export const groupKey = (name: string | null | undefined) => (name ?? '').trim().toLowerCase();

/** An inherited requirement as the form shows it, in the list of the group it belongs to. */
export interface InheritedEntry {
  spec: InheritedSpec;
  requirement: InheritedRequirement;
  /** Name of the spec the one stating it is extended by, when it is not the edited spec. */
  through?: string;
  /** Set when a nearer requirement says the same thing: the spec stating it ("" for the edited one) and its key word. */
  overridden?: { by: string; keyword?: Keyword };
}

export interface MergedInheritance {
  /** Inherited requirements by group key, closest spec first; "" holds the ones written without a group. */
  byGroup: Map<string, InheritedEntry[]>;
  /** Groups only the specs extended have, as they are spelled there, in the order they are met. */
  extraGroups: string[];
  total: number;
}

/**
 * The inherited requirements laid out like the Requirements section of the form: per group, closest
 * spec first, each marked with what overrides it (a requirement of the edited spec, or of a spec
 * extended before the one stating it).
 */
export function mergeInherited(model: SpecModel, inheritance: SpecInheritance | undefined): MergedInheritance {
  const byGroup = new Map<string, InheritedEntry[]>();
  const extraGroups: string[] = [];
  const ownGroups = new Set((model.requirements?.groups ?? []).map((group) => groupKey(group.heading.text)));
  const own = new Map(allRequirements(model).map(({ item }) => [overrideKey(item.text), item]));
  const applied = new Map<string, InheritedEntry>();
  const names = new Map((inheritance?.chain ?? []).map((spec) => [spec.path, specName(spec)]));
  let total = 0;

  for (const spec of inheritance?.chain ?? []) {
    for (const requirement of spec.requirements) {
      const entry: InheritedEntry = { spec, requirement, ...(spec.via ? { through: names.get(spec.via) ?? spec.via } : {}) };
      const sentence = overrideKey(requirement.text);
      const ownItem = own.get(sentence);
      const closer = applied.get(sentence);
      if (ownItem) entry.overridden = { by: '', keyword: ownItem.keyword };
      else if (closer) entry.overridden = { by: specName(closer.spec), keyword: closer.requirement.keyword };
      else applied.set(sentence, entry);

      const key = groupKey(requirement.group);
      const entries = byGroup.get(key);
      if (entries) entries.push(entry);
      else byGroup.set(key, [entry]);
      if (key && !ownGroups.has(key) && !extraGroups.some((name) => groupKey(name) === key)) extraGroups.push(requirement.group ?? '');
      total++;
    }
  }
  return { byGroup, extraGroups, total };
}

/** Problems the file alone cannot show: specs that cannot be read, requirements already inherited, and parents that disagree. */
export function inheritanceIssues(model: SpecModel, inheritance: SpecInheritance | undefined): SpecIssue[] {
  const issues: SpecIssue[] = [];
  if (!inheritance) return issues;
  for (const problem of inheritance.problems) issues.push({ severity: 'warning', message: problem, location: { anchor: 'overview' } });

  const groups = model.requirements?.groups ?? [];
  const inherited = inheritedByKey(inheritance);
  const overridden = new Set<string>();
  for (const { group, index, item } of allRequirements(model)) {
    const key = overrideKey(item.text);
    const found = inherited.get(key)?.[0];
    if (!found) continue;
    overridden.add(key);
    if (found.requirement.keyword !== item.keyword) continue;
    const label = `${group === null ? '' : `${groups[group].heading.text}: `}requirement ${index + 1}`;
    issues.push({
      severity: 'warning',
      message: `${label[0].toUpperCase()}${label.slice(1)} repeats a requirement inherited from "${specName(found.spec)}"`,
      location: { anchor: 'requirements', group, index },
    });
  }

  // Two inherited specs asking for the same thing at different levels: the closest one applies, say so.
  for (const [key, found] of inherited) {
    if (overridden.has(key) || found.length < 2) continue;
    const other = found.find((f) => f.requirement.keyword !== found[0].requirement.keyword);
    if (!other) continue;
    issues.push({
      severity: 'warning',
      message: `"${specName(found[0].spec)}" (${found[0].requirement.keyword ?? 'no key word'}) and "${specName(other.spec)}" (${other.requirement.keyword ?? 'no key word'}) disagree on "${found[0].requirement.text.replace(/\s+/g, ' ')}": the first one applies, restate it here to settle it`,
      location: { anchor: 'requirements' },
    });
  }
  return issues;
}
