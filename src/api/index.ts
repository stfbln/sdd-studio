import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import * as vscode from 'vscode';
import { MCP_SERVER_NAME } from '../shared/mcpTools';
import { newToken, startMcpHttpServer, type McpHttpServer } from './mcpServer';
import { SddStudioService } from './service';
import type { SddStudioApi } from './types';

const TOKEN_SECRET = 'sdd.mcp.token';
export const URL_VARIABLE = 'SDD_STUDIO_MCP_URL';
export const TOKEN_VARIABLE = 'SDD_STUDIO_MCP_TOKEN';

/**
 * Entry in a Claude Code `.mcp.json`: the address and token come from the environment of the
 * terminal, so the file can be committed and each VS Code window reaches its own server.
 */
export const CLAUDE_CODE_ENTRY = { type: 'http', url: `\${${URL_VARIABLE}}`, headers: { Authorization: `Bearer \${${TOKEN_VARIABLE}}` } };

/**
 * Runs the MCP server of this window while `sdd.mcp.enabled` is on, and tells assistants where it is:
 * VS Code chat through an MCP server definition provider, terminals (Claude Code) through environment variables.
 */
class McpHost implements vscode.Disposable {
  private server: McpHttpServer | undefined;
  private token: string | undefined;
  private queue = Promise.resolve();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly log = vscode.window.createOutputChannel('SDD Studio MCP', { log: true });
  private readonly disposables: vscode.Disposable[] = [this.changed, this.log];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: SddStudioApi,
  ) {
    this.disposables.push(vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('sdd.mcp') && this.restart()));
    // VS Code chat (GitHub Copilot) finds the server without any setup.
    this.disposables.push(
      vscode.lm.registerMcpServerDefinitionProvider(MCP_SERVER_NAME, {
        onDidChangeMcpServerDefinitions: this.changed.event,
        provideMcpServerDefinitions: () =>
          this.server && this.token ? [new vscode.McpHttpServerDefinition('SDD Studio', vscode.Uri.parse(this.server.url), { Authorization: `Bearer ${this.token}` }, this.version)] : [],
      }),
    );
  }

  private get version(): string {
    return String(this.context.extension.packageJSON.version ?? '0.0.0');
  }

  get connection(): { url: string; token: string } | undefined {
    return this.server && this.token ? { url: this.server.url, token: this.token } : undefined;
  }

  restart() {
    this.queue = this.queue.then(() => this.stop()).then(() => this.start());
    return this.queue;
  }

  private async start() {
    const config = vscode.workspace.getConfiguration('sdd.mcp');
    if (!config.get<boolean>('enabled', true)) return;
    this.token ??= await this.loadToken();
    const port = config.get<number>('port', 0);
    const options = { api: this.api, version: this.version, token: this.token, onError: (err: unknown) => this.log.error(String(err)) };
    try {
      this.server = await startMcpHttpServer({ ...options, port });
    } catch (err) {
      if (!port || (err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        this.log.error(`The MCP server could not start: ${String(err)}`);
        return;
      }
      // Usually another VS Code window: this one still gets a server.
      this.server = await startMcpHttpServer({ ...options, port: 0 });
      void vscode.window.showWarningMessage(`Port ${port} (sdd.mcp.port) is already in use, maybe by another VS Code window: the SDD Studio MCP server of this window listens on port ${this.server.port}.`);
    }
    this.log.info(`MCP server listening on ${this.server.url}`);
    this.setEnvironment(this.server.url, this.token);
    this.changed.fire();
  }

  private async stop() {
    const server = this.server;
    this.server = undefined;
    this.setEnvironment(undefined, undefined);
    this.changed.fire();
    if (server) {
      await server.close();
      this.log.info('MCP server stopped');
    }
  }

  private async loadToken(): Promise<string> {
    const stored = await this.context.secrets.get(TOKEN_SECRET);
    if (stored) return stored;
    const token = newToken();
    await this.context.secrets.store(TOKEN_SECRET, token);
    return token;
  }

  private setEnvironment(url: string | undefined, token: string | undefined) {
    const collection = this.context.environmentVariableCollection;
    collection.description = 'Address and token of the SDD Studio MCP server of this window, for AI assistants started in the terminal';
    if (url && token) {
      collection.replace(URL_VARIABLE, url);
      collection.replace(TOKEN_VARIABLE, token);
      // Processes started by other extensions (e.g. the Claude Code extension) inherit the extension host environment.
      process.env[URL_VARIABLE] = url;
      process.env[TOKEN_VARIABLE] = token;
    } else {
      collection.clear();
      delete process.env[URL_VARIABLE];
      delete process.env[TOKEN_VARIABLE];
    }
  }

  dispose() {
    void this.stop();
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Adds the SDD Studio server to the `.mcp.json` of a workspace folder (Claude Code project servers). */
async function configureClaudeCode() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const folder = folders.length > 1 ? await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Workspace folder where Claude Code runs' }) : folders[0];
  if (!folder) {
    if (!folders.length) void vscode.window.showWarningMessage('Open a folder to configure Claude Code.');
    return;
  }
  const uri = vscode.Uri.joinPath(folder.uri, '.mcp.json');
  let text = '{}\n';
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    // A new file.
  }
  const errors: ParseError[] = [];
  parse(text, errors, { allowTrailingComma: true });
  if (errors.length) {
    void vscode.window.showErrorMessage('.mcp.json is not valid JSON: fix it first.');
    return;
  }
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
  const formattingOptions = { insertSpaces: !indent.includes('\t'), tabSize: indent.includes('\t') ? 1 : indent.length, eol: text.includes('\r\n') ? '\r\n' : '\n' };
  const updated = applyEdits(text, modify(text, ['mcpServers', MCP_SERVER_NAME], CLAUDE_CODE_ENTRY, { formattingOptions }));
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
  await vscode.window.showTextDocument(uri);
  void vscode.window.showInformationMessage(
    `SDD Studio is in ${vscode.workspace.asRelativePath(uri)}. Claude Code reads the server address and token from ${URL_VARIABLE} and ${TOKEN_VARIABLE}: start it from a new terminal of this window (or from the Claude Code extension) and approve the project server.`,
  );
}

export function registerApi(context: vscode.ExtensionContext): SddStudioApi {
  const api = new SddStudioService();
  const host = new McpHost(context, api);
  context.subscriptions.push(
    host,
    vscode.commands.registerCommand('sdd.mcp.configureClaudeCode', configureClaudeCode),
    vscode.commands.registerCommand('sdd.mcp.copyClaudeCodeCommand', async () => {
      const connection = host.connection;
      if (!connection) {
        void vscode.window.showWarningMessage('The SDD Studio MCP server is not running: turn on sdd.mcp.enabled.');
        return;
      }
      await vscode.env.clipboard.writeText(`claude mcp add --transport http ${MCP_SERVER_NAME} ${connection.url} --header "Authorization: Bearer ${connection.token}"`);
      const fixed = vscode.workspace.getConfiguration('sdd.mcp').get<number>('port', 0);
      void vscode.window.showInformationMessage(
        `The claude mcp add command is copied, with the token: keep it private.${fixed ? '' : ' The port changes when VS Code restarts: set sdd.mcp.port, or use "Configure Claude Code" which follows the port.'}`,
      );
    }),
  );
  void host.restart();
  return api;
}
