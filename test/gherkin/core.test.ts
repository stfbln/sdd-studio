import { describe, expect, it } from 'vitest';
import { getDialect, translateDocument } from '../../src/modules/gherkin/core/dialects';
import type { GherkinDocumentModel } from '../../src/modules/gherkin/core/model';
import {
  analyzeExamples,
  extractParameter,
  scenarioParameters,
  substitute,
  suggestParameterName,
} from '../../src/modules/gherkin/core/parameters';
import { parseGherkin } from '../../src/modules/gherkin/core/parse';
import { serializeGherkin } from '../../src/modules/gherkin/core/serialize';

const counter = () => {
  let i = 0;
  return () => `id${i++}`;
};

function parse(source: string): GherkinDocumentModel {
  const result = parseGherkin(source, counter());
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('\n'));
  return result.document;
}

/** serialize → parse must give back exactly the same model. */
function expectRoundTrip(source: string) {
  const model = parse(source);
  const text = serializeGherkin(model);
  expect(parse(text)).toEqual(model);
  expect(serializeGherkin(parse(text))).toBe(text);
  return text;
}

const SAMPLE = `# The whole shop
@shop @smoke
Feature: Buying cucumbers
    As a customer
    I want to buy cucumbers

      so that I can eat them

  Background:
    Given the shop is open

  @outline
  Scenario Outline: eating <what>
    # the basket is empty
    Given there are <start> cucumbers
    When I eat <eat> cucumbers
    Then I should have <left> cucumbers
      | name  | value |
      | a\\|b | c\\\\d  |
    And the receipt says
      """json
      {"left": <left>}
      \\"\\"\\" is how you write """
      """

    @fast
    Examples: Small numbers
      Just a few
      | start | eat | left | what |
      |    12 |   5 |    7 | cukes |
      |    20 |   5 |   15 | cukes |

    Examples:
      | start | eat | left | what |

  Rule: Stock is limited
    Stock can't go negative

    Background:
      Given an empty stock

    Scenario: out of stock
      * I try to buy
      Then I see an error
      \`\`\`
      Sorry
      \`\`\`

# end of file
`;

describe('parse + serialize', () => {
  it('round-trips a feature using every construct', () => {
    const text = expectRoundTrip(SAMPLE);
    expect(text).toMatchInlineSnapshot(`
      "# The whole shop
      @shop @smoke
      Feature: Buying cucumbers
        As a customer
        I want to buy cucumbers

          so that I can eat them

        Background:
          Given the shop is open

        @outline
        Scenario Outline: eating <what>
          # the basket is empty
          Given there are <start> cucumbers
          When I eat <eat> cucumbers
          Then I should have <left> cucumbers
            | name | value |
            | a\\|b | c\\\\d  |
          And the receipt says
            """json
            {"left": <left>}
            \\"\\"\\" is how you write """
            """

          @fast
          Examples: Small numbers
            Just a few
            | start | eat | left | what  |
            | 12    | 5   | 7    | cukes |
            | 20    | 5   | 15   | cukes |

          Examples:
            | start | eat | left | what |

        Rule: Stock is limited
          Stock can't go negative

          Background:
            Given an empty stock

          Scenario: out of stock
            * I try to buy
            Then I see an error
              \`\`\`
              Sorry
              \`\`\`

      # end of file
      "
    `);
  });

  it('keeps cell and doc string contents intact', () => {
    const doc = parse(SAMPLE);
    const outline = doc.feature!.children[1];
    if (outline.kind !== 'scenario') throw new Error('expected scenario');
    expect(outline.steps[2].dataTable!.rows[1]).toEqual(['a|b', 'c\\d']);
    expect(outline.steps[3].docString).toEqual({ delimiter: '"""', mediaType: 'json', content: '{"left": <left>}\n""" is how you write """' });
    expect(outline.steps[0].comments).toEqual(['# the basket is empty']);
    expect(doc.trailingComments).toEqual(['# end of file']);
    expect(doc.feature!.description).toBe('As a customer\nI want to buy cucumbers\n\n  so that I can eat them');
  });

  it('escapes special characters typed in the forms', () => {
    const doc = parse('Feature: x\n  Scenario: y\n    Given a\n      | v |\n');
    const scenario = doc.feature!.children[0];
    if (scenario.kind !== 'scenario') throw new Error('expected scenario');
    scenario.steps[0].dataTable!.rows = [['pipe | back \\ slash', 'line\nbreak']];
    scenario.steps[0].docString = { delimiter: '"""', mediaType: '', content: '  """ at start, """ in middle\n\n  indented\n```' };
    const reparsed = parse(serializeGherkin(doc));
    expect(reparsed).toEqual(doc);
  });

  it('does not write steps left blank in the form', () => {
    const doc = parse('Feature: x\n  Scenario: y\n    Given a\n');
    const scenario = doc.feature!.children[0];
    if (scenario.kind !== 'scenario') throw new Error('expected scenario');
    scenario.steps.push({ id: 'blank', comments: [], keyword: 'And ', text: '  ' });
    expect(serializeGherkin(doc)).toBe('Feature: x\n\n  Scenario: y\n    Given a\n');
  });

  it('handles empty and comment-only files', () => {
    expect(serializeGherkin(parse(''))).toBe('');
    expect(parse('# just a note\n')).toEqual({ language: 'en', feature: null, trailingComments: ['# just a note'] });
    expectRoundTrip('# just a note\n');
  });

  it('reports syntax errors with their location', () => {
    const result = parseGherkin('Feature: x\n  Scenario: y\n    Given a\nfoo: bar\n  | a |\n');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].line).toBeGreaterThan(0);
  });
});

