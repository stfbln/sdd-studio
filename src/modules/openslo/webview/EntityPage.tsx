import { useId } from 'react';
import { getIn, isObject, type Json, type SpecPath } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { CheckboxField, Field, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import { analyzeOpenSlo } from '../core/analysis';
import { deleteEntityEdits } from '../core/edits';
import {
  ALERT_SEVERITIES,
  BUDGETING_METHODS,
  DATA_SOURCE_TYPES,
  entitiesOfKind,
  entityAt,
  entityLabel,
  entityPath,
  isKind,
  KIND_INFO,
  lowerLabel,
  NOTIFICATION_TARGET_TYPES,
  OBJECTIVE_OPS,
  str,
} from '../core/model';
import { DeleteImpactHint, MapSection, MoveButtons, NameField, NumberField, RefInput, RefListField } from './controls';
import { sameLocation, useOpenSlo } from './state';

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value : []);

export function EntityPage({ index }: { index: number }) {
  const { spec, edit, navigate } = useOpenSlo();
  const info = entityAt(spec, index);
  if (!info) return null;
  const kind = isKind(info.kind) ? info.kind : undefined;
  const specPath = entityPath(index, 'spec');
  const issues = analyzeOpenSlo(spec).filter((i) => sameLocation(i.location, { kind: 'entity', index }));

  return (
    <div className="page">
      <div className="page-title-row">
        <span className={`codicon codicon-${kind ? KIND_INFO[kind].icon : 'symbol-misc'}`} aria-hidden="true" />
        <span className="mono title-text">{entityLabel(info.entity)}</span>
        <span className="kind-badge">{info.kind || 'Unknown kind'}</span>
        <span className="grow" />
        <DeleteImpactHint spec={spec} index={index} />
        <IconButton
          icon="trash"
          label={`Delete ${kind ? lowerLabel(KIND_INFO[kind].singular) : 'object'}`}
          onClick={() => {
            edit(deleteEntityEdits(spec, index));
            navigate({ kind: 'overview' });
          }}
        />
      </div>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      {!kind ? (
        <p className="muted">
          Unknown kind "{info.kind}". Expected one of Service, SLO, SLI, DataSource, AlertPolicy, AlertCondition or AlertNotificationTarget. Edit it as text.
        </p>
      ) : (
        <>
          <Section title={KIND_INFO[kind].singular} icon={KIND_INFO[kind].icon}>
            <p className="muted small">{KIND_INFO[kind].hint}</p>
            <div className="form-grid">
              <NameField index={index} />
              <TextField path={entityPath(index, 'metadata', 'displayName')} label="Display name" placeholder={info.name} />
            </div>
            {kind !== 'DataSource' && <TextAreaField path={[...specPath, 'description']} label="Description" placeholder="What this describes" />}
          </Section>

          {kind === 'SLI' && <IndicatorSpecFields path={specPath} />}
          {kind === 'DataSource' && <DataSourceFields specPath={specPath} />}
          {kind === 'AlertPolicy' && <AlertPolicyFields index={index} specPath={specPath} />}
          {kind === 'AlertCondition' && <AlertConditionFields specPath={specPath} />}
          {kind === 'AlertNotificationTarget' && <AlertNotificationTargetFields specPath={specPath} />}
          {kind === 'SLO' && <SloFields index={index} specPath={specPath} />}
        </>
      )}
    </div>
  );
}

/* SLI / indicator ------------------------------------------------------------ */

