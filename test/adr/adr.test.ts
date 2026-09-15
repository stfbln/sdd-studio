import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyAdrEdits, type AdrEdit } from '../../src/modules/adr/core/edits';
import { frontMatterList, parseAdrMarkdown, splitLines } from '../../src/modules/adr/core/parse';
import { analyzeAdr, looksLikeAdr, newAdrTemplate, summarizeAdr } from '../../src/modules/adr/core/summary';

const SAMPLE = readFileSync(join(__dirname, '../../samples/adr/0001-use-postgresql.md'), 'utf8');
const edit = (text: string, ...edits: AdrEdit[]) => applyAdrEdits(text, edits);

describe('parsing', () => {
  it('reads front matter, title, sections, options, drivers, the matrix and pros/cons', () => {
    const model = parseAdrMarkdown(SAMPLE);
    expect(model.title?.text).toBe('Use PostgreSQL for the order store');
    expect(model.context?.text).toMatch(/^Orders are currently written[\s\S]*specialists\.$/);

    expect(model.drivers?.list.items.map((i) => i.text)).toEqual(['Operational cost', 'Team familiarity', 'Query flexibility for support tooling']);

    const options = model.options?.list.items ?? [];
    expect(options.map((o) => [o.title, o.description])).toEqual([
      ['PostgreSQL', 'Battle-tested relational database, strong ecosystem, easy to self-host or run managed.'],
      ['DynamoDB', 'Managed NoSQL, scales elastically without capacity planning.'],
    ]);

    expect(model.matrix?.rows[0].map((c) => c.rating)).toEqual(['meets', 'meets', 'meets']);
    expect(model.matrix?.rows[1][0]).toEqual({ rating: 'partial', note: 'pay-per-request adds up at our volume' });

    expect(model.outcome?.selectedOption).toBe(0);
    expect(model.outcome?.rationale).toMatch(/^it best balances/);
    expect(model.outcome?.consequences.list.items.map((c) => [c.type, c.text])).toEqual([
      ['good', 'the team can operate it without ramp-up.'],
      ['bad', 'vertical scaling has a ceiling we will eventually need to plan around.'],
    ]);

    expect(model.prosCons?.options.map((o) => o.heading.text)).toEqual(['PostgreSQL', 'DynamoDB']);
    expect(model.prosCons?.options[0].list.items.map((i) => i.type)).toEqual(['good', 'neutral', 'bad']);

    expect(model.more?.text).toMatch(/^Revisit this decision/);
  });

  it('reads the decision-makers, consulted and informed lists', () => {
    const model = parseAdrMarkdown(SAMPLE);
    const fields = model.frontMatter.fields;
    expect(fields.status).toBeDefined();
    expect(fields['decision-makers']).toBeDefined();
  });

  it('reads a block-style YAML list in the front matter, and normalizes it to a flow list once edited', () => {
    const text = '---\nstatus: proposed\ndecision-makers:\n  - Alice\n  - Bob\n---\n\n# T\n';
    const model = parseAdrMarkdown(text);
    expect(frontMatterList(splitLines(text), model.frontMatter.fields['decision-makers'])).toEqual(['Alice', 'Bob']);
    expect(edit(text, { op: 'setStatus', value: 'accepted' })).toContain('decision-makers:\n  - Alice\n  - Bob');
    expect(edit(text, { op: 'setDecisionMakers', value: ['Alice', 'Bob', 'Carol'] })).toContain('decision-makers: [Alice, Bob, Carol]');
  });

  it('escapes a pipe in a matrix cell note', () => {
    const text = edit(
      '# T\n',
      { op: 'addDriver', text: 'Cost' },
      { op: 'addOption', title: 'A' },
      { op: 'setCell', option: 0, driver: 0, rating: 'partial', note: 'depends on load | volume' },
    );
    expect(text).toContain('depends on load \\| volume');
    expect(parseAdrMarkdown(text).matrix?.rows[0][0].note).toBe('depends on load | volume');
  });

  it('leaves an unmatched "chosen option" as free text', () => {
    const text = '# T\n\n## Considered Options\n\n- **A**\n\n## Decision Outcome\n\nChosen option: **B**, because reasons.\n';
    const model = parseAdrMarkdown(text);
    expect(model.outcome?.selectedOption).toBeUndefined();
    expect(model.outcome?.unmatchedChoice).toBe('B');
  });
});

