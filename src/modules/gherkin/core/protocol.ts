import type { DialectKeywords, GherkinDocumentModel, GherkinParseError, LanguageOption } from './model';

/** Messages sent by the extension host to the Gherkin webview. */
export type HostMessage =
  | {
      type: 'document';
      document: GherkinDocumentModel;
      dialect: DialectKeywords;
      /** True when the change comes from outside the webview (text editor, undo, git...). */
      external: boolean;
    }
  | { type: 'parseErrors'; errors: GherkinParseError[] }
  | { type: 'init'; fileName: string; languages: LanguageOption[] }
  | { type: 'stepSuggestions'; steps: string[] };

/** Messages sent by the Gherkin webview to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; document: GherkinDocumentModel }
  | { type: 'changeLanguage'; document: GherkinDocumentModel; language: string }
  | { type: 'openAsText'; line?: number }
  | { type: 'openOverview' }
  | { type: 'copyPrompt' }
  | { type: 'openAsDocument' };
