import type { SpecKind } from '../../../host/catalog/SpecKind';
import { adrInstructions } from '../core/instructions';
import { parseAdrMarkdown } from '../core/parse';
import { analyzeAdr, looksLikeAdr, newAdrTemplate, summarizeAdr } from '../core/summary';

/** Architecture Decision Records (mADR), one numbered markdown file per decision. */
export const adrKind: SpecKind<undefined> = {
  info: {
    kind: 'adr',
    title: 'Decisions',
    singular: 'ADR',
    plural: 'ADRs',
    icon: 'notebook',
    namePlaceholder: 'e.g. Use PostgreSQL for the order store',
    formats: [{ label: 'Markdown', extension: '.md' }],
    acceptedExtensions: ['.md'],
    numberedFiles: true,
  },
  panelViewType: 'sdd.adr.decisionsOverview',
  editorViewType: 'sdd.adr.editor',
  folderSetting: 'sdd.adr.decisionsFolder',
  defaultFolder: 'docs/decisions',
  include: '**/*.{md,markdown}',
  fileExtensions: ['.md', '.markdown'],
  accepts: looksLikeAdr,
  summarize: (fileName, text) => ({ summary: summarizeAdr(fileName, text), extra: undefined }),
  template: (name) => newAdrTemplate(name),
  check: (_fileName, text) => analyzeAdr(parseAdrMarkdown(text)).map(({ severity, message }) => ({ severity, message })),
  instructions: adrInstructions,
};
