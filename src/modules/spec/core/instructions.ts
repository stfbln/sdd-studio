import type { FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of a markdown spec (the structure `parseSpecMarkdown` reads). */
export function specInstructions(): FileInstructions {
  return {
    style: 'markdown',
    format: 'a Markdown specification of requirements',
    docs: 'https://www.rfc-editor.org/rfc/rfc8174',
    rules: [
      purposeRule('spec'),
      'The catalog entry linking this file (sdd-studio/specs annotation) is the entry point: start there to find the owner, the APIs, the dependencies and the other spec files of the entity.',
      'Structure: a "# Title" heading, a short description, a "## Context" section (background, free text) and a "## Requirements" section. Other sections are allowed and kept as written.',
      'Each requirement is one list item under "## Requirements", or under a "### Group" heading inside it, and uses one BCP 14 key word in capitals: MUST, MUST NOT, SHOULD, SHOULD NOT or MAY (also SHALL, SHALL NOT, REQUIRED, RECOMMENDED, NOT RECOMMENDED, OPTIONAL).',
      'Do not write these words in lowercase inside requirements: rephrase instead (e.g. "can" or "is allowed to"). Keep the sentence about BCP 14 key words at the start of the Requirements section.',
      'Say who or what the requirement is about (e.g. "The service MUST ...") and keep one requirement per item.',
      'Keep this comment.',
    ],
  };
}
