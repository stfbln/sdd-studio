import { getIn } from '../../../shared/structured/edits';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Section } from '../../../webview/structured/fields';
import { analyzeOpenSlo } from '../core/analysis';
import { appendEntityEdit, newEntity } from '../core/edits';
import { documentsOf, entitiesOfKind, entityLabel, KIND_INFO, KINDS, lowerLabel, str, type Kind } from '../core/model';
import { CreateButton } from './controls';
import { entityLocation, sameLocation, useOpenSlo } from './state';

export function OverviewPage() {
  const { spec, edit, navigate } = useOpenSlo();
  const issues = analyzeOpenSlo(spec);
  const overviewIssues = issues.filter((i) => sameLocation(i.location, { kind: 'overview' }));
  const services = entitiesOfKind(spec, 'Service');
  const slos = entitiesOfKind(spec, 'SLO');

  const create = (kind: Kind, name: string) => {
    edit(appendEntityEdit(spec, newEntity(spec, kind, name)));
    navigate(entityLocation(documentsOf(spec).length));
  };

  return (
    <div className="page">
      <h1 className="page-title">Service level objectives</h1>
      {overviewIssues.length > 0 && <ProblemsList issues={overviewIssues} onNavigate={navigate} />}

      <Section title="Objects" icon="list-tree" count={documentsOf(spec).length}>
        {documentsOf(spec).length === 0 ? (
          <p className="muted">No objects yet. Start with a Service, then add its SLOs.</p>
        ) : (
          <div className="counts">
            {KINDS.map((kind) => {
              const n = entitiesOfKind(spec, kind).length;
              return n ? (
                <span key={kind} className="count-chip">
                  <span className={`codicon codicon-${KIND_INFO[kind].icon}`} aria-hidden="true" /> {n} {n === 1 ? KIND_INFO[kind].singular : KIND_INFO[kind].plural}
                </span>
              ) : null;
            })}
          </div>
        )}
        <div className="list-row add-methods">
          {KINDS.map((kind) => (
            <CreateButton key={kind} label={KIND_INFO[kind].singular} singular={lowerLabel(KIND_INFO[kind].singular)} onCreate={(name) => create(kind, name)} />
          ))}
        </div>
      </Section>

      {services.length > 0 && (
        <Section title="Services" icon={KIND_INFO.Service.icon} count={services.length}>
          <div className="table services-table" role="table">
            <div className="table-head" role="row">
              <span>Service</span>
              <span>SLOs</span>
              <span>Problems</span>
            </div>
            {services.map((service) => {
              const linked = slos.filter((s) => str(getIn(s.entity, ['spec', 'service'])) === service.name);
              const problems = issues.filter((i) => {
                if (i.location.kind !== 'entity') return false;
                const at = i.location.index;
                return at === service.index || linked.some((s) => s.index === at);
              }).length;
              return (
                <div key={service.index} className="table-row" role="row">
                  <span>
                    <button type="button" className="link-button" onClick={() => navigate(entityLocation(service.index))}>
                      {entityLabel(service.entity)}
                    </button>
                  </span>
                  <span className="muted small">{linked.length ? linked.map((s) => entityLabel(s.entity)).join(', ') : '—'}</span>
                  <span className={problems ? 'warning-text' : 'muted small'}>{problems || '—'}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {slos.length > 0 && (
        <Section title="SLOs" icon={KIND_INFO.SLO.icon} count={slos.length}>
          <div className="table slos-table" role="table">
            <div className="table-head" role="row">
              <span>SLO</span>
              <span>Service</span>
              <span>Objectives</span>
              <span>Budgeting</span>
            </div>
            {slos.map((slo) => {
              const objectives = getIn(slo.entity, ['spec', 'objectives']);
              const count = Array.isArray(objectives) ? objectives.length : 0;
              return (
                <div key={slo.index} className="table-row" role="row">
                  <span>
                    <button type="button" className="link-button" onClick={() => navigate(entityLocation(slo.index))}>
                      {entityLabel(slo.entity)}
                    </button>
                  </span>
                  <span className="muted small mono">{str(getIn(slo.entity, ['spec', 'service'])) || '—'}</span>
                  <span className="muted small">{count} objective{count === 1 ? '' : 's'}</span>
                  <span className="muted small">{str(getIn(slo.entity, ['spec', 'budgetingMethod'])) || '—'}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
