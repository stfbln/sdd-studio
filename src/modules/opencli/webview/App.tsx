import { isObject, type JsonObject } from '../../../shared/structured/edits';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { SpecEditorContext, type SpecEditorContextValue } from '../../../webview/structured/state';
import { useStructuredDocument } from '../../../webview/structured/useStructuredDocument';
import { getCommand, openCliVersion, type CliLocation } from '../core/opencli';
import { CommandPage } from './CommandPage';
import { GeneralPage } from './GeneralPage';
import { Nav } from './Nav';

/** Falls back to the closest existing parent when a command no longer exists (deleted, renamed in text...). */
function validLocation(spec: JsonObject, location: CliLocation): CliLocation {
  if (location.kind !== 'command') return location;
  for (let depth = location.names.length; depth >= 0; depth--) {
    const names = location.names.slice(0, depth);
    if (getCommand(spec, names)) return depth === location.names.length ? location : { kind: 'command', names };
  }
  return { kind: 'general' };
}

export function App() {
  const doc = useStructuredDocument<CliLocation>({ kind: 'command', names: [] });
  const { spec, errors, actions } = doc;

  if (!spec) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading CLI description…</div>;
  }

  const version = openCliVersion(spec) ?? '';
  const current = validLocation(spec, doc.location);
  const context: SpecEditorContextValue<CliLocation> = {
    spec,
    version,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: () => actions.openAsText(),
    schemaOptions: { nullableKeyword: false, open: () => undefined },
  };
  const unsupported =
    version || isObject(spec.info) || isObject(spec.command) ? undefined : 'This file is not an OpenCLI description (no "opencli" field).';

  return (
    <SpecEditorContext.Provider value={context}>
      <EditorFrame
        icon="terminal"
        fileName={doc.fileName}
        format={doc.format}
        versionLabel={version && `OpenCLI ${version}`}
        catalogLabel="All CLI specs"
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
        {current.kind === 'command' && <CommandPage key={JSON.stringify(current.names)} names={current.names} />}
      </EditorFrame>
    </SpecEditorContext.Provider>
  );
}