describe('writing', () => {
  it('builds an ADR part by part, writing only what is filled', () => {
    let text = '# Checkout store\n';
    text = edit(text, { op: 'setStatus', value: 'proposed' });
    expect(text).toBe('---\nstatus: proposed\n---\n\n# Checkout store\n');
    text = edit(text, { op: 'setContext', value: 'We need a store for baskets.' });
    text = edit(text, { op: 'addDriver', text: 'Cost' }, { op: 'addDriver', text: 'Latency' });
    text = edit(text, { op: 'addOption', title: 'Redis', description: 'In-memory store.' }, { op: 'addOption', title: 'Postgres' });
    expect(text).toContain('## Options Comparison');
    expect(text).toContain('| Option | Cost | Latency |');
    expect(text).toContain('| Redis |  |  |');

    text = edit(text, { op: 'setCell', option: 0, driver: 0, rating: 'meets', note: '' }, { op: 'setCell', option: 1, driver: 1, rating: 'fails', note: 'too slow' });
    expect(text).toContain('| Redis | ✅ Meets |  |');
    expect(text).toContain('| Postgres |  | ❌ Fails: too slow |');

    text = edit(text, { op: 'setOutcome', selectedOption: 0, rationale: "it's the fastest" });
    expect(text).toContain('Chosen option: **Redis**, because it\'s the fastest.');
    text = edit(text, { op: 'addConsequence', type: 'good', text: 'simple to operate' });
    expect(text).toContain('### Consequences\n\n- Good, because simple to operate.');

    text = edit(text, { op: 'addProCon', option: 0, type: 'good', text: 'fast' });
    expect(text).toContain('## Pros and Cons of the Options\n\n### Redis\n\n- Good, because fast.\n\n### Postgres');
  });

  it('keeps the matrix and pros/cons in sync when an option is added, moved or deleted', () => {
    let text = edit(
      '# T\n',
      { op: 'addDriver', text: 'Cost' },
      { op: 'addOption', title: 'A' },
      { op: 'addOption', title: 'B' },
      { op: 'setCell', option: 0, driver: 0, rating: 'meets', note: '' },
      { op: 'setCell', option: 1, driver: 0, rating: 'fails', note: '' },
      { op: 'addProCon', option: 0, type: 'good', text: 'a is good' },
      { op: 'addProCon', option: 1, type: 'bad', text: 'b is bad' },
    );
    expect(text).toContain('| A | ✅ Meets |');
    expect(text).toContain('| B | ❌ Fails |');

    // Inserting an option at position 0 shifts A and B down: their ratings and pros/cons follow.
    text = edit(text, { op: 'addOption', title: 'Z', index: 0 });
    const model1 = parseAdrMarkdown(text);
    expect(model1.options?.list.items.map((o) => o.title)).toEqual(['Z', 'A', 'B']);
    expect(model1.matrix?.rows.map((r) => r[0].rating)).toEqual([undefined, 'meets', 'fails']);
    expect(model1.prosCons?.options.map((o) => o.heading.text)).toEqual(['Z', 'A', 'B']);
    expect(model1.prosCons?.options[1].list.items[0].text).toBe('a is good.');

    // Deleting Z restores the original order and content.
    text = edit(text, { op: 'deleteOption', index: 0 });
    const model2 = parseAdrMarkdown(text);
    expect(model2.options?.list.items.map((o) => o.title)).toEqual(['A', 'B']);
    expect(model2.matrix?.rows.map((r) => r[0].rating)).toEqual(['meets', 'fails']);
    expect(model2.prosCons?.options[0].list.items[0].text).toBe('a is good.');
    expect(model2.prosCons?.options[1].list.items[0].text).toBe('b is bad.');

    // Moving A after B swaps the rows and the pros/cons subsections together.
    text = edit(text, { op: 'moveOption', index: 0, toIndex: 1 });
    const model3 = parseAdrMarkdown(text);
    expect(model3.options?.list.items.map((o) => o.title)).toEqual(['B', 'A']);
    expect(model3.matrix?.rows.map((r) => r[0].rating)).toEqual(['fails', 'meets']);
    expect(model3.prosCons?.options.map((o) => o.heading.text)).toEqual(['B', 'A']);
    expect(model3.prosCons?.options[0].list.items[0].text).toBe('b is bad.');
  });

  it('keeps the matrix columns in sync when a driver is added, moved or deleted', () => {
    let text = edit(
      '# T\n',
      { op: 'addOption', title: 'A' },
      { op: 'addDriver', text: 'Cost' },
      { op: 'addDriver', text: 'Speed' },
      { op: 'setCell', option: 0, driver: 0, rating: 'meets', note: '' },
      { op: 'setCell', option: 0, driver: 1, rating: 'fails', note: '' },
    );
    text = edit(text, { op: 'addDriver', text: 'Security', index: 0 });
    let model = parseAdrMarkdown(text);
    expect(model.drivers?.list.items.map((d) => d.text)).toEqual(['Security', 'Cost', 'Speed']);
    expect(model.matrix?.rows[0].map((c) => c.rating)).toEqual([undefined, 'meets', 'fails']);

    text = edit(text, { op: 'deleteDriver', index: 0 });
    model = parseAdrMarkdown(text);
    expect(model.drivers?.list.items.map((d) => d.text)).toEqual(['Cost', 'Speed']);
    expect(model.matrix?.rows[0].map((c) => c.rating)).toEqual(['meets', 'fails']);

    text = edit(text, { op: 'moveDriver', index: 0, toIndex: 1 });
    model = parseAdrMarkdown(text);
    expect(model.drivers?.list.items.map((d) => d.text)).toEqual(['Speed', 'Cost']);
    expect(model.matrix?.rows[0].map((c) => c.rating)).toEqual(['fails', 'meets']);
  });

  it('renames an option and keeps its row label and pros/cons heading in sync', () => {
    let text = edit('# T\n', { op: 'addDriver', text: 'Cost' }, { op: 'addOption', title: 'A' }, { op: 'setCell', option: 0, driver: 0, rating: 'meets', note: '' });
    text = edit(text, { op: 'setOption', index: 0, title: 'Renamed', description: '' });
    expect(text).toContain('| Renamed | ✅ Meets |');
    expect(text).toContain('### Renamed');
  });

  it('sets and clears the people fields of the front matter', () => {
    let text = edit('# T\n', { op: 'setDecisionMakers', value: ['Alice', 'Bob'] });
    expect(text).toBe('---\ndecision-makers: [Alice, Bob]\n---\n\n# T\n');
    text = edit(text, { op: 'setStatus', value: 'accepted' });
    expect(text).toContain('decision-makers: [Alice, Bob]');
    expect(text).toContain('status: accepted');
    text = edit(text, { op: 'setDecisionMakers', value: [] });
    expect(text).not.toContain('decision-makers');
    text = edit(text, { op: 'setStatus', value: '' });
    expect(text).toBe('# T\n');
  });

  it('removes the outcome section once it is empty again', () => {
    let text = edit('# T\n', { op: 'addOption', title: 'A' }, { op: 'setOutcome', selectedOption: 0, rationale: 'reasons' });
    expect(text).toContain('## Decision Outcome');
    text = edit(text, { op: 'setOutcome', selectedOption: undefined, rationale: '' });
    expect(text).not.toContain('## Decision Outcome');
  });

  it('normalizes line endings and keeps a missing final newline', () => {
    expect(edit('# T', { op: 'setContext', value: 'D' })).toBe('# T\n\n## Context and Problem Statement\n\nD');
    expect(edit('', { op: 'setTitle', value: 'New' })).toBe('# New\n');
  });
});

