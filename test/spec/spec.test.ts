import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySpecEdits, type ListRef, type SpecEdit } from '../../src/modules/spec/core/edits';
import { inheritanceIssues, overrideKey, parentPath, requirementsOf, type SpecInheritance } from '../../src/modules/spec/core/inherit';
import { composeRequirement, CONFORMANCE_NOTICE, findKeyword, lowercaseKeyword, subjectOf, withKeyword } from '../../src/modules/spec/core/keywords';
import { parseSpecMarkdown } from '../../src/modules/spec/core/parse';
import { analyzeSpec, defaultSubject, exampleCount, looksLikeSpec, newSpecTemplate, summarizeSpec } from '../../src/modules/spec/core/summary';

const SAMPLE = readFileSync(join(__dirname, '../../samples/specs/payment-service.spec.md'), 'utf8');
const edit = (text: string, ...edits: SpecEdit[]) => applySpecEdits(text, edits);
const texts = (text: string, group: ListRef = null) => {
  const requirements = parseSpecMarkdown(text).requirements;
  return (group === null ? requirements?.list : requirements?.groups[group])?.items.map((i) => i.text);
};
const REQUIREMENTS = `## Requirements\n\n${CONFORMANCE_NOTICE}\n\n`;

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
});

describe('parsing', () => {
  it('reads title, description, context, the conformance sentence, requirements and groups', () => {
    const model = parseSpecMarkdown(SAMPLE);
    expect(model.title?.text).toBe('Payment service');
    expect(model.description.text).toBe('Takes card and wallet payments for the web shop and the mobile app, and keeps\nthe payment history of each order.');
    expect(model.context?.text).toMatch(/^Orders are created by the \*\*order service\*\*[\s\S]*back office\.$/);
    const requirements = model.requirements!;
    expect(requirements.notice).toBeDefined();
    expect(requirements.list.otherContent).toBe(false);
    expect(requirements.list.items.map((i) => i.keyword)).toEqual(['MUST', 'MUST', 'SHOULD', 'MAY']);
    expect(requirements.groups.map((g) => [g.heading.text, g.otherContent, g.items.map((i) => i.keyword)])).toEqual([['Security', true, ['MUST NOT', 'SHOULD NOT']]]);
    expect(texts(SAMPLE, 0)?.[1]).toBe('The back office SHOULD NOT show more than the last four digits of a card\nnumber to support staff.');
    expect(model.sections.map((s) => s.kind)).toEqual(['context', 'requirements', 'other']);
  });

  it('keeps markers, task boxes and code blocks apart', () => {
    const text = '---\ntitle: x\n---\n# T\n\n```md\n## Requirements\n```\n\n## Requirements\n\n1. One MUST\n2. Two\n   - detail\n\n   more\n3) [x] Three MAY\n';
    const model = parseSpecMarkdown(text);
    expect(model.bodyStart).toBe(3);
    expect(model.description.text).toBe('```md\n## Requirements\n```');
    expect(model.requirements?.notice).toBeUndefined();
    expect(model.requirements?.list.items.map((i) => [i.marker, i.checkbox, i.text, i.keyword])).toEqual([
      ['1.', '', 'One MUST', 'MUST'],
      ['2.', '', 'Two\n- detail\n\nmore', undefined],
      ['3)', '[x] ', 'Three MAY', 'MAY'],
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

  it('reads the examples listed under a requirement, apart from its sentence', () => {
    const items = parseSpecMarkdown(WITH_EXAMPLES).requirements!.list.items;
    expect(items.map((i) => i.text)).toEqual(['The service MUST retry failed calls.', 'The service MAY log the outcome.']);
    expect(items[0].examples.map((e) => e.text)).toEqual([
      'the provider times out, the call is retried twice, and the payment goes through.',
      'the card is declined; nothing is retried.\nThe customer is told at once.',
    ]);
    expect(items[0].examples.map((e) => [e.line, e.end])).toEqual([
      [5, 6],
      [6, 8],
    ]);
    expect([items[0].line, items[0].bodyEnd, items[0].end]).toEqual([4, 5, 8]);
    expect(exampleCount(parseSpecMarkdown(WITH_EXAMPLES))).toBe(2);
    // A nested list that is not made of examples stays part of the sentence.
    expect(texts('## Requirements\n\n- A MUST hold\n  - because\n')).toEqual(['A MUST hold\n- because']);
  });

  it('adds, edits, reorders and deletes examples without touching the sentence', () => {
    let text = edit('## Requirements\n\n- A MUST hold.\n- B MAY hold.\n', { op: 'addExample', group: null, index: 0, text: 'x happens' });
    expect(text).toBe('## Requirements\n\n- A MUST hold.\n  - Example: x happens\n- B MAY hold.\n');
    text = edit(text, { op: 'addExample', group: null, index: 0, text: 'Example: y happens' }, { op: 'addExample', group: null, index: 1, text: 'z happens' });
    expect(text).toBe('## Requirements\n\n- A MUST hold.\n  - Example: x happens\n  - Example: y happens\n- B MAY hold.\n  - Example: z happens\n');
    text = edit(text, { op: 'moveExample', group: null, index: 0, example: 1, to: 0 }, { op: 'setRequirement', group: null, index: 0, text: 'A MUST really hold.' });
    expect(text).toBe('## Requirements\n\n- A MUST really hold.\n  - Example: y happens\n  - Example: x happens\n- B MAY hold.\n  - Example: z happens\n');
    text = edit(text, { op: 'setExample', group: null, index: 0, example: 0, text: 'y happens\ntwice' }, { op: 'deleteExample', group: null, index: 1, example: 0 });
    expect(text).toBe('## Requirements\n\n- A MUST really hold.\n  - Example: y happens\n    twice\n  - Example: x happens\n- B MAY hold.\n');
    expect(edit(text, { op: 'deleteRequirement', group: null, index: 0 })).toBe('## Requirements\n\n- B MAY hold.\n');
    expect(() => edit(text, { op: 'addExample', group: null, index: 0, text: '  ' })).toThrow(/cannot be empty/);
    expect(() => edit(text, { op: 'setExample', group: null, index: 1, example: 0, text: 'x' })).toThrow(/no longer exists/);
  });

  it('rewrites an example of a real spec and puts it back as it was', () => {
    const first = parseSpecMarkdown(SAMPLE).requirements!.list.items[0];
    expect(first.examples).toHaveLength(2);
    const changed = edit(SAMPLE, { op: 'setExample', group: null, index: 0, example: 1, text: 'the provider is down\nand the customer is asked to try later.' });
    expect(changed).toContain('  - Example: the provider is down\n    and the customer is asked to try later.\n- The service MUST record');
    expect(edit(changed, { op: 'setExample', group: null, index: 0, example: 1, text: first.examples[1].text })).toBe(SAMPLE);
  });

  it('keeps the examples with their requirement when it moves to another group', () => {
    const text = '## Requirements\n\n* A MUST hold.\n  * Example: x happens\n* B MAY hold.\n\n### Ops\n\n- C SHOULD hold.\n';
    const moved = edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: 0 });
    expect(moved).toBe('## Requirements\n\n* B MAY hold.\n\n### Ops\n\n- C SHOULD hold.\n- A MUST hold.\n  - Example: x happens\n');
    expect(parseSpecMarkdown(moved).requirements!.groups[0].items[1].examples.map((e) => e.text)).toEqual(['x happens']);
  });

  it('reports empty and repeated examples', () => {
    const text = '# A\n\n## Requirements\n\n- A MUST hold.\n  - Example: x\n  - Example:\n  - Example: X\n';
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
      { group: null, text: 'Data SHOULD be encrypted at rest.', keyword: 'SHOULD', examples: ['a backup file is written with SSE-KMS.'] },
      { group: 'Retention', text: 'Data MUST have a retention limit.', keyword: 'MUST', examples: [] },
    ]);
    expect(analyzeSpec(parseSpecMarkdown('# T\n\nExtends: [A](./a.spec.md), ./a.spec.md, [B](./b.txt)\n')).map((i) => i.message)).toEqual([
      'Extends "./a.spec.md" twice',
      'Extends "./b.txt": a spec extends other markdown spec files',
    ]);
    expect(summarizeSpec('x.spec.md', '# T\n\nExtends: [A](./a.spec.md), [B](./b.spec.md)\n').details).toContain('extends A, B');
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
      ['"Data storage" (SHOULD) and "Audit logging" (MUST) disagree on "Data SHOULD be encrypted at rest.": the first one applies, restate it here to settle it', 'inherited'],
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
    expect(text).toBe(`# Checkout\n\n${REQUIREMENTS}- The checkout MUST show the total.\n`);
    text = edit(text, { op: 'addGroup', name: ' Security ', text: 'The checkout MUST NOT store cards.' }, { op: 'addRequirement', group: null, text: 'The checkout MAY offer gift cards.' });
    text = edit(text, { op: 'setContext', value: 'Part of the web shop.\n\n' }, { op: 'setDescription', value: 'The checkout pages.' });
    expect(text).toBe(
      `# Checkout\n\nThe checkout pages.\n\n## Context\n\nPart of the web shop.\n\n${REQUIREMENTS}- The checkout MUST show the total.\n- The checkout MAY offer gift cards.\n\n### Security\n\n- The checkout MUST NOT store cards.\n`,
    );

    // A group stays when its last requirement goes, until it is deleted.
    text = edit(text, { op: 'deleteRequirement', group: 0, index: 0 }, { op: 'setContext', value: '  ' });
    expect(text).toBe(`# Checkout\n\nThe checkout pages.\n\n${REQUIREMENTS}- The checkout MUST show the total.\n- The checkout MAY offer gift cards.\n\n### Security\n`);
    text = edit(text, { op: 'deleteGroup', group: 0 });
    expect(text).toBe(`# Checkout\n\nThe checkout pages.\n\n${REQUIREMENTS}- The checkout MUST show the total.\n- The checkout MAY offer gift cards.\n`);
    text = edit(text, { op: 'setNotice', enabled: false });
    expect(text).toBe('# Checkout\n\nThe checkout pages.\n\n## Requirements\n\n- The checkout MUST show the total.\n- The checkout MAY offer gift cards.\n');
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
        .replace('- The service MUST NOT store card numbers or security codes.', '- The service MUST NOT store card numbers.\n  Not even in logs.')
        .replace('- The service MAY offer', '- The service SHOULD send a receipt by email.\n- The service MAY offer')
        .replace('### Security', '### Security and privacy'),
    );
    // The group and its note stay when its requirements go; other sections stay.
    const emptied = edit(SAMPLE, { op: 'deleteRequirement', group: 0, index: 1 }, { op: 'deleteRequirement', group: 0, index: 0 });
    expect(emptied).toContain('- The service MAY offer to save a card for later payments.\n\n### Security\n\nAgreed with the security team on 2026-08-12.\n\n## Open questions');
    expect(edit(SAMPLE, { op: 'deleteGroup', group: 0 })).toContain('- The service MAY offer to save a card for later payments.\n\n## Open questions');
  });

  it('moves requirements within a list and between groups', () => {
    const text = '# T\n\n## Requirements\n\n* A MUST\n* B MUST\n* C MAY\n\n### Ops\n\n- D SHOULD\n';
    expect(edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: null, toIndex: 2 })).toBe('# T\n\n## Requirements\n\n* B MUST\n* C MAY\n* A MUST\n\n### Ops\n\n- D SHOULD\n');
    const moved = edit(text, { op: 'moveRequirement', group: 0, index: 0, toGroup: null, toIndex: 1 });
    expect(moved).toBe('# T\n\n## Requirements\n\n* A MUST\n* D SHOULD\n* B MUST\n* C MAY\n\n### Ops\n');
    expect(edit(moved, { op: 'moveRequirement', group: null, index: 1, toGroup: 0 })).toBe(text);
    expect(() => edit(moved, { op: 'moveRequirement', group: null, index: 1, toGroup: 1 })).toThrow(/target group/);
    // An emptied group keeps its place.
    const two = '## Requirements\n\n### A\n\n- x MUST\n\n### B\n\n- y MUST\n';
    expect(edit(two, { op: 'moveRequirement', group: 0, index: 0, toGroup: 1 })).toBe('## Requirements\n\n### A\n\n### B\n\n- y MUST\n- x MUST\n');
    expect(edit('## Requirements\n\n### A\n\n- x MUST\n', { op: 'moveRequirement', group: 0, index: 0, toGroup: null })).toBe('## Requirements\n\n- x MUST\n\n### A\n');

    const loose = '## Requirements\n\n1. A MUST\n\n2. B MUST\n';
    expect(edit(loose, { op: 'addRequirement', group: null, text: 'C MAY' })).toBe('## Requirements\n\n1. A MUST\n\n2. B MUST\n\n3. C MAY\n');
  });

  it('adds empty groups, fills them and reorders or deletes groups', () => {
    let text = edit('# T\n\n## Requirements\n\n- A MUST\n\n## Notes\n\nKept.\n', { op: 'addGroup', name: 'Ops' });
    expect(text).toBe('# T\n\n## Requirements\n\n- A MUST\n\n### Ops\n\n## Notes\n\nKept.\n');
    expect(parseSpecMarkdown(text).requirements?.groups.map((g) => [g.heading.text, g.items.length])).toEqual([['Ops', 0]]);
    text = edit(text, { op: 'moveRequirement', group: null, index: 0, toGroup: 0 }, { op: 'addGroup', name: 'Security', text: 'B MUST NOT' });
    expect(text).toBe('# T\n\n## Requirements\n\n### Ops\n\n- A MUST\n\n### Security\n\n- B MUST NOT\n\n## Notes\n\nKept.\n');
    text = edit(text, { op: 'addGroup', name: 'Data' });
    const order = (t: string) => parseSpecMarkdown(t).requirements?.groups.map((g) => g.heading.text);
    expect(edit(text, { op: 'moveGroup', group: 2, toIndex: 0 })).toBe('# T\n\n## Requirements\n\n### Data\n\n### Ops\n\n- A MUST\n\n### Security\n\n- B MUST NOT\n\n## Notes\n\nKept.\n');
    expect(edit(text, { op: 'moveGroup', group: 0, toIndex: 2 })).toBe('# T\n\n## Requirements\n\n### Security\n\n- B MUST NOT\n\n### Data\n\n### Ops\n\n- A MUST\n\n## Notes\n\nKept.\n');
    expect(order(edit(text, { op: 'moveGroup', group: 0, toIndex: 1 }))).toEqual(['Security', 'Ops', 'Data']);
    expect(edit(text, { op: 'moveGroup', group: 1, toIndex: 1 })).toBe(text);
    // At the end of the file, with a note, and after the ungrouped list.
    const tail = '## Requirements\n\n- A MUST\n\n### X\n\nNote.\n\n- x MUST\n\n### Y\n- y MAY';
    expect(edit(tail, { op: 'moveGroup', group: 1, toIndex: 0 })).toBe('## Requirements\n\n- A MUST\n\n### Y\n- y MAY\n\n### X\n\nNote.\n\n- x MUST');
    expect(edit(tail, { op: 'moveGroup', group: 0, toIndex: 1 })).toBe('## Requirements\n\n- A MUST\n\n### Y\n- y MAY\n\n### X\n\nNote.\n\n- x MUST');

    text = edit(text, { op: 'deleteGroup', group: 1 }, { op: 'deleteGroup', group: 0 });
    expect(text).toBe('# T\n\n## Requirements\n\n### Data\n\n## Notes\n\nKept.\n');
    expect(edit(text, { op: 'deleteGroup', group: 0 })).toBe('# T\n\n## Notes\n\nKept.\n');
    expect(edit('# T\n', { op: 'addGroup', name: 'Ops' })).toBe(`# T\n\n${REQUIREMENTS}### Ops\n`);
    expect(() => edit(text, { op: 'moveGroup', group: 3, toIndex: 0 })).toThrow(/no longer exists/);
  });

  it('keeps the rest of the file intact when text breaks the structure', () => {
    const text = edit('# T\n\n## Requirements\n\n- A MUST\n', { op: 'setContext', value: '## Not a section\n```js\nconst a = 1;' });
    expect(text).toBe('# T\n\n## Context\n\n\\## Not a section\n```js\nconst a = 1;\n```\n\n## Requirements\n\n- A MUST\n');
    expect(texts(text)).toEqual(['A MUST']);
    const typing = edit(text, { op: 'setRequirement', group: null, index: 0, text: '' });
    expect(typing).toContain('## Requirements\n\n-\n');
    expect(texts(typing)).toEqual(['']);
    expect(() => edit(text, { op: 'deleteRequirement', group: 2, index: 0 })).toThrow(/no longer exists/);
    expect(() => edit(text, { op: 'addGroup', name: '', text: 'x' })).toThrow(/name/);
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
