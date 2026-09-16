import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySpecEdits, type ListRef, type SpecEdit } from '../../src/modules/spec/core/edits';
import { groupKey, inheritanceIssues, mergeInherited, overrideKey, parentPath, requirementsOf, type SpecInheritance } from '../../src/modules/spec/core/inherit';
import {
  composeRequirement,
  CONFORMANCE_NOTICE,
  DEFAULT_KEYWORD_ICONS,
  findKeyword,
  KEYWORD_DEFINITIONS,
  keywordIcons,
  levelOfHeading,
  lowercaseKeyword,
  NO_KEYWORD_DEFINITION,
  subjectOf,
  withKeyword,
  WRITTEN_NOTICE,
  type Keyword,
} from '../../src/modules/spec/core/keywords';
import { parseSpecMarkdown, type RequirementList } from '../../src/modules/spec/core/parse';
import { analyzeSpec, defaultSubject, exampleCount, looksLikeSpec, newSpecTemplate, summarizeSpec } from '../../src/modules/spec/core/summary';

const SAMPLE = readFileSync(join(__dirname, '../../samples/specs/payment-service.spec.md'), 'utf8');
/** The same spec written as a list, the layout before key word headings. */
const LIST_LAYOUT = readFileSync(join(__dirname, 'fixtures/payment-service.list-layout.spec.md'), 'utf8');
const edit = (text: string, ...edits: SpecEdit[]) => applySpecEdits(text, edits);
const texts = (text: string, group: ListRef = null) => {
  const requirements = parseSpecMarkdown(text).requirements;
  return (group === null ? requirements?.list : requirements?.groups[group])?.items.map((i) => i.text);
};
/** What the form shows of a list, whatever its layout. */
const content = (list: RequirementList | undefined) =>
  list?.items.map(({ text, description, level, checkbox, examples }) => ({ text, description, level, checkbox, examples: examples.map(({ title, text }) => ({ title, text })) }));
const REQUIREMENTS = `## Requirements\n\n*${CONFORMANCE_NOTICE}*\n\n`;
/** The heading of a key word, with its icon, and its definition in italics, as written before its requirements. */
const level = (keyword: Keyword) => `#### ${DEFAULT_KEYWORD_ICONS[keyword]} ${keyword}\n\n*${KEYWORD_DEFINITIONS[keyword]}*\n\n`;
const NO_KEYWORD = `#### ❔ No key word\n\n*${NO_KEYWORD_DEFINITION}*\n\n`;
const [MUST, MUST_NOT, SHOULD, MAY] = (['MUST', 'MUST NOT', 'SHOULD', 'MAY'] as const).map(level);

describe('RFC 2119 key words', () => {
  it('finds key words in capitals only, longest first, with their synonyms', () => {
    expect(findKeyword('The service MUST NOT store cards.')).toEqual({ written: 'MUST NOT', keyword: 'MUST NOT', index: 12 });
    expect(findKeyword('Logs SHALL be kept.')?.keyword).toBe('MUST');
    expect(findKeyword('A receipt is OPTIONAL.')?.keyword).toBe('MAY');
    expect(findKeyword('It is NOT RECOMMENDED to retry.')?.keyword).toBe('SHOULD NOT');
    expect(findKeyword('The service must store cards, MAYBE.')).toBeUndefined();
    expect(lowercaseKeyword('The service should not retry.')).toBe('should not');
    expect(lowercaseKeyword('The service SHOULD retry, it may fail.')).toBeUndefined();
  });

  it('changes the level of a sentence and composes new ones', () => {
    expect(withKeyword('The service SHALL retry.', 'MAY')).toBe('The service MAY retry.');
    expect(withKeyword('The service should retry.', 'MUST NOT')).toBe('The service MUST NOT retry.');
    expect(withKeyword('Retry twice.', 'SHOULD')).toBe('SHOULD Retry twice.');
    expect(composeRequirement('MUST', 'Take card payments', 'The service')).toBe('The service MUST take card payments');
    expect(composeRequirement('MUST', 'API keys are rotated', 'The service')).toBe('The service MUST API keys are rotated');
    expect(composeRequirement('MAY', 'Users SHOULD confirm.', 'The service')).toBe('Users SHOULD confirm.');
    expect(composeRequirement('SHOULD', 'the service must log', 'X')).toBe('the service SHOULD log');
    expect(subjectOf('The back office SHOULD NOT show cards.')).toBe('The back office');
    expect(subjectOf('MUST be fast.')).toBeUndefined();
  });

  it('reads the level of a key word heading whatever its icon, synonyms and case aside', () => {
    expect(levelOfHeading('MUST NOT')).toEqual({ keyword: 'MUST NOT' });
    expect(levelOfHeading(' shall  not ')).toEqual({ keyword: 'MUST NOT' });
    expect(levelOfHeading('Recommended')).toEqual({ keyword: 'SHOULD' });
    expect(levelOfHeading('⛔ MUST NOT')).toEqual({ keyword: 'MUST NOT' });
    expect(levelOfHeading('🔴MUST')).toEqual({ keyword: 'MUST' });
    expect(levelOfHeading('[!] May')).toEqual({ keyword: 'MAY' });
    expect(levelOfHeading(':white_check_mark: MUST')).toEqual({ keyword: 'MUST' });
    expect(levelOfHeading('<img src="must.svg" width="16"> SHOULD NOT')).toEqual({ keyword: 'SHOULD NOT' });
    expect(levelOfHeading('❔ No key word')).toEqual({});
    expect(levelOfHeading('Ask me: no key word')).toEqual({});
    // Words that are not an icon, or a key word inside another word, name no level.
    expect(levelOfHeading('Things you may')).toBeUndefined();
    expect(levelOfHeading('Smust')).toBeUndefined();
    expect(levelOfHeading('MUST: absolute')).toBeUndefined();
    expect(levelOfHeading('Notes')).toBeUndefined();
  });

  it('reads the icons of the settings, one line each, the default where none is given', () => {
    expect(keywordIcons(undefined)).toEqual(DEFAULT_KEYWORD_ICONS);
    expect(keywordIcons({ MUST: ' :red_circle:\n', MAY: '', SHOULD: 3 })).toEqual({ ...DEFAULT_KEYWORD_ICONS, MUST: ':red_circle:', MAY: '' });
  });
});

