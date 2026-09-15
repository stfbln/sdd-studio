import type { SpecKind } from '../../../host/catalog/SpecKind';
import { parseYamlDocuments } from '../../../shared/structured/yamlDocuments';
import { analyzeOpenSlo } from '../core/analysis';
import { openSloInstructions } from '../core/instructions';
import { looksLikeOpenSlo, newOpenSloTemplate, summarizeOpenSlo } from '../core/summary';

/** OpenSLO files, one object (Service, SLO, SLI…) per YAML document. */
export const openSloKind: SpecKind<undefined> = {
  info: {
    kind: 'openslo',
    title: 'Service Level Objectives',
    singular: 'OpenSLO file',
    plural: 'OpenSLO files',
    icon: 'target',
    namePlaceholder: 'e.g. Checkout service (the service the SLOs describe)',
    formats: [{ label: 'OpenSLO YAML', extension: '.openslo.yaml' }],
    acceptedExtensions: ['.yaml', '.yml'],
  },
  panelViewType: 'sdd.openslo.specsOverview',
  editorViewType: 'sdd.openslo.editor',
  folderSetting: 'sdd.openslo.specsFolder',
  defaultFolder: 'slos',
  include: '**/*.{yaml,yml}',
  fileExtensions: ['.yaml', '.yml'],
  accepts: looksLikeOpenSlo,
  summarize: (fileName, text) => ({ summary: summarizeOpenSlo(fileName, text), extra: undefined }),
  template: (name) => newOpenSloTemplate(name),
  check: (_fileName, text) => {
    const result = parseYamlDocuments(text);
    if (!result.ok) return result.errors.map((e) => ({ severity: 'error' as const, message: `${e.line ? `Line ${e.line}: ` : ''}${e.message}` }));
    return analyzeOpenSlo(result.value).map(({ severity, message }) => ({ severity, message }));
  },
  instructions: openSloInstructions,
};
