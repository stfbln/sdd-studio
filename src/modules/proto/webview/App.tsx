import { useMemo } from 'react';
import { ReworkButton } from '../../../webview/components/ReworkButton';
import { EditorFrame, ErrorPanel } from '../../../webview/structured/EditorFrame';
import { useStructuredDocument, type LocalEngine } from '../../../webview/structured/useStructuredDocument';
import { analyzeProto, findEnum, findMessage, importInfos, knownTypes, type ProtoLocation } from '../core/analysis';
import { applyToDocument, type ProtoDocument } from '../core/document';
import type { ProtoEdit } from '../core/edits';
import type { ProtoFile } from '../core/model';
import { EnumPage } from './EnumPage';
import { GeneralPage } from './GeneralPage';
import { MessagePage } from './MessagePage';
import { Nav } from './Nav';
import { RpcPage, ServicePage } from './ServicePages';
import { ProtoContext, type ProtoEditorValue, type ProtoHostContext } from './state';

const engine: LocalEngine<ProtoDocument, ProtoEdit> = {
  fromHost: (value) => value as ProtoDocument,
  apply: applyToDocument,
  typingKey: (edit) => {
    switch (edit.op) {
      case 'setComment':
      case 'setNumber':
        return `${edit.op} ${JSON.stringify(edit.target)}`;
      case 'setOption':
        return edit.value === undefined ? undefined : `${edit.op} ${JSON.stringify(edit.target)} ${edit.name}`;
      default:
        return undefined;
    }
  },
};

/** Falls back to a parent page when the selected element no longer exists (deleted, renamed in text...). */
function validLocation(file: ProtoFile, location: ProtoLocation): ProtoLocation {
  switch (location.kind) {
    case 'service':
      return file.services.some((s) => s.name === location.name) ? location : { kind: 'general' };
    case 'rpc': {
      const service = file.services.find((s) => s.name === location.service);
      if (service?.rpcs.some((r) => r.name === location.name)) return location;
      return service ? { kind: 'service', name: service.name } : { kind: 'general' };
    }
    case 'message':
    case 'enum': {
      if (location.kind === 'message' ? findMessage(file, location.path) : findEnum(file, location.path)) return location;
      for (let n = location.path.length - 1; n > 0; n--) {
        const parent = location.path.slice(0, n);
        if (findMessage(file, parent)) return { kind: 'message', path: parent };
      }
      return { kind: 'general' };
    }
    default:
      return location;
  }
}

export function App() {
  const doc = useStructuredDocument<ProtoLocation, ProtoDocument, ProtoEdit>({ kind: 'general' }, engine);
  const { spec, errors, actions } = doc;
  const host = doc.hostContext as ProtoHostContext | undefined;

  const derived = useMemo(() => {
    if (!spec) return undefined;
    const imports = importInfos(spec.file, host?.imports);
    return { imports, types: knownTypes(spec.file, imports), issues: analyzeProto(spec.file, imports) };
  }, [spec, host]);

  if (!spec || !derived) {
    return errors ? <ErrorPanel errors={errors} onOpenText={actions.openAsText} /> : <div className="loading">Loading proto file…</div>;
  }

  const { file } = spec;
  const syntax = file.syntax?.keyword === 'edition' ? 'editions' : file.syntax?.value === 'proto3' ? 'proto3' : 'proto2';
  const current = validLocation(file, doc.location);
  const context: ProtoEditorValue = {
    doc: spec,
    file,
    syntax,
    imports: derived.imports,
    available: host?.available ?? [],
    types: derived.types,
    issues: derived.issues,
    edit: actions.edit,
    navigate: actions.navigate,
    openAsText: actions.openAsText,
    openFile: actions.openFile,
  };
  const versionLabel = file.syntax ? (file.syntax.keyword === 'edition' ? `edition ${file.syntax.value}` : file.syntax.value) : 'proto2 (implicit)';

  return (
    <ProtoContext.Provider value={context}>
      <EditorFrame
        icon="symbol-interface"
        fileName={doc.fileName}
        format="proto"
        versionLabel={`${versionLabel}${file.package ? ` · ${file.package.name}` : ''}`}
        catalogLabel="All proto files"
        errors={errors}
        editError={doc.editError}
        drift={false}
        onDismissEditError={doc.dismissEditError}
        onOpenText={actions.openAsText}
        onOpenCatalog={actions.openCatalog}
        extraActions={<ReworkButton request={actions.request} />}
        nav={<Nav current={current} />}
      >
        {current.kind === 'general' && <GeneralPage />}
        {current.kind === 'service' && <ServicePage key={current.name} name={current.name} />}
        {current.kind === 'rpc' && <RpcPage key={`${current.service} ${current.name}`} service={current.service} name={current.name} />}
        {current.kind === 'message' && <MessagePage key={current.path.join('/')} path={current.path} />}
        {current.kind === 'enum' && <EnumPage key={current.path.join('/')} path={current.path} />}
      </EditorFrame>
    </ProtoContext.Provider>
  );
}
