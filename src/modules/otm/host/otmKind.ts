import { structuredChecks, type SpecKind } from '../../../host/catalog/SpecKind';
import { otmInstructions } from '../core/instructions';
import { analyzeOtm, newOtmTemplate } from '../core/otm';
import { looksLikeOtm, outlineOtm, summarizeOtm, type OtmOutline } from '../core/summary';

/** Open Threat Model documents (YAML or JSON) in the spec catalog. */
export const otmKind: SpecKind<OtmOutline> = {
  info: {
    kind: 'otm',
    title: 'Threat Models',
    singular: 'threat model',
    plural: 'threat models',
    icon: 'shield',
    namePlaceholder: 'e.g. Online shop',
    formats: [
      { label: 'YAML', extension: '.otm.yaml' },
      { label: 'JSON', extension: '.otm.json' },
    ],
    acceptedExtensions: ['.yaml', '.yml', '.json'],
  },
  panelViewType: 'sdd.otm.threatModelsOverview',
  editorViewType: 'sdd.otm.editor',
  folderSetting: 'sdd.otm.threatModelsFolder',
  defaultFolder: 'threat-models',
  include: '**/*.{yaml,yml,json}',
  fileExtensions: ['.yaml', '.yml', '.json'],
  accepts: looksLikeOtm,
  summarize: (fileName, text) => ({ summary: summarizeOtm(fileName, text), extra: outlineOtm(fileName, text) }),
  template: (name, fileName) => newOtmTemplate(name, /\.json$/i.test(fileName) ? 'json' : 'yaml'),
  check: (fileName, text) => structuredChecks(summarizeOtm(fileName, text).error, fileName, text, analyzeOtm),
  instructions: otmInstructions,
};
