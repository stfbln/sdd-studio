import type { CatalogInfo, SpecDetails } from '../../shared/catalog';
import type { FileInstructions } from '../../shared/instructions';
import { detectFormat, parseSpec } from '../../shared/structured/specText';

/** A problem of a spec file, as reported to other extensions and AI assistants. */
export interface SpecCheck {
  severity: 'error' | 'warning';
  message: string;
}

/** Everything the generic catalog (index, page, file operations) needs to know about one kind of spec. */
export interface SpecKind<Extra = unknown> {
  readonly info: CatalogInfo;
  /** View type of the catalog page (also used to restore it after a reload). */
  readonly panelViewType: string;
  /** Custom editor opening these files. */
  readonly editorViewType: string;
  /** Setting holding the default folder for new specs, and its default value. */
  readonly folderSetting: string;
  readonly defaultFolder: string;
  /** Glob of candidate files, e.g. "**\/*.feature". */
  readonly include: string;
  /** Lowercase extensions of candidate files, used to react to renames and deletions. */
  readonly fileExtensions: string[];
  /** Quick content check (e.g. an `openapi:` field) before parsing. */
  accepts(fileName: string, text: string): boolean;
  summarize(fileName: string, text: string): { summary: SpecDetails; extra: Extra };
  template(name: string, fileName: string): string;
  /** Syntax errors, or the problems the form reports (those counted in the summary). */
  check(fileName: string, text: string): SpecCheck[];
  /** How people and AI assistants should update these files, written at their top. */
  instructions(fileName: string, text: string): FileInstructions;
  /** When set, moving the file asks for confirmation with this message. */
  moveWarning?(extra: Extra): string | undefined;
}

/** Checks of a YAML or JSON spec: the error of its summary (syntax, unsupported version), else what `analyze` finds. */
export function structuredChecks(error: string | undefined, fileName: string, text: string, analyze: (spec: unknown) => SpecCheck[]): SpecCheck[] {
  if (error) return [{ severity: 'error', message: error }];
  const result = parseSpec(text, detectFormat(fileName, text));
  return result.ok ? analyze(result.value).map(({ severity, message }) => ({ severity, message })) : [];
}
