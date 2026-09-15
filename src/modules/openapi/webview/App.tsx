import { getIn, isObject, type JsonObject } from '../../../shared/structured/edits';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { isSupportedSpec, openApiVersion, type SpecLocation } from '../core/openapi';
import { Nav } from './Nav';
import { GeneralPage, OperationPage, PathPage, SchemaPage } from './pages';

/** Falls back to a parent page when the selected item no longer exists (deleted, renamed in text...). */
function validLocation(spec: JsonObject, location: SpecLocation): SpecLocation {
  switch (location.kind) {
    case 'operation':
      if (isObject(getIn(spec, ['paths', location.path, location.method]))) return location;
      return validLocation(spec, { kind: 'path', path: location.path });
    case 'path':
      return getIn(spec, ['paths', location.path]) !== undefined ? location : { kind: 'general' };
    case 'schema':
      return getIn(spec, ['components', 'schemas', location.name]) !== undefined ? location : { kind: 'general' };
    default:
      return location;
  }
}

export function App() {
  const doc = useStructuredDocument<SpecLocation>({ kind: 'general' });
  const { spec, errors, actions } = doc;

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading specification…</div>;
  }

  const version = openApiVersion(spec) ?? '';
  const current = validLocation(spec, doc.location);
  const context: SpecEditorContextValue<SpecLocation> = {
    spec,
    version,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: !version.startsWith('3.1'), open: (name) => actions.navigate({ kind: 'schema', name }) },
  };
  const unsupported = isSupportedSpec(spec)
    ? undefined
    : typeof spec.swagger === 'string'
      ? `Swagger ${spec.swagger} documents are not supported by the form editor. Convert the file to OpenAPI 3 to edit it here.`
      : 'This file is not an OpenAPI 3.0 / 3.1 document (no "openapi: 3.x" field).';

  return (
    <SpecEditorContext.Provider value={context}>
      <EditorFrame
        icon="json"
        fileName={doc.fileName}
        format={doc.format}
        versionLabel={version && `OpenAPI ${version}`}
        catalogLabel="All API specs"
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
        {current.kind === 'general' && <GeneralPage />}
        {current.kind === 'path' && <PathPage key={current.path} path={current.path} />}
        {current.kind === 'operation' && <OperationPage key={`${current.path} ${current.method}`} path={current.path} method={current.method} />}
        {current.kind === 'schema' && <SchemaPage key={current.name} name={current.name} />}
      </EditorFrame>
    </SpecEditorContext.Provider>
  );
}
