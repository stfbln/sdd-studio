import type { FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of an ADR (the structure `parseAdrMarkdown` reads). */
export function adrInstructions(): FileInstructions {
  return {
    style: 'markdown',
    format: 'an Architecture Decision Record following the mADR template',
    docs: 'https://adr.github.io/madr/',
    rules: [
      purposeRule('adr'),
      'Structure: front matter (status, date, decision-makers, consulted, informed), a "# Title" heading, "## Context and Problem Statement", "## Decision Drivers", "## Considered Options", "## Options Comparison", "## Decision Outcome" (with a "### Consequences" sub-section), "## Pros and Cons of the Options" and "## More Information". Other sections are allowed and kept as written.',
      'Each considered option is one item under "## Considered Options": "- **Title** — short description".',
      [
        'The "## Options Comparison" table and the "### {option title}" headings of "## Pros and Cons of the Options" are generated from the Considered Options and Decision Drivers lists and kept in sync with them by position: edit them from the form, or keep any hand edit\'s row/column order and option headings exactly aligned with those lists.',
        'A matrix cell starts with ✅ Meets, ⚠️ Partial or ❌ Fails, optionally followed by ": a short note".',
      ],
      'The Decision Outcome starts with "Chosen option: **Title**, because ...", matching the bold title to one of the Considered Options.',
      'Each Consequence or pro/con is one item written as "Good, because ...", "Neutral, because ..." (pros/cons only) or "Bad, because ...".',
      'Keep this comment.',
    ],
  };
}
