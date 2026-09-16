import { useEffect, useMemo, useState } from 'react';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame } from '../../../webview/structured/EditorFrame';
import { useStructuredDocument, type LocalEngine } from '../../../webview/structured/useStructuredDocument';
import { applySpecEdits, type SpecEdit, type SpecWriteOptions } from '../core/edits';
import { inheritanceIssues, type SpecEditorContext } from '../core/inherit';
import { parseSpecFile, type SpecFile } from '../core/parse';
import { allRequirements, analyzeSpec, plural, type SpecAnchor } from '../core/summary';
import { Nav } from './Nav';
import { SpecPage } from './SpecPage';
import { anchorId, requestedAnchor, SpecContext, type SpecEditorValue } from './state';

/** The icons the host writes key word headings with, once it has sent them: edits applied here write the same text. */
const writeOptions: SpecWriteOptions = {};

const engine: LocalEngine<SpecFile, SpecEdit> = {
  fromHost: (value) => value as SpecFile,
  apply: (doc, edits) => parseSpecFile(applySpecEdits(doc.text, edits, writeOptions)),
  typingKey: (edit) => {
    switch (edit.op) {
      case 'setTitle':
      case 'setDescription':
      case 'setContext':
        return edit.op;
      case 'setRequirement':
      case 'setRequirementDescription':
        return `${edit.op} ${edit.group} ${edit.index}`;
      case 'setExample':
      case 'setExampleTitle':
        return `${edit.op} ${edit.group} ${edit.index} ${edit.example}`;
      default:
        return undefined;
    }
  },
};

const ANCHORS: SpecAnchor[] = ['overview', 'context', 'requirements'];

/** The part of the page at the top of the scrolled pane. */
function useVisibleAnchor(ready: boolean) {
  const [visible, setVisible] = useState<SpecAnchor>('overview');
  useEffect(() => {
    const pane = document.querySelector('.content-pane');
    if (!ready || !pane) return;
    const update = () => {
      const box = pane.getBoundingClientRect();
      const top = (anchor: SpecAnchor) => document.getElementById(anchorId(anchor))?.getBoundingClientRect().top ?? Infinity;
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
  const doc = useStructuredDocument<null, SpecFile, SpecEdit>(null, engine);
  const { spec, actions } = doc;
  const hostContext = doc.hostContext as SpecEditorContext | undefined;
  writeOptions.icons = hostContext?.keywordIcons;
  const issues = useMemo(() => (spec ? [...analyzeSpec(spec.model), ...inheritanceIssues(spec.model, hostContext?.inheritance)] : []), [spec, hostContext]);
  const visible = useVisibleAnchor(!!spec);

  if (!spec) return <div className="loading">Loading spec…</div>;

  const context: SpecEditorValue = {
    doc: spec,
    model: spec.model,
    issues,
    context: hostContext,
    edit: actions.edit,
    openAsText: actions.openAsText,
    openFile: actions.openFile,
  };
  return (
    <SpecContext.Provider value={context}>
      <EditorFrame
        icon="book"
        fileName={doc.fileName}
        format="markdown"
        versionLabel={allRequirements(spec.model).length ? plural(allRequirements(spec.model).length, 'requirement') : undefined}
        catalogLabel="All specs"
        errors={null}
        editError={doc.editError}
        drift={false}
        onDismissEditError={doc.dismissEditError}
        onOpenText={actions.openAsText}
        onOpenCatalog={actions.openCatalog}
        extraActions={<ReworkButton request={actions.request} />}
        nav={<Nav current={visible} />}
      >
        <SpecPage />
      </EditorFrame>
    </SpecContext.Provider>
  );
}
