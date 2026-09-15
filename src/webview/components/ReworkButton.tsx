import { useEffect, useRef, useState } from 'react';
import { IconButton } from './IconButton';

/**
 * "Rework with AI": asks the host to build a prompt from the file's own update instructions and
 * either copy it to the clipboard or open it as a new document. The host builds the prompt itself
 * (it has the file path and text already), so no document content needs to cross into the webview.
 */
export function ReworkButton({ request }: { request(name: string, payload: unknown): Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);
  const run = (name: string) => {
    void request(name, undefined);
    setOpen(false);
  };
  return (
    <div className="rework" ref={ref}>
      <IconButton icon="sparkle" label="Rework with AI" showLabel onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="rework-menu">
          <button type="button" className="rework-item" onClick={() => run('copyPrompt')}>
            <span className="codicon codicon-copy" aria-hidden="true" /> Copy prompt
          </button>
          <button type="button" className="rework-item" onClick={() => run('openAsDocument')}>
            <span className="codicon codicon-new-file" aria-hidden="true" /> Open prompt as a document
          </button>
        </div>
      )}
    </div>
  );
}
