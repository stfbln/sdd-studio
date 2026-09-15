import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { otmVersion, type OtmLocation } from '../core/otm';
import { AssetPage, ComponentPage, DataflowPage, MitigationPage, ThreatPage, TrustZonePage } from './ItemPages';
import { Nav } from './Nav';
import { ProjectPage } from './ProjectPage';
import { validLocation } from './state';

const PAGES = {
  trustZones: TrustZonePage,
  components: ComponentPage,
  dataflows: DataflowPage,
  assets: AssetPage,
  threats: ThreatPage,
  mitigations: MitigationPage,
};

export function App() {
  const doc = useStructuredDocument<OtmLocation>({ kind: 'project' });
  const { spec, errors, actions } = doc;

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading threat model…</div>;
  }

  const version = otmVersion(spec) ?? '';
  const current = validLocation(spec, doc.location);
  const context: SpecEditorContextValue<OtmLocation> = {
    spec,
    version,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: false, open: () => {} },
  };
  const Page = current.kind === 'item' ? PAGES[current.collection] : undefined;

  return (
    <SpecEditorContext.Provider value={context}>
      <EditorFrame
        icon="shield"
        fileName={doc.fileName}
        format={doc.format}
        versionLabel={version && `OTM ${version}`}
        catalogLabel="All threat models"
        errors={errors}
        editError={doc.editError}
        drift={doc.drift}
        onDismissEditError={doc.dismissEditError}
        onOpenText={actions.openAsText}
        onOpenCatalog={actions.openCatalog}
        extraActions={<ReworkButton request={actions.request} />}
        unsupported={Object.keys(spec).length && !('otmVersion' in spec) ? 'This file is not an Open Threat Model document (no "otmVersion" field).' : undefined}
        nav={<Nav current={current} />}
      >
        {Page && current.kind === 'item' ? <Page key={`${current.collection}-${current.index}`} index={current.index} /> : <ProjectPage />}
      </EditorFrame>
    </SpecEditorContext.Provider>
  );
}
