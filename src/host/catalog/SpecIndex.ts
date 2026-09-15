import * as vscode from 'vscode';
import type { SpecSummary } from '../../shared/catalog';
import type { SpecKind } from './SpecKind';
import { toWorkspacePath } from './workspaceFiles';

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const EXCLUDED = '**/{node_modules,.git,dist,out,build,target,.vscode-test}/**';
const EXCLUDED_SEGMENT = /\/(node_modules|\.git|dist|out|build|target|\.vscode-test)\//;

export interface IndexEntry<Extra> {
  uri: vscode.Uri;
  summary: SpecSummary;
  extra: Extra;
}

/**
 * Keeps a summary of every spec file of one kind, parsed once and updated by a file
 * watcher. Feeds the catalog page and module features such as step suggestions.
 */
export class SpecIndex<Extra = unknown> implements vscode.Disposable {
  private entries = new Map<string, IndexEntry<Extra>>();
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private loading: Promise<void> | undefined;
  private fireTimer: ReturnType<typeof setTimeout> | undefined;

  /** Fires (debounced) when specs are added, changed or removed. */
  readonly onDidChange = this.emitter.event;

  constructor(readonly kind: SpecKind<Extra>) {
    const watcher = vscode.workspace.createFileSystemWatcher(kind.include);
    // Folder deletions and renames only report the folder itself.
    const mayContainSpecs = (uri: vscode.Uri) => {
      const name = uri.path.slice(uri.path.lastIndexOf('/') + 1).toLowerCase();
      return !name.includes('.') || kind.fileExtensions.some((ext) => name.endsWith(ext));
    };
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.index(uri)),
      watcher.onDidChange((uri) => this.index(uri)),
      watcher.onDidDelete((uri) => this.forget(uri)),
      vscode.workspace.onDidDeleteFiles((e) => e.files.some(mayContainSpecs) && this.rescan()),
      vscode.workspace.onDidRenameFiles((e) => e.files.some((f) => mayContainSpecs(f.oldUri)) && this.rescan()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.rescan()),
    );
  }

  async all(): Promise<IndexEntry<Extra>[]> {
    await this.load();
    return [...this.entries.values()];
  }

  async summaries(): Promise<SpecSummary[]> {
    return (await this.all()).map((e) => e.summary);
  }

  get(uri: vscode.Uri): IndexEntry<Extra> | undefined {
    return this.entries.get(uri.toString());
  }

  /** Re-reads one file right away (used after our own file operations). */
  async refresh(uri: vscode.Uri) {
    await this.load();
    await this.index(uri);
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      const uris = await vscode.workspace.findFiles(this.kind.include, EXCLUDED, MAX_FILES);
      await Promise.all(uris.map((uri) => this.index(uri, false)));
    })();
    return this.loading;
  }

  private rescan() {
    this.loading = undefined;
    this.entries = new Map();
    void this.load().then(() => this.scheduleFire());
  }

  private forget(uri: vscode.Uri) {
    if (this.entries.delete(uri.toString())) this.scheduleFire();
  }

  private async index(uri: vscode.Uri, notify = true) {
    const location = toWorkspacePath(uri);
    if (!location || EXCLUDED_SEGMENT.test(`/${location.path}`)) return;
    let text: string;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) return;
      text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      this.forget(uri);
      return;
    }
    if (!this.kind.accepts(uri.path, text)) {
      this.forget(uri);
      return;
    }
    const { summary, extra } = this.kind.summarize(uri.path, text);
    this.entries.set(uri.toString(), { uri, summary: { ...summary, ...location }, extra });
    if (notify) this.scheduleFire();
  }

  private scheduleFire() {
    clearTimeout(this.fireTimer);
    this.fireTimer = setTimeout(() => this.emitter.fire(), 300);
  }

  dispose() {
    clearTimeout(this.fireTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
