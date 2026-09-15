import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applySpecEdits, type ListRef, type SpecEdit } from '../../src/modules/spec/core/edits';
import { composeRequirement, CONFORMANCE_NOTICE, findKeyword, lowercaseKeyword, subjectOf, withKeyword } from '../../src/modules/spec/core/keywords';
import { parseSpecMarkdown } from '../../src/modules/spec/core/parse';
import { analyzeSpec, defaultSubject, looksLikeSpec, newSpecTemplate, summarizeSpec } from '../../src/modules/spec/core/summary';

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
      details: ['6 requirements', '2 MUST · 1 MUST NOT · 1 SHOULD · 1 SHOULD NOT · 1 MAY'],
      problems: 0,
    });
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
