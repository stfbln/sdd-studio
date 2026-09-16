import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Section } from '../../../webview/structured/fields';
import { appendEntityEdit, newEntity } from '../core/edits';
import { entityCounts } from '../core/consolidated';
import { CATEGORIES, CODE, documentFiles, documentsOf, HIERARCHY, NETWORKS, ORGANIZATION, placementsOf, type Category } from '../core/model';
import { ImportNetworks } from './infrastructure';
import { CreateButton } from './controls';
import { CoverageTable } from './sections';
import { entityLocation, useCatalog, useWorkspace } from './state';

const ADDABLE = [...HIERARCHY, ...NETWORKS, ...CODE, ...ORGANIZATION, 'location'] as Exclude<Category, 'other'>[];

export function OverviewPage() {
  const { spec, edit, navigate } = useCatalog();
  const { issues, known, context, openFile, openCatalog, runCommand, consolidated } = useWorkspace();
  const files = documentFiles(spec);
  const shownFile = consolidated?.filter ?? '';
  const local = known.filter((e) => e.index !== undefined && (!shownFile || e.file === shownFile));
  // In the consolidated view, problems say which file they are about.
  const shownIssues = files
    ? issues
        .filter((i) => i.location.kind !== 'entity' || !shownFile || files[i.location.index] === shownFile)
        .map((i) => (i.location.kind === 'entity' ? { ...i, message: `${files[i.location.index]} · ${i.message}` } : i))
    : issues;
  const software = local.filter((e) => ['component', 'api', 'resource', 'dataAsset', 'artifact', 'system'].includes(e.category));
  const others = context?.entities ?? [];
  const networks = local.filter((e) => e.category === 'network');
  const mismatches = local.reduce((n, e) => n + placementsOf(e.key, known, context).filter((p) => !p.matches).length, 0);
  const create = (category: Exclude<Category, 'other'>, name: string) => {
    const edits = [appendEntityEdit(spec, newEntity(spec, category, name, {}, context))];
    if (consolidated) consolidated.editIn(consolidated.target, edits);
    else edit(edits);
    navigate(entityLocation(documentsOf(spec).length));
  };

  return (
    <div className="page">
      <h1 className="page-title">{consolidated ? `Software catalog of ${context?.consolidated?.folder || 'the workspace'}` : 'Software catalog'}</h1>
      {shownIssues.length > 0 && <ProblemsList issues={shownIssues} onNavigate={navigate} />}
      {consolidated && <CatalogFilesSection />}

      <Section title="Entities" icon="type-hierarchy" count={local.length}>
        {local.length === 0 ? (
          <p className="muted">
            {consolidated ? 'No entities yet.' : 'This file has no entities yet.'} Start with a system, then add its components, APIs, resources and data assets.
          </p>
        ) : (
          <div className="counts">
            {ADDABLE.map((category) => {
              const n = local.filter((e) => e.category === category).length;
              return n ? (
                <span key={category} className="count-chip">
                  <span className={`codicon codicon-${CATEGORIES[category].icon}`} aria-hidden="true" /> {n} {n === 1 ? CATEGORIES[category].singular : CATEGORIES[category].plural}
                </span>
              ) : null;
            })}
          </div>
        )}
        <div className="list-row add-methods">
          {ADDABLE.map((category) => (
            <CreateButton key={category} label={CATEGORIES[category].singular} singular={CATEGORIES[category].singular.toLowerCase()} onCreate={(name) => create(category, name)} />
          ))}
        </div>
      </Section>

      {!!context?.threatModels.length && (
        <Section title="Networks and trust zones" icon="globe" count={networks.length}>
          <p className="muted small">
            Networks stand for the trust zones of threat models. Components and resources placed in them are compared with where the threat models put them
            {mismatches ? ` (${mismatches} difference${mismatches === 1 ? '' : 's'}, see problems)` : ''}.
          </p>
          <ImportNetworks />
        </Section>
      )}

      {software.length > 0 && (
        <Section title="Coverage" icon="checklist" count={software.length}>
          <p className="muted small">Spec files each entity implements, and the threat models applying to it (directly or through its system or domain).</p>
          <CoverageTable entities={software} />
        </Section>
      )}

      {!consolidated && (
        <Section title="Workspace" icon="folder-library" count={context?.catalogFiles.length}>
          {!context ? (
            <p className="muted">Looking at the workspace…</p>
          ) : (
            <>
              <p className="muted small">
                References may point to entities of the other catalog files of this workspace folder ({others.length} entities). {context.specFiles.length} spec files can be linked.
              </p>
              {context.catalogFiles.map((file) => (
                <div key={file} className="list-row">
                  <span className="codicon codicon-file" aria-hidden="true" />
                  <button type="button" className="link-button" onClick={() => openFile(file)}>
                    {file}
                  </button>
                  <span className="muted small">{others.filter((e) => e.file === file).length} entities</span>
                </div>
              ))}
            </>
          )}
          <div className="list-row">
            <IconButton icon="layers" label="Consolidated view" showLabel onClick={() => runCommand('consolidated')} />
            <IconButton icon="list-tree" label="All catalog files" showLabel onClick={openCatalog} />
          </div>
        </Section>
      )}
    </div>
  );
}