describe('parsing', () => {
  it('reads title, description, context, the conformance sentence, requirements and groups', () => {
    const model = parseSpecMarkdown(SAMPLE);
    expect(model.title?.text).toBe('Payment service');
    expect(model.description.text).toBe('Takes card and wallet payments for the web shop and the mobile app, and keeps\nthe payment history of each order.');
    expect(model.context?.text).toMatch(/^Orders are created by the \*\*order service\*\*[\s\S]*back office\.$/);
    const requirements = model.requirements!;
    expect(requirements.notice?.text).toBe(WRITTEN_NOTICE);
    expect(requirements.list.notes).toBe('');
    expect(requirements.list.items.map((i) => i.keyword)).toEqual(['MUST', 'MUST', 'SHOULD', 'MAY']);
    expect(requirements.list.levels.map((l) => [l.keyword, l.heading?.text, l.intro === `*${KEYWORD_DEFINITIONS[l.keyword!]}*`, l.start, l.count])).toEqual([
      ['MUST', '✅ MUST', true, 0, 2],
      ['SHOULD', '👍 SHOULD', true, 2, 1],
      ['MAY', '🆗 MAY', true, 3, 1],
    ]);
    expect(requirements.groups.map((g) => [g.heading.text, g.notes, g.items.map((i) => i.keyword)])).toEqual([['Security', 'Agreed with the security team on 2026-08-12.', ['MUST NOT', 'SHOULD NOT']]]);
    expect(texts(SAMPLE, 0)?.[1]).toBe('The back office SHOULD NOT show more than the last four digits of a card number to support staff.');
    expect(model.sections.map((s) => s.kind)).toEqual(['context', 'requirements', 'other']);
  });

  it('reads a requirement heading with its description and its titled examples', () => {
    const [first, second] = parseSpecMarkdown(SAMPLE).requirements!.list.items;
    expect(first).toMatchObject({
      text: "The service MUST take card payments through the payment provider's hosted form.",
      description: 'Keeps the shop out of the scope of PCI DSS: card data is typed in the form of\nthe provider, never in a page of the shop.',
      level: 'MUST',
      listItem: false,
    });
    expect(first.examples.map((e) => [e.title, e.text])).toEqual([
      ['Card accepted', 'A customer pays a 20 EUR basket with a Visa card and comes back to\nthe shop with the order marked paid.'],
      ['Card declined', 'The provider declines the card; the order stays unpaid and the\ncustomer is offered another payment method.'],
    ]);
    // "**Example 1**\\" is the title of an example that has none.
    expect(second.examples.map((e) => e.title)).toEqual(['']);

    const text = [
      '## Requirements',
      '',
      '#### Shall',
      '',
      '##### [x] The service MUST keep **card** tokens #',
      'Kept for refunds.',
      '',
      '```md',
      '*Not an example*',
      '##### Not a requirement',
      '```',
      '',
      '\\*Not an example either*',
      '',
      '_Refund:_',
      'A refund of order 4711 reuses its token.',
      '',
      'It is not shown to the customer.',
      '',
      '**Example 2**',
      '',
      '##### Tags MUST start with # #',
      '',
      '#### Notes',
      '',
      'Kept as written.',
      '',
    ].join('\n');
    const list = parseSpecMarkdown(text).requirements!.list;
    expect(content(list)).toEqual([
      {
        text: 'The service MUST keep **card** tokens',
        description: 'Kept for refunds.\n\n```md\n*Not an example*\n##### Not a requirement\n```\n\n\\*Not an example either*',
        level: 'MUST',
        checkbox: '[x] ',
        examples: [
          { title: 'Refund', text: 'A refund of order 4711 reuses its token.\n\nIt is not shown to the customer.' },
          { title: '', text: '' },
        ],
      },
      { text: 'Tags MUST start with #', description: '', level: 'MUST', checkbox: '', examples: [] },
    ]);
    expect(list.items[0].examples.map((e) => [e.line, e.end])).toEqual([
      [14, 18],
      [19, 20],
    ]);
    // A heading that is not a key word holds the requirements without one; with only notes, it is kept for them.
    expect(list.levels.map((l) => [l.keyword, l.heading?.text, l.customHeading, l.intro, l.count])).toEqual([
      ['MUST', 'Shall', false, '', 2],
      [undefined, 'Notes', true, 'Kept as written.', 0],
    ]);
  });

  it('reads specs written as lists in the order they are written back, key word by key word', () => {
    const list = parseSpecMarkdown(LIST_LAYOUT).requirements!;
    expect(list.list.items.map((i) => [i.keyword, i.level, i.listItem])).toEqual([
      ['MUST', 'MUST', true],
      ['MUST', 'MUST', true],
      ['SHOULD', 'SHOULD', true],
      ['MAY', 'MAY', true],
    ]);
    // Levels without a heading yet get the definition they are written with.
    expect(list.list.levels.map((l) => [l.keyword, l.heading, l.intro === `*${KEYWORD_DEFINITIONS[l.keyword!]}*`, l.start, l.count])).toEqual([
      ['MUST', undefined, true, 0, 2],
      ['SHOULD', undefined, true, 2, 1],
      ['MAY', undefined, true, 3, 1],
    ]);
    expect(list.groups[0].notes).toBe('Agreed with the security team on 2026-08-12.');
    expect(texts(LIST_LAYOUT, 0)?.[1]).toBe('The back office SHOULD NOT show more than the last four digits of a card number to support staff.');

    const text = '---\ntitle: x\n---\n# T\n\n```md\n## Requirements\n```\n\n## Requirements\n\n1. One MUST\n2. Two\n   - detail\n\n   more\n3) [x] Three MAY\n\nA note.\n';
    const model = parseSpecMarkdown(text);
    expect(model.bodyStart).toBe(3);
    expect(model.description.text).toBe('```md\n## Requirements\n```');
    expect(model.requirements?.notice).toBeUndefined();
    expect(model.requirements?.list.notes).toBe('A note.');
    // The first paragraph of an item is its sentence, the rest its description; no key word comes last.
    expect(model.requirements?.list.items.map((i) => [i.checkbox, i.text, i.description, i.level, i.line])).toEqual([
      ['', 'One MUST', '', 'MUST', 11],
      ['[x] ', 'Three MAY', '', 'MAY', 16],
      ['', 'Two', '- detail\n\nmore', undefined, 12],
    ]);
  });
});

