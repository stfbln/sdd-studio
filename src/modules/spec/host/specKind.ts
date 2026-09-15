import type { SpecKind } from '../../../host/catalog/SpecKind';
import { specInstructions } from '../core/instructions';
import { parseSpecMarkdown } from '../core/parse';
import { analyzeSpec, looksLikeSpec, newSpecTemplate, SPEC_EXTENSION, summarizeSpec } from '../core/summary';

/** Markdown specs of a system or component, with RFC 2119 requirements. */
export const specKind: SpecKind<undefined> = {
  info: {
    kind: 'spec',
    title: 'Specs',
    singular: 'spec',
    plural: 'specs',
    icon: 'book',
    namePlaceholder: 'e.g. Payment service',
    formats: [{ label: 'Markdown', extension: SPEC_EXTENSION }],
    acceptedExtensions: [SPEC_EXTENSION],
  },
  panelViewType: 'sdd.spec.specsOverview',
  editorViewType: 'sdd.spec.editor',
  folderSetting: 'sdd.spec.specsFolder',
  defaultFolder: 'specs',
  include: '**/*.{md,markdown}',
  fileExtensions: ['.md', '.markdown'],
  accepts: looksLikeSpec,
  summarize: (fileName, text) => ({ summary: summarizeSpec(fileName, text), extra: undefined }),
  template: (name) => newSpecTemplate(name),
  check: (_fileName, text) => analyzeSpec(parseSpecMarkdown(text)).map(({ severity, message }) => ({ severity, message })),
  instructions: specInstructions,
};
