import type { SpecKind } from '../../../host/catalog/SpecKind';
import { newProtoTemplate } from '../core/analysis';
import { protoInstructions } from '../core/instructions';
import { checkProto, summarizeProto } from '../core/summary';

/** Protocol Buffers files in the spec catalog. The extra data is the number of project imports. */
export const protoKind: SpecKind<number> = {
  info: {
    kind: 'proto',
    title: 'gRPC / Protobuf Files',
    singular: 'proto file',
    plural: 'proto files',
    icon: 'symbol-interface',
    namePlaceholder: 'e.g. Order service',
    formats: [{ label: 'Proto', extension: '.proto' }],
    acceptedExtensions: ['.proto'],
    fileNameSeparator: '_',
  },
  panelViewType: 'sdd.proto.specsOverview',
  editorViewType: 'sdd.proto.editor',
  folderSetting: 'sdd.proto.specsFolder',
  defaultFolder: 'proto',
  include: '**/*.proto',
  fileExtensions: ['.proto'],
  accepts: (fileName) => fileName.toLowerCase().endsWith('.proto'),
  summarize: (_fileName, text) => {
    const { summary, localImports } = summarizeProto(text);
    return { summary, extra: localImports };
  },
  template: (name) => newProtoTemplate(name),
  check: (_fileName, text) => checkProto(text),
  instructions: protoInstructions,
  moveWarning: (localImports) =>
    localImports
      ? `This file imports ${localImports} other proto file${localImports === 1 ? '' : 's'} of the project. Import paths are relative to the proto root: they are not updated when files move, and files importing this one keep the old path.`
      : undefined,
};
