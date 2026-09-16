import type * as vscode from 'vscode';
import { registerApi } from './api';
import type { SddStudioApi } from './api/types';
import { registerInstructionsCommands } from './host/instructionsCommands';
import { adrModule } from './modules/adr';
import { asyncApiModule } from './modules/asyncapi';
import { backstageModule } from './modules/backstage';
import { gherkinModule } from './modules/gherkin';
import { openApiModule } from './modules/openapi';
import { openCliModule } from './modules/opencli';
import { openSloModule } from './modules/openslo';
import { otmModule } from './modules/otm';
import { promptsModule } from './modules/prompts';
import { protoModule } from './modules/proto';
import { specModule } from './modules/spec';
import { studioModule } from './modules/studio';
import type { SddModule } from './modules/types';

const modules: SddModule[] = [
  gherkinModule,
  openApiModule,
  asyncApiModule,
  protoModule,
  openCliModule,
  specModule,
  otmModule,
  backstageModule,
  openSloModule,
  promptsModule,
  adrModule,
  studioModule,
];

/** Returns the API other extensions use (see `api/types.ts`); AI assistants reach it through the MCP server. */
export function activate(context: vscode.ExtensionContext): SddStudioApi {
  for (const module of modules) module.activate(context);
  context.subscriptions.push(registerInstructionsCommands());
  return registerApi(context);
}

export function deactivate() {}