/** Consolidated view: the catalog files, where new entities go, and which file the outline shows. */
function CatalogFilesSection() {
  const { spec, navigate } = useCatalog();
  const { issues, consolidated, openFile, openCatalog, runCommand } = useWorkspace();
  if (!consolidated) return null;
  const files = documentFiles(spec) ?? [];
  const counts = entityCounts(spec);
  const problems = (file: string) => issues.filter((i) => i.location.kind === 'entity' && files[i.location.index] === file).length;
  return (
    <Section title="Catalog files" icon="files" count={consolidated.files.length}>
      <p className="muted small">
        Every catalog file of the workspace folder, merged: references, renames and deletes work across files. Changes are saved to the file of each entity.
      </p>
      {consolidated.files.length === 0 ? (
        <p className="muted">No catalog files yet.</p>
      ) : (
        <div className="table files-table" role="table">
          <div className="table-head" role="row">
            <span>File</span>
            <span>Entities</span>
            <span>New entities</span>
            <span />
          </div>
          {consolidated.files.map((file) => {
            const n = problems(file);
            const first = files.indexOf(file);
            return (
              <div key={file} className={`table-row ${consolidated.filter === file ? 'selected' : ''}`} role="row">
                <span className="list-row">
                  <span className="codicon codicon-file" aria-hidden="true" />
                  <button type="button" className="link-button mono" title="Open the file" onClick={() => openFile(file)}>
                    {file}
                  </button>
                </span>
                <span className="small">
                  {counts.get(file) ?? 0}
                  {n > 0 && <span className="warning-text"> · {n} problem{n === 1 ? '' : 's'}</span>}
                </span>
                <label className="checkbox small" title="New entities created from the overview and the outline go to this file">
                  <input type="radio" name="target-file" checked={consolidated.target === file} onChange={() => consolidated.setTarget(file)} /> go here
                </label>
                <span className="row-buttons">
                  <IconButton
                    icon={consolidated.filter === file ? 'clear-all' : 'filter'}
                    label={consolidated.filter === file ? 'Show all files' : 'Show only this file'}
                    onClick={() => consolidated.setFilter(consolidated.filter === file ? '' : file)}
                  />
                  {first >= 0 && <IconButton icon="arrow-right" label="First entity of the file" onClick={() => navigate(entityLocation(first))} />}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="list-row">
        <IconButton icon="new-file" label="New catalog file" showLabel onClick={() => runCommand('newCatalogFile')} />
        <IconButton icon="list-tree" label="All catalog files" showLabel onClick={openCatalog} />
      </div>
    </Section>
  );
}
