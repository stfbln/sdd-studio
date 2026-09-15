import { isObject, type Json, type JsonObject } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { InlineInput, KeyInput, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import { analyzeAsyncApi, CONTENT_TYPES, PROTOCOLS } from '../core/asyncapi';
import { idError, uniqueName, useAsync } from './state';

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value : []);

export function GeneralPage() {
  const { spec, version, major, edit, navigate, openAsText } = useAsync();
  const issues = analyzeAsyncApi(spec);
  const servers = isObject(spec.servers) ? spec.servers : {};
  const serverNames = Object.keys(servers);
  const tagsPath = major === 3 ? ['info', 'tags'] : ['tags'];
  const tags = asArray(major === 3 ? (isObject(spec.info) ? spec.info.tags : undefined) : spec.tags);
  const otherComponents = Object.entries(isObject(spec.components) ? spec.components : {}).filter(
    ([k, v]) => k !== 'schemas' && k !== 'messages' && isObject(v) && Object.keys(v).length,
  );

  return (
    <div className="page">
      <h1 className="page-title">General</h1>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Application information" icon="info">
        <div className="form-grid">
          <TextField path={['info', 'title']} label="Title" required placeholder="Order events" />
          <TextField path={['info', 'version']} label="Version" required placeholder="1.0.0" mono />
          <TextAreaField path={['info', 'description']} label="Description" placeholder="What this application publishes and consumes (Markdown supported)" />
          <TextField path={['defaultContentType']} label="Default content type" mono list="content-types" placeholder="application/json" />
          <TextField path={['id']} label="Application id" mono placeholder="urn:example:orders" />
          <TextField path={['info', 'contact', 'name']} label="Contact name" />
          <TextField path={['info', 'contact', 'email']} label="Contact email" type="email" />
          <TextField path={['info', 'license', 'name']} label="License" placeholder="Apache 2.0" />
          <TextField path={['info', 'license', 'url']} label="License URL" mono />
        </div>
        <datalist id="content-types">
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <p className="muted small">AsyncAPI version: {version}</p>
      </Section>

      <Section
        title="Servers"
        icon="server-environment"
        count={serverNames.length}
        actions={
          <IconButton
            icon="add"
            label="Add server"
            showLabel
            onClick={() =>
              edit({
                op: 'set',
                path: ['servers', uniqueName('production', serverNames)],
                value: major === 3 ? { host: 'broker.example.com', protocol: 'kafka' } : { url: 'broker.example.com', protocol: 'kafka' },
              })
            }
          />
        }
      >
        {serverNames.length === 0 && <p className="muted">No servers: add the brokers your application connects to.</p>}
        {serverNames.length > 0 && (
          <div className={`table servers-table v${major}`} role="table">
            <div className="table-head" role="row">
              <span>Name</span>
              <span>{major === 3 ? 'Host' : 'URL'}</span>
              {major === 3 && <span>Path</span>}
              <span>Protocol</span>
              <span>Description</span>
              <span />
            </div>
            {serverNames.map((name) => (
              <div key={name} className="table-row" role="row">
                <KeyInput
                  value={name}
                  className="mono"
                  ariaLabel="Server name"
                  validate={(v) => idError(v, serverNames.filter((n) => n !== name))}
                  onCommit={(v) => edit({ op: 'renameKey', path: ['servers', name], newKey: v })}
                />
                {isObject(servers[name]) && typeof (servers[name] as JsonObject).$ref === 'string' ? (
                  <code className="muted">{String((servers[name] as JsonObject).$ref)}</code>
                ) : (
                  <>
                    <InlineInput path={['servers', name, major === 3 ? 'host' : 'url']} placeholder={major === 3 ? 'broker.example.com:9092' : 'kafka://broker.example.com'} mono />
                    {major === 3 && <InlineInput path={['servers', name, 'pathname']} placeholder="/path" mono />}
                    <InlineInput path={['servers', name, 'protocol']} placeholder="protocol" mono list="protocols" />
                  </>
                )}
                <InlineInput path={['servers', name, 'description']} placeholder="Description" />
                <IconButton icon="trash" label="Remove server" onClick={() => edit({ op: 'delete', path: ['servers', name] })} />
              </div>
            ))}
          </div>
        )}
        <datalist id="protocols">
          {PROTOCOLS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Section>

      <Section
        title="Tags"
        icon="tag"
        count={tags.length}
        actions={<IconButton icon="add" label="Add tag" showLabel onClick={() => edit({ op: 'set', path: [...tagsPath, tags.length], value: { name: `tag${tags.length + 1}` } })} />}
      >
        {tags.length === 0 && <p className="muted">Tags group channels and operations in documentation tools.</p>}
        {tags.map((_, i) => (
          <div key={i} className="list-row">
            <InlineInput path={[...tagsPath, i, 'name']} placeholder="name" mono />
            <InlineInput path={[...tagsPath, i, 'description']} placeholder="Description" grow />
            <IconButton icon="trash" label="Remove tag" onClick={() => edit({ op: 'delete', path: [...tagsPath, i] })} />
          </div>
        ))}
      </Section>

      {otherComponents.length > 0 && (
        <Section title="Other components" icon="symbol-namespace">
          <p className="muted">
            {otherComponents.map(([k, v]) => `${k} (${Object.keys(v as JsonObject).length})`).join(' · ')} — kept as is; edit them{' '}
            <button type="button" className="link-button" onClick={openAsText}>
              in the text editor
            </button>
            .
          </p>
        </Section>
      )}
    </div>
  );
}
