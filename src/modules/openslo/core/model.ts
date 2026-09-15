/**
 * OpenSLO knowledge used by the form editor, the catalog and the checks.
 *
 * An OpenSLO file holds one object per YAML document (`---` separated): Services, SLOs, SLIs,
 * DataSources, AlertPolicies, AlertConditions and AlertNotificationTargets. The form sees
 * `{ documents: [...] }` (see `yamlDocuments.ts`), so the object of document `i` lives at
 * `['documents', i]`. Objects reference each other by `metadata.name`, scoped to their file.
 */
import { getIn, isObject, type Json, type JsonObject, type SpecPath } from '../../../shared/structured/edits';
import { DOCUMENTS_KEY } from '../../../shared/structured/yamlDocuments';

export const API_VERSION = 'openslo/v1';

export type Kind = 'SLO' | 'Service' | 'SLI' | 'DataSource' | 'AlertPolicy' | 'AlertCondition' | 'AlertNotificationTarget';

export const KINDS: Kind[] = ['Service', 'SLO', 'SLI', 'DataSource', 'AlertPolicy', 'AlertCondition', 'AlertNotificationTarget'];

export const KIND_INFO: Record<Kind, { singular: string; plural: string; icon: string; hint: string }> = {
  Service: { singular: 'Service', plural: 'Services', icon: 'server-environment', hint: 'What the SLOs are measured for.' },
  SLO: { singular: 'SLO', plural: 'SLOs', icon: 'target', hint: 'A service level objective: a target on an indicator, with an error budget.' },
  SLI: { singular: 'SLI', plural: 'SLIs', icon: 'pulse', hint: 'A service level indicator: how good and total (or threshold) events are measured.' },
  DataSource: { singular: 'Data source', plural: 'Data sources', icon: 'database', hint: 'Where indicators query their metrics (Prometheus, Datadog, CloudWatch…).' },
  AlertPolicy: { singular: 'Alert policy', plural: 'Alert policies', icon: 'bell', hint: 'When and how to alert on an SLO, from its conditions and notification targets.' },
  AlertCondition: { singular: 'Alert condition', plural: 'Alert conditions', icon: 'symbol-event', hint: 'A burn rate threshold that triggers an alert policy.' },
  AlertNotificationTarget: { singular: 'Notification target', plural: 'Notification targets', icon: 'megaphone', hint: 'Where an alert is sent (Slack, email, PagerDuty…).' },
};

export const BUDGETING_METHODS = ['Occurrences', 'Timeslices'];
export const OBJECTIVE_OPS = ['lt', 'lte', 'gt', 'gte'];
export const DATA_SOURCE_TYPES = ['Prometheus', 'Datadog', 'CloudWatch', 'NewRelic', 'Splunk', 'Lightstep', 'Dynatrace', 'Sumologic', 'Graphite', 'ThousandEyes', 'Instana', 'Elasticsearch'];
export const NOTIFICATION_TARGET_TYPES = ['Slack', 'Email', 'PagerDuty', 'Webhook', 'Opsgenie', 'MSTeams'];
export const ALERT_SEVERITIES = ['page', 'ticket', 'info'];

export type OpenSloLocation = { kind: 'overview' } | { kind: 'entity'; index: number };

export const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** "service", "SLO", "alert policy" (acronyms keep their case). */
export const lowerLabel = (text: string) => (/^[A-Z]{2,}/.test(text) ? text : text.toLowerCase());

export const entityPath = (index: number, ...rest: SpecPath): SpecPath => [DOCUMENTS_KEY, index, ...rest];

export function documentsOf(spec: unknown): Json[] {
  const list = getIn(spec, [DOCUMENTS_KEY]);
  return Array.isArray(list) ? list : [];
}

export interface EntityInfo {
  /** Document index in the file. */
  index: number;
  entity: JsonObject;
  kind: string;
  name: string;
  displayName: string;
}

const infoOf = (entity: JsonObject, index: number): EntityInfo => ({
  index,
  entity,
  kind: str(entity.kind),
  name: str(getIn(entity, ['metadata', 'name'])),
  displayName: str(getIn(entity, ['metadata', 'displayName'])),
});

/** Objects of the file; empty documents (e.g. after a trailing `---`) are skipped. */
export function entitiesOf(spec: unknown): EntityInfo[] {
  return documentsOf(spec).flatMap((doc, index) => (isObject(doc) ? [infoOf(doc, index)] : []));
}

export function entityAt(spec: unknown, index: number): EntityInfo | undefined {
  const doc = documentsOf(spec)[index];
  return isObject(doc) ? infoOf(doc, index) : undefined;
}

export const isKind = (value: string): value is Kind => (KINDS as string[]).includes(value);

export function entitiesOfKind(spec: unknown, kind: Kind): EntityInfo[] {
  return entitiesOf(spec).filter((e) => e.kind === kind);
}

export function entityLabel(entity: unknown, fallback = '(unnamed)'): string {
  return str(getIn(entity, ['metadata', 'displayName'])).trim() || str(getIn(entity, ['metadata', 'name'])).trim() || fallback;
}

export function findByName(spec: unknown, kind: Kind, name: string): EntityInfo | undefined {
  return entitiesOfKind(spec, kind).find((e) => e.name === name);
}

/** Names already used by a kind, other than `except` (used to validate a rename or a new name). */
export function namesOf(spec: unknown, kind: Kind, except?: number): string[] {
  return entitiesOfKind(spec, kind)
    .filter((e) => e.index !== except)
    .map((e) => e.name)
    .filter(Boolean);
}

export function apiVersion(spec: unknown): string | undefined {
  const first = documentsOf(spec).find(isObject);
  const value = first ? getIn(first, ['apiVersion']) : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** OpenSLO major version ("v1", "v1alpha"…) the form editor understands, else undefined. */
export function majorVersion(spec: unknown): string | undefined {
  const version = apiVersion(spec);
  const major = version?.startsWith('openslo/') ? version.slice('openslo/'.length) : undefined;
  return major === 'v1' ? major : undefined;
}
