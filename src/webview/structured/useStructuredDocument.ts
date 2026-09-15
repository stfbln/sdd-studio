import { useEffect, useMemo, useRef, useState } from 'react';
import { applyEditsToValue, isObject, type JsonObject, type SpecEdit } from '../../shared/structured/edits';
import type { StructuredHostMessage, StructuredWebviewMessage } from '../../shared/structured/protocol';
import type { SpecProblem } from '../../shared/structured/specText';
import { onHostMessage, vscode } from '../vscode';

export const postToHost = (message: StructuredWebviewMessage<unknown>) => vscode.postMessage(message);

/** Typing is written after this pause; structural changes are written at once. */
const TYPING_DELAY = 300;

/** How the form applies its own edits before the host writes them to the file. */
export interface LocalEngine<Value, Edit> {
  fromHost(value: unknown): Value;
  /** Throws when the edit cannot be applied (the host is not told about it). */
  apply(value: Value, edits: Edit[]): Value;
  /** Edits sharing a key while typing replace each other; undefined for structural edits. */
  typingKey(edit: Edit): string | undefined;
}

/** YAML/JSON documents (OpenAPI, AsyncAPI). */
export const jsonEngine: LocalEngine<JsonObject, SpecEdit> = {
  fromHost: (value) => (isObject(value) ? value : {}),
  apply: applyEditsToValue,
  typingKey: (edit) => (edit.op === 'set' && (edit.value === null || typeof edit.value !== 'object') ? JSON.stringify(edit.path) : undefined),
};

/**
 * Keeps the form in sync with the text document: receives the parsed document, applies
 * edits locally at once and sends them to the host (coalescing keystrokes), and remembers
 * the page being shown.
 */
export function useStructuredDocument<Location, Value = JsonObject, Edit = SpecEdit>(
  defaultLocation: Location,
  engine: LocalEngine<Value, Edit> = jsonEngine as unknown as LocalEngine<Value, Edit>,
) {
  const [spec, setSpec] = useState<Value | null>(null);
  const [errors, setErrors] = useState<SpecProblem[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [format, setFormat] = useState('');
  const [drift, setDrift] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [hostContext, setHostContext] = useState<unknown>();
  const [location, setLocation] = useState<Location>(
    () => ((vscode.getState() as { location?: Location } | undefined)?.location ?? defaultLocation),
  );

  const specRef = useRef<Value | null>(null);
  const queue = useRef<Edit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const engineRef = useRef(engine);
  const requests = useRef({ next: 0, pending: new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>() });

  const actions = useMemo(() => {
    const flush = () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      if (!queue.current.length) return;
      postToHost({ type: 'edits', edits: queue.current });
      queue.current = [];
    };
    return {
      flush,
      edit(input: Edit | Edit[]) {
        const edits = Array.isArray(input) ? input : [input];
        if (!specRef.current || !edits.length) return;
        const local = engineRef.current;
        try {
          specRef.current = local.apply(specRef.current, edits);
        } catch (err) {
          setEditError(err instanceof Error ? err.message : String(err));
          return;
        }
        setSpec(specRef.current);
        setDrift(false);

        const key = edits.length === 1 ? local.typingKey(edits[0]) : undefined;
        for (const e of edits) {
          const last = queue.current[queue.current.length - 1];
          // Consecutive keystrokes on the same field become a single edit.
          if (key !== undefined && last !== undefined && local.typingKey(last) === key) queue.current[queue.current.length - 1] = e;
          else queue.current.push(e);
        }
        if (key !== undefined) {
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, TYPING_DELAY);
        } else {
          flush();
        }
      },
      navigate(next: Location) {
        flush();
        setLocation(next);
        vscode.setState({ location: next });
        document.querySelector('.content-pane')?.scrollTo({ top: 0 });
      },
      openAsText(line?: number) {
        flush();
        postToHost({ type: 'openAsText', line });
      },
      openCatalog() {
        flush();
        postToHost({ type: 'openCatalog' });
      },
      openFile(path: string) {
        flush();
        postToHost({ type: 'openFile', path });
      },
      /** Work done by the host (e.g. creating a file); resolves with its result. */
      request(name: string, payload: unknown): Promise<unknown> {
        flush();
        const requestId = ++requests.current.next;
        return new Promise((resolve, reject) => {
          requests.current.pending.set(requestId, { resolve, reject });
          postToHost({ type: 'request', requestId, name, payload });
        });
      },
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && actions.flush();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', actions.flush);
    const dispose = onHostMessage<StructuredHostMessage<unknown>>((message) => {
      switch (message.type) {
        case 'init':
          setFileName(message.fileName);
          setFormat(message.format);
          break;
        case 'spec':
          if (message.external) {
            clearTimeout(timer.current);
            queue.current = [];
          }
          specRef.current = engineRef.current.fromHost(message.value);
          setSpec(specRef.current);
          setErrors(null);
          setDrift(message.formattingDrift);
          break;
        case 'parseErrors':
          setErrors(message.errors);
          break;
        case 'editFailed':
          setEditError(message.message);
          break;
        case 'context':
          setHostContext(message.value);
          break;
        case 'response': {
          const pending = requests.current.pending.get(message.requestId);
          requests.current.pending.delete(message.requestId);
          if (message.error !== undefined) pending?.reject(new Error(message.error));
          else pending?.resolve(message.value);
          break;
        }
      }
    });
    postToHost({ type: 'ready' });
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', actions.flush);
      dispose();
    };
  }, [actions]);

  return { spec, errors, fileName, format, drift, editError, hostContext, dismissEditError: () => setEditError(undefined), location, actions };
}
