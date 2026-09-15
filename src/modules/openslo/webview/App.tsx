import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { apiVersion, majorVersion, type OpenSloLocation } from '../core/model';
import { EntityPage } from './EntityPage';
import { Nav } from './Nav';
import { OverviewPage } from './OverviewPage';
import { validLocation } from './state';

export function App() {
  const doc = useStructuredDocument<OpenSloLocation>({ kind: 'overview' });
  const { spec, errors, actions } = doc;

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading OpenSLO file…</div>;
  }

  const version = apiVersion(spec) ?? '';
  const major = majorVersion(spec);
  const current = validLocation(spec, doc.location);
  const context: SpecEditorContextValue<OpenSloLocation> = {
    spec,
    version,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: true, open: () => undefined },
  };
  const unsupported = major ? undefined : version ? `OpenSLO "${version}" is not supported by the form editor (openslo/v1 is). Edit it as text.` : 'This file is not an OpenSLO specification (no "apiVersion: openslo/..." field).';

  return (
    <SpecEditorContext.Provider value={context}>
      <EditorFrame
        icon="target"
        fileName={doc.fileName}
        format={doc.format}
        versionLabel={version && `OpenSLO ${version.replace(/^openslo\//, '')}`}
        catalogLabel="All OpenSLO files"
        errors={errors}
        editError={doc.editError}
        drift={doc.drift}
        onDismissEditError={doc.dismissEditError}
        onOpenText={actions.openAsText}
        onOpenCatalog={actions.openCatalog}
        extraActions={<ReworkButton request={actions.request} />}
        unsupported={unsupported}
        nav={<Nav current={current} />}
      >
        {current.kind === 'overview' && <OverviewPage />}
        {current.kind === 'entity' && <EntityPage key={current.index} index={current.index} />}
      </EditorFrame>
    </SpecEditorContext.Provider>
  );
}
