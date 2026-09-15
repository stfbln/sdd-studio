import { getIn, isObject, type JsonObject } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { KeyInput, ChipsField, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import {
  analyzeOtm,
  appendEdit,
  COLLECTION_LABELS,
  labelOf,
  renameRepresentationEdits,
  REPRESENTATION_TYPES,
  representationIds,
  threatUses,
  uniqueId,
} from '../core/otm';
import { AttributesSection, ItemLink, NumberInput, OptionalInput, RequiredInput } from './controls';
import { useOtm } from './state';

/** The project's representations: diagrams, code repositories, other threat models. */
function RepresentationsSection() {
  const { spec, edit } = useOtm();
  const list = getIn(spec, ['representations']);
  const representations = (Array.isArray(list) ? list : []).map((r) => (isObject(r) ? r : ({} as JsonObject)));
  const ids = representationIds(spec);
  const add = () => {
    const id = uniqueId('architecture diagram', ids, 'representation');
    edit(appendEdit(spec, ['representations'], { name: 'Architecture diagram', id, type: 'diagram' }));
  };

  return (
    <Section title="Representations" icon="symbol-misc" count={representations.length} actions={<IconButton icon="add" label="Add representation" showLabel onClick={add} />}>
      {representations.length === 0 && <p className="muted">Diagrams, code repositories or other threat models describing this project. Elements can then be placed in them.</p>}
      {representations.map((rep, i) => {
        const base = ['representations', i];
        const type = String(rep.type ?? '');
        return (
          <div key={i} className="representation-card">
            <div className="representation-row">
              <RequiredInput path={[...base, 'name']} placeholder="Name" />
              <KeyInput
                value={String(rep.id ?? '')}
                className="mono"
                ariaLabel="Representation id"
                placeholder="id"
                validate={(v) => (!v.trim() ? 'Required' : ids.some((other, j) => other === v && j !== i) ? 'Already used' : undefined)}
                onCommit={(next) => edit(renameRepresentationEdits(spec, i, next))}
              />
              <RequiredInput path={[...base, 'type']} placeholder="Type" mono list="otm-representation-types" />
              <IconButton icon="trash" label="Remove representation" onClick={() => edit({ op: 'delete', path: base })} />
            </div>
            <div className="representation-row">
              {type === 'diagram' && (
                <span className="inline-fields numbers">
                  <span className="size-label">Size</span>
                  <NumberInput path={[...base, 'size', 'width']} label="width" />
                  <NumberInput path={[...base, 'size', 'height']} label="height" />
                </span>
              )}
              {type === 'code' && <OptionalInput path={[...base, 'repository', 'url']} placeholder="Repository URL" mono />}
              <OptionalInput path={[...base, 'description']} placeholder="Description" />
            </div>
          </div>
        );
      })}
      <datalist id="otm-representation-types">
        {REPRESENTATION_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Section>
  );
}

/** Every threat found on a component or dataflow, with its state and mitigations. */
function ThreatRegister() {
  const { spec } = useOtm();
  const uses = threatUses(spec);
  const exposed = uses.filter((u) => u.state === 'exposed').length;
  return (
    <Section title="Threat register" icon="bug" count={uses.length}>
      {uses.length === 0 ? (
        <p className="muted">No threats linked to components or dataflows yet.</p>
      ) : (
        <>
          <p className="muted small">{exposed ? `${exposed} of ${uses.length} still exposed.` : 'No threat is exposed.'}</p>
          <div className="table register-table" role="table">
            <div className="table-head" role="row">
              <span>Threat</span>
              <span>Found on</span>
              <span>State</span>
              <span>Mitigations</span>
            </div>
            {uses.map((use) => (
              <div key={`${use.collection}${use.index}-${use.instance}`} className="table-row" role="row">
                <ItemLink collection="threats" id={use.threat} />
                <span className="list-row">
                  <span className={`codicon codicon-${COLLECTION_LABELS[use.collection].icon}`} aria-hidden="true" />
                  <ItemLink collection={use.collection} index={use.index} />
                </span>
                <span>
                  <span className={`state-badge state-${use.state.toLowerCase()}`}>{use.state || 'no state'}</span>
                </span>
                <span className="small">
                  {use.mitigations.length === 0 ? (
                    <span className="muted">none</span>
                  ) : (
                    use.mitigations.map((m, i) => (
                      <span key={i} className="register-mitigation">
                        {labelOf(spec, 'mitigations', m.mitigation)} <span className={`state-badge state-${m.state.toLowerCase()}`}>{m.state || '?'}</span>
                      </span>
                    ))
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

export function ProjectPage() {
  const { spec, navigate } = useOtm();
  const issues = analyzeOtm(spec);
  return (
    <div className="page">
      <h1 className="page-title">Project</h1>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Project" icon="project">
        <div className="form-grid">
          <TextField path={['project', 'name']} label="Name" required placeholder="Online shop" />
          <TextField path={['project', 'id']} label="Id" required mono placeholder="online-shop" />
          <TextField path={['project', 'owner']} label="Owner" placeholder="Person responsible for the project" />
          <TextField path={['project', 'ownerContact']} label="Owner contact" type="email" placeholder="owner@example.com" />
          <ChipsField path={['project', 'tags']} label="Tags" placeholder="Add tag" />
          <TextField path={['otmVersion']} label="OTM version" required mono placeholder="0.2.0" />
          <TextAreaField path={['project', 'description']} label="Description" placeholder="What the system does and what this threat model covers" />
        </div>
      </Section>

      <ThreatRegister />
      <RepresentationsSection />
      <AttributesSection path={['project', 'attributes']} />
    </div>
  );
}
