import { getIn, isObject, type JsonObject } from '../../../shared/structured/edits';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { asyncApiVersion, majorVersion, type AsyncLocation } from '../core/asyncapi';
import { ChannelOperationPage, ChannelPage, OperationPage } from './ChannelPages';
import { MessagePage, SchemaPage } from './ComponentPages';
import { GeneralPage } from './GeneralPage';
import { Nav } from './Nav';

/** Falls back to a parent page when the selected item no longer exists (deleted, renamed in text...). */
function validLocation(spec: JsonObject, location: AsyncLocation): AsyncLocation {
  const exists = (path: string[]) => getIn(spec, path) !== undefined;
  switch (location.kind) {
    case 'channelOperation':
      if (isObject(getIn(spec, ['channels', location.channel, location.action]))) return location;
      return validLocation(spec, { kind: 'channel', id: location.channel });
    case 'channel':
      return exists(['channels', location.id]) ? location : { kind: 'general' };
    case 'operation':
      return exists(['operations', location.id]) ? location : { kind: 'general' };
    case 'message':
      return exists(['components', 'messages', location.name]) ? location : { kind: 'general' };
    case 'schema':
      return exists(['components', 'schemas', location.name]) ? location : { kind: 'general' };
    default:
      return location;
  }
}

export function App() {
  const doc = useStructuredDocument<AsyncLocation>({ kind: 'general' });
  const { spec, errors, actions } = doc;

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading specification…</div>;
  }

  const version = asyncApiVersion(spec) ?? '';
  const major = majorVersion(spec);
  const current = validLocation(spec, doc.location);
  const context: SpecEditorContextValue<AsyncLocation> = {
    spec,
    version,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: false, open: (name) => actions.navigate({ kind: 'schema', name }) },
  };
  const unsupported = major
    ? undefined
    : version
      ? `AsyncAPI ${version} is not supported by the form editor (2.x and 3.0 are). Edit it as text.`
      : 'This file is not an AsyncAPI document (no "asyncapi" field).';

  return (
    <SpecEditorContext.Provider value={context}>
      <EditorFrame
        icon="broadcast"
        fileName={doc.fileName}
        format={doc.format}
        versionLabel={version && `AsyncAPI ${version}`}
        catalogLabel="All AsyncAPI specs"
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
        {current.kind === 'channel' && <ChannelPage key={current.id} id={current.id} />}
        {current.kind === 'operation' && <OperationPage key={current.id} id={current.id} />}
        {current.kind === 'channelOperation' && (
          <ChannelOperationPage key={`${current.channel} ${current.action}`} channel={current.channel} action={current.action} />
        )}
        {current.kind === 'message' && <MessagePage key={current.name} name={current.name} />}
        {current.kind === 'schema' && <SchemaPage key={current.name} name={current.name} />}
      </EditorFrame>
    </SpecEditorContext.Provider>
  );
}
