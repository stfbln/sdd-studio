import type { SpecDetails } from '../../../shared/catalog';
import { normalizeTitle, type ListRef } from './edits';
import { KEYWORDS, lowercaseKeyword, subjectOf, type Keyword } from './keywords';
import { parseSpecMarkdown, type Requirement, type SpecModel } from './parse';

export type SpecAnchor = 'overview' | 'context' | 'requirements';

/** Where a problem is shown in the form: a part of the page, one requirement, or one of its examples. */
export interface SpecLocation {
  anchor: SpecAnchor;
  group?: ListRef;
  index?: number;
  example?: number;
}

export interface SpecIssue {
  severity: 'error' | 'warning';
  message: string;
  location: SpecLocation;
}

export const SPEC_EXTENSION = '.spec.md';

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Every requirement with the list it belongs to. */
export function allRequirements(model: SpecModel): { group: ListRef; index: number; item: Requirement }[] {
  const requirements = model.requirements;
  if (!requirements) return [];
  return [
    ...requirements.list.items.map((item, index) => ({ group: null, index, item })),
    ...requirements.groups.flatMap((g, group) => g.items.map((item, index) => ({ group, index, item }))),
  ];
}

export const exampleCount = (model: SpecModel) => allRequirements(model).reduce((total, r) => total + r.item.examples.length, 0);

export function keywordCounts(model: SpecModel): { keyword: Keyword; count: number }[] {
  const all = allRequirements(model);
  return KEYWORDS.map((keyword) => ({ keyword, count: all.filter((r) => r.item.keyword === keyword).length })).filter((c) => c.count);
}

/** Subject for requirements added without one: the last one used, else the title. */
export function defaultSubject(model: SpecModel): string {
  const subjects = allRequirements(model).map((r) => subjectOf(r.item.text)).filter(Boolean);
  return subjects[subjects.length - 1] ?? (model.title?.text || 'The system');
}

/**
 * `*.spec.md` files, and other markdown files whose `## Requirements` section uses RFC 2119 key
 * words, in `#####` headings or list items (README files and notes are not listed).
 */
export function looksLikeSpec(fileName: string, text: string): boolean {
  const name = fileName.toLowerCase();
  if (name.endsWith(SPEC_EXTENSION)) return true;
  if (!/\.(md|markdown)$/.test(name)) return false;
  return /^##[ \t]+requirements[ \t#]*$/im.test(text) && /^[ \t]*([-*+]|\d+[.)]|#####)[ \t].*(?<![\w-])(MUST|SHALL|SHOULD|MAY|REQUIRED)(?![\w-])/m.test(text);
}

export function analyzeSpec(model: SpecModel): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const warn = (location: SpecLocation, message: string) => issues.push({ severity: 'warning', message, location });

  if (!model.title?.text) warn({ anchor: 'overview' }, 'The spec has no title (a "# Title" heading)');
  const parents = model.extends?.parents ?? [];
  for (const [index, parent] of parents.entries()) {
    if (!/\.(md|markdown)(#.*)?$/i.test(parent.target)) warn({ anchor: 'overview' }, `Extends "${parent.target}": a spec extends other markdown spec files`);
    else if (parents.findIndex((p) => p.target === parent.target) !== index) warn({ anchor: 'overview' }, `Extends "${parent.target}" twice`);
  }
  for (const heading of model.extraTitles) warn({ anchor: 'overview' }, `Line ${heading.line + 1}: "${heading.text}" is another level-1 heading; only the first one is the title`);
  for (const kind of ['context', 'requirements'] as const) {
    const [, ...others] = model.sections.filter((s) => s.kind === kind);
    for (const other of others) warn({ anchor: kind }, `Line ${other.heading.line + 1}: another "${other.heading.text}" section; only the first one is edited here`);
  }

  const groups = model.requirements?.groups ?? [];
  const names = new Set<string>();
  for (const group of groups) {
    const key = group.heading.text.toLowerCase();
    if (names.has(key)) warn({ anchor: 'requirements' }, `Several groups are called "${group.heading.text}"`);
    names.add(key);
  }

  const seen = new Set<string>();
  for (const { group, index, item } of allRequirements(model)) {
    const location = { anchor: 'requirements' as const, group, index };
    const label = `${group === null ? '' : `${groups[group].heading.text}: `}requirement ${index + 1}`;
    const Label = label[0].toUpperCase() + label.slice(1);
    const key = normalizeTitle(item.text).toLowerCase();
    if (!key) {
      warn(location, `${Label} is empty`);
      continue;
    }
    if (!item.keyword) {
      const lower = lowercaseKeyword(item.text);
      warn(location, lower ? `${Label} writes "${lower}" in lowercase: key words only carry their RFC 2119 meaning in capitals` : `${Label} has no RFC 2119 key word (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)`);
    } else if (item.level && item.keyword !== item.level) {
      warn(location, `${Label} says ${item.keyword} but is written under the ${item.level} heading: editing its sentence moves it under ${item.keyword}`);
    }
    if (seen.has(key)) warn(location, `${Label} is listed twice`);
    seen.add(key);

    const examples = new Set<string>();
    for (const [example, { title, text }] of item.examples.entries()) {
      const value = normalizeTitle(text).toLowerCase();
      if (!value && !title) warn({ ...location, example }, `${Label}: example ${example + 1} is empty`);
      else if (value && examples.has(value)) warn({ ...location, example }, `${Label}: example ${example + 1} is listed twice`);
      if (value) examples.add(value);
    }
  }
  return issues;
}

export function summarizeSpec(_fileName: string, text: string): SpecDetails {
  const model = parseSpecMarkdown(text);
  const total = allRequirements(model).length;
  const counts = keywordCounts(model).map((c) => `${c.count} ${c.keyword}`);
  const examples = exampleCount(model);
  const parents = model.extends?.parents ?? [];
  return {
    name: model.title?.text ?? '',
    tags: [],
    details: [
      ...(total ? [plural(total, 'requirement'), ...(counts.length ? [counts.join(' · ')] : [])] : ['No requirements yet']),
      ...(examples ? [plural(examples, 'example')] : []),
      ...(parents.length ? [`extends ${parents.map((p) => p.label || p.target).join(', ')}`] : []),
    ],
    problems: analyzeSpec(model).length,
  };
}

/** A new spec only has its title: sections are written as they get content. */
export const newSpecTemplate = (title: string) => `# ${normalizeTitle(title)}\n`;