/** A metric source (type, optional data source reference, free-form query spec). */
function MetricSourceFields({ path, title }: { path: SpecPath; title: string }) {
  const { spec } = useOpenSlo();
  const listId = useId();
  const dataSources = entitiesOfKind(spec, 'DataSource').map((e) => e.name).filter(Boolean);
  return (
    <Section title={title} icon="symbol-field">
      <div className="form-grid">
        <TextField path={[...path, 'type']} label="Type" required list={listId} placeholder={DATA_SOURCE_TYPES[0]} />
        <TextField path={[...path, 'metricSourceRef']} label="Data source" list={`${listId}-ref`} placeholder={dataSources[0] ?? 'name of a Data source'} />
      </div>
      <datalist id={listId}>
        {DATA_SOURCE_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <datalist id={`${listId}-ref`}>
        {dataSources.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <MapSection path={[...path, 'spec']} title="Query" icon="symbol-parameter" empty="Query parameters for this metric source, e.g. query for a PromQL expression." />
    </Section>
  );
}

/** ratioMetric (good/total, optional bad) or thresholdMetric, as declared by an SLI (standalone or inline in an SLO). */
export function IndicatorSpecFields({ path }: { path: SpecPath }) {
  const { spec, edit } = useOpenSlo();
  const ratio = getIn(spec, [...path, 'ratioMetric']);
  const threshold = getIn(spec, [...path, 'thresholdMetric']);
  const mode = isObject(threshold) && !isObject(ratio) ? 'threshold' : 'ratio';

  const useRatio = () => edit([{ op: 'delete', path: [...path, 'thresholdMetric'] }, { op: 'set', path: [...path, 'ratioMetric'], value: { counter: true, good: { metricSource: { type: '' } }, total: { metricSource: { type: '' } } } }]);
  const useThreshold = () => edit([{ op: 'delete', path: [...path, 'ratioMetric'] }, { op: 'set', path: [...path, 'thresholdMetric'], value: { metricSource: { type: '' } } }]);

  return (
    <Section title="Indicator" icon="pulse">
      <div className="row-buttons">
        <button type="button" className={`btn ${mode === 'ratio' ? 'btn-primary' : 'btn-secondary'}`} onClick={useRatio}>
          Ratio (good / total)
        </button>
        <button type="button" className={`btn ${mode === 'threshold' ? 'btn-primary' : 'btn-secondary'}`} onClick={useThreshold}>
          Threshold
        </button>
      </div>

      {mode === 'ratio' ? (
        <>
          <CheckboxField path={[...path, 'ratioMetric', 'counter']} label="Counter metric (cumulative, always increasing)" />
          <MetricSourceFields path={[...path, 'ratioMetric', 'good', 'metricSource']} title="Good events" />
          <MetricSourceFields path={[...path, 'ratioMetric', 'total', 'metricSource']} title="Total events" />
          {isObject(getIn(spec, [...path, 'ratioMetric', 'bad'])) ? (
            <MetricSourceFields path={[...path, 'ratioMetric', 'bad', 'metricSource']} title="Bad events" />
          ) : (
            <IconButton
              icon="add"
              label="Add bad events metric"
              showLabel
              onClick={() => edit({ op: 'set', path: [...path, 'ratioMetric', 'bad'], value: { metricSource: { type: '' } } })}
            />
          )}
        </>
      ) : (
        <MetricSourceFields path={[...path, 'thresholdMetric', 'metricSource']} title="Metric source" />
      )}
    </Section>
  );
}

/* DataSource ------------------------------------------------------------------ */

function DataSourceFields({ specPath }: { specPath: SpecPath }) {
  const listId = useId();
  return (
    <>
      <Section title="Type" icon="symbol-field">
        <div className="form-grid">
          <TextField path={[...specPath, 'type']} label="Type" required list={listId} placeholder={DATA_SOURCE_TYPES[0]} />
        </div>
        <datalist id={listId}>
          {DATA_SOURCE_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Section>
      <MapSection path={[...specPath, 'connectionDetails']} title="Connection details" icon="plug" empty="How SLIs using this data source connect (URL, region, API key reference…)." />
    </>
  );
}

/* AlertPolicy ------------------------------------------------------------------ */

function AlertPolicyFields({ index, specPath }: { index: number; specPath: SpecPath }) {
  return (
    <>
      <Section title="When to alert" icon="settings">
        <div className="checkbox-group">
          <CheckboxField path={[...specPath, 'alertWhenNoData']} label="No data" hint="Alert when the indicator reports no data." />
          <CheckboxField path={[...specPath, 'alertWhenBreaching']} label="Breaching" hint="Alert when the error budget is being burned too fast." />
          <CheckboxField path={[...specPath, 'alertWhenResolved']} label="Resolved" hint="Alert again once the condition clears." />
        </div>
      </Section>
      <Section title="Conditions" icon={KIND_INFO.AlertCondition.icon}>
        <p className="muted small">Burn rate conditions (from Alert conditions of this file) that trigger this policy.</p>
        <RefListField index={index} from="AlertPolicy" field="conditions" label="Conditions" />
      </Section>
      <Section title="Notification targets" icon={KIND_INFO.AlertNotificationTarget.icon}>
        <p className="muted small">Where alerts of this policy are sent.</p>
        <RefListField index={index} from="AlertPolicy" field="notificationTargets" label="Notification targets" />
      </Section>
    </>
  );
}

/* AlertCondition ---------------------------------------------------------------- */

function AlertConditionFields({ specPath }: { specPath: SpecPath }) {
  const listId = useId();
  return (
    <Section title="Condition" icon="symbol-event">
      <div className="form-grid">
        <TextField path={[...specPath, 'severity']} label="Severity" list={listId} placeholder="page" />
        <TextField path={[...specPath, 'condition', 'kind']} label="Kind" mono required placeholder="burnrate" />
        <NumberField path={[...specPath, 'condition', 'threshold']} label="Threshold" required step={0.1} min={0} hint="Burn rate that triggers the alert (2 = burning the budget twice as fast as sustainable)." />
        <TextField path={[...specPath, 'condition', 'lookbackWindow']} label="Lookback window" mono required placeholder="5m" />
        <TextField path={[...specPath, 'condition', 'alertAfter']} label="Alert after" mono placeholder="5m" hint="How long the burn rate must hold before alerting." />
      </div>
      <datalist id={listId}>
        {ALERT_SEVERITIES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </Section>
  );
}

/* AlertNotificationTarget -------------------------------------------------------- */

function AlertNotificationTargetFields({ specPath }: { specPath: SpecPath }) {
  const listId = useId();
  return (
    <Section title="Target" icon="megaphone">
      <div className="form-grid">
        <TextField path={[...specPath, 'target']} label="Target" required list={listId} placeholder={NOTIFICATION_TARGET_TYPES[0]} />
      </div>
      <datalist id={listId}>
        {NOTIFICATION_TARGET_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Section>
  );
}

/* SLO ---------------------------------------------------------------------------- */

function SloFields({ index, specPath }: { index: number; specPath: SpecPath }) {
  const { spec, edit } = useOpenSlo();
  const indicatorRef = str(getIn(spec, [...specPath, 'indicatorRef']));
  const inline = getIn(spec, [...specPath, 'indicator']);
  const method = str(getIn(spec, [...specPath, 'budgetingMethod'])) || 'Occurrences';

  const useInline = () =>
    edit([
      { op: 'delete', path: [...specPath, 'indicatorRef'] },
      { op: 'set', path: [...specPath, 'indicator'], value: { metadata: { name: '' }, spec: { ratioMetric: { counter: true, good: { metricSource: { type: '' } }, total: { metricSource: { type: '' } } } } } },
    ]);
  const useRef = () => edit([{ op: 'delete', path: [...specPath, 'indicator'] }, { op: 'set', path: [...specPath, 'indicatorRef'], value: '' }]);

  return (
    <>
      <Section title="Service and indicator" icon="target">
        <div className="form-grid">
          <RefInput index={index} from="SLO" field="service" label="Service" required />
        </div>
        <div className="row-buttons">
          <button type="button" className={`btn ${!isObject(inline) ? 'btn-primary' : 'btn-secondary'}`} onClick={useRef}>
            Existing SLI
          </button>
          <button type="button" className={`btn ${isObject(inline) ? 'btn-primary' : 'btn-secondary'}`} onClick={useInline}>
            Inline indicator
          </button>
        </div>
        {isObject(inline) ? (
          <>
            <div className="form-grid">
              <TextField path={[...specPath, 'indicator', 'metadata', 'name']} label="Indicator name" mono required placeholder="availability" />
            </div>
            <IndicatorSpecFields path={[...specPath, 'indicator', 'spec']} />
          </>
        ) : (
          <div className="form-grid">
            <RefInput index={index} from="SLO" field="indicatorRef" label="Indicator (SLI)" required hint={!indicatorRef ? 'Pick an SLI of this file, or switch to an inline indicator.' : undefined} />
          </div>
        )}
      </Section>

      <Section title="Budgeting" icon="graph">
        <div className="form-grid">
          <Field label="Method" required>
            <select
              className="keyword-select"
              value={method}
              onChange={(e) => edit({ op: 'set', path: [...specPath, 'budgetingMethod'], value: e.target.value })}
            >
              {BUDGETING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <TimeWindowSection specPath={specPath} />
      <ObjectivesSection specPath={specPath} method={method} />

      <Section title="Alert policies" icon={KIND_INFO.AlertPolicy.icon}>
        <p className="muted small">Alert policies (from this file) watching this SLO's error budget.</p>
        <RefListField index={index} from="SLO" field="alertPolicies" label="Alert policies" />
      </Section>
    </>
  );
}

function TimeWindowSection({ specPath }: { specPath: SpecPath }) {
  const { spec, edit } = useOpenSlo();
  const path = [...specPath, 'timeWindow'];
  const windows = asArray(getIn(spec, path));

  return (
    <Section title="Time window" icon="calendar" count={windows.length}>
      <p className="muted small">The period the error budget is measured over. Rolling windows slide continuously; others are calendar-aligned.</p>
      {windows.map((w, i) => {
        if (!isObject(w)) return null;
        const rolling = w.isRolling !== false;
        return (
          <div key={i} className="table-group">
            <div className="form-grid">
              <TextField path={[...path, i, 'duration']} label="Duration" mono required placeholder="28d" />
              <CheckboxField path={[...path, i, 'isRolling']} label="Rolling" />
            </div>
            {!rolling && (
              <div className="form-grid">
                <TextField path={[...path, i, 'calendar', 'startTime']} label="Calendar start time" mono placeholder="2024-01-01T00:00:00Z" />
                <TextField path={[...path, i, 'calendar', 'timeZone']} label="Time zone" mono placeholder="UTC" />
              </div>
            )}
            <div className="row-buttons">
              <MoveButtons path={path} index={i} count={windows.length} label="time window" />
              <IconButton icon="trash" label="Remove time window" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
            </div>
          </div>
        );
      })}
      <IconButton icon="add" label="Add time window" showLabel onClick={() => edit({ op: 'set', path: [...path, windows.length], value: { duration: '28d', isRolling: true } })} />
    </Section>
  );
}

function ObjectivesSection({ specPath, method }: { specPath: SpecPath; method: string }) {
  const { spec, edit } = useOpenSlo();
  const path = [...specPath, 'objectives'];
  const objectives = asArray(getIn(spec, path));
  const timeslices = method === 'Timeslices';

  return (
    <Section title="Objectives" icon="target" count={objectives.length}>
      <p className="muted small">Targets are a ratio (0.99 = 99%), not a percentage.</p>
      {objectives.map((o, i) => {
        if (!isObject(o)) return null;
        return (
          <div key={i} className="table-group">
            <div className="form-grid">
              <TextField path={[...path, i, 'displayName']} label="Name" placeholder={`Objective ${i + 1}`} />
              <Field label="Comparison">
                <select className="keyword-select" value={str(o.op) || 'gte'} onChange={(e) => edit({ op: 'set', path: [...path, i, 'op'], value: e.target.value })}>
                  {OBJECTIVE_OPS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </Field>
              <NumberField path={[...path, i, 'target']} label="Target" required step={0.001} min={0} max={1} />
              {timeslices && <NumberField path={[...path, i, 'timeSliceTarget']} label="Time slice target" step={0.001} min={0} max={1} />}
              {timeslices && <TextField path={[...path, i, 'timeSliceWindow']} label="Time slice window" mono placeholder="5m" />}
            </div>
            <div className="row-buttons">
              <MoveButtons path={path} index={i} count={objectives.length} label="objective" />
              <IconButton icon="trash" label="Remove objective" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
            </div>
          </div>
        );
      })}
      <IconButton
        icon="add"
        label="Add objective"
        showLabel
        onClick={() => edit({ op: 'set', path: [...path, objectives.length], value: { displayName: `Objective ${objectives.length + 1}`, op: 'gte', target: 0.99 } })}
      />
    </Section>
  );
}
