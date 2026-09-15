import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import type { CatalogHostMessage, CatalogState, CatalogWebviewMessage, SpecSummary } from '../../shared/catalog';
import { baseName, fileNameError, folderError, joinPath, normalizeFolder, parentFolder, replaceExtension, withExtension } from '../../shared/files';
import { slugify, withArticle } from '../../shared/naming';
import { IconButton } from '../components/IconButton';
import { requestFocus } from '../focus';
import { onHostMessage, vscode } from '../vscode';
import { buildFolderTree, folderKey, type FolderNode } from './folderTree';

type Request = (build: (requestId: number) => CatalogWebviewMessage) => Promise<string | undefined>;
interface Target {
  workspace: number;
  folder: string;
}

const post = (message: CatalogWebviewMessage) => vscode.postMessage(message);
const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MAX_TAGS = 4;
const NUMBER_PREFIX = /^(\d{3,5})-/;

/** Next "NNNN-" prefix for a kind whose files are numbered (e.g. ADRs), from the files already in the target folder. */
function nextNumberedPrefix(specs: SpecSummary[], target: Target): string {
  const folder = normalizeFolder(target.folder);
  const numbers = specs
    .filter((s) => s.workspace === target.workspace && parentFolder(s.path) === folder)
    .map((s) => Number(NUMBER_PREFIX.exec(baseName(s.path))?.[1]))
    .filter((n) => !Number.isNaN(n));
  return `${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, '0')}-`;
}

/** Page listing every spec of one kind (features, API specs...) by folder. */
export function CatalogApp() {
  const [state, setState] = useState<CatalogState | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<Target | null>(null);
  const [actionError, setActionError] = useState<string>();
  const pending = useRef(new Map<number, (error?: string) => void>());
  const nextRequestId = useRef(1);

  const request: Request = (build) =>
    new Promise((resolve) => {
      const id = nextRequestId.current++;
      pending.current.set(id, resolve);
      post(build(id));
    });

  useEffect(() => {
    const dispose = onHostMessage<CatalogHostMessage>((message) => {
      switch (message.type) {
        case 'state': {
          const { type: _type, ...next } = message;
          setState(next);
          setTarget((t) => t ?? { workspace: 0, folder: next.defaultFolder });
          document.title = next.info.title;
          break;
        }
        case 'result':
          pending.current.get(message.requestId)?.(message.error);
          pending.current.delete(message.requestId);
          break;
        case 'prepareCreate':
          setTarget({ workspace: message.workspace, folder: message.folder });
          requestFocus('create:name');
          break;
      }
    });
    post({ type: 'ready' });
    return dispose;
  }, []);

  const tree = useMemo(() => (state ? buildFolderTree(state, filter) : []), [state, filter]);

  if (!state || !target) return <div className="loading">Loading…</div>;
  const { info } = state;
  if (!state.workspaces.length) {
    return <div className="empty">Open a folder or workspace to manage its {info.plural}.</div>;
  }

  const folderCount = new Set(state.specs.map((s) => folderKey(s.workspace, parentFolder(s.path)))).size;
  const runAction: Request = async (build) => {
    const error = await request(build);
    setActionError(error);
    return error;
  };

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const prepareCreate = (workspace: number, folder: string) => {
    setTarget({ workspace, folder });
    requestFocus('create:name');
  };

  const allKeys = (n: FolderNode): string[] => [n.key, ...n.folders.flatMap(allKeys)];

  return (
    <div className="overview">
      <header className="overview-header">
        <div className="overview-title">
          <span className={`codicon codicon-${info.icon}`} aria-hidden="true" />
          <h1>{info.title}</h1>
          <span className="muted">
            {plural(state.specs.length, info.singular, info.plural)} in {plural(folderCount, 'folder')}
          </span>
        </div>
        <div className="overview-tools">
          <label className="search">
            <span className="codicon codicon-search" aria-hidden="true" />
            <input className="input" type="search" placeholder="Filter by name, path or tag" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
          <IconButton icon="collapse-all" label="Collapse all folders" onClick={() => setCollapsed(new Set(tree.flatMap(allKeys)))} />
          <IconButton icon="refresh" label="Refresh" onClick={() => post({ type: 'refresh' })} />
        </div>
      </header>

      <CreateForm state={state} target={target} onTargetChange={setTarget} request={request} />

      {actionError && (
        <div className="notice notice-error" role="alert">
          <span className="codicon codicon-error" aria-hidden="true" />
          <span>{actionError}</span>
          <IconButton icon="close" label="Dismiss" onClick={() => setActionError(undefined)} />
        </div>
      )}

      <section className="tree" aria-label={info.title}>
        {tree.map((root) => (
          <FolderView
            key={root.key}
            node={root}
            depth={0}
            state={state}
            collapsed={filter.trim() ? new Set() : collapsed}
            target={target}
            onToggle={toggle}
            onPrepareCreate={prepareCreate}
            request={runAction}
          />
        ))}
        {filter.trim() && tree.every((r) => r.total === 0) && (
          <p className="muted empty">
            No {info.singular} matches “{filter}”.
          </p>
        )}
      </section>
    </div>
  );
}

