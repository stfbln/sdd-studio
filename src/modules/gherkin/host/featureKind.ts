import * as vscode from 'vscode';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import type { SpecKind } from '../../../host/catalog/SpecKind';
import { FEATURE_EXTENSION, featureTemplate } from '../core/files';
import { featureInstructions } from '../core/instructions';
import { summarizeFeature } from '../core/summary';

const MAX_SUGGESTIONS = 3000;

/** Gherkin features in the spec catalog. The extra data is the step texts of each file. */
export const featureKind: SpecKind<string[]> = {
  info: {
    kind: 'gherkin',
    title: 'Features',
    singular: 'feature',
    plural: 'features',
    icon: 'checklist',
    namePlaceholder: 'e.g. Checkout with a credit card',
    formats: [{ label: 'Gherkin', extension: FEATURE_EXTENSION }],
    acceptedExtensions: [FEATURE_EXTENSION],
  },
  panelViewType: 'sdd.gherkin.featuresOverview',
  editorViewType: 'sdd.gherkin.editor',
  folderSetting: 'sdd.gherkin.featuresFolder',
  defaultFolder: 'features',
  include: '**/*.feature',
  fileExtensions: [FEATURE_EXTENSION],
  accepts: () => true,
  summarize: (_fileName, text) => {
    const { summary, steps } = summarizeFeature(text);
    return { summary, extra: steps };
  },
  template: (name) => featureTemplate(name),
  check: (_fileName, text) => {
    const { error } = summarizeFeature(text).summary;
    return error ? [{ severity: 'error', message: error }] : [];
  },
  instructions: featureInstructions,
};

/** Step texts used across the workspace, offered while typing steps. */
export async function stepSuggestions(index: SpecIndex<string[]>): Promise<string[]> {
  if (!vscode.workspace.getConfiguration('sdd.gherkin').get('stepSuggestions', true)) return [];
  const unique = new Set<string>();
  for (const entry of await index.all()) entry.extra.forEach((s) => unique.add(s));
  return [...unique].sort((a, b) => a.localeCompare(b)).slice(0, MAX_SUGGESTIONS);
}