describe('example scenarios', () => {
  const WITH_EXAMPLES = [
    '# T',
    '',
    '## Requirements',
    '',
    '- The service MUST retry failed calls.',
    '  - Example: the provider times out, the call is retried twice, and the payment goes through.',
    '  - **Example 2:** the card is declined; nothing is retried.',
    '    The customer is told at once.',
    '- The service MAY log the outcome.',
    '',
  ].join('\n');

  it('reads the examples listed under a requirement written as a list, apart from its sentence', () => {
    const items = parseSpecMarkdown(WITH_EXAMPLES).requirements!.list.items;
    expect(items.map((i) => i.text)).toEqual(['The service MUST retry failed calls.', 'The service MAY log the outcome.']);
    expect(items[0].examples.map((e) => [e.title, e.text])).toEqual([
      ['', 'the provider times out, the call is retried twice, and the payment goes through.'],
      ['', 'the card is declined; nothing is retried.\nThe customer is told at once.'],
    ]);
    expect(items[0].examples.map((e) => [e.line, e.end])).toEqual([
      [5, 6],
      [6, 8],
    ]);
    expect([items[0].line, items[0].end]).toEqual([4, 8]);
    expect(exampleCount(parseSpecMarkdown(WITH_EXAMPLES))).toBe(2);
    // A nested list that is not made of examples is written under the sentence.
    expect(content(parseSpecMarkdown('## Requirements\n\n- A MUST hold\n  - because\n').requirements!.list)).toEqual([
      { text: 'A MUST hold', description: '- because', level: 'MUST', checkbox: '', examples: [] },
    ]);
  });

  it('adds, edits, titles, reorders and deletes examples without touching the sentence', () => {
    let text = edit('## Requirements\n\n- A MUST hold.\n- B MAY hold.\n', { op: 'addExample', group: null, index: 0, text: 'x happens' });
    expect(text).toBe(`## Requirements\n\n${MUST}##### A MUST hold.\n\n**Example 1**\\\nx happens\n\n${MAY}##### B MAY hold.\n`);
    text = edit(text, { op: 'addExample', group: null, index: 0, text: 'Example: y happens' }, { op: 'addExample', group: null, index: 1, text: 'z happens', title: 'Late' });
    expect(text).toBe(`## Requirements\n\n${MUST}##### A MUST hold.\n\n**Example 1**\\\nx happens\n\n**Example 2**\\\ny happens\n\n${MAY}##### B MAY hold.\n\n**Late**\\\nz happens\n`);
    text = edit(text, { op: 'moveExample', group: null, index: 0, example: 1, to: 0 }, { op: 'setRequirement', group: null, index: 0, text: 'A MUST really hold.' });
    expect(text).toBe(`## Requirements\n\n${MUST}##### A MUST really hold.\n\n**Example 1**\\\ny happens\n\n**Example 2**\\\nx happens\n\n${MAY}##### B MAY hold.\n\n**Late**\\\nz happens\n`);
    text = edit(
      text,
      { op: 'setExample', group: null, index: 0, example: 0, text: 'y happens\ntwice' },
      { op: 'setExampleTitle', group: null, index: 0, example: 1, title: ' **The x** case: ' },
      { op: 'deleteExample', group: null, index: 1, example: 0 },
    );
    expect(text).toBe(`## Requirements\n\n${MUST}##### A MUST really hold.\n\n**Example 1**\\\ny happens\ntwice\n\n**The x case**\\\nx happens\n\n${MAY}##### B MAY hold.\n`);
    // A title alone makes an example, without a backslash to break a line; "Example 3" is no title.
    text = edit(text, { op: 'addExample', group: null, index: 0, text: '', title: 'Pending' }, { op: 'setExampleTitle', group: null, index: 0, example: 1, title: 'Example 3' });
    expect(text).toContain(`**Example 2**\\\nx happens\n\n**Pending**\n\n${MAY}`);
    expect(parseSpecMarkdown(text).requirements!.list.items[0].examples.map((e) => [e.title, e.text])).toEqual([
      ['', 'y happens\ntwice'],
      ['', 'x happens'],
      ['Pending', ''],
    ]);
    expect(edit(text, { op: 'deleteRequirement', group: null, index: 0 })).toBe(`## Requirements\n\n${MAY}##### B MAY hold.\n`);
    expect(() => edit(text, { op: 'addExample', group: null, index: 0, text: '  ' })).toThrow(/cannot be empty/);
    expect(() => edit(text, { op: 'setExample', group: null, index: 1, example: 0, text: 'x' })).toThrow(/no longer exists/);
  });

  it('rewrites an example of a real spec and puts it back as it was', () => {
    const first = parseSpecMarkdown(SAMPLE).requirements!.list.items[0];
    expect(first.examples).toHaveLength(2);
    const changed = edit(SAMPLE, { op: 'setExample', group: null, index: 0, example: 1, text: 'The provider is down\nand the customer is asked to try later.' });
    expect(changed).toContain('**Card declined**\\\nThe provider is down\nand the customer is asked to try later.\n\n##### The service MUST record');
    expect(edit(changed, { op: 'setExample', group: null, index: 0, example: 1, text: first.examples[1].text })).toBe(SAMPLE);
  });

  it('keeps the examples with their requirement when it moves to another group', () => {
    const text = '## Requirements\n\n* A MUST hold.\n  * Example: x happens\n* B MAY hold.\n\n### Ops\n\n- C SHOULD hold.\n';
    const moved = edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: 0 });
    expect(moved).toBe(`## Requirements\n\n${MAY}##### B MAY hold.\n\n### Ops\n\n${MUST}##### A MUST hold.\n\n**Example 1**\\\nx happens\n\n${SHOULD}##### C SHOULD hold.\n`);
    expect(parseSpecMarkdown(moved).requirements!.groups[0].items[0].examples.map((e) => e.text)).toEqual(['x happens']);
  });

  it('reports empty and repeated examples', () => {
    const text = '# A\n\n## Requirements\n\n#### ✅ MUST\n\n##### A MUST hold.\n\n**Example 1**\\\nx\n\n**Example 2**\n\n**Example 3**\\\nX\n\n**Titled**\n';
    expect(analyzeSpec(parseSpecMarkdown(text)).map((i) => [i.message, i.location.example])).toEqual([
      ['Requirement 1: example 2 is empty', 1],
      ['Requirement 1: example 3 is listed twice', 2],
    ]);
  });
});

