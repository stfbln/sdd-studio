import { useId, useState } from 'react';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { IconButton } from '../../../webview/components/IconButton';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import { countRpcs, listEnums, listMessages, PACKAGE_NAME, plural, WELL_KNOWN_IMPORTS } from '../core/analysis';
import { OptionCheckbox, OptionSelect, OptionTextField, OtherOptions } from './controls';
import { useProto } from './state';

const FILE_OPTIONS = [
  { name: 'go_package', label: 'Go package', placeholder: 'github.com/acme/api/gen/orders/v1;ordersv1' },
  { name: 'java_package', label: 'Java package', placeholder: 'com.acme.orders.v1' },
  { name: 'java_outer_classname', label: 'Java outer class', placeholder: 'OrderServiceProto' },
  { name: 'csharp_namespace', label: 'C# namespace', placeholder: 'Acme.Orders.V1' },
  { name: 'php_namespace', label: 'PHP namespace', placeholder: 'Acme\\Orders\\V1' },
  { name: 'ruby_package', label: 'Ruby package', placeholder: 'Acme::Orders::V1' },
  { name: 'objc_class_prefix', label: 'Objective-C prefix', placeholder: 'AOX' },
  { name: 'swift_prefix', label: 'Swift prefix', placeholder: '' },
];
const HANDLED_OPTIONS = [...FILE_OPTIONS.map((o) => o.name), 'java_multiple_files', 'optimize_for', 'deprecated', 'cc_enable_arenas'];

function ImportsSection() {
  const { file, imports, available, edit, openFile, openAsText } = useProto();
  const [draft, setDraft] = useState('');
  const listId = useId();
  const suggestions = [...new Set([...available.map((f) => f.importPath), ...Object.keys(WELL_KNOWN_IMPORTS)])].filter((p) => !file.imports.some((i) => i.path === p));
  const add = () => {
    const path = draft.trim().replace(/^["']|["']$/g, '');
    if (!path) return;
    edit({ op: 'addImport', path });
    setDraft('');
  };

  return (
    <Section title="Imports" icon="references" count={file.imports.length}>
      {file.imports.length === 0 && <p className="muted">No imports. Picking a type from another file (Timestamp, a message of another file…) adds its import.</p>}
      {file.imports.map((i) => {
        const info = imports.find((x) => x.path === i.path);
        const status = info?.wellKnown ? 'well-known' : info?.resolved ? 'found' : 'missing';
        return (
          <div key={i.path} className="import-row">
            <span
              className={`codicon ${status === 'missing' ? 'codicon-warning warning-text' : 'codicon-check'}`}
              title={
                status === 'well-known'
                  ? 'Well-known type shipped with protoc'
                  : status === 'found'
                    ? `Found: ${info!.resolved}`
                    : 'Not found in the workspace: its types are not checked (add its folder to the sdd.proto.importPaths setting)'
              }
              aria-hidden="true"
            />
            {i.modifier && <span className="badge">{i.modifier}</span>}
            {status === 'found' ? (
              <button type="button" className="link-button mono" title={`Open ${info!.resolved}`} onClick={() => openFile(info!.resolved!)}>
                {i.path}
              </button>
            ) : (
              <span className="mono">{i.path}</span>
            )}
            <span className="muted small">{info?.types.length ? plural(info.types.length, 'type') : ''}</span>
            <span className="row-buttons">
              <IconButton icon="go-to-file" label="Show in text" onClick={() => openAsText(i.line)} />
              <IconButton icon="trash" label="Remove import" onClick={() => edit({ op: 'removeImport', path: i.path })} />
            </span>
          </div>
        );
      })}
      <div className="add-row">
        <input
          className="input mono"
          list={listId}
          value={draft}
          placeholder="google/protobuf/timestamp.proto"
          aria-label="Import path"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <IconButton icon="add" label="Add import" showLabel variant="secondary" disabled={!draft.trim()} onClick={add} />
      </div>
    </Section>
  );
}

export function GeneralPage() {
  const { file, edit, issues, navigate, syntax } = useProto();
  const editions = file.syntax?.keyword === 'edition';

  return (
    <div className="page">
      <h1 className="page-title">General</h1>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="File" icon="file-code">
        <div className="form-grid">
          <Field label="Syntax" hint={syntax === 'proto2' ? 'proto3 is recommended for new APIs' : undefined}>
            {editions ? (
              <input className="input mono" value={`edition ${file.syntax!.value}`} readOnly title="Editions are edited as text" />
            ) : (
              <select className="keyword-select" value={file.syntax?.value ?? ''} onChange={(e) => edit({ op: 'setSyntax', value: e.target.value })}>
                {!file.syntax && <option value="">(not set: proto2)</option>}
                <option value="proto3">proto3</option>
                <option value="proto2">proto2</option>
              </select>
            )}
          </Field>
          <Field label="Package" hint="Namespace of every type in this file, usually versioned: acme.orders.v1">
            <KeyInput
              value={file.package?.name ?? ''}
              className="mono"
              placeholder="acme.orders.v1"
              ariaLabel="Package"
              validate={(v) => (v && !PACKAGE_NAME.test(v) ? 'Dot-separated names: letters, digits, _' : undefined)}
              onCommit={(value) => edit({ op: 'setPackage', value })}
            />
          </Field>
        </div>
        <p className="muted small">
          {[plural(file.services.length, 'service'), plural(countRpcs(file.services), 'RPC'), plural(listMessages(file).length, 'message'), plural(listEnums(file).length, 'enum')].join(' · ')}
        </p>
      </Section>

      <ImportsSection />

      <Section title="Code generation options" icon="settings">
        <div className="form-grid">
          {FILE_OPTIONS.map((o) => (
            <OptionTextField key={o.name} target={[]} options={file.options} name={o.name} label={o.label} placeholder={o.placeholder} />
          ))}
          <OptionSelect target={[]} options={file.options} name="optimize_for" label="Optimize for" choices={['SPEED', 'CODE_SIZE', 'LITE_RUNTIME']} />
        </div>
        <div className="inline-fields">
          <OptionCheckbox target={[]} options={file.options} name="java_multiple_files" label="Java: one file per type" />
          <OptionCheckbox target={[]} options={file.options} name="cc_enable_arenas" label="C++ arenas" />
          <OptionCheckbox target={[]} options={file.options} name="deprecated" label="Deprecated file" />
        </div>
        <OtherOptions options={file.options} handled={HANDLED_OPTIONS} />
      </Section>

      {file.extends.length > 0 && (
        <p className="notice">
          <span className="codicon codicon-info" /> {file.extends.length} extend block(s) ({file.extends.map((e) => e.target).join(', ')}) are kept but edited as text.
        </p>
      )}
    </div>
  );
}
