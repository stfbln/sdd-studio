import { structuredChecks, type SpecKind } from '../../../host/catalog/SpecKind';
import { openCliInstructions } from '../core/instructions';
import { analyzeOpenCli, newOpenCliTemplate } from '../core/opencli';
import { looksLikeOpenCli, summarizeOpenCli } from '../core/summary';

/** OpenCLI descriptions in the spec catalog. */
export const cliSpecKind: SpecKind<undefined> = {
  info: {
    kind: 'opencli',
    title: 'CLI Specifications',
    singular: 'CLI spec',
    plural: 'CLI specs',
    icon: 'terminal',
    namePlaceholder: 'e.g. Acme deploy tool',
    formats: [
      { label: 'JSON', extension: '.opencli.json' },
      { label: 'YAML', extension: '.opencli.yaml' },
    ],
    acceptedExtensions: ['.yaml', '.yml', '.json'],
  },
  panelViewType: 'sdd.opencli.specsOverview',
  editorViewType: 'sdd.opencli.editor',
  folderSetting: 'sdd.opencli.specsFolder',
  defaultFolder: 'cli',
  include: '**/*.{yaml,yml,json}',
  fileExtensions: ['.yaml', '.yml', '.json'],
  accepts: looksLikeOpenCli,
  summarize: (fileName, text) => ({ summary: summarizeOpenCli(fileName, text), extra: undefined }),
  template: (name, fileName) => newOpenCliTemplate(name, /\.ya?ml$/i.test(fileName) ? 'yaml' : 'json'),
  check: (fileName, text) => structuredChecks(summarizeOpenCli(fileName, text).error, fileName, text, analyzeOpenCli),
  instructions: openCliInstructions,
};