/* Creation form ------------------------------------------------------------ */

interface FormProps {
  state: CatalogState;
  target: Target;
  onTargetChange: (target: Target) => void;
  request: Request;
}

function CreateForm({ state, target, onTargetChange, request }: FormProps) {
  const { info } = state;
  const extensions = [...new Set([...info.formats.map((f) => f.extension), ...info.acceptedExtensions])];
  const [name, setName] = useState('');
  const [formatIndex, setFormatIndex] = useState(0);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [openAfter, setOpenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<string>();

  const extension = info.formats[formatIndex]?.extension ?? extensions[0];
  const slug = slugify(name, info.fileNameSeparator);
  const numberedPrefix = info.numberedFiles ? nextNumberedPrefix(state.specs, target) : '';
  const fileName = customFileName ?? (slug ? numberedPrefix + slug + extension : '');
  const finalFileName = fileName ? withExtension(fileName, extensions, extension) : '';
  const folder = normalizeFolder(target.folder);
  const fullPath = joinPath(folder, finalFileName || `<file-name>${extension}`);
  const folderOptions = state.folders.filter((f) => f.workspace === target.workspace && f.exists).map((f) => f.path);
  const isNewFolder = folder !== '' && !folderOptions.includes(folder);
  const duplicate = state.specs.some((s) => s.workspace === target.workspace && s.path.toLowerCase() === fullPath.toLowerCase());
  const problem =
    folderError(target.folder) ??
    (name.trim() || customFileName !== null ? fileNameError(fileName, extensions) : undefined) ??
    (duplicate ? `${fullPath} already exists` : undefined);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(`Enter ${withArticle(info.singular)} name`);
      requestFocus('create:name');
      return;
    }
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const failure = await request((requestId) => ({
      type: 'createSpec',
      requestId,
      workspace: target.workspace,
      folder,
      fileName: finalFileName,
      name: name.trim(),
      open: openAfter,
    }));
    setBusy(false);
    setError(failure);
    if (!failure) {
      setCreated(fullPath);
      setName('');
      setCustomFileName(null);
      requestFocus('create:name');
    }
  };

  return (
    <form className="create-card" onSubmit={submit}>
      <h2>
        <span className="codicon codicon-new-file" aria-hidden="true" /> New {info.singular}
      </h2>

      <div className="form-grid">
        <label htmlFor="create-name">{capitalize(info.singular)} name</label>
        <input
          id="create-name"
          className="input"
          data-focus-key="create:name"
          placeholder={info.namePlaceholder}
          value={name}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setError(undefined);
            setCreated(undefined);
          }}
        />

        <label htmlFor="create-folder">Folder</label>
        <div className="field-row">
          {state.workspaces.length > 1 && (
            <select
              className="keyword-select"
              aria-label="Workspace folder"
              value={target.workspace}
              onChange={(e) => onTargetChange({ workspace: Number(e.target.value), folder: target.folder })}
            >
              {state.workspaces.map((w) => (
                <option key={w.index} value={w.index}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <input
            id="create-folder"
            className="input field-grow mono"
            list="folder-options"
            placeholder="(workspace root)"
            value={target.folder}
            spellCheck={false}
            onChange={(e) => {
              onTargetChange({ ...target, folder: e.target.value });
              setError(undefined);
            }}
          />
          <datalist id="folder-options">
            {folderOptions.map((path) => (
              <option key={path} value={path} />
            ))}
          </datalist>
          {isNewFolder && !folderError(target.folder) && (
            <span className="badge" title="The folder will be created">
              new folder
            </span>
          )}
        </div>

        <label htmlFor="create-file">File name</label>
        <div className="field-row">
          <input
            id="create-file"
            className="input field-grow mono"
            placeholder={`Generated from the ${info.singular} name`}
            value={fileName}
            spellCheck={false}
            onChange={(e) => {
              setCustomFileName(e.target.value);
              setError(undefined);
            }}
          />
          {info.formats.length > 1 && (
            <select
              className="keyword-select"
              aria-label="Format"
              value={formatIndex}
              onChange={(e) => {
                const next = Number(e.target.value);
                setFormatIndex(next);
                if (customFileName !== null) setCustomFileName(replaceExtension(customFileName, extensions, info.formats[next].extension));
              }}
            >
              {info.formats.map((f, i) => (
                <option key={f.extension} value={i}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
          {customFileName !== null && (
            <IconButton icon="discard" label={`Generate from the ${info.singular} name again`} onClick={() => setCustomFileName(null)} />
          )}
        </div>
      </div>

      <div className="create-footer">
        <span className={`path-preview mono ${problem ? 'invalid-text' : ''}`} title={problem}>
          {problem ? (
            <>
              <span className="codicon codicon-warning" aria-hidden="true" /> {problem}
            </>
          ) : (
            fullPath
          )}
        </span>
        <label className="checkbox">
          <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} /> Open after creating
        </label>
        <button type="submit" className="btn btn-primary btn-labelled" disabled={busy}>
          <span className="codicon codicon-add" aria-hidden="true" /> Create {info.singular}
        </button>
      </div>
      {error && error !== problem && <p className="form-message invalid-text">{error}</p>}
      {created && !error && (
        <p className="form-message success-text">
          <span className="codicon codicon-check" aria-hidden="true" /> Created {created}
        </p>
      )}
    </form>
  );
}

/* Tree --------------------------------------------------------------------- */

const DRAG_TYPE = 'application/x-sdd-spec';

interface FolderViewProps {
  node: FolderNode;
  depth: number;
  state: CatalogState;
  collapsed: ReadonlySet<string>;
  target: Target;
  onToggle: (key: string) => void;
  onPrepareCreate: (workspace: number, folder: string) => void;
  request: Request;
}

function FolderView({ node, depth, state, collapsed, target, onToggle, onPrepareCreate, request }: FolderViewProps) {
  const [dropping, setDropping] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [newFolderError, setNewFolderError] = useState<string>();
  const isOpen = !collapsed.has(node.key);
  const isRoot = node.path === '';
  const isTarget = target.workspace === node.workspace && normalizeFolder(target.folder) === node.path;
  const multiRoot = state.workspaces.length > 1;

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    let dragged: { workspace: number; path: string } | undefined;
    try {
      dragged = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
    } catch {
      return;
    }
    if (!dragged || (dragged.workspace === node.workspace && parentFolder(dragged.path) === node.path)) return;
    const { workspace, path } = dragged;
    await request((requestId) => ({ type: 'moveSpec', requestId, workspace, path, target: { workspace: node.workspace, folder: node.path } }));
  };

  const submitNewFolder = async () => {
    if (newFolder === null) return;
    const path = joinPath(node.path, normalizeFolder(newFolder));
    const problem = normalizeFolder(newFolder) ? folderError(path) : 'A folder name is required';
    if (problem) {
      setNewFolderError(problem);
      return;
    }
    const failure = await request((requestId) => ({ type: 'createFolder', requestId, workspace: node.workspace, path }));
    if (failure) {
      setNewFolderError(failure);
    } else {
      setNewFolder(null);
      onPrepareCreate(node.workspace, path);
    }
  };

  const childIndent = { paddingLeft: `${(depth + 1) * 16 + 24}px` };

  return (
    <div className="folder" role="group">
      <div
        className={`tree-row folder-row ${dropping ? 'drop-target' : ''} ${isTarget ? 'is-target' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <button type="button" className="tree-label" aria-expanded={isOpen} onClick={() => onToggle(node.key)}>
          <span className={`codicon codicon-chevron-${isOpen ? 'down' : 'right'}`} aria-hidden="true" />
          <span className={`codicon codicon-${isRoot ? 'root-folder' : isOpen ? 'folder-opened' : 'folder'}`} aria-hidden="true" />
          <span className={isRoot ? 'root-label' : 'folder-label'}>{isRoot && !multiRoot ? `${node.label} (workspace root)` : node.label}</span>
          {!node.exists && <span className="muted"> — not created yet</span>}
          <span className="count">{node.total}</span>
        </button>
        <div className="row-actions">
          <IconButton icon="new-file" label={`New ${state.info.singular} in this folder`} onClick={() => onPrepareCreate(node.workspace, node.path)} />
          <IconButton
            icon="new-folder"
            label="New subfolder"
            onClick={() => {
              setNewFolder('');
              setNewFolderError(undefined);
              if (!isOpen) onToggle(node.key);
              requestFocus(`new-folder:${node.key}`);
            }}
          />
        </div>
      </div>

      {isOpen && (
        <div role="list">
          {newFolder !== null && (
            <div className="tree-row new-folder-row" style={childIndent}>
              <span className="codicon codicon-folder" aria-hidden="true" />
              <input
                className={`input input-small mono ${newFolderError ? 'invalid' : ''}`}
                data-focus-key={`new-folder:${node.key}`}
                placeholder="folder name (a/b creates nested folders)"
                value={newFolder}
                onChange={(e) => {
                  setNewFolder(e.target.value);
                  setNewFolderError(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewFolder();
                  if (e.key === 'Escape') setNewFolder(null);
                }}
              />
              <IconButton icon="check" label="Create folder" onClick={() => void submitNewFolder()} />
              <IconButton icon="close" label="Cancel" onClick={() => setNewFolder(null)} />
              {newFolderError && <span className="invalid-text">{newFolderError}</span>}
            </div>
          )}
          {node.folders.map((child) => (
            <FolderView
              key={child.key}
              node={child}
              depth={depth + 1}
              state={state}
              collapsed={collapsed}
              target={target}
              onToggle={onToggle}
              onPrepareCreate={onPrepareCreate}
              request={request}
            />
          ))}
          {node.specs.map((spec) => (
            <SpecRow key={spec.path} spec={spec} depth={depth + 1} state={state} request={request} />
          ))}
          {node.total === 0 && node.folders.length === 0 && newFolder === null && (
            <div className="tree-row muted empty-folder" style={childIndent}>
              Empty — drop {withArticle(state.info.singular)} here or{' '}
              <button type="button" className="link-button" onClick={() => onPrepareCreate(node.workspace, node.path)}>
                create one
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpecRow({ spec, depth, state, request }: { spec: SpecSummary; depth: number; state: CatalogState; request: Request }) {
  const location = { workspace: spec.workspace, path: spec.path };
  const { info } = state;
  return (
    <div
      className="tree-row spec-row"
      role="listitem"
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(location));
        e.dataTransfer.setData('text/plain', spec.path);
        e.dataTransfer.effectAllowed = 'move';
      }}
      title={`${spec.path}\nDrag onto a folder to move it`}
    >
      <button type="button" className="tree-label" onClick={() => post({ type: 'open', ...location })}>
        <span className={`codicon codicon-${spec.error ? 'error' : info.icon} ${spec.error ? 'invalid-text' : ''}`} aria-hidden="true" />
        <span className="spec-name">{spec.name || <em className="muted">Unnamed {info.singular}</em>}</span>
        <span className="muted mono file-name">{baseName(spec.path)}</span>
        {spec.tags.slice(0, MAX_TAGS).map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
        {spec.tags.length > MAX_TAGS && <span className="more-tags" title={spec.tags.join(', ')}>+{spec.tags.length - MAX_TAGS}</span>}
        {spec.error ? (
          <span className="invalid-text error-summary" title={spec.error}>
            {spec.error}
          </span>
        ) : (
          <span className="muted stats">{spec.details.join(' · ')}</span>
        )}
        {!!spec.problems && (
          <span className="problems-badge" title="Open it to see the problems">
            <span className="codicon codicon-warning" aria-hidden="true" />
            {plural(spec.problems, 'problem')}
          </span>
        )}
        {spec.warning && <span className="codicon codicon-info warning-icon" title={spec.warning} aria-label={spec.warning} />}
      </button>
      <div className="row-actions">
        <IconButton icon="go-to-file" label="Open as text" onClick={() => post({ type: 'open', ...location, asText: true })} />
        <IconButton icon="move" label="Move to folder…" onClick={() => void request((requestId) => ({ type: 'moveSpec', requestId, ...location }))} />
        <IconButton icon="files" label="Reveal in Explorer" onClick={() => post({ type: 'reveal', ...location })} />
        <IconButton icon="trash" label="Delete" onClick={() => void request((requestId) => ({ type: 'deleteSpec', requestId, ...location }))} />
      </div>
    </div>
  );
}