describe('specs extending other specs', () => {
  const CHILD = '# Ephemeral storage\n\nExtends: [Data storage](../generics/data-storage.spec.md)\n\nCaches and scratch space.\n\n## Requirements\n\n- Data MUST be dropped after 24 hours.\n';
  const parents = (text: string) => parseSpecMarkdown(text).extends?.parents;

  it('reads the Extends line under the title, apart from the description', () => {
    const model = parseSpecMarkdown(CHILD);
    expect(model.extends).toEqual({ parents: [{ label: 'Data storage', target: '../generics/data-storage.spec.md' }], line: 2 });
    expect(model.description.text).toBe('Caches and scratch space.');
    expect(parents('# T\n\n**Extends:** <../a b.spec.md>\n')).toEqual([{ label: '', target: '../a b.spec.md' }]);
    // Several specs on the line: commas inside a link do not separate them.
    expect(parents('# T\n\nExtends: [A, first](./a.spec.md), ./b.spec.md , [C](<./c d.spec.md>)\n')).toEqual([
      { label: 'A, first', target: './a.spec.md' },
      { label: '', target: './b.spec.md' },
      { label: 'C', target: './c d.spec.md' },
    ]);
    // Only the first thing written under the title, and only when it names a file.
    expect(parents('# T\n\nA policy.\n\nExtends: [X](x.spec.md)\n')).toBeUndefined();
    expect(parents('# T\n\nExtends the base policy.\n')).toBeUndefined();
    expect(parseSpecMarkdown(CHILD).sections.map((s) => s.kind)).toEqual(['requirements']);
  });

  it('writes, replaces and removes the Extends line, leaving the description alone', () => {
    const storage = { target: '../generics/data-storage.spec.md', label: 'Data storage' };
    let text = edit('# Ephemeral storage\n\nCaches.\n', { op: 'setExtends', parents: [storage] });
    expect(text).toBe('# Ephemeral storage\n\nExtends: [Data storage](../generics/data-storage.spec.md)\n\nCaches.\n');
    text = edit(text, { op: 'setDescription', value: 'Caches and scratch space.' });
    expect(text).toBe('# Ephemeral storage\n\nExtends: [Data storage](../generics/data-storage.spec.md)\n\nCaches and scratch space.\n');

    // A second spec is added to the line, and a spec listed twice is written once.
    const two = edit(text, { op: 'setExtends', parents: [storage, { target: './audit.spec.md', label: 'Audit logging' }, storage] });
    expect(two).toContain('Extends: [Data storage](../generics/data-storage.spec.md), [Audit logging](./audit.spec.md)\n');
    expect(parents(two)?.map((p) => p.target)).toEqual(['../generics/data-storage.spec.md', './audit.spec.md']);
    expect(edit(two, { op: 'setExtends', parents: [{ target: './audit.spec.md', label: 'Audit logging' }] })).toBe(text.replace('[Data storage](../generics/data-storage.spec.md)', '[Audit logging](./audit.spec.md)'));

    expect(edit(text, { op: 'setExtends', parents: [{ target: './other.spec.md' }] })).toBe(text.replace('[Data storage](../generics/data-storage.spec.md)', '[other.spec.md](./other.spec.md)'));
    expect(edit(text, { op: 'setExtends', parents: [] })).toBe('# Ephemeral storage\n\nCaches and scratch space.\n');
    expect(edit(text, { op: 'setExtends', parents: [{ target: '  ' }] })).toBe('# Ephemeral storage\n\nCaches and scratch space.\n');
    // Without a title, it stays above the description; a title added later goes on top.
    const untitled = edit('Caches.\n', { op: 'setExtends', parents: [{ target: 'a.spec.md' }] });
    expect(untitled).toBe('Extends: [a.spec.md](a.spec.md)\n\nCaches.\n');
    expect(edit(untitled, { op: 'setTitle', value: 'Ephemeral' })).toBe('# Ephemeral\n\nExtends: [a.spec.md](a.spec.md)\n\nCaches.\n');
    expect(edit('# T\n', { op: 'setExtends', parents: [{ target: '../a b.spec.md', label: 'A b' }] })).toBe('# T\n\nExtends: [A b](<../a b.spec.md>)\n');
  });

  it('resolves the specs extended and reads their requirements', () => {
    expect(parentPath('specs/policies/ephemeral.spec.md', '../generics/data-storage.spec.md')).toBe('specs/generics/data-storage.spec.md');
    expect(parentPath('specs/a.spec.md', '../../outside.spec.md')).toBeUndefined();
    expect(parentPath('specs/a.spec.md', undefined)).toBeUndefined();
    expect(overrideKey('Data SHOULD be encrypted at rest.')).toBe(overrideKey('Data MUST be encrypted at rest'));

    const storage = parseSpecMarkdown('# Data storage\n\n## Requirements\n\n- Data SHOULD be encrypted at rest.\n  - Example: a backup file is written with SSE-KMS.\n\n### Retention\n\n- Data MUST have a retention limit.\n');
    expect(requirementsOf(storage)).toEqual([
      { group: null, text: 'Data SHOULD be encrypted at rest.', keyword: 'SHOULD', description: '', examples: [{ title: '', text: 'a backup file is written with SSE-KMS.' }] },
      { group: 'Retention', text: 'Data MUST have a retention limit.', keyword: 'MUST', description: '', examples: [] },
    ]);
    expect(analyzeSpec(parseSpecMarkdown('# T\n\nExtends: [A](./a.spec.md), ./a.spec.md, [B](./b.txt)\n')).map((i) => i.message)).toEqual([
      'Extends "./a.spec.md" twice',
      'Extends "./b.txt": a spec extends other markdown spec files',
    ]);
    expect(summarizeSpec('x.spec.md', '# T\n\nExtends: [A](./a.spec.md), [B](./b.spec.md)\n').details).toContain('extends A, B');
  });

  it('lays the inherited requirements out in the groups of the form, closest spec first', () => {
    const storage = parseSpecMarkdown('# Data storage\n\n## Requirements\n\n- Data SHOULD be encrypted at rest.\n\n### Retention\n\n- Data MUST have a retention limit.\n');
    const audit = parseSpecMarkdown('# Audit logging\n\n## Requirements\n\n- Data MUST be encrypted at rest.\n\n### retention\n\n- Every read MUST be logged.\n');
    const inheritance: SpecInheritance = {
      chain: [
        { path: 'specs/data-storage.spec.md', title: 'Data storage', requirements: requirementsOf(storage), depth: 1 },
        { path: 'specs/audit-logging.spec.md', title: 'Audit logging', requirements: requirementsOf(audit), depth: 2, via: 'specs/data-storage.spec.md' },
      ],
      problems: [],
    };
    const child = parseSpecMarkdown('# Persistent storage\n\n## Requirements\n\n- Data MUST be encrypted at rest.\n\n### Backups\n\n- Backups MUST be taken every day.\n');
    const merged = mergeInherited(child, inheritance);
    expect(merged.total).toBe(4);
    // The ungrouped requirements of both specs, the nearest first; the child states the first one itself.
    expect(merged.byGroup.get('')?.map((e) => [e.spec.title, e.requirement.text, e.overridden])).toEqual([
      ['Data storage', 'Data SHOULD be encrypted at rest.', { by: '', keyword: 'MUST' }],
      ['Audit logging', 'Data MUST be encrypted at rest.', { by: '', keyword: 'MUST' }],
    ]);
    // Groups are matched whatever their case, and one the child does not have is listed apart.
    expect(merged.byGroup.get('retention')?.map((e) => e.requirement.text)).toEqual(['Data MUST have a retention limit.', 'Every read MUST be logged.']);
    expect(merged.extraGroups).toEqual(['Retention']);
    expect(merged.byGroup.get('backups')).toBeUndefined();
    expect(groupKey(' Retention ')).toBe('retention');

    // Without the child stating it, the nearest spec applies and the farther one is marked as overridden by it.
    const plain = mergeInherited(parseSpecMarkdown('# P\n'), inheritance);
    expect(plain.byGroup.get('')?.map((e) => e.overridden)).toEqual([undefined, { by: 'Data storage', keyword: 'SHOULD' }]);
    expect(mergeInherited(child, undefined)).toEqual({ byGroup: new Map(), extraGroups: [], total: 0 });
  });

  it('reports repeated requirements and specs extended that disagree', () => {
    const storage = parseSpecMarkdown('# Data storage\n\n## Requirements\n\n- Data SHOULD be encrypted at rest.\n\n### Retention\n\n- Data MUST have a retention limit.\n');
    const audit = parseSpecMarkdown('# Audit logging\n\n## Requirements\n\n- Data MUST be encrypted at rest.\n- Every read MUST be logged.\n');
    const inheritance: SpecInheritance = {
      chain: [
        { path: 'specs/generics/data-storage.spec.md', title: 'Data storage', requirements: requirementsOf(storage), depth: 1 },
        { path: 'specs/generics/audit-logging.spec.md', title: 'Audit logging', requirements: requirementsOf(audit), depth: 1 },
      ],
      problems: [],
    };
    const child = parseSpecMarkdown('# Persistent storage\n\n## Requirements\n\n- Every read MUST be logged.\n\n### Backups\n\n- Data MUST have a retention limit.\n');
    expect(inheritanceIssues(child, inheritance).map((i) => [i.message, i.location.anchor])).toEqual([
      ['Requirement 1 repeats a requirement inherited from "Audit logging"', 'requirements'],
      ['Backups: requirement 1 repeats a requirement inherited from "Data storage"', 'requirements'],
      ['"Data storage" (SHOULD) and "Audit logging" (MUST) disagree on "Data SHOULD be encrypted at rest.": the first one applies, restate it here to settle it', 'requirements'],
    ]);
    // Settling it in the child, by overriding it, ends the disagreement.
    const settled = parseSpecMarkdown('# Persistent storage\n\n## Requirements\n\n- Data MUST be encrypted at rest.\n');
    expect(inheritanceIssues(settled, inheritance)).toEqual([]);
    expect(inheritanceIssues(child, { chain: [], problems: ['The spec it extends was not found: x.spec.md.'] }).map((i) => i.message)).toEqual([
      'The spec it extends was not found: x.spec.md.',
    ]);
    expect(inheritanceIssues(child, undefined)).toEqual([]);
  });
});

