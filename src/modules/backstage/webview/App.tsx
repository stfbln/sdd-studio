import { useMemo, useState } from 'react';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { applyEditsToValue, type SpecEdit } from '../../../shared/structured/edits';
import { postToHost } from '../../../webview/structured/useStructuredDocument';
import { withFileEdits } from '../core/consolidated';
import { analyzeCatalog } from '../core/analysis';
import { sourceLocationEdits } from '../core/edits';
import { documentFiles, documentsOf, entitiesOf, knownEntities, type CatalogContext, type CatalogLocation } from '../core/model';
import { EntityPage } from './EntityPage';
import { Nav } from './Nav';
import { OverviewPage } from './OverviewPage';
import { validLocation, WorkspaceContext, type WorkspaceValue } from './state';

export function App() {
  const doc = useStructuredDocument<CatalogLocation>({ kind: 'overview' });
  const { spec, errors, actions } = doc;
  const context = doc.hostContext as CatalogContext | undefined;

  const [chosenTarget, setTarget] = useState('');
  const [filter, setFilter] = useState('');
  const files = spec ? documentFiles(spec) : undefined;
  const current = spec ? validLocation(spec, doc.location) : doc.location;
  const catalogFiles = [...new Set([...(context?.catalogFiles ?? []), ...(files ?? [])])].sort();
  const pageFile = files && current.kind === 'entity' ? files[current.index] : undefined;
  const target = pageFile ?? (catalogFiles.includes(chosenTarget) ? chosenTarget : filter || catalogFiles[0] || '');

  /** Adds the catalog files of new entities (consolidated view) and keeps source locations in line. */
  const editIn = (file: string, input: SpecEdit | SpecEdit[]) => {
    if (!spec) return;
    const edits = withFileEdits(spec, Array.isArray(input) ? input : [input], file);
    const extra = sourceLocationEdits(spec, applyEditsToValue(spec, edits), context);
    actions.edit(extra.length ? [...edits, ...extra] : edits);
  };

  const workspace = useMemo<WorkspaceValue>(
    () => ({
      context,
      known: spec ? knownEntities(spec, context) : [],
      issues: spec
        ? [
            ...(context?.consolidated?.brokenFiles ?? []).map((b) => ({
              severity: 'error' as const,
              message: `${b.path}${b.line ? ` line ${b.line}` : ''}: ${b.message} (its entities are not shown)`,
              location: { kind: 'overview' } as CatalogLocation,
            })),
            ...analyzeCatalog(spec, context),
          ]
        : [],
      openFile: actions.openFile,
      openCatalog: actions.openCatalog,
      runCommand: (name) => postToHost({ type: 'command', name }),
      request: actions.request,
      consolidated: files ? { files: catalogFiles, target, setTarget, filter, setFilter, editIn } : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, context, actions, target, filter, catalogFiles.join('\n')],
  );

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading catalog…</div>;
  }

  const editor: SpecEditorContextValue<CatalogLocation> = {
    spec,
    version: '',
    // New entities go to the file of the page (consolidated view); source locations follow repositories.
    edit: (input) => editIn(target, input),
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: false, open: () => {} },
  };
  const entities = entitiesOf(spec);
  const notCatalog = !files && documentsOf(spec).length > 0 && !entities.some((e) => e.kind);

  return (
    <SpecEditorContext.Provider value={editor}>
      <WorkspaceContext.Provider value={workspace}>
        <EditorFrame
          icon="type-hierarchy"
          fileName={doc.fileName}
          format={doc.format}
          versionLabel={`Backstage · ${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}${files ? ` in ${catalogFiles.length} ${catalogFiles.length === 1 ? 'file' : 'files'}` : ''}`}
          catalogLabel="All catalog files"
          errors={errors}
          editError={doc.editError}
          drift={doc.drift}
          onDismissEditError={doc.dismissEditError}
          onOpenText={files ? () => (pageFile ? actions.openFile(pageFile) : actions.openCatalog()) : actions.openAsText}
          onOpenCatalog={actions.openCatalog}
          extraActions={<ReworkButton request={actions.request} />}
          unsupported={notCatalog ? 'This file is not a Backstage catalog file (no document has a "kind").' : undefined}
          nav={<Nav current={current} />}
        >
          {current.kind === 'entity' ? <EntityPage key={current.index} index={current.index} /> : <OverviewPage />}
        </EditorFrame>
      </WorkspaceContext.Provider>
    </SpecEditorContext.Provider>
  );
}