describe('catalog and checks', () => {
  it('recognizes numbered files and ADR-shaped markdown, but not other markdown', () => {
    expect(looksLikeAdr('docs/decisions/0001-x.md', '# X\n')).toBe(true);
    expect(looksLikeAdr('docs/decisions/x.md', SAMPLE)).toBe(true);
    expect(looksLikeAdr('README.md', '# Tool\n\n## Considered Options\n\n- A\n')).toBe(false);
    expect(looksLikeAdr('notes.txt', SAMPLE)).toBe(false);
  });

  it('summarizes and reports problems', () => {
    expect(summarizeAdr('0001-use-postgresql.md', SAMPLE)).toEqual({ name: 'Use PostgreSQL for the order store', tags: ['accepted'], details: ['2 options'], problems: 0 });
    expect(summarizeAdr('x.md', 'Nothing')).toMatchObject({ name: '', details: ['No options yet'] });

    const broken = '# A\n\n# B\n\n## Considered Options\n\n- **A**\n- **A**\n\n## Options Comparison\n\n## Decision Outcome\n';
    const issues = analyzeAdr(parseAdrMarkdown(broken)).map((i) => i.message);
    expect(issues).toContain('Line 3: "B" is another level-1 heading; only the first one is the title');
    expect(issues).toContain('Several options are called "A"');
  });

  it('starts a new ADR with only its front matter and title', () => {
    const text = newAdrTemplate('Use PostgreSQL  ');
    expect(text).toMatch(/^---\nstatus: "proposed"\ndate: \d{4}-\d{2}-\d{2}\n---\n\n# Use PostgreSQL\n$/);
  });
});
