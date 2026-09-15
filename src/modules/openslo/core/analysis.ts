/** Problems reported by the OpenSLO form: broken references, missing fields, invalid values. */
import { getIn, isObject, type Json } from '../../../shared/structured/edits';
import { entitiesOf, findByName, isKind, majorVersion, str, type OpenSloLocation } from './model';

export interface OpenSloIssue {
  severity: 'error' | 'warning';
  message: string;
  location: OpenSloLocation;
}

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value : []);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function analyzeOpenSlo(spec: unknown): OpenSloIssue[] {
  const issues: OpenSloIssue[] = [];
  const overview: OpenSloLocation = { kind: 'overview' };
  const add = (severity: OpenSloIssue['severity'], message: string, location: OpenSloLocation = overview) => issues.push({ severity, message, location });

  if (!majorVersion(spec)) add('error', 'The "apiVersion" must be openslo/v1');

  const entities = entitiesOf(spec);
  const names = new Map<string, number[]>();
  for (const info of entities) {
    const location: OpenSloLocation = { kind: 'entity', index: info.index };
    const label = info.name || `${info.kind || 'object'} #${info.index + 1}`;
    const at = (severity: OpenSloIssue['severity'], message: string) => add(severity, `${label}: ${message}`, location);

    if (!isKind(info.kind)) {
      at('error', `Unknown kind "${info.kind || ''}"`);
      continue;
    }
    if (!info.name.trim()) at('error', 'metadata.name is required');
    else {
      const key = `${info.kind}:${info.name}`;
      names.set(key, [...(names.get(key) ?? []), info.index]);
    }

    const specValue = getIn(info.entity, ['spec']);
    if (!isObject(specValue)) {
      at('error', '"spec" is missing');
      continue;
    }

    const ref = (field: string, kind: Parameters<typeof findByName>[1]) => {
      const value = str(getIn(specValue, [field])).trim();
      if (value && !findByName(spec, kind, value)) at('warning', `${field} "${value}" does not match any ${kind} of this file`);
      return value;
    };
    const refList = (field: string, kind: Parameters<typeof findByName>[1]) => {
      for (const value of asArray(getIn(specValue, [field])).map(String)) {
        if (value && !findByName(spec, kind, value)) at('warning', `${field}: "${value}" does not match any ${kind} of this file`);
      }
    };

    switch (info.kind) {
      case 'Service':
        break;
      case 'SLO': {
        if (!ref('service', 'Service')) at('error', 'service is required');
        const indicatorRef = str(getIn(specValue, ['indicatorRef'])).trim();
        const inline = getIn(specValue, ['indicator']);
        if (indicatorRef) ref('indicatorRef', 'SLI');
        else if (!isObject(inline)) at('error', 'An indicator (indicatorRef, or an inline indicator) is required');
        const method = str(getIn(specValue, ['budgetingMethod']));
        if (!method) at('error', 'budgetingMethod is required');
        else if (!['Occurrences', 'Timeslices'].includes(method)) at('error', `budgetingMethod "${method}" must be Occurrences or Timeslices`);
        const windows = asArray(getIn(specValue, ['timeWindow']));
        if (windows.length === 0) at('error', 'At least one timeWindow is required');
        windows.forEach((w, i) => {
          if (!isObject(w) || !str(w.duration).trim()) at('error', `timeWindow #${i + 1}: duration is required`);
        });
        const objectives = asArray(getIn(specValue, ['objectives']));
        if (objectives.length === 0) at('error', 'At least one objective is required');
        objectives.forEach((o, i) => {
          if (!isObject(o)) return;
          if (o.target === undefined && o.value === undefined) at('error', `Objective #${i + 1}: target is required`);
          else if (isNumber(o.target) && (o.target < 0 || o.target > 1)) at('warning', `Objective #${i + 1}: target ${o.target} is outside 0-1 (a ratio, not a percentage)`);
        });
        refList('alertPolicies', 'AlertPolicy');
        break;
      }
      case 'SLI': {
        const threshold = getIn(specValue, ['thresholdMetric']);
        const ratio = getIn(specValue, ['ratioMetric']);
        if (!isObject(threshold) && !isObject(ratio)) at('error', 'A thresholdMetric or a ratioMetric is required');
        if (isObject(threshold) && !str(getIn(threshold, ['metricSource', 'type'])).trim()) at('error', 'thresholdMetric.metricSource.type is required');
        if (isObject(ratio)) {
          if (!isObject(ratio.good) && !isObject(ratio.total)) at('error', 'ratioMetric needs at least a good or total metric source');
          if (isObject(ratio.good) && !str(getIn(ratio.good, ['metricSource', 'type'])).trim()) at('error', 'ratioMetric.good.metricSource.type is required');
          if (isObject(ratio.total) && !str(getIn(ratio.total, ['metricSource', 'type'])).trim()) at('error', 'ratioMetric.total.metricSource.type is required');
        }
        break;
      }
      case 'DataSource':
        if (!str(getIn(specValue, ['type'])).trim()) at('error', 'type is required');
        break;
      case 'AlertPolicy':
        refList('conditions', 'AlertCondition');
        refList('notificationTargets', 'AlertNotificationTarget');
        break;
      case 'AlertCondition': {
        const condition = getIn(specValue, ['condition']);
        if (!isObject(condition)) at('error', 'condition is required');
        else {
          if (!str(condition.kind).trim()) at('error', 'condition.kind is required');
          if (!isNumber(condition.threshold)) at('error', 'condition.threshold must be a number');
          if (!str(condition.lookbackWindow).trim()) at('error', 'condition.lookbackWindow is required');
        }
        break;
      }
      case 'AlertNotificationTarget':
        if (!str(getIn(specValue, ['target'])).trim()) at('error', 'target is required');
        break;
    }
  }

  for (const [key, indices] of names) {
    if (indices.length <= 1) continue;
    const name = key.slice(key.indexOf(':') + 1);
    for (const index of indices) add('error', `"${name}" is used by ${indices.length} objects of the same kind`, { kind: 'entity', index });
  }

  return issues;
}
