import { current, produce } from 'immer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '../../../webview/components/IconButton';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { onHostMessage, vscode } from '../../../webview/vscode';
import type { DialectKeywords, GherkinDocumentModel, GherkinParseError, LanguageOption } from '../core/model';
import type { HostMessage, WebviewMessage } from '../core/protocol';
import { FeatureCard } from './Blocks';
import { ActionsContext, CollapseContext, DialectContext, SuggestionsContext, type EditorActions } from './state';
import { emptyDocument, locate, reconcileIds, withFreshIds } from './tree';

const post = (message: WebviewMessage) => vscode.postMessage(message);
/** Delay before typing is written to the document; keeps undo steps meaningful. */
const WRITE_DELAY = 200;

/** Gherkin has no request/response protocol: "Rework with AI" only needs to fire and forget. */
const reworkRequest = (name: string) => {
  post({ type: name as 'copyPrompt' | 'openAsDocument' });
  return Promise.resolve();
};

export function App() {
  const [doc, setDoc] = useState<GherkinDocumentModel | null>(null);
  const [dialect, setDialect] = useState<DialectKeywords | null>(null);
  const [errors, setErrors] = useState<GherkinParseError[] | null>(null);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [fileName, setFileName] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const docRef = useRef<GherkinDocumentModel | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef(() => {});

  const actions = useMemo<EditorActions>(() => {
    const flush = () => {
      if (writeTimer.current === undefined || !docRef.current) return;
      clearTimeout(writeTimer.current);
      writeTimer.current = undefined;
      post({ type: 'edit', document: docRef.current });
    };
    const update: EditorActions['update'] = (recipe) => {
      if (!docRef.current) return;
      const next = produce(docRef.current, recipe);
      if (next === docRef.current) return;
      docRef.current = next;
      setDoc(next);
      clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(flush, WRITE_DELAY);
    };
    flushRef.current = flush;

    return {
      update,
      edit: (id, recipe) =>
        update((d) => {
          const found = locate(d as GherkinDocumentModel, id);
          if (found) recipe(found.node as never);
        }),
      remove: (id) =>
        update((d) => {
          const found = locate(d as GherkinDocumentModel, id);
          found?.list?.splice(found.index, 1);
        }),
      move: (id, delta) =>
        update((d) => {
          const found = locate(d as GherkinDocumentModel, id);
          if (!found?.list) return;
          const target = found.index + delta;
          if (target < 0 || target >= found.list.length) return;
          const [node] = found.list.splice(found.index, 1);
          found.list.splice(target, 0, node);
        }),
      duplicate: (id) =>
        update((d) => {
          const found = locate(d as GherkinDocumentModel, id);
          found?.list?.splice(found.index + 1, 0, withFreshIds(current(found.node)));
        }),
      openAsText: (line) => {
        flush();
        post({ type: 'openAsText', line });
      },
      changeLanguage: (language) => {
        if (!docRef.current) return;
        clearTimeout(writeTimer.current);
        writeTimer.current = undefined;
        post({ type: 'changeLanguage', document: docRef.current, language });
      },
    };
  }, []);

  useEffect(() => {
    // Save and undo shortcuts are handled by VS Code: write pending typing first.
    const onKeyDown = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && flushRef.current();
    const onBlur = () => flushRef.current();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const dispose = onHostMessage<HostMessage>((message) => {
      switch (message.type) {
        case 'init':
          setFileName(message.fileName);
          setLanguages(message.languages);
          break;
        case 'document':
          // The text document changed elsewhere: it wins over unsaved typing.
          clearTimeout(writeTimer.current);
          writeTimer.current = undefined;
          reconcileIds(docRef.current, message.document);
          docRef.current = message.document;
          setDoc(message.document);
          setDialect(message.dialect);
          setErrors(null);
          break;
        case 'parseErrors':
          setErrors(message.errors);
          break;
        case 'stepSuggestions':
          setSuggestions(message.steps);
          break;
      }
    });
    post({ type: 'ready' });
    return dispose;
  }, []);

  const collapseState = useMemo(
    () => ({
      collapsed,
      toggle: (id: string) =>
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
    }),
    [collapsed],
  );

  if (!doc || !dialect) {
    return errors ? <ErrorView errors={errors} actions={actions} /> : <div className="loading">Loading…</div>;
  }

  const feature = doc.feature;
  const blockIds = feature?.children.flatMap((c) => (c.kind === 'rule' ? [c.id, ...c.children.map((x) => x.id)] : [c.id])) ?? [];
  const scenarios = feature?.children.flatMap((c) => (c.kind === 'rule' ? c.children : [c])).filter((c) => c.kind === 'scenario') ?? [];
  const exampleRows = scenarios.reduce((n, s) => n + s.examples.reduce((m, e) => m + e.rows.length, 0), 0);

  return (
    <ActionsContext.Provider value={actions}>
      <DialectContext.Provider value={dialect}>
        <SuggestionsContext.Provider value={suggestions}>
          <CollapseContext.Provider value={collapseState}>
            <div className="sticky-top">
            <div className="toolbar">
              <div className="toolbar-title">
                <span className="codicon codicon-checklist" aria-hidden="true" />
                <span className="file-name" title={fileName}>
                  {fileName}
                </span>
                {feature && (
                  <span className="muted">
                    {scenarios.length} scenario{scenarios.length === 1 ? '' : 's'} · {exampleRows} example row{exampleRows === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="toolbar-actions">
                <ReworkButton request={reworkRequest} />
                <label className="language">
                  <span className="codicon codicon-globe" aria-hidden="true" />
                  <select
                    className="keyword-select"
                    aria-label="Gherkin language"
                    title="Language of the Gherkin keywords"
                    value={doc.language}
                    onChange={(e) => actions.changeLanguage(e.target.value)}
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.native === l.name ? l.name : `${l.native} (${l.name})`}
                      </option>
                    ))}
                  </select>
                </label>
                <IconButton
                  icon="expand-all"
                  label="Expand all"
                  disabled={collapsed.size === 0}
                  onClick={() => setCollapsed(new Set())}
                />
                <IconButton icon="collapse-all" label="Collapse all" onClick={() => setCollapsed(new Set(blockIds))} />
                <IconButton icon="go-to-file" label="Open as text" onClick={() => actions.openAsText()} />
                <IconButton icon="list-tree" label="All features" onClick={() => post({ type: 'openOverview' })} />
              </div>
            </div>

            {errors && <ErrorView errors={errors} actions={actions} compact />}
            </div>

            <main className={`editor ${errors ? 'readonly' : ''}`} inert={errors ? true : undefined}>
              {feature ? (
                <FeatureCard feature={feature} />
              ) : (
                <div className="empty">
                  <p>This file does not contain a Feature yet.</p>
                  <IconButton
                    icon="add"
                    label="Create feature"
                    showLabel
                    variant="primary"
                    onClick={() => actions.update((d) => ({ ...emptyDocument(dialect), trailingComments: [...d.trailingComments] }))}
                  />
                </div>
              )}
            </main>
          </CollapseContext.Provider>
        </SuggestionsContext.Provider>
      </DialectContext.Provider>
    </ActionsContext.Provider>
  );
}

function ErrorView({ errors, actions, compact }: { errors: GherkinParseError[]; actions: EditorActions; compact?: boolean }) {
  return (
    <div className={`error-panel ${compact ? 'compact' : ''}`} role="alert">
      <div className="error-title">
        <span className="codicon codicon-error" aria-hidden="true" />
        <span>
          The file has Gherkin syntax errors. Fix them in the text editor to resume visual editing
          {compact ? ' (showing the last valid version, read-only).' : '.'}
        </span>
        <IconButton icon="go-to-file" label="Open as text" showLabel variant="primary" onClick={() => actions.openAsText(errors[0]?.line)} />
      </div>
      <ul>
        {errors.map((error, i) => (
          <li key={i}>
            {error.line ? (
              <button type="button" className="link-button" onClick={() => actions.openAsText(error.line)}>
                Line {error.line}
              </button>
            ) : null}{' '}
            {error.message.replace(/^\(\d+:\d+\):\s*/, '')}
          </li>
        ))}
      </ul>
    </div>
  );
}
