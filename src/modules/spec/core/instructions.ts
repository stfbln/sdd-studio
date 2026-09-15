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
      'A requirement can be illustrated by example scenarios: a nested list under it, each item written "Example: <one concrete case>" (e.g. "Example: a 20 EUR basket paid with a declined card leaves the order unpaid"). Give real values, one case per item, and no expected steps: behaviour shown step by step belongs in a Gherkin feature.',
      'A spec can extend a more general spec: an "Extends: [Title](relative/path.spec.md)" line right under the title, pointing to one other markdown spec (e.g. an ephemeral storage policy extending a data storage policy). Its requirements and those of its own parents apply to this spec too.',
      'Do not copy inherited requirements: only write here what is specific, or a requirement that overrides an inherited one by changing its key word (same sentence, e.g. SHOULD becoming MUST).',
      'Keep this comment.',
    ],
  };
}
