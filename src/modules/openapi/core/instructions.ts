import { KEEP_HEADER_RULE, schemaRule, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Schema and specification of each OpenAPI line, newest first. */
const VERSIONS = [
  { match: /^3\.2/, label: '3.2', schema: 'https://spec.openapis.org/oas/3.2/schema/2025-09-17', docs: 'https://spec.openapis.org/oas/v3.2.0.html' },
  { match: /^3\.1/, label: '3.1', schema: 'https://spec.openapis.org/oas/3.1/schema/2025-09-15', docs: 'https://spec.openapis.org/oas/v3.1.2.html' },
  { match: /^3\.0/, label: '3.0', schema: 'https://spec.openapis.org/oas/3.0/schema/2024-10-18', docs: 'https://spec.openapis.org/oas/v3.0.4.html' },
  { match: /^2\.0/, label: '2.0 (Swagger)', schema: 'https://spec.openapis.org/oas/2.0/schema/2017-08-27', docs: 'https://spec.openapis.org/oas/v2.0.html' },
];

/** Update instructions of an OpenAPI document, for the version it declares. */
export function openApiInstructions(fileName: string, text: string): FileInstructions {
  const declared = /^\s*["']?(openapi|swagger)["']?\s*:\s*["']?(\d+\.\d+)/m.exec(text);
  const version = VERSIONS.find((v) => v.match.test(declared?.[2] ?? '')) ?? VERSIONS[2];
  const field = declared?.[1] ?? 'openapi';
  return {
    style: /\.json$/i.test(fileName) ? 'json' : 'hash',
    // The root of an OpenAPI document only allows "x-" extensions besides its own fields.
    schemaProperty: 'x-json-schema',
    format: `an OpenAPI ${version.label} document`,
    docs: version.docs,
    schema: version.schema,
    rules: [
      purposeRule('openapi'),
      schemaRule(field),
      'Give every operation a unique operationId and at least one response; declare each {parameter} of a path as an "in: path" parameter.',
      "Define reusable schemas under components.schemas and use them with $ref: '#/components/schemas/Name' instead of copying them.",
      'Software catalog files and other specs refer to this file by its path: keep its name and folder.',
      KEEP_HEADER_RULE,
    ],
  };
}
