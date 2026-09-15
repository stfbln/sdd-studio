import type * as vscode from 'vscode';

/**
 * A spec format supported by SDD Studio (Gherkin, and later OpenAPI, ADRs...).
 * Each module registers its own editors and commands; extension.ts only lists them.
 */
export interface SddModule {
  readonly id: string;
  activate(context: vscode.ExtensionContext): void;
}