describe('writing', () => {
  it('builds a spec part by part, writing only what is filled', () => {
    let text = newSpecTemplate('Checkout  ');
    expect(text).toBe('# Checkout\n');
    text = edit(text, { op: 'addRequirement', group: null, text: 'The checkout MUST show the total.' });
    expect(text).toBe(`# Checkout\n\n${REQUIREMENTS}${MUST}##### The checkout MUST show the total.\n`);
    text = edit(text, { op: 'addGroup', name: ' Security ', text: 'The checkout MUST NOT store cards.' }, { op: 'addRequirement', group: null, text: 'The checkout MAY offer gift cards.' });
    text = edit(text, { op: 'setContext', value: 'Part of the web shop.\n\n' }, { op: 'setDescription', value: 'The checkout pages.' });
    expect(text).toBe(
      `# Checkout\n\nThe checkout pages.\n\n## Context\n\nPart of the web shop.\n\n${REQUIREMENTS}${MUST}##### The checkout MUST show the total.\n\n${MAY}##### The checkout MAY offer gift cards.\n\n### Security\n\n${MUST_NOT}##### The checkout MUST NOT store cards.\n`,
    );

    // A group stays when its last requirement goes, until it is deleted; a key word goes with its last requirement.
    text = edit(text, { op: 'deleteRequirement', group: 0, index: 0 }, { op: 'setContext', value: '  ' });
    expect(text).toBe(`# Checkout\n\nThe checkout pages.\n\n${REQUIREMENTS}${MUST}##### The checkout MUST show the total.\n\n${MAY}##### The checkout MAY offer gift cards.\n\n### Security\n`);
    text = edit(text, { op: 'deleteGroup', group: 0 }, { op: 'setRequirementDescription', group: null, index: 1, text: 'Sold in the shops.\n\n' });
    expect(text).toBe(`# Checkout\n\nThe checkout pages.\n\n${REQUIREMENTS}${MUST}##### The checkout MUST show the total.\n\n${MAY}##### The checkout MAY offer gift cards.\n\nSold in the shops.\n`);
    text = edit(text, { op: 'setNotice', enabled: false }, { op: 'setRequirementDescription', group: null, index: 1, text: '' });
    expect(text).toBe(`# Checkout\n\nThe checkout pages.\n\n## Requirements\n\n${MUST}##### The checkout MUST show the total.\n\n${MAY}##### The checkout MAY offer gift cards.\n`);
    text = edit(text, { op: 'setNotice', enabled: true }, { op: 'deleteRequirement', group: null, index: 1 }, { op: 'deleteRequirement', group: null, index: 0 }, { op: 'setDescription', value: '' });
    expect(text).toBe('# Checkout\n');
  });

  it('separates a description added under a lone title', () => {
    const text = edit('# Checkout\n', { op: 'setDescription', value: 'T' }, { op: 'setDescription', value: 'The pages.' });
    expect(text).toBe('# Checkout\n\nThe pages.\n');
    expect(edit('# Checkout\n', { op: 'setContext', value: 'Web shop.' }, { op: 'setDescription', value: 'The pages.' })).toBe('# Checkout\n\nThe pages.\n\n## Context\n\nWeb shop.\n');
    expect(parseSpecMarkdown('# A\n').lineCount).toBe(1);
  });

  it('changes only the lines concerned in an existing file', () => {
    const changed = edit(
      SAMPLE,
      { op: 'setRequirement', group: 0, index: 0, text: 'The service MUST NOT store card numbers.\nNot even in logs.' },
      { op: 'addRequirement', group: null, text: 'The service SHOULD send a receipt by email.', index: 3 },
      { op: 'renameGroup', group: 0, name: 'Security and privacy' },
      { op: 'setTitle', value: 'Payments' },
    );
    expect(changed).toBe(
      SAMPLE.replace('# Payment service', '# Payments')
        .replace('##### The service MUST NOT store card numbers or security codes.', '##### The service MUST NOT store card numbers. Not even in logs.')
        .replace('##### The service SHOULD support Apple Pay and Google Pay.', '##### The service SHOULD support Apple Pay and Google Pay.\n\n##### The service SHOULD send a receipt by email.')
        .replace('### Security', '### Security and privacy'),
    );
    expect(edit(SAMPLE, { op: 'setTitle', value: 'Payment service' })).toBe(SAMPLE);
    // The group and its note stay when its requirements go; other sections stay.
    const emptied = edit(SAMPLE, { op: 'deleteRequirement', group: 0, index: 1 }, { op: 'deleteRequirement', group: 0, index: 0 });
    expect(emptied).toContain('##### The service MAY offer to save a card for later payments.\n\n### Security\n\nAgreed with the security team on 2026-08-12.\n\n## Open questions');
    expect(edit(SAMPLE, { op: 'deleteGroup', group: 0 })).toContain('##### The service MAY offer to save a card for later payments.\n\n## Open questions');
  });

  it('writes a spec written as a list under key word headings at its first change, whatever it is', () => {
    const converted = edit(LIST_LAYOUT, { op: 'setDescription', value: parseSpecMarkdown(LIST_LAYOUT).description.text });
    const at = (text: string, heading: string) => text.indexOf(`\n${heading}\n`) + 1;
    const requirements = converted.slice(at(converted, '## Requirements'), at(converted, '## Open questions'));
    expect(requirements).toBe(
      `${REQUIREMENTS}${MUST}##### The service MUST take card payments through the payment provider's hosted form.\n\n` +
        '**Example 1**\\\na customer pays a 20 EUR basket with a Visa card and comes back to\nthe shop with the order marked paid.\n\n' +
        '**Example 2**\\\nthe provider declines the card; the order stays unpaid and the\ncustomer is offered another payment method.\n\n' +
        '##### The service MUST record every payment attempt with its order, amount, currency and outcome.\n\n' +
        '**Example 1**\\\nthree attempts on the same order, two declined and one accepted,\nare all readable in the back office with their timestamps.\n\n' +
        `${SHOULD}##### The service SHOULD support Apple Pay and Google Pay.\n\n${MAY}##### The service MAY offer to save a card for later payments.\n\n` +
        `### Security\n\nAgreed with the security team on 2026-08-12.\n\n${MUST_NOT}##### The service MUST NOT store card numbers or security codes.\n\n` +
        `${level('SHOULD NOT')}##### The back office SHOULD NOT show more than the last four digits of a card number to support staff.\n\n`,
    );
    // Nothing else changes, the form shows the same requirements, and the next change keeps the layout.
    expect(converted.slice(0, at(converted, '## Requirements'))).toBe(LIST_LAYOUT.slice(0, at(LIST_LAYOUT, '## Requirements')));
    expect(converted.endsWith('## Open questions\n\n- Do we need 3-D Secure exemptions for low amounts?\n')).toBe(true);
    const before = parseSpecMarkdown(LIST_LAYOUT).requirements!;
    const after = parseSpecMarkdown(converted).requirements!;
    expect(content(after.list)).toEqual(content(before.list));
    expect(after.groups.map(content)).toEqual(before.groups.map(content));
    expect(after.list.items.every((i) => !i.listItem)).toBe(true);
    expect(edit(converted, { op: 'setTitle', value: 'Payment service' })).toBe(converted);
    // Reading a file never changes it.
    expect(applySpecEdits(LIST_LAYOUT, [])).toBe(LIST_LAYOUT);

    // Items without a key word go last, task boxes stay in front of the sentence, the rest of an item is its description.
    const numbered = edit('## Requirements\n\n1. One MUST\n2. Two\n   - detail\n\n   more\n3) [x] Three MAY\n', { op: 'setTitle', value: '' });
    expect(numbered).toBe(`## Requirements\n\n${MUST}##### One MUST\n\n${MAY}##### [x] Three MAY\n\n${NO_KEYWORD}##### Two\n\n- detail\n\nmore\n`);
  });

  it('moves a requirement under the heading of its key word when the key word changes', () => {
    const text = `## Requirements\n\n${MUST}##### A MUST hold.\n\n##### B MUST hold.\n\n${MAY}##### C MAY hold.\n`;
    // While the key word is being typed, the requirement stays where it is.
    const typing = edit(text, { op: 'setRequirement', group: null, index: 0, text: 'A hold.' });
    expect(typing).toBe(`## Requirements\n\n${MUST}##### A hold.\n\n##### B MUST hold.\n\n${MAY}##### C MAY hold.\n`);
    expect(analyzeSpec(parseSpecMarkdown(typing)).map((i) => i.message)).toContain('Requirement 1 has no RFC 2119 key word (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)');
    // It then moves to the nearest end of its new key word: first when it comes from above, last when it comes from below.
    const lowered = edit(typing, { op: 'setRequirement', group: null, index: 0, text: 'A MAY hold.' });
    expect(lowered).toBe(`## Requirements\n\n${MUST}##### B MUST hold.\n\n${MAY}##### A MAY hold.\n\n##### C MAY hold.\n`);
    expect(edit(lowered, { op: 'setRequirement', group: null, index: 2, text: 'C MUST hold.' })).toBe(`## Requirements\n\n${MUST}##### B MUST hold.\n\n##### C MUST hold.\n\n${MAY}##### A MAY hold.\n`);
    // A requirement added without a key word goes under its own heading.
    expect(edit(text, { op: 'addRequirement', group: null, text: 'Plain' })).toBe(`${text}\n${NO_KEYWORD}##### Plain\n`);

    // Written under another key word by hand: reported, and moved at the next change of its sentence.
    const misplaced = `## Requirements\n\n${MUST}##### A SHOULD hold.\n`;
    expect(analyzeSpec(parseSpecMarkdown(`# T\n\n${misplaced}`)).map((i) => i.message)).toEqual([
      'Requirement 1 says SHOULD but is written under the MUST heading: editing its sentence moves it under SHOULD',
    ]);
    expect(edit(misplaced, { op: 'setTitle', value: '' })).toBe(misplaced);
    expect(edit(misplaced, { op: 'setRequirement', group: null, index: 0, text: 'A SHOULD hold!' })).toBe(`## Requirements\n\n${SHOULD}##### A SHOULD hold!\n`);
  });

  it('writes key word headings with the icons of the settings, and keeps the headings and notes written by hand', () => {
    const text = [
      '## Requirements',
      '',
      '#### Shall',
      '',
      'Our own words.',
      '',
      '##### A MUST hold.',
      '',
      '#### :white_check_mark: MAY',
      '',
      '#### 🔴 MUST',
      '',
      '_An absolute requirement of the specification (also written REQUIRED or SHALL)._',
      '',
      '##### B SHALL hold.',
      '',
      '#### Notes',
      '',
      'Kept.',
      '',
      '### **Ops**',
      '',
      '#### SHOULD',
      '',
      '##### C SHOULD hold.',
      '',
    ].join('\n');
    // Headings of the same key word are merged and written with the icon of the settings, an empty one goes, a heading naming no level
    // stays, and so does the text under a heading, a definition left out included.
    const expected = `## Requirements\n\n#### ✅ MUST\n\nOur own words.\n\n*${KEYWORD_DEFINITIONS.MUST}*\n\n##### A MUST hold.\n\n##### B SHALL hold.\n\n#### Notes\n\nKept.\n\n### **Ops**\n\n#### 👍 SHOULD\n\n##### C SHOULD hold.\n`;
    expect(edit(text, { op: 'setTitle', value: '' })).toBe(expected);
    expect(edit(expected, { op: 'setTitle', value: '' })).toBe(expected);
    expect(edit(expected, { op: 'renameGroup', group: 0, name: 'Ops' })).toBe(expected);
    expect(edit(expected, { op: 'renameGroup', group: 0, name: 'Operations' })).toBe(expected.replace('### **Ops**', '### Operations'));

    // Other icons are read the same, and written at the next change; an empty icon writes the key word alone.
    const icons = { ...DEFAULT_KEYWORD_ICONS, MUST: ':red_circle:', SHOULD: '' };
    const recoloured = applySpecEdits(expected, [{ op: 'setTitle', value: '' }], { icons });
    expect(recoloured).toBe(expected.replace('#### ✅ MUST', '#### :red_circle: MUST').replace('#### 👍 SHOULD', '#### SHOULD'));
    expect(content(parseSpecMarkdown(recoloured).requirements!.list)).toEqual(content(parseSpecMarkdown(expected).requirements!.list));
    expect(parseSpecMarkdown(recoloured).requirements!.groups[0].levels.map((l) => [l.keyword, l.customHeading])).toEqual([['SHOULD', false]]);
  });

  it('writes the conformance sentence, the definitions and the example titles of an older layout as they are written now', () => {
    const older = `# T\n\n## Requirements\n\n${CONFORMANCE_NOTICE}\n\n#### MUST\n\n${KEYWORD_DEFINITIONS.MUST}\n\n##### A MUST hold.\n\nWhy.\n\n*Card declined*\nThe order stays unpaid.\n\n*Example 2*\nAnother case.\n`;
    const model = parseSpecMarkdown(older).requirements!;
    expect(model.notice?.text).toBe(WRITTEN_NOTICE);
    expect(model.list.levels[0].intro).toBe(`*${KEYWORD_DEFINITIONS.MUST}*`);
    expect(content(model.list)).toEqual([
      {
        text: 'A MUST hold.',
        description: 'Why.',
        level: 'MUST',
        checkbox: '',
        examples: [
          { title: 'Card declined', text: 'The order stays unpaid.' },
          { title: '', text: 'Another case.' },
        ],
      },
    ]);
    expect(edit(older, { op: 'setTitle', value: 'T' })).toBe(
      `# T\n\n${REQUIREMENTS}${MUST}##### A MUST hold.\n\nWhy.\n\n**Card declined**\\\nThe order stays unpaid.\n\n**Example 2**\\\nAnother case.\n`,
    );
    // Another wording of the sentence is kept as written.
    const own = '## Requirements\n\nThe key words in this document follow RFC 2119.\n\n- A MUST hold.\n';
    expect(edit(own, { op: 'setTitle', value: '' })).toBe(`## Requirements\n\nThe key words in this document follow RFC 2119.\n\n${MUST}##### A MUST hold.\n`);
  });

  it('moves requirements within their key word and between groups', () => {
    const text = '# T\n\n## Requirements\n\n* A MUST\n* B MUST\n* C MAY\n\n### Ops\n\n- D SHOULD\n';
    const swapped = `# T\n\n## Requirements\n\n${MUST}##### B MUST\n\n##### A MUST\n\n${MAY}##### C MAY\n\n### Ops\n\n${SHOULD}##### D SHOULD\n`;
    expect(edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: null, toIndex: 1 })).toBe(swapped);
    // A requirement does not leave its key word.
    expect(edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: null, toIndex: 2 })).toBe(swapped);
    const moved = edit(text, { op: 'moveRequirement', group: 0, index: 0, toGroup: null, toIndex: 1 });
    expect(moved).toBe(`# T\n\n## Requirements\n\n${MUST}##### A MUST\n\n##### B MUST\n\n${SHOULD}##### D SHOULD\n\n${MAY}##### C MAY\n\n### Ops\n`);
    expect(edit(moved, { op: 'moveRequirement', group: null, index: 2, toGroup: 0 })).toBe(edit(text, { op: 'setTitle', value: 'T' }));
    expect(() => edit(moved, { op: 'moveRequirement', group: null, index: 1, toGroup: 1 })).toThrow(/target group/);
    // An emptied group keeps its place.
    const two = '## Requirements\n\n### A\n\n- x MUST\n\n### B\n\n- y MUST\n';
    expect(edit(two, { op: 'moveRequirement', group: 0, index: 0, toGroup: 1 })).toBe(`## Requirements\n\n### A\n\n### B\n\n${MUST}##### y MUST\n\n##### x MUST\n`);
    expect(edit('## Requirements\n\n### A\n\n- x MUST\n', { op: 'moveRequirement', group: 0, index: 0, toGroup: null })).toBe(`## Requirements\n\n${MUST}##### x MUST\n\n### A\n`);
  });

  it('adds empty groups, fills them and reorders or deletes groups', () => {
    let text = edit('# T\n\n## Requirements\n\n- A MUST\n\n## Notes\n\nKept.\n', { op: 'addGroup', name: 'Ops' });
    expect(text).toBe(`# T\n\n## Requirements\n\n${MUST}##### A MUST\n\n### Ops\n\n## Notes\n\nKept.\n`);
    expect(parseSpecMarkdown(text).requirements?.groups.map((g) => [g.heading.text, g.items.length])).toEqual([['Ops', 0]]);
    text = edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: 0 }, { op: 'addGroup', name: 'Security', text: 'B MUST NOT' });
    expect(text).toBe(`# T\n\n## Requirements\n\n### Ops\n\n${MUST}##### A MUST\n\n### Security\n\n${MUST_NOT}##### B MUST NOT\n\n## Notes\n\nKept.\n`);
    text = edit(text, { op: 'addGroup', name: 'Data' });
    const order = (t: string) => parseSpecMarkdown(t).requirements?.groups.map((g) => g.heading.text);
    expect(edit(text, { op: 'moveGroup', group: 2, toIndex: 0 })).toBe(`# T\n\n## Requirements\n\n### Data\n\n### Ops\n\n${MUST}##### A MUST\n\n### Security\n\n${MUST_NOT}##### B MUST NOT\n\n## Notes\n\nKept.\n`);
    expect(edit(text, { op: 'moveGroup', group: 0, toIndex: 2 })).toBe(`# T\n\n## Requirements\n\n### Security\n\n${MUST_NOT}##### B MUST NOT\n\n### Data\n\n### Ops\n\n${MUST}##### A MUST\n\n## Notes\n\nKept.\n`);
    expect(order(edit(text, { op: 'moveGroup', group: 0, toIndex: 1 }))).toEqual(['Security', 'Ops', 'Data']);
    expect(edit(text, { op: 'moveGroup', group: 1, toIndex: 1 })).toBe(text);
    // At the end of the file, with a note, and after the ungrouped list.
    const tail = '## Requirements\n\n- A MUST\n\n### X\n\nNote.\n\n- x MUST\n\n### Y\n- y MAY';
    const swapped = `## Requirements\n\n${MUST}##### A MUST\n\n### Y\n\n${MAY}##### y MAY\n\n### X\n\nNote.\n\n${MUST}##### x MUST`;
    expect(edit(tail, { op: 'moveGroup', group: 1, toIndex: 0 })).toBe(swapped);
    expect(edit(tail, { op: 'moveGroup', group: 0, toIndex: 1 })).toBe(swapped);

    text = edit(text, { op: 'deleteGroup', group: 1 }, { op: 'deleteGroup', group: 0 });
    expect(text).toBe('# T\n\n## Requirements\n\n### Data\n\n## Notes\n\nKept.\n');
    expect(edit(text, { op: 'deleteGroup', group: 0 })).toBe('# T\n\n## Notes\n\nKept.\n');
    expect(edit('# T\n', { op: 'addGroup', name: 'Ops' })).toBe(`# T\n\n${REQUIREMENTS}### Ops\n`);
    expect(() => edit(text, { op: 'moveGroup', group: 3, toIndex: 0 })).toThrow(/no longer exists/);
  });

  it('keeps the rest of the file intact when text breaks the structure', () => {
    const text = edit('# T\n\n## Requirements\n\n- A MUST\n', { op: 'setContext', value: '## Not a section\n```js\nconst a = 1;' });
    expect(text).toBe(`# T\n\n## Context\n\n\\## Not a section\n\`\`\`js\nconst a = 1;\n\`\`\`\n\n## Requirements\n\n${MUST}##### A MUST\n`);
    expect(texts(text)).toEqual(['A MUST']);
    const typing = edit(text, { op: 'setRequirement', group: null, index: 0, text: '' });
    expect(typing).toContain(`## Requirements\n\n${MUST}#####\n`);
    expect(texts(typing)).toEqual(['']);
    expect(() => edit(text, { op: 'deleteRequirement', group: 2, index: 0 })).toThrow(/no longer exists/);
    expect(() => edit(text, { op: 'addGroup', name: '', text: 'x' })).toThrow(/name/);

    // Headings and lines in italics typed under a requirement stay inside it; a sentence ending with # keeps it.
    const description = '##### Not a requirement\n*Not an example*\n\n**Not one either**\\\ntext\n```\n##### in code';
    const broken = edit(
      text,
      { op: 'setRequirement', group: null, index: 0, text: 'Tags MUST start with #' },
      { op: 'setRequirementDescription', group: null, index: 0, text: description },
      { op: 'addExample', group: null, index: 0, text: '*Same* here\n\n*Here too*\n# and here' },
    );
    expect(broken).toContain(
      `${MUST}##### Tags MUST start with # #\n\n\\##### Not a requirement\n*Not an example*\n\n\\**Not one either**\\\ntext\n\`\`\`\n##### in code\n\`\`\`\n\n**Example 1**\\\n*Same* here\n\n\\*Here too*\n\\# and here\n`,
    );
    expect(content(parseSpecMarkdown(broken).requirements!.list)).toEqual([
      {
        text: 'Tags MUST start with #',
        description: '\\##### Not a requirement\n*Not an example*\n\n\\**Not one either**\\\ntext\n```\n##### in code\n```',
        level: 'MUST',
        checkbox: '',
        examples: [{ title: '', text: '*Same* here\n\n\\*Here too*\n\\# and here' }],
      },
    ]);
  });

  it('normalizes line endings and keeps a missing final newline', () => {
    expect(edit('# T', { op: 'setDescription', value: 'D' })).toBe('# T\n\nD');
    expect(edit('', { op: 'setTitle', value: 'New' })).toBe('# New\n');
    expect(edit('# T\r\n\r\nOld\r\n', { op: 'setDescription', value: 'New' })).toBe('# T\n\nNew\n');
  });
});

