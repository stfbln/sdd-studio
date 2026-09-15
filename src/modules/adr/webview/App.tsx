import { useEffect, useMemo, useState } from 'react';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame } from '../../../webview/structured/EditorFrame';
import { useStructuredDocument, type LocalEngine } from '../../../webview/structured/useStructuredDocument';
import { applyAdrEdits, type AdrEdit } from '../core/edits';
import { parseAdrFile, type AdrFile } from '../core/parse';
import { analyzeAdr, plural, type AdrAnchor } from '../core/summary';
import { AdrPage } from './AdrPage';
import { Nav } from './Nav';
import { anchorId, requestedAnchor, AdrContext, type AdrEditorValue } from './state';

const engine: LocalEngine<AdrFile, AdrEdit> = {
  fromHost: (value) => value as AdrFile,
  apply: (doc, edits) => parseAdrFile(applyAdrEdits(doc.text, edits)),
  typingKey: (edit) => {
    switch (edit.op) {
      case 'setStatus':
      case 'setDate':
      case 'setDecisionMakers':
      case 'setConsulted':
      case 'setInformed':
      case 'setTitle':
      case 'setContext':
      case 'setMoreInformation':
      case 'setOutcome':
        return edit.op;
      case 'setDriver':
        return `driver ${edit.index}`;
      case 'setOption':
        return `option ${edit.index}`;
      case 'setCell':
        return `cell ${edit.option} ${edit.driver}`;
      case 'setConsequence':
        return `consequence ${edit.index}`;
      case 'setProCon':
        return `procon ${edit.option} ${edit.index}`;
      default:
        return undefined;
    }
  },
};

const ANCHORS: AdrAnchor[] = ['overview', 'context', 'drivers', 'options', 'matrix', 'outcome', 'prosCons', 'more'];

/** The part of the page at the top of the scrolled pane. */
function useVisibleAnchor(ready: boolean) {
  const [visible, setVisible] = useState<AdrAnchor>('overview');
  useEffect(() => {
    const pane = document.querySelector('.content-pane');
    if (!ready || !pane) return;
    const update = () => {
      const box = pane.getBoundingClientRect();
      const top = (anchor: AdrAnchor) => document.getElementById(anchorId(anchor))?.getBoundingClientRect().top ?? Infinity;
      let current = ANCHORS.filter((anchor) => top(anchor) <= box.top + 48).pop() ?? 'overview';
      const atBottom = pane.scrollTop > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;
      if (atBottom && requestedAnchor && top(requestedAnchor) < box.bottom) current = requestedAnchor;
      setVisible(current);
    };
    update();
    pane.addEventListener('scroll', update, { passive: true });
    return () => pane.removeEventListener('scroll', update);
  }, [ready]);
  return visible;
}

export function App() {
  const doc = useStructuredDocument<null, AdrFile, AdrEdit>(null, engine);
  const { spec, actions } = doc;
  const issues = useMemo(() => (spec ? analyzeAdr(spec.model) : []), [spec]);
  const visible = useVisibleAnchor(!!spec);

  if (!spec) return <div className="loading">Loading ADR…</div>;

  const context: AdrEditorValue = { doc: spec, model: spec.model, issues, edit: actions.edit, openAsText: actions.openAsText, request: actions.request };
  const options = spec.model.options?.list.items.length ?? 0;
  return (
    <AdrContext.Provider value={context}>
      <EditorFrame
        icon="notebook"
        fileName={doc.fileName}
        format="markdown"
        versionLabel={options ? plural(options, 'option') : undefined}
        catalogLabel="All decisions"
        errors={null}
        editError={doc.editError}
        drift={false}
        onDismissEditError={doc.dismissEditError}
        onOpenText={actions.openAsText}
        onOpenCatalog={actions.openCatalog}
        extraActions={<ReworkButton request={actions.request} />}
        nav={<Nav current={visible} />}
      >
        <AdrPage />
      </EditorFrame>
    </AdrContext.Provider>
  );
}
