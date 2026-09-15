import { structuredChecks, type SpecKind } from '../../../host/catalog/SpecKind';
import { openApiInstructions } from '../core/instructions';
import { analyzeSpec, newSpecTemplate } from '../core/openapi';
import { looksLikeApiSpec, summarizeApiSpec } from '../core/summary';

/** OpenAPI documents in the spec catalog. The extra data is the number of references to other files. */
export const apiSpecKind: SpecKind<number> = {
  info: {
    kind: 'openapi',
    title: 'API Specifications',
    singular: 'API spec',
    plural: 'API specs',
    icon: 'json',
    namePlaceholder: 'e.g. Orders API',
    formats: [
      { label: 'YAML', extension: '.openapi.yaml' },
      { label: 'JSON', extension: '.openapi.json' },
    ],
    acceptedExtensions: ['.yaml', '.yml', '.json'],
  },
  panelViewType: 'sdd.openapi.specsOverview',
  editorViewType: 'sdd.openapi.editor',
  folderSetting: 'sdd.openapi.specsFolder',
  defaultFolder: 'api',
  include: '**/*.{yaml,yml,json}',
  fileExtensions: ['.yaml', '.yml', '.json'],
  accepts: looksLikeApiSpec,
  summarize: (fileName, text) => {
    const { summary, relativeRefs } = summarizeApiSpec(fileName, text);
    return { summary, extra: relativeRefs };
  },
  template: (name, fileName) => newSpecTemplate(name, /\.json$/i.test(fileName) ? 'json' : 'yaml'),
  check: (fileName, text) => structuredChecks(summarizeApiSpec(fileName, text).summary.error, fileName, text, analyzeSpec),
  instructions: openApiInstructions,
  moveWarning: (relativeRefs) =>
    relativeRefs
      ? `This specification has ${relativeRefs} $ref pointing to other files with relative paths. They are not updated when the file moves and may break.`
      : undefined,
};
