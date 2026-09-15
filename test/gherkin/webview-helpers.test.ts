import { describe, expect, it } from 'vitest';
import { parseGherkin } from '../../src/modules/gherkin/core/parse';
import { locate, reconcileIds, withFreshIds } from '../../src/modules/gherkin/webview/tree';
import { parseClipboardTable } from '../../src/webview/components/GridEditor';

describe('parseClipboardTable', () => {
  it('ignores plain single-line text', () => {
    expect(parseClipboardTable('hello world')).toBeNull();
  });

  it('reads spreadsheet (tab separated) data', () => {
    expect(parseClipboardTable('a\tb\r\n1\t2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads Gherkin and Markdown pipe tables', () => {
    expect(parseClipboardTable('| a | b \\| c |\n|---|---|\n| 1 |   |')).toEqual([
      ['a', 'b | c'],
      ['1', ''],
    ]);
  });
});

describe('document tree helpers', () => {
  const source = 'Feature: f\n  Rule: r\n    Scenario: s\n      Given a\n\n      Examples:\n        | x |\n        | 1 |\n';
  const parse = () => {
    const result = parseGherkin(source);
    if (!result.ok) throw new Error('parse failed');
    return result.document;
  };

  it('locates nested nodes with their containing list', () => {
    const doc = parse();
    const rule = doc.feature!.children[0];
    if (rule.kind !== 'rule' || rule.children[0].kind !== 'scenario') throw new Error('unexpected shape');
    const examples = rule.children[0].examples[0];
    const found = locate(doc, examples.id);
    expect(found?.node).toBe(examples);
    expect(found?.index).toBe(0);
    expect(locate(doc, doc.feature!.id)?.list).toBeUndefined();
    expect(locate(doc, 'missing')).toBeUndefined();
  });

  it('keeps ids stable across a re-parse and renews them on copy', () => {
    const before = parse();
    const after = parse();
    reconcileIds(before, after);
    expect(after).toEqual(before);

    const copy = withFreshIds(before.feature!);
    expect(copy.name).toBe('f');
    expect(copy.id).not.toBe(before.feature!.id);
  });
});
