import { KEEP_HEADER_RULE, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of a Gherkin feature file. */
export function featureInstructions(): FileInstructions {
  return {
    style: 'hash',
    format: 'a Gherkin feature (Cucumber)',
    docs: 'https://cucumber.io/docs/gherkin/reference/',
    keepFirstLine: /^\s*#\s*language\s*:/,
    compact: true,
    rules: [
      purposeRule('gherkin'),
      'One Feature per file, with a short description, then scenarios (optionally grouped in Rules); a Background holds the steps shared by every scenario.',
      'Write steps as Given (context), When (action), Then (expected outcome), with And or But to continue; reuse the wording of existing steps.',
      'A Scenario Outline uses <placeholders> filled by its Examples tables; keep table columns aligned.',
      'Avoid near-duplicate scenarios that only differ by their data: fold them into a Scenario Outline with an Examples table instead, so people and AI assistants can read and extend it as one case.',
      'Tags (@name) go on the line above a Feature, Rule, Scenario or Examples. When the first line is "# language: xx", use the keywords of that language.',
      KEEP_HEADER_RULE,
    ],
  };
}
