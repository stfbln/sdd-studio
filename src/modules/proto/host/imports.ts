import * as vscode from 'vscode';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { listEnums, listMessages, WELL_KNOWN_IMPORTS, type ProtoImportInfo, type TypeKind } from '../core/analysis';
import { parseProto } from '../core/parse';

interface ParsedImport {
  version: string;
  types: { fullName: string; kind: TypeKind }[];
  publicImports: string[];
}

const MAX_PUBLIC_DEPTH = 4;
const MAX_AVAILABLE_FILES = 300;

/** Another proto file of the workspace, and the import path that would reach it from the edited file. */
export interface AvailableProtoFile {
  importPath: string;
  resolved: string;
  types: { fullName: string; kind: TypeKind }[];
}

/**
 * Finds the files behind the imports of a .proto file and the types they declare, so the form
 * can offer them and check references. Import paths are looked up like protoc include paths:
 * the configured `sdd.proto.importPaths`, then every folder from the file up to the workspace
 * root, then any indexed file whose path ends with the import.
 */
export class ProtoImportResolver {
  private cache = new Map<string, ParsedImport>();

  constructor(private readonly index: SpecIndex<number>) {}

  async resolve(document: vscode.TextDocument): Promise<ProtoImportInfo[] | undefined> {
    let file;
    try {
      file = parseProto(document.getText());
    } catch {
      return undefined;
    }
    const roots = this.roots(document.uri);
    return Promise.all(
      file.imports.map(async (i): Promise<ProtoImportInfo> => {
        const wellKnown = WELL_KNOWN_IMPORTS[i.path];
        if (wellKnown) return { path: i.path, wellKnown: true, types: wellKnown };
        const found = await this.find(i.path, roots);
        if (!found) return { path: i.path, types: [] };
        const types = await this.typesOf(found, roots, 0, new Set());
        return { path: i.path, resolved: vscode.workspace.asRelativePath(found, false), types };
      }),
    );
  }

  /** Types of the other proto files of the workspace, offered in type pickers with the import they need. */
  async available(document: vscode.TextDocument): Promise<AvailableProtoFile[]> {
    const roots = this.roots(document.uri);
    const entries = (await this.index.all()).filter((e) => e.uri.toString() !== document.uri.toString() && !e.summary.error).slice(0, MAX_AVAILABLE_FILES);
    const result: AvailableProtoFile[] = [];
    for (const entry of entries) {
      // Configured import paths first, then the deepest folder shared with the edited file.
      const root = roots.find((r) => entry.uri.path.startsWith(`${r.path.replace(/\/$/, '')}/`));
      if (!root) continue;
      const parsed = await this.parse(entry.uri);
      if (!parsed?.types.length) continue;
      result.push({
        importPath: entry.uri.path.slice(root.path.replace(/\/$/, '').length + 1),
        resolved: vscode.workspace.asRelativePath(entry.uri, false),
        types: parsed.types,
      });
    }
    return result;
  }

  private roots(uri: vscode.Uri): vscode.Uri[] {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const roots: vscode.Uri[] = [];
    if (folder) {
      for (const path of vscode.workspace.getConfiguration('sdd.proto', uri).get<string[]>('importPaths', [])) {
        roots.push(vscode.Uri.joinPath(folder.uri, ...path.split(/[\\/]/).filter(Boolean)));
      }
    }
    let dir = vscode.Uri.joinPath(uri, '..');
    while (true) {
      roots.push(dir);
      if (!folder || dir.path.length <= folder.uri.path.length) break;
      dir = vscode.Uri.joinPath(dir, '..');
    }
    return roots;
  }

  private async find(importPath: string, roots: vscode.Uri[]): Promise<vscode.Uri | undefined> {
    const segments = importPath.split('/').filter(Boolean);
    for (const root of roots) {
      const candidate = vscode.Uri.joinPath(root, ...segments);
      try {
        await vscode.workspace.fs.stat(candidate);
        return candidate;
      } catch {
        // not under this root
      }
    }
    const suffix = `/${segments.join('/')}`;
    return (await this.index.all()).find((e) => e.uri.path.endsWith(suffix))?.uri;
  }

  private async typesOf(uri: vscode.Uri, roots: vscode.Uri[], depth: number, seen: Set<string>): Promise<ParsedImport['types']> {
    const key = uri.toString();
    if (seen.has(key)) return [];
    seen.add(key);
    const parsed = await this.parse(uri);
    if (!parsed) return [];
    const types = [...parsed.types];
    if (depth < MAX_PUBLIC_DEPTH) {
      for (const path of parsed.publicImports) {
        const wellKnown = WELL_KNOWN_IMPORTS[path];
        if (wellKnown) types.push(...wellKnown);
        else {
          const found = await this.find(path, [...this.roots(uri), ...roots]);
          if (found) types.push(...(await this.typesOf(found, roots, depth + 1, seen)));
        }
      }
    }
    return types;
  }

  private async parse(uri: vscode.Uri): Promise<ParsedImport | undefined> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    let version: string;
    let text: string;
    try {
      if (open) {
        version = `open:${open.version}`;
        text = open.getText();
      } else {
        const stat = await vscode.workspace.fs.stat(uri);
        version = `disk:${stat.mtime}:${stat.size}`;
        const cached = this.cache.get(uri.toString());
        if (cached?.version === version) return cached;
        text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
      }
    } catch {
      return undefined;
    }
    const cached = this.cache.get(uri.toString());
    if (cached?.version === version) return cached;
    try {
      const file = parseProto(text);
      const parsed: ParsedImport = {
        version,
        types: [
          ...listMessages(file).map((m) => ({ fullName: m.fullName, kind: 'message' as const })),
          ...listEnums(file).map((e) => ({ fullName: e.fullName, kind: 'enum' as const })),
        ],
        publicImports: file.imports.filter((i) => i.modifier === 'public').map((i) => i.path),
      };
      this.cache.set(uri.toString(), parsed);
      return parsed;
    } catch {
      return undefined;
    }
  }
}