describe('languages', () => {
  const FRENCH = `# language: fr
Fonctionnalité: Achat

  Plan du scénario: manger
    Soit il y a <n> concombres
    Et je mange
    Mais pas trop

    Exemples:
      | n |
      | 1 |
`;

  it('round-trips a non-English file', () => {
    expect(expectRoundTrip(FRENCH)).toBe(FRENCH);
  });

  it('translates keywords to another language', () => {
    const english = serializeGherkin(translateDocument(parse(FRENCH), 'en'));
    expect(english).toBe(`Feature: Achat

  Scenario Outline: manger
    Given il y a <n> concombres
    And je mange
    But pas trop

    Examples:
      | n |
      | 1 |
`);
  });
});

describe('parameters', () => {
  const doc = parse(SAMPLE);
  const outline = doc.feature!.children[1];
  if (outline.kind !== 'scenario') throw new Error('expected scenario');

  it('detects parameters in name, steps, tables and doc strings', () => {
    expect(scenarioParameters(outline)).toEqual(['what', 'start', 'eat', 'left']);
  });

  it('compares parameters with an Examples header', () => {
    expect(analyzeExamples(['a', 'b'], { header: ['b', 'c'] })).toEqual({ missing: ['a'], unused: ['c'] });
  });

  it('substitutes row values', () => {
    expect(substitute('eat <eat> of <start>, keep <other>', ['start', 'eat'], ['12', '5'])).toBe('eat 5 of 12, keep <other>');
  });

  it('suggests unique parameter names', () => {
    expect(suggestParameterName('Crème brûlée', [])).toBe('creme_brulee');
    expect(suggestParameterName('12', [])).toBe('value_12');
    expect(suggestParameterName('eat', ['eat', 'eat_2'])).toBe('eat_3');
    expect(suggestParameterName('  ', [])).toBe('value');
  });

  it('extracts a parameter from a plain scenario into a new Examples table', () => {
    const plain = parse('Feature: f\n  Scenario: s\n    Given there are 12 cucumbers\n    When I eat 5\n').feature!.children[0];
    if (plain.kind !== 'scenario') throw new Error('expected scenario');
    const dialect = getDialect('en');
    const once = extractParameter(plain, plain.steps[0].id, { start: 10, end: 12 }, 'start', dialect, counter());
    const twice = extractParameter(once, once.steps[1].id, { start: 6, end: 7 }, 'eat', dialect, counter());

    expect(twice.keyword).toBe('Scenario Outline');
    expect(twice.steps.map((s) => s.text)).toEqual(['there are <start> cucumbers', 'I eat <eat>']);
    expect(twice.examples).toHaveLength(1);
    expect(twice.examples[0].header).toEqual(['start', 'eat']);
    expect(twice.examples[0].rows).toEqual([['12', '5']]);
  });
});
