/** Changes made by the OpenSLO form: new objects, renames, deletes and references between them. */
import { slugify } from '../../../shared/naming';
import { getIn, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import {
  API_VERSION,
  documentsOf,
  entityAt,
  entityPath,
  entitiesOf,
  namesOf,
  str,
  type EntityInfo,
  type Kind,
} from './model';

/* New objects ---------------------------------------------------------------- */

/** Object name derived from a title, unique for its kind among `taken` names. */
export function uniqueName(title: string, taken: string[]): string {
  const base = slugify(title).slice(0, 63).replace(/-+$/, '') || 'object';
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}-${i}`;
  return name;
}

const DEFAULT_SPEC: Record<Kind, JsonObject> = {
  Service: { description: '' },
  SLO: {
    description: '',
    service: '',
    budgetingMethod: 'Occurrences',
    timeWindow: [{ duration: '28d', isRolling: true }],
    objectives: [{ displayName: 'Objective 1', target: 0.99, op: 'gte' }],
    indicator: { metadata: { name: '' }, spec: { ratioMetric: { counter: true, good: { metricSource: { type: '' } }, total: { metricSource: { type: '' } } } } },
  },
  SLI: { description: '', ratioMetric: { counter: true, good: { metricSource: { type: '' } }, total: { metricSource: { type: '' } } } },
  DataSource: { type: '', connectionDetails: {} },
  AlertPolicy: { description: '', alertWhenBreaching: true, conditions: [], notificationTargets: [] },
  AlertCondition: { description: '', severity: 'page', condition: { kind: 'burnrate', threshold: 2, lookbackWindow: '5m', alertAfter: '5m' } },
  AlertNotificationTarget: { description: '', target: '' },
};

/** A new object of `kind`, named after `title` (unique among the objects of the same kind). */
export function newEntity(spec: unknown, kind: Kind, title: string): JsonObject {
  const name = uniqueName(title, namesOf(spec, kind));
  return {
    apiVersion: API_VERSION,
    kind,
    metadata: { name, ...(title.trim() && title.trim() !== name ? { displayName: title.trim() } : {}) },
    spec: DEFAULT_SPEC[kind],
  };
}

export const appendEntityEdit = (spec: unknown, entity: JsonObject): SpecEdit => ({ op: 'set', path: entityPath(documentsOf(spec).length), value: entity });

/* References ------------------------------------------------------------------ */

/** Where a kind's objects are referenced by name from other kinds (field below `spec`, single or list). */
const REFERENCING_FIELDS: { from: Kind; to: Kind; field: string; many: boolean }[] = [
  { from: 'SLO', to: 'Service', field: 'service', many: false },
  { from: 'SLO', to: 'SLI', field: 'indicatorRef', many: false },
  { from: 'SLO', to: 'AlertPolicy', field: 'alertPolicies', many: true },
  { from: 'AlertPolicy', to: 'AlertCondition', field: 'conditions', many: true },
  { from: 'AlertPolicy', to: 'AlertNotificationTarget', field: 'notificationTargets', many: true },
];

export interface LocalReference {
  /** Document index of the object writing the reference. */
  index: number;
  path: SpecPath;
  field: string;
  position?: number;
  many: boolean;
}

/** References of this file pointing to the object of document `index` (name-based, string entries only). */
export function referencesTo(spec: unknown, index: number): LocalReference[] {
  const target = entityAt(spec, index);
  if (!target?.name) return [];
  const rule = REFERENCING_FIELDS.filter((r) => r.to === target.kind);
  return entitiesOf(spec).flatMap((info): LocalReference[] =>
    rule
      .filter((r) => r.from === info.kind)
      .flatMap((r): LocalReference[] => {
        const value = getIn(info.entity, ['spec', r.field]);
        if (r.many) {
          return Array.isArray(value)
            ? value.flatMap((v, position): LocalReference[] => (v === target.name ? [{ index: info.index, path: entityPath(info.index, 'spec', r.field, position), field: r.field, position, many: true }] : []))
            : [];
        }
        return value === target.name ? [{ index: info.index, path: entityPath(info.index, 'spec', r.field), field: r.field, many: false }] : [];
      }),
  );
}

/** Renames an object and every reference to it in this file. */
export function renameEntityEdits(spec: unknown, index: number, newName: string): SpecEdit[] {
  const edits: SpecEdit[] = referencesTo(spec, index).map((r) => ({ op: 'set', path: r.path, value: newName }));
  return [{ op: 'set', path: entityPath(index, 'metadata', 'name'), value: newName }, ...edits];
}

/** List entries removed with the object (alertPolicies, conditions, notificationTargets) and single references left dangling. */
export function deleteImpact(spec: unknown, index: number): { removed: number; broken: number } {
  const refs = referencesTo(spec, index).filter((r) => r.index !== index);
  return { removed: refs.filter((r) => r.many).length, broken: refs.filter((r) => !r.many).length };
}

/** Deletes the document and the list entries pointing to it. Single references (service, indicatorRef) stay, flagged by the checks. */
export function deleteEntityEdits(spec: unknown, index: number): SpecEdit[] {
  const listEntries = referencesTo(spec, index)
    .filter((r) => r.many && r.index !== index)
    .sort((a, b) => a.index - b.index || a.field.localeCompare(b.field) || (b.position ?? 0) - (a.position ?? 0));
  return [...listEntries.map((r): SpecEdit => ({ op: 'delete', path: r.path })), { op: 'delete', path: entityPath(index) }];
}

/** Adds a reference to a list field (alertPolicies, conditions, notificationTargets) unless it is already there. */
export function addRefEdit(spec: unknown, index: number, field: string, targetName: string): SpecEdit | undefined {
  const info = entityAt(spec, index);
  if (!info || !targetName.trim()) return undefined;
  const list = getIn(info.entity, ['spec', field]);
  const values = Array.isArray(list) ? list.map(str) : [];
  if (values.includes(targetName)) return undefined;
  return { op: 'set', path: entityPath(index, 'spec', field, values.length), value: targetName };
}

/** Objects a reference field of `kind` may point to, as names. */
export function candidatesFor(spec: unknown, from: Kind, field: string): string[] {
  const rule = REFERENCING_FIELDS.find((r) => r.from === from && r.field === field);
  return rule ? namesOf(spec, rule.to) : [];
}

export const referenceRule = (from: Kind, field: string) => REFERENCING_FIELDS.find((r) => r.from === from && r.field === field);

export type { EntityInfo };
