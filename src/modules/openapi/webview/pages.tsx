import { getIn, isObject, type Json, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList as SharedProblemsList } from '../../../webview/structured/EditorFrame';
import { CheckboxField, ChipsField, Field, InlineInput, KeyInput, KindBadge, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import { SchemaEditor } from '../../../webview/structured/SchemaEditor';
import {
  analyzeSpec,
  COMMON_MEDIA_TYPES,
  COMMON_STATUS_CODES,
  HTTP_METHODS,
  pathParameterNames,
  pathTemplateError,
  pathTemplateParameters,
  PARAMETER_LOCATIONS,
  renameSchemaEdits,
  schemaKind,
  schemaNames,
  schemaUsages,
  suggestOperationId,
  type HttpMethod,
  type SpecIssue,
} from '../core/openapi';
import { useField, useSpec } from './state';

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value : []);

/* General ------------------------------------------------------------------ */

export function GeneralPage() {
  const { spec, version, edit } = useSpec();
  const servers = asArray(spec.servers);
  const tags = asArray(spec.tags);
  const issues = analyzeSpec(spec);

  const renameTag = (index: number, from: string, to: string) => {
    // Keep operations pointing at the renamed tag.
    const edits: SpecEdit[] = [{ op: 'set', path: ['tags', index, 'name'], value: to }];
    for (const [path, item] of Object.entries(isObject(spec.paths) ? spec.paths : {})) {
      for (const method of HTTP_METHODS) {
        const opTags = isObject(item) && isObject(item[method]) ? asArray(item[method].tags) : [];
        opTags.forEach((t, i) => t === from && edits.push({ op: 'set', path: ['paths', path, method, 'tags', i], value: to }));
      }
    }
    edit(edits);
  };

  return (
    <div className="page">
      <h1 className="page-title">General</h1>
      {issues.length > 0 && <ProblemsList issues={issues} />}

      <Section title="API information" icon="info">
        <div className="form-grid">
          <TextField path={['info', 'title']} label="Title" required placeholder="Orders API" />
          <TextField path={['info', 'version']} label="Version" required placeholder="1.0.0" mono />
          {version.startsWith('3.1') && <TextField path={['info', 'summary']} label="Summary" />}
          <TextAreaField path={['info', 'description']} label="Description" placeholder="What this API does (Markdown supported)" />
          <TextField path={['info', 'contact', 'name']} label="Contact name" />
          <TextField path={['info', 'contact', 'email']} label="Contact email" type="email" />
          <TextField path={['info', 'license', 'name']} label="License" placeholder="MIT" />
          <TextField path={['info', 'license', 'url']} label="License URL" mono />
        </div>
        <p className="muted small">OpenAPI version: {version}</p>
      </Section>

      <Section
        title="Servers"
        icon="server-environment"
        count={servers.length}
        actions={<IconButton icon="add" label="Add server" showLabel onClick={() => edit({ op: 'set', path: ['servers', servers.length], value: { url: 'https://' } })} />}
      >
        {servers.length === 0 && <p className="muted">No servers: clients will use the host serving this document.</p>}
        {servers.map((_, i) => (
          <div key={i} className="list-row">
            <InlineInput path={['servers', i, 'url']} placeholder="https://api.example.com/v1" mono grow />
            <InlineInput path={['servers', i, 'description']} placeholder="Description" grow />
            <IconButton icon="trash" label="Remove server" onClick={() => edit({ op: 'delete', path: ['servers', i] })} />
          </div>
        ))}
      </Section>

      <Section
        title="Tags"
        icon="tag"
        count={tags.length}
        actions={<IconButton icon="add" label="Add tag" showLabel onClick={() => edit({ op: 'set', path: ['tags', tags.length], value: { name: `tag${tags.length + 1}` } })} />}
      >
        {tags.length === 0 && <p className="muted">Tags group operations in documentation tools.</p>}
        {tags.map((tag, i) => {
          const name = isObject(tag) ? String(tag.name ?? '') : '';
          return (
            <div key={i} className="list-row">
              <KeyInput value={name} className="mono" ariaLabel="Tag name" validate={(v) => (v.trim() ? undefined : 'Name required')} onCommit={(v) => renameTag(i, name, v)} />
              <InlineInput path={['tags', i, 'description']} placeholder="Description" grow />
              <IconButton icon="trash" label="Remove tag" onClick={() => edit({ op: 'delete', path: ['tags', i] })} />
            </div>
          );
        })}
      </Section>

      <OtherComponents />
    </div>
  );
}

