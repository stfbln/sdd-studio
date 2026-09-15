interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  /** Returns the state, as VS Code does: do not return it from a React effect, which would take it for a cleanup function. */
  setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** The VS Code webview API, or a console stub when the UI is opened in a plain browser. */
export const vscode: VsCodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : { postMessage: (m) => console.debug('[webview → host]', m), getState: () => undefined, setState: (state) => state };

export function onHostMessage<T>(handler: (message: T) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data as T);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
