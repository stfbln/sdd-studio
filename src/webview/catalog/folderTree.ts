import type { CatalogState, SpecSummary } from '../../shared/catalog';
import { parentFolder } from '../../shared/files';

export interface FolderNode {
  key: string;
  workspace: number;
  /** Deepest folder of the node (compacted nodes cover several levels). */
  path: string;
  label: string;
  exists: boolean;
  folders: FolderNode[];
  specs: SpecSummary[];
  /** Specs in this folder and all its subfolders. */
  total: number;
}

export const folderKey = (workspace: number, path: string) => `${workspace}:${path}`;

export function matchesFilter(spec: SpecSummary, filter: string): boolean {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  return [spec.name, spec.path, ...spec.tags].some((v) => v.toLowerCase().includes(query));
}

/**
 * Builds one tree per workspace folder. Chains of folders holding nothing but a single
 * subfolder are merged ("src/test/features"), like VS Code's compact folders.
 * With a filter, folders without matching specs are hidden.
 */
export function buildFolderTree(state: CatalogState, filter = ''): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const node = (workspace: number, path: string): FolderNode => {
    const key = folderKey(workspace, path);
    let found = nodes.get(key);
    if (!found) {
      found = { key, workspace, path, label: path.slice(path.lastIndexOf('/') + 1), exists: true, folders: [], specs: [], total: 0 };
      nodes.set(key, found);
      if (path) node(workspace, parentFolder(path)).folders.push(found);
    }
    return found;
  };

  const roots = state.workspaces.map((w) => {
    const root = node(w.index, '');
    root.label = w.name;
    return root;
  });
  const filtering = filter.trim() !== '';
  if (!filtering) {
    for (const f of state.folders) node(f.workspace, f.path).exists = f.exists;
  }
  for (const spec of state.specs) {
    if (matchesFilter(spec, filter)) node(spec.workspace, parentFolder(spec.path)).specs.push(spec);
  }

  const finish = (n: FolderNode): FolderNode => {
    n.folders = n.folders.map(finish).filter((c) => !filtering || c.total > 0).sort((a, b) => a.label.localeCompare(b.label));
    n.specs.sort((a, b) => (a.name || a.path).localeCompare(b.name || b.path));
    n.total = n.specs.length + n.folders.reduce((sum, c) => sum + c.total, 0);
    while (n.path && n.folders.length === 1 && n.specs.length === 0) {
      const [only] = n.folders;
      Object.assign(n, { ...only, label: `${n.label}/${only.label}`, exists: only.exists });
    }
    return n;
  };
  return roots.map(finish);
}
