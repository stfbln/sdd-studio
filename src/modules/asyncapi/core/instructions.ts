import { KEEP_HEADER_RULE, schemaRule, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

const KNOWN = ['2.0.0', '2.1.0', '2.2.0', '2.3.0', '2.4.0', '2.5.0', '2.6.0', '3.0.0'];

/** Update instructions of an AsyncAPI document, for the version it declares. */
export function asyncApiInstructions(fileName: string, text: string): FileInstructions {
  const declared = /^\s*["']?asyncapi["']?\s*:\s*["']?(\d+)\.(\d+)/m.exec(text);
  const wanted = declared ? `${declared[1]}.${declared[2]}.0` : '3.0.0';
  // Unknown minor versions use the latest schema of their major version.
  const version = KNOWN.includes(wanted) ? wanted : ([...KNOWN].reverse().find((v) => v.startsWith(`${declared?.[1] ?? '3'}.`)) ?? '3.0.0');
  const v2 = version.startsWith('2.');
  return {
    style: /\.json$/i.test(fileName) ? 'json' : 'hash',
    // The root of an AsyncAPI document only allows "x-" extensions besides its own fields.
    schemaProperty: 'x-json-schema',
    format: `an AsyncAPI ${version.replace(/\.0$/, '')} document`,
    docs: `https://www.asyncapi.com/docs/reference/specification/v${version}`,
    schema: `https://raw.githubusercontent.com/asyncapi/spec-json-schemas/master/schemas/${version}.json`,
    rules: [
      purposeRule('asyncapi'),
      schemaRule('asyncapi'),
      v2
        ? 'Channels hold their publish and subscribe operations and messages; declare each {parameter} of a channel name under its parameters.'
        : 'Channels list their messages and declare each {parameter} of their address; operations have an action (send or receive), a channel ($ref) and messages of that channel.',
      "Keep operationIds unique; define reusable messages and schemas under components and use them with $ref: '#/components/messages/Name'.",
      'Software catalog files and other specs refer to this file by its path: keep its name and folder.',
      KEEP_HEADER_RULE,
    ],
  };
}