describe('catalog and checks', () => {
  it('lists spec files but not other markdown', () => {
    expect(looksLikeSpec('specs/a.spec.md', '# A\n')).toBe(true);
    expect(looksLikeSpec('docs/scope.md', SAMPLE)).toBe(true);
    expect(looksLikeSpec('README.md', '# Tool\n\n## Requirements\n\n- Node 20 or later.\n')).toBe(false);
    expect(looksLikeSpec('docs/scope.md', '# Tool\n\n## Requirements\n\n#### MUST\n\n##### The tool MUST run offline.\n')).toBe(true);
    expect(looksLikeSpec('docs/scope.md', LIST_LAYOUT)).toBe(true);
    expect(looksLikeSpec('notes.txt', SAMPLE)).toBe(false);
  });

  it('summarizes, suggests a subject and reports problems', () => {
    expect(summarizeSpec('payment-service.spec.md', SAMPLE)).toEqual({
      name: 'Payment service',
      tags: [],
      details: ['6 requirements', '2 MUST · 1 MUST NOT · 1 SHOULD · 1 SHOULD NOT · 1 MAY', '3 examples'],
      problems: 0,
    });
    const child = readFileSync(join(__dirname, '../../samples/specs/ephemeral-storage.spec.md'), 'utf8');
    expect(summarizeSpec('ephemeral-storage.spec.md', child)).toMatchObject({ name: 'Ephemeral storage', details: expect.arrayContaining(['extends Data storage']), problems: 0 });
    expect(summarizeSpec('x.spec.md', 'Nothing')).toMatchObject({ name: '', details: ['No requirements yet'], problems: 1 });
    expect(defaultSubject(parseSpecMarkdown(SAMPLE))).toBe('The back office');
    expect(defaultSubject(parseSpecMarkdown('# Cart\n'))).toBe('Cart');

    const broken = '# A\n\n# B\n\n## Requirements\n\n- Log in MUST work\n-\n- It should retry\n\n### Ops\n\n- log in MUST work\n- Deploy daily\n\n### ops\n\n- x MAY\n';
    expect(analyzeSpec(parseSpecMarkdown(broken)).map((i) => i.message)).toEqual([
      'Line 3: "B" is another level-1 heading; only the first one is the title',
      'Several groups are called "ops"',
      'Requirement 2 is empty',
      'Requirement 3 writes "should" in lowercase: key words only carry their RFC 2119 meaning in capitals',
      'Ops: requirement 1 is listed twice',
      'Ops: requirement 2 has no RFC 2119 key word (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY)',
    ]);
  });
});
