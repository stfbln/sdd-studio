/**
 * Specs that extend another spec: a generic spec (e.g. data storage) holds the requirements shared
 * by its children, and each child spec ("Extends: [Data storage](...)" under its title) adds the
 * requirements of its own case. The requirements of the whole chain apply to the child; they are
 * shown in its form, read-only, and are not copied into it.
 */
import { dirOf, resolvePath } from '../../../shared/files';
import { normalizeTitle } from './edits';
import { findKeyword, type Keyword } from './keywords';
import type { SpecModel } from './parse';
import { allRequirements, type SpecIssue } from './summary';

/** How far a chain of specs is followed before it is considered broken. */
export const MAX_INHERITANCE = 10;

export interface InheritedRequirement {
  /** Name of the `###` group it belongs to in its own spec, null when it has none. */
  group: string | null;
  text: string;
  keyword?: Keyword;
  examples: string[];
}

/** One ancestor of the edited spec. */
export interface InheritedSpec {
  /** Workspace-relative path of the file. */
  path: string;
  title: string;
  requirements: InheritedRequirement[];
  /** 1 for the spec it extends, 2 for the one that spec extends... */
  depth: number;
}

export interface SpecInheritance {
  /** Ancestors, closest first. */
  chain: InheritedSpec[];
  /** Why the chain stops before its end (file not found, circular...). */
  problem?: string;
}

/** Extra data the host sends to the spec form. */
export interface SpecEditorContext {
  /** Workspace-relative path of the edited file. */
  file: string;
  /** The other specs of the workspace folder, to pick the spec this one extends. */
  specs: { path: string; title: string }[];
  inheritance: SpecInheritance;
}

/** Workspace path of the spec `file` extends, from the path written in it. */
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
 * What a requirement says without its key word, so that a child spec raising or lowering the level
 * of an inherited requirement ("SHOULD be encrypted" → "MUST be encrypted") is seen as its override.
 */
export function overrideKey(text: string): string {
  const match = findKeyword(text);
  const sentence = match ? text.slice(0, match.index) + text.slice(match.index + match.written.length) : text;
  return sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Inherited requirements by what they say, closest ancestor first. */
export function inheritedByKey(inheritance: SpecInheritance | undefined): Map<string, { spec: InheritedSpec; requirement: InheritedRequirement }> {
  const byKey = new Map<string, { spec: InheritedSpec; requirement: InheritedRequirement }>();
  for (const spec of inheritance?.chain ?? []) {
    for (const requirement of spec.requirements) {
      const key = overrideKey(requirement.text);
      if (key && !byKey.has(key)) byKey.set(key, { spec, requirement });
    }
  }
  return byKey;
}

/** Problems the file alone cannot show: a broken chain, and requirements the parents already state. */
export function inheritanceIssues(model: SpecModel, inheritance: SpecInheritance | undefined): SpecIssue[] {
  const issues: SpecIssue[] = [];
  if (!inheritance) return issues;
  if (inheritance.problem) issues.push({ severity: 'warning', message: inheritance.problem, location: { anchor: 'overview' } });

  const groups = model.requirements?.groups ?? [];
  const inherited = inheritedByKey(inheritance);
  for (const { group, index, item } of allRequirements(model)) {
    const found = inherited.get(overrideKey(item.text));
    if (!found || found.requirement.keyword !== item.keyword) continue;
    const label = `${group === null ? '' : `${groups[group].heading.text}: `}requirement ${index + 1}`;
    issues.push({
      severity: 'warning',
      message: `${label[0].toUpperCase()}${label.slice(1)} repeats a requirement inherited from "${found.spec.title || found.spec.path}"`,
      location: { anchor: 'requirements', group, index },
    });
  }
  return issues;
}
