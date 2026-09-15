import { structuredChecks, type SpecKind } from '../../../host/catalog/SpecKind';
import { asyncApiInstructions } from '../core/instructions';
import { analyzeAsyncApi, newAsyncApiTemplate } from '../core/asyncapi';
import { looksLikeAsyncApi, summarizeAsyncApi } from '../core/summary';

/** AsyncAPI documents in the spec catalog. The extra data is the number of references to other files. */
export const asyncSpecKind: SpecKind<number> = {
  info: {
    kind: 'asyncapi',
    title: 'AsyncAPI Specifications',
    singular: 'AsyncAPI spec',
    plural: 'AsyncAPI specs',
    icon: 'broadcast',
    namePlaceholder: 'e.g. Order events',
    formats: [
      { label: 'YAML', extension: '.asyncapi.yaml' },
      { label: 'JSON', extension: '.asyncapi.json' },
    ],
    acceptedExtensions: ['.yaml', '.yml', '.json'],
  },
  panelViewType: 'sdd.asyncapi.specsOverview',
  editorViewType: 'sdd.asyncapi.editor',
  folderSetting: 'sdd.asyncapi.specsFolder',
  defaultFolder: 'api',
  include: '**/*.{yaml,yml,json}',
  fileExtensions: ['.yaml', '.yml', '.json'],
  accepts: looksLikeAsyncApi,
  summarize: (fileName, text) => {
    const { summary, relativeRefs } = summarizeAsyncApi(fileName, text);
    return { summary, extra: relativeRefs };
  },
  template: (name, fileName) => newAsyncApiTemplate(name, /\.json$/i.test(fileName) ? 'json' : 'yaml'),
  check: (fileName, text) => structuredChecks(summarizeAsyncApi(fileName, text).summary.error, fileName, text, analyzeAsyncApi),
  instructions: asyncApiInstructions,
  moveWarning: (relativeRefs) =>
    relativeRefs
      ? `This specification has ${relativeRefs} $ref pointing to other files with relative paths. They are not updated when the file moves and may break.`
      : undefined,
};
