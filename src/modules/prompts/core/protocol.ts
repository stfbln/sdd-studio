/** Messages between the extension host and the prompt page. */
import type { PromptEntity } from './prompts';

export interface PromptsState {
  hasWorkspace: boolean;
  /** Entities of the catalog files of the workspace. */
  entities: PromptEntity[];
  /** Whether the MCP server the prompts refer to is on (setting). */
  mcpEnabled: boolean;
}

export type PromptsHostMessage = { type: 'state' } & PromptsState;

export type PromptsWebviewMessage =
  | { type: 'ready' }
  | { type: 'copy'; text: string }
  | { type: 'openAsDocument'; text: string }
  | { type: 'openEntity'; entity: PromptEntity }
  | { type: 'enableMcp' }
  | { type: 'configureClaudeCode' };
