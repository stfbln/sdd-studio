import { KEEP_HEADER_RULE, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of a Protocol Buffers file (no JSON schema: the rules say what protoc checks). */
export function protoInstructions(): FileInstructions {
  return {
    style: 'slash',
    format: 'a Protocol Buffers file',
    docs: 'https://protobuf.dev/programming-guides/proto3/',
    rules: [
      purposeRule('proto'),
      'Follow the style guide (https://protobuf.dev/programming-guides/style/): PascalCase messages, enums, services and rpcs; snake_case fields; UPPER_SNAKE_CASE enum values prefixed with the enum name, the first one being 0 and unspecified.',
      'Never change or reuse the number of a published field: remove a field by adding its number and name to "reserved".',
      'Import other files by their path from the proto root folder, as protoc -I does (e.g. import "common/v1/money.proto"), and refer to their types with the full package name.',
      'A comment right above a message, field, enum, service or rpc documents it.',
      KEEP_HEADER_RULE,
    ],
  };
}