function OtherComponents() {
  const { spec, openAsText } = useSpec();
  const components = isObject(spec.components) ? spec.components : {};
  const others = Object.entries(components).filter(([k, v]) => k !== 'schemas' && isObject(v) && Object.keys(v).length);
  if (!others.length) return null;
  return (
    <Section title="Other components" icon="symbol-namespace">
      <p className="muted">
        {others.map(([k, v]) => `${k} (${Object.keys(v as JsonObject).length})`).join(' · ')} — kept as is; edit them{' '}
        <button type="button" className="link-button" onClick={openAsText}>
          in the text editor
        </button>
        .
      </p>
    </Section>
  );
}

export function ProblemsList({ issues }: { issues: SpecIssue[] }) {
  const { navigate } = useSpec();
  return <SharedProblemsList issues={issues} onNavigate={navigate} />;
}

/* Path --------------------------------------------------------------------- */

export function newOperation(spec: unknown, path: string, method: HttpMethod): JsonObject {
  const declared = pathParameterNames(spec, path, {});
  const missing = pathTemplateParameters(path).filter((p) => !declared.includes(p));
  return {
    operationId: suggestOperationId(method, path),
    ...(missing.length ? { parameters: missing.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })) } : {}),
    responses: method === 'post' ? { '201': { description: 'Created' } } : method === 'delete' ? { '204': { description: 'Deleted' } } : { '200': { description: 'OK' } },
  };
}

