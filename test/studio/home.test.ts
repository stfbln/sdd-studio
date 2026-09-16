import { describe, expect, it } from 'vitest';
import { groupKinds } from '../../src/modules/studio/core/home';
import type { StudioKind } from '../../src/modules/studio/core/protocol';

const kind = (name: string): StudioKind => ({
  kind: name,
  title: name,
  singular: name,
  plural: `${name}s`,
  icon: 'book',
  purpose: '',
  count: 0,
  problems: 0,
});

describe('groupKinds', () => {
  it('takes the software catalog out of the spec formats', () => {
    const { catalog, specs } = groupKinds([kind('gherkin'), kind('backstage'), kind('spec')]);
    expect(catalog?.kind).toBe('backstage');
    expect(specs.map((s) => s.kind)).toEqual(['spec', 'gherkin']);
  });

  it('orders the spec formats the same way whatever order the modules registered them in', () => {
    const registered = ['adr', 'openapi', 'spec', 'otm', 'gherkin', 'opencli', 'openslo', 'asyncapi', 'proto'];
    const { specs } = groupKinds(registered.map(kind));
    expect(specs.map((s) => s.kind)).toEqual(['spec', 'gherkin', 'openapi', 'asyncapi', 'proto', 'opencli', 'otm', 'openslo', 'adr']);
  });

  it('lists a kind it does not know about last, without a catalog', () => {
    const { catalog, specs } = groupKinds([kind('newcomer'), kind('adr'), kind('spec')]);
    expect(catalog).toBeUndefined();
    expect(specs.map((s) => s.kind)).toEqual(['spec', 'adr', 'newcomer']);
  });
});
