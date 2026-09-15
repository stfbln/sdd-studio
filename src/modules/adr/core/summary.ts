import type { SpecDetails } from '../../../shared/catalog';
import { normalizeTitle } from './edits';
import { frontMatterValue, parseAdrMarkdown, splitLines, type AdrModel } from './parse';

export type AdrAnchor = 'overview' | 'context' | 'drivers' | 'options' | 'matrix' | 'outcome' | 'prosCons' | 'more';

export interface AdrLocation {
  anchor: AdrAnchor;
  index?: number;
}

export interface AdrIssue {
  severity: 'error' | 'warning';
  message: string;
  location: AdrLocation;
}

/** Numbered ADR file names, the adr-tools/mADR/log4brains convention: "0001-use-postgresql.md". */
export const ADR_NUMBER_RE = /^(\d{3,5})-/;

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Numbered markdown files, and other markdown files that already have the shape of an ADR (a
 * "Decision Outcome" heading alongside "Considered Options" or "Decision Drivers").
 */
export function looksLikeAdr(fileName: string, text: string): boolean {
  const name = fileName.slice(fileName.lastIndexOf('/') + 1).toLowerCase();
  if (!/\.(md|markdown)$/.test(name)) return false;
  if (ADR_NUMBER_RE.test(name)) return true;
  return /^##[ \t]+decision outcome[ \t#]*$/im.test(text) && /^##[ \t]+(considered options|decision drivers?)[ \t#]*$/im.test(text);
}

export function analyzeAdr(model: AdrModel): AdrIssue[] {
  const issues: AdrIssue[] = [];
  const warn = (location: AdrLocation, message: string) => issues.push({ severity: 'warning', message, location });

  if (!model.title?.text) warn({ anchor: 'overview' }, 'The ADR has no title (a "# Title" heading)');
  for (const heading of model.extraTitles) warn({ anchor: 'overview' }, `Line ${heading.line + 1}: "${heading.text}" is another level-1 heading; only the first one is the title`);

  const kinds = ['context', 'drivers', 'options', 'matrix', 'outcome', 'prosCons', 'more'] as const;
  const anchors: Record<(typeof kinds)[number], AdrAnchor> = { context: 'context', drivers: 'drivers', options: 'options', matrix: 'matrix', outcome: 'outcome', prosCons: 'prosCons', more: 'more' };
  for (const kind of kinds) {
    const [, ...others] = model.sections.filter((s) => s.kind === kind);
    for (const other of others) warn({ anchor: anchors[kind] }, `Line ${other.heading.line + 1}: another "${other.heading.text}" section; only the first one is edited here`);
  }

  const options = model.options?.list.items ?? [];
  const drivers = model.drivers?.list.items ?? [];
  const seenTitles = new Set<string>();
  options.forEach((option, index) => {
    const key = normalizeTitle(option.title).toLowerCase();
    if (!key) warn({ anchor: 'options', index }, `Option ${index + 1} has no title`);
    else if (seenTitles.has(key)) warn({ anchor: 'options', index }, `Several options are called "${option.title}"`);
    seenTitles.add(key);
  });

  if (options.length && drivers.length && model.matrix) {
    options.forEach((option, i) => {
      if (model.matrix!.rows[i]?.every((c) => !c.rating)) warn({ anchor: 'matrix', index: i }, `"${option.title || `Option ${i + 1}`}" is not rated against any decision driver`);
    });
  }

  if (options.length) {
    if (!model.outcome || (model.outcome.selectedOption === undefined && !model.outcome.unmatchedChoice)) warn({ anchor: 'outcome' }, 'No option is selected as the decision outcome yet');
    if (model.outcome?.unmatchedChoice) warn({ anchor: 'outcome' }, `The chosen option "${model.outcome.unmatchedChoice}" no longer matches a considered option`);
  }

  return issues;
}

export function summarizeAdr(_fileName: string, text: string): SpecDetails {
  const model = parseAdrMarkdown(text);
  const options = model.options?.list.items.length ?? 0;
  const status = frontMatterValue(splitLines(text), model.frontMatter.fields.status);
  return {
    name: model.title?.text ?? '',
    tags: status ? [status] : [],
    details: [options ? plural(options, 'option') : 'No options yet'],
    problems: analyzeAdr(model).length,
  };
}

/** A new ADR only has its title and an empty front matter for status/date: sections are written as they get content. */
export const newAdrTemplate = (title: string) => `---\nstatus: "proposed"\ndate: ${new Date().toISOString().slice(0, 10)}\n---\n\n# ${normalizeTitle(title)}\n`;
