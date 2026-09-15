import { describe, expect, it } from 'vitest';
import type { CatalogState, SpecSummary } from '../../src/shared/catalog';
import { buildFolderTree, type FolderNode } from '../../src/webview/catalog/folderTree';

const feature = (path: string, name: string, tags: string[] = []): SpecSummary => ({ workspace: 0, path, name, tags, details: [] });

const state: CatalogState = {
  info: { kind: 'gherkin', title: 'Features', singular: 'feature', plural: 'features', icon: 'checklist', namePlaceholder: '', formats: [], acceptedExtensions: [] },
  workspaces: [{ index: 0, name: 'shop' }],
  defaultFolder: 'features',
  folders: [
    { workspace: 0, path: '', exists: true },
    { workspace: 0, path: 'features', exists: true },
    { workspace: 0, path: 'features/cart', exists: true },
    { workspace: 0, path: 'features/empty', exists: true },
    { workspace: 0, path: 'src', exists: true },
    { workspace: 0, path: 'src/test', exists: true },
    { workspace: 0, path: 'src/test/features', exists: true },
  ],
  specs: [
    feature('features/cart/checkout.feature', 'Checkout', ['@smoke']),
    feature('features/cart/add-item.feature', 'Add item'),
    feature('features/login.feature', 'Login'),
    feature('src/test/features/legacy.feature', 'Legacy'),
  ],
};

/** Compact text rendering of a tree, easy to compare. */
const render = (nodes: FolderNode[], depth = 0): string[] =>
  nodes.flatMap((n) => [
    `${'  '.repeat(depth)}${n.label}/ (${n.total})`,
    ...render(n.folders, depth + 1),
    ...n.specs.map((f) => `${'  '.repeat(depth + 1)}${f.name}`),
  ]);

describe('buildFolderTree', () => {
  it('groups features by folder, keeps empty folders and compacts single-child chains', () => {
    expect(render(buildFolderTree(state))).toEqual([
      'shop/ (4)',
      '  features/ (3)',
      '    cart/ (2)',
      '      Add item',
      '      Checkout',
      '    empty/ (0)',
      '    Login',
      '  src/test/features/ (1)',
      '    Legacy',
    ]);
  });

  it('keeps the deepest path on compacted folders', () => {
    const [root] = buildFolderTree(state);
    expect(root.folders[1].path).toBe('src/test/features');
  });

  it('filters by name, path or tag and hides folders without matches', () => {
    expect(render(buildFolderTree(state, '@SMOKE'))).toEqual(['shop/ (1)', '  features/cart/ (1)', '    Checkout']);
    expect(render(buildFolderTree(state, 'legacy'))).toEqual(['shop/ (1)', '  src/test/features/ (1)', '    Legacy']);
  });
});
