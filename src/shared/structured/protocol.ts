import type { Json, SpecEdit } from './edits';
import type { SpecProblem } from './specText';

/**
 * Messages sent by the extension host to a form editor whose file is the source of truth
 * (OpenAPI, AsyncAPI, Protocol Buffers). `Value` is the parsed document.
 */
export type StructuredHostMessage<Value = Json> =
  /** `format` is shown in the toolbar, e.g. "yaml" or "proto". */
  | { type: 'init'; fileName: string; format: string }
  | {
      type: 'spec';
      value: Value;
      /** True when the change comes from outside the form (text editor, undo, git...). */
      external: boolean;
      formattingDrift: boolean;
    }
  | { type: 'parseErrors'; errors: SpecProblem[] }
  | { type: 'editFailed'; message: string }
  /** Extra information computed by the host (e.g. types of imported files). */
  | { type: 'context'; value: unknown }
  /** Answer to a `request` of the form. */
  | { type: 'response'; requestId: number; value?: unknown; error?: string };

/** Messages sent by a form editor to the extension host. */
export type StructuredWebviewMessage<Edit = SpecEdit> =
  | { type: 'ready' }
  | { type: 'edits'; edits: Edit[] }
  | { type: 'openAsText'; line?: number }
  | { type: 'openCatalog' }
  /** Opens another file of the workspace (workspace-relative path), e.g. an import. */
  | { type: 'openFile'; path: string }
  /** Runs one of the commands the editor offers to its form, by name. */
  | { type: 'command'; name: string }
  /** Asks the host for work the form waits on (e.g. creating a file), answered by a `response`. */
  | { type: 'request'; requestId: number; name: string; payload: unknown };
