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
      'Keep the sentence about BCP 14 key words, in italics, at the start of the Requirements section. Requirements can be split into "### Group" headings inside it (e.g. Security).',
      'Under the section, or under each group, requirements are listed by key word: a "#### MUST" heading, then MUST NOT, SHOULD, SHOULD NOT and MAY, in this order, each followed by the definition of its key word in italics and left out when it has no requirement. An icon can come before the key word (e.g. "#### ✅ MUST"): use the icons already written in the file.',
      'Each requirement is a "##### <sentence>" heading under the heading of its key word: one sentence on one line, saying who or what it is about (e.g. "##### The service MUST ..."), with that BCP 14 key word in capitals (SHALL and REQUIRED are read as MUST, SHALL NOT as MUST NOT, RECOMMENDED as SHOULD, NOT RECOMMENDED as SHOULD NOT, OPTIONAL as MAY). A description (details, rationale) can follow under the heading, before the examples.',
      'Do not write these words in lowercase inside requirements: rephrase instead (e.g. "can" or "is allowed to"). Keep one requirement per heading.',
      'A requirement can be illustrated by example scenarios, after its description: a short title in bold followed by a backslash ("**Declined card**\\", or "**Example 2**\\" without a title), the case on the next line, and a blank line between examples. Give real values (e.g. "A 20 EUR basket paid with a declined card leaves the order unpaid"), one case per example, and no expected steps: behaviour shown step by step belongs in a Gherkin feature.',
      'A spec can extend one or several more general specs: an "Extends: [Title](relative/path.spec.md), [Other](relative/other.spec.md)" line right under the title (e.g. an ephemeral storage policy extending a data storage policy, a persistent storage policy extending it and an audit logging policy). Their requirements, and those of the specs they extend, apply to this spec too.',
      'Do not copy inherited requirements: only write here what is specific, or a requirement that overrides an inherited one by changing its key word (same sentence, e.g. SHOULD becoming MUST). When two specs extended disagree, the one written first applies; restate the requirement here to settle it.',
      'Keep this comment.',
    ],
  };
}