export function PathPage({ path }: { path: string }) {
  const { spec, edit, navigate } = useSpec();
  const item = getIn(spec, ['paths', path]);
  const allPaths = Object.keys(isObject(spec.paths) ? spec.paths : {});
  const methods = HTTP_METHODS.filter((m) => isObject(item) && isObject(item[m]));
  const unused = HTTP_METHODS.filter((m) => !methods.includes(m));

  const addOperation = (method: HttpMethod) => {
    edit({ op: 'set', path: ['paths', path, method], value: newOperation(spec, path, method) });
    navigate({ kind: 'operation', path, method });
  };

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-symbol-interface" aria-hidden="true" />
        <KeyInput
          value={path}
          className="mono title-input"
          ariaLabel="Path"
          validate={(v) => pathTemplateError(v, allPaths.filter((p) => p !== path))}
          onCommit={(next) => {
            edit({ op: 'renameKey', path: ['paths', path], newKey: next });
            navigate({ kind: 'path', path: next });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete path and all its operations"
          onClick={() => {
            edit({ op: 'delete', path: ['paths', path] });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">Use {'{name}'} for path parameters, e.g. /orders/{'{orderId}'}. Press Enter to rename.</p>

      <Section title="Operations" icon="list-flat" count={methods.length}>
        {methods.length === 0 && <p className="muted">No operation yet. Pick an HTTP method below.</p>}
        {methods.map((method) => {
          const op = (item as JsonObject)[method] as JsonObject;
          return (
            <button key={method} type="button" className="operation-link" onClick={() => navigate({ kind: 'operation', path, method })}>
              <KindBadge value={method} />
              <span>{String(op.summary || op.operationId || '(no summary)')}</span>
              <span className="codicon codicon-arrow-right" aria-hidden="true" />
            </button>
          );
        })}
        <div className="add-methods">
          {unused.map((method) => (
            <button key={method} type="button" className={`btn btn-secondary btn-labelled kind-add badge-${method}`} onClick={() => addOperation(method)}>
              <span className="codicon codicon-add" aria-hidden="true" /> {method.toUpperCase()}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Shared by all operations" icon="references">
        <div className="form-grid">
          <TextField path={['paths', path, 'summary']} label="Summary" />
          <TextAreaField path={['paths', path, 'description']} label="Description" />
        </div>
        <ParametersEditor basePath={['paths', path]} urlPath={path} />
      </Section>
    </div>
  );
}

/* Operation ---------------------------------------------------------------- */

export function OperationPage({ path, method }: { path: string; method: HttpMethod }) {
  const { spec, edit, navigate } = useSpec();
  const base: SpecPath = ['paths', path, method];
  const item = getIn(spec, ['paths', path]) as JsonObject;
  const definedTags = asArray(spec.tags).flatMap((t) => (isObject(t) && typeof t.name === 'string' ? [t.name] : []));
  const [operationId, setOperationId] = useField<string>([...base, 'operationId']);
  const issues = analyzeSpec(spec).filter((i) => i.location.kind === 'operation' && i.location.path === path && i.location.method === method);

  return (
    <div className="page">
      <div className="page-title-row">
        <select
          className={`keyword-select kind-select badge-${method}`}
          aria-label="HTTP method"
          value={method}
          onChange={(e) => {
            const next = e.target.value as HttpMethod;
            edit({ op: 'renameKey', path: base, newKey: next });
            navigate({ kind: 'operation', path, method: next });
          }}
        >
          {HTTP_METHODS.filter((m) => m === method || !isObject(item[m])).map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </select>
        <button type="button" className="link-button mono path-link" onClick={() => navigate({ kind: 'path', path })}>
          {path}
        </button>
        <span className="grow" />
        <CheckboxField path={[...base, 'deprecated']} label="Deprecated" />
        <IconButton
          icon="trash"
          label="Delete operation"
          onClick={() => {
            edit({ op: 'delete', path: base });
            navigate({ kind: 'path', path });
          }}
        />
      </div>
      {issues.length > 0 && <ProblemsList issues={issues} />}

      <Section title="Description" icon="note">
        <div className="form-grid">
          <TextField path={[...base, 'summary']} label="Summary" placeholder="Short sentence, e.g. List orders" />
          <Field label="Operation ID" hint="Unique name used by code generators">
            <span className="field-row">
              <input
                className="input mono grow"
                value={typeof operationId === 'string' ? operationId : ''}
                onChange={(e) => setOperationId(e.target.value)}
              />
              <IconButton icon="sparkle" label="Generate from method and path" onClick={() => setOperationId(suggestOperationId(method, path))} />
            </span>
          </Field>
          <ChipsField
            path={[...base, 'tags']}
            label="Tags"
            placeholder="Add tag"
            suggestions={definedTags}
            chipWarning={(t) => (definedTags.includes(t) ? undefined : 'Not declared in the General › Tags list')}
          />
          <TextAreaField path={[...base, 'description']} label="Description" />
        </div>
      </Section>

      <Section title="Parameters" icon="symbol-parameter">
        <ParametersEditor basePath={base} urlPath={path} />
      </Section>

      <RequestBodySection base={base} method={method} />
      <ResponsesSection base={base} />
    </div>
  );
}

function ParametersEditor({ basePath, urlPath }: { basePath: SpecPath; urlPath: string }) {
  const { spec, edit } = useSpec();
  const parameters = asArray(getIn(spec, [...basePath, 'parameters']));
  const isOperation = basePath.length === 3;
  const inherited = isOperation ? asArray(getIn(spec, ['paths', urlPath, 'parameters'])) : [];
  const declared = pathParameterNames(spec, urlPath, isOperation ? (getIn(spec, basePath) as JsonObject) : {});
  const missing = pathTemplateParameters(urlPath).filter((p) => !declared.includes(p));

  const add = (value: JsonObject) => edit({ op: 'set', path: [...basePath, 'parameters', parameters.length], value });

  return (
    <div className="parameters">
      {missing.length > 0 && (
        <div className="notice notice-warning">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            Path parameter{missing.length > 1 ? 's' : ''} {missing.map((m) => `{${m}}`).join(', ')} not declared.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-labelled"
            onClick={() =>
              edit(
                missing.map((name, i): SpecEdit => ({
                  op: 'set',
                  path: [...basePath, 'parameters', parameters.length + i],
                  value: { name, in: 'path', required: true, schema: { type: 'string' } },
                })),
              )
            }
          >
            Declare {missing.length > 1 ? 'them' : 'it'}
          </button>
        </div>
      )}

      {(parameters.length > 0 || inherited.length > 0) && (
        <div className="table parameters-table" role="table">
          <div className="table-head" role="row">
            <span>Name</span>
            <span>In</span>
            <span>Type</span>
            <span title="Required">Req.</span>
            <span>Description</span>
            <span />
          </div>
          {inherited.map((p, i) => (
            <div key={`inherited-${i}`} className="table-row inherited" role="row" title="Declared on the path, shared by all operations">
              <span className="mono">{isObject(p) ? String(p.name ?? p.$ref ?? '') : ''}</span>
              <span>{isObject(p) ? String(p.in ?? '') : ''}</span>
              <span className="muted">from path</span>
              <span />
              <span />
              <span />
            </div>
          ))}
          {parameters.map((p, i) => {
            const rowPath = [...basePath, 'parameters', i];
            if (!isObject(p) || typeof p.$ref === 'string') {
              return (
                <div key={i} className="table-row" role="row">
                  <span className="mono muted" title="Reference to a shared parameter">
                    {isObject(p) ? String(p.$ref).split('/').pop() : '?'}
                  </span>
                  <span className="muted">reference</span>
                  <span />
                  <span />
                  <span />
                  <IconButton icon="trash" label="Remove parameter" onClick={() => edit({ op: 'delete', path: rowPath })} />
                </div>
              );
            }
            return <ParameterRow key={i} path={rowPath} parameter={p} />;
          })}
        </div>
      )}
      <div className="row-buttons">
        <IconButton icon="add" label="Query parameter" showLabel onClick={() => add({ name: 'param', in: 'query', schema: { type: 'string' } })} />
        <IconButton icon="add" label="Header" showLabel onClick={() => add({ name: 'X-Header', in: 'header', schema: { type: 'string' } })} />
      </div>
    </div>
  );
}

function ParameterRow({ path, parameter }: { path: SpecPath; parameter: JsonObject }) {
  const { edit } = useSpec();
  const isPath = parameter.in === 'path';
  const kind = schemaKind(parameter.schema);
  return (
    <div className="table-row" role="row">
      <InlineInput path={[...path, 'name']} mono placeholder="name" />
      <select
        className="keyword-select compact"
        aria-label="Location"
        value={String(parameter.in ?? 'query')}
        onChange={(e) =>
          edit([
            { op: 'set', path: [...path, 'in'], value: e.target.value },
            ...(e.target.value === 'path' ? [{ op: 'set', path: [...path, 'required'], value: true } as SpecEdit] : []),
          ])
        }
      >
        {PARAMETER_LOCATIONS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      {parameter.schema !== undefined || !parameter.content ? (
        <select
          className="keyword-select compact"
          aria-label="Type"
          value={['string', 'integer', 'number', 'boolean', 'array'].includes(kind) ? kind : 'string'}
          onChange={(e) =>
            edit({
              op: 'set',
              path: [...path, 'schema'],
              value: e.target.value === 'array' ? { type: 'array', items: { type: 'string' } } : { type: e.target.value },
            })
          }
        >
          {['string', 'integer', 'number', 'boolean', 'array'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : (
        <span className="muted">content</span>
      )}
      <input
        type="checkbox"
        aria-label="Required"
        checked={isPath || parameter.required === true}
        disabled={isPath}
        title={isPath ? 'Path parameters are always required' : undefined}
        onChange={(e) => edit(e.target.checked ? { op: 'set', path: [...path, 'required'], value: true } : { op: 'delete', path: [...path, 'required'] })}
      />
      <InlineInput path={[...path, 'description']} placeholder="Description" />
      <IconButton icon="trash" label="Remove parameter" onClick={() => edit({ op: 'delete', path })} />
    </div>
  );
}

function RequestBodySection({ base, method }: { base: SpecPath; method: HttpMethod }) {
  const { spec, edit } = useSpec();
  const body = getIn(spec, [...base, 'requestBody']);
  if (!isObject(body)) {
    return (
      <Section title="Request body" icon="arrow-up">
        <p className="muted">
          {['get', 'head', 'delete'].includes(method) ? `${method.toUpperCase()} requests usually have no body. ` : 'No request body. '}
          <button
            type="button"
            className="link-button"
            onClick={() => edit({ op: 'set', path: [...base, 'requestBody'], value: { required: true, content: { 'application/json': { schema: { type: 'object', properties: {} } } } } })}
          >
            Add a request body
          </button>
        </p>
      </Section>
    );
  }
  if (typeof body.$ref === 'string') {
    return (
      <Section title="Request body" icon="arrow-up">
        <p className="muted">
          Shared request body <code>{body.$ref}</code> (edit in text).
        </p>
      </Section>
    );
  }
  return (
    <Section
      title="Request body"
      icon="arrow-up"
      actions={<IconButton icon="trash" label="Remove request body" onClick={() => edit({ op: 'delete', path: [...base, 'requestBody'] })} />}
    >
      <div className="inline-fields">
        <CheckboxField path={[...base, 'requestBody', 'required']} label="Required" />
        <InlineInput path={[...base, 'requestBody', 'description']} placeholder="Description" grow />
      </div>
      <ContentEditor path={[...base, 'requestBody', 'content']} />
    </Section>
  );
}

function ResponsesSection({ base }: { base: SpecPath }) {
  const { spec, edit } = useSpec();
  const responses = getIn(spec, [...base, 'responses']);
  const codes = Object.keys(isObject(responses) ? responses : {});
  const available = COMMON_STATUS_CODES.filter((c) => !codes.includes(c));

  return (
    <Section
      title="Responses"
      icon="arrow-down"
      count={codes.length}
      actions={
        <select
          className="keyword-select"
          aria-label="Add response"
          value=""
          onChange={(e) => e.target.value && edit({ op: 'set', path: [...base, 'responses', e.target.value], value: { description: defaultDescription(e.target.value) } })}
        >
          <option value="">+ Add response…</option>
          {available.map((c) => (
            <option key={c} value={c}>
              {c} {defaultDescription(c)}
            </option>
          ))}
        </select>
      }
    >
      {codes.length === 0 && <p className="notice notice-warning">At least one response is required.</p>}
      {codes.map((code) => {
        const responsePath = [...base, 'responses', code];
        const response = getIn(spec, responsePath);
        const isRef = isObject(response) && typeof response.$ref === 'string';
        return (
          <div key={code} className={`response status-${code[0]}`}>
            <div className="response-head">
              <KeyInput
                value={code}
                className="mono status-input"
                ariaLabel="Status code"
                validate={(v) => (!/^([1-5]\d\d|[1-5]XX|default)$/.test(v) ? 'Use 100-599, 2XX or default' : codes.includes(v) ? 'Already defined' : undefined)}
                onCommit={(v) => edit({ op: 'renameKey', path: responsePath, newKey: v })}
              />
              {isRef ? (
                <code className="muted grow">{String((response as JsonObject).$ref)}</code>
              ) : (
                <InlineInput path={[...responsePath, 'description']} placeholder="Description (required)" grow />
              )}
              <IconButton icon="trash" label="Remove response" onClick={() => edit({ op: 'delete', path: responsePath })} />
            </div>
            {!isRef && <ContentEditor path={[...responsePath, 'content']} optional />}
          </div>
        );
      })}
    </Section>
  );
}

function defaultDescription(code: string): string {
  const texts: Record<string, string> = {
    '200': 'OK', '201': 'Created', '202': 'Accepted', '204': 'No content', '400': 'Bad request', '401': 'Unauthorized',
    '403': 'Forbidden', '404': 'Not found', '409': 'Conflict', '422': 'Unprocessable entity', '500': 'Server error', default: 'Unexpected error',
  };
  return texts[code] ?? '';
}

/** Media types (application/json...) each with a schema. */
function ContentEditor({ path, optional }: { path: SpecPath; optional?: boolean }) {
  const { spec, edit } = useSpec();
  const content = getIn(spec, path);
  const types = Object.keys(isObject(content) ? content : {});
  const addType = (type: string) => edit({ op: 'set', path: [...path, type], value: { schema: { type: 'object', properties: {} } } });

  return (
    <div className="content">
      {types.map((type) => (
        <div key={type} className="media">
          <div className="media-head">
            <KeyInput
              value={type}
              className="mono media-input"
              ariaLabel="Media type"
              validate={(v) => (!/^[\w.+-]+\/[\w.+*-]+$|^\*\/\*$/.test(v) ? 'Use type/subtype' : types.includes(v) ? 'Already defined' : undefined)}
              onCommit={(v) => edit({ op: 'renameKey', path: [...path, type], newKey: v })}
            />
            <IconButton icon="trash" label="Remove media type" onClick={() => edit({ op: 'delete', path: types.length === 1 && optional ? path : [...path, type] })} />
          </div>
          {isObject(getIn(spec, [...path, type, 'schema'])) ? (
            <SchemaEditor path={[...path, type, 'schema']} depth={1} />
          ) : (
            <button type="button" className="link-button" onClick={() => edit({ op: 'set', path: [...path, type, 'schema'], value: { type: 'string' } })}>
              Add a schema
            </button>
          )}
        </div>
      ))}
      <select className="keyword-select add-media" aria-label="Add body" value="" onChange={(e) => e.target.value && addType(e.target.value)}>
        <option value="">{types.length ? '+ Other media type…' : optional ? '+ Add a body…' : '+ Add media type…'}</option>
        {COMMON_MEDIA_TYPES.filter((t) => !types.includes(t)).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

/* Schema ------------------------------------------------------------------- */

export function SchemaPage({ name }: { name: string }) {
  const { spec, edit, navigate } = useSpec();
  const usages = schemaUsages(spec, name).filter((u) => !(u.location.kind === 'schema' && u.location.name === name));
  const names = schemaNames(spec);

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-symbol-structure" aria-hidden="true" />
        <KeyInput
          value={name}
          className="title-input mono"
          ariaLabel="Schema name"
          validate={(v) => (!/^[A-Za-z0-9._-]+$/.test(v) ? 'Letters, digits, . _ - only' : names.includes(v) ? 'Already exists' : undefined)}
          onCommit={(next) => {
            edit(renameSchemaEdits(spec, name, next));
            navigate({ kind: 'schema', name: next });
          }}
        />
        <IconButton
          icon="trash"
          label={usages.length ? `Delete (still used ${usages.length} time${usages.length > 1 ? 's' : ''})` : 'Delete schema'}
          onClick={() => {
            edit({ op: 'delete', path: ['components', 'schemas', name] });
            navigate({ kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">Renaming updates every reference to this schema.</p>

      <Section title="Definition" icon="symbol-structure">
        <SchemaEditor path={['components', 'schemas', name]} />
      </Section>

      <Section title="Used by" icon="references" count={usages.length}>
        {usages.length === 0 && <p className="muted">Not referenced anywhere yet.</p>}
        {usages.map((u, i) => (
          <button key={i} type="button" className="operation-link" onClick={() => navigate(u.location)}>
            <span className="codicon codicon-arrow-right" aria-hidden="true" /> {u.label}
          </button>
        ))}
      </Section>
    </div>
  );
}
