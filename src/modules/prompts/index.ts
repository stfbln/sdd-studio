import * as vscode from 'vscode';
import type { SddModule } from '../types';
import { PromptsPanel } from './host/PromptsPanel';

/** Prompts for AI assistants designing, updating and implementing the specs of the catalog. */
export const promptsModule: SddModule = {
  id: 'prompts',

  activate(context) {
    context.subscriptions.push(
      PromptsPanel.registerSerializer(context),
      vscode.commands.registerCommand('sdd.prompts.open', () => PromptsPanel.show(context)),
    );
  },
};
