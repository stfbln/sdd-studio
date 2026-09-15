import type {
  BackgroundModel,
  DialectKeywords,
  GherkinDocumentModel,
  RuleModel,
  ScenarioModel,
  StepModel,
} from '../core/model';

export const newId = () => crypto.randomUUID();

type Node = { id: string };
const CHILD_LISTS = ['children', 'steps', 'examples'] as const;

export interface Location {
  node: Node;
  /** Array containing the node; undefined for the Feature itself. */
  list?: Node[];
  index: number;
}

/** Finds any identified node (feature, rule, scenario, step, examples...) in the document. */
export function locate(doc: GherkinDocumentModel, id: string): Location | undefined {
  const feature = doc.feature;
  if (!feature) return undefined;
  if (feature.id === id) return { node: feature, index: 0 };
  const visit = (list: Node[]): Location | undefined => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      if (node.id === id) return { node, list, index };
      for (const key of CHILD_LISTS) {
        const nested = (node as Record<string, unknown>)[key];
        if (Array.isArray(nested)) {
          const found = visit(nested as Node[]);
          if (found) return found;
        }
      }
    }
    return undefined;
  };
  return visit(feature.children);
}

/** Deep copy with new ids, used when duplicating. */
export function withFreshIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withFreshIds) as T;
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) copy[k] = k === 'id' ? newId() : withFreshIds(v);
    return copy as T;
  }
  return value;
}

/**
 * Keeps ids of nodes that sit at the same place after an external change,
 * so React keeps inputs (and their focus) mounted.
 */
export function reconcileIds(previous: unknown, next: unknown): void {
  if (Array.isArray(previous) && Array.isArray(next)) {
    next.forEach((item, i) => reconcileIds(previous[i], item));
    return;
  }
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return;
  const p = previous as Record<string, unknown>;
  const n = next as Record<string, unknown>;
  if (p.kind !== n.kind) return;
  if (typeof p.id === 'string' && typeof n.id === 'string') n.id = p.id;
  for (const key of ['feature', ...CHILD_LISTS]) reconcileIds(p[key], n[key]);
}

/** Preferred keyword of a list, ignoring the generic "* ". */
export function primaryKeyword(list: string[]): string {
  return list.find((k) => k.trim() !== '*') ?? list[0];
}

export function newStep(dialect: DialectKeywords, previous?: StepModel): StepModel {
  return {
    id: newId(),
    comments: [],
    keyword: previous ? primaryKeyword(dialect.and) : primaryKeyword(dialect.given),
    text: '',
  };
}

export function newScenario(dialect: DialectKeywords, outline = false): ScenarioModel {
  return {
    kind: 'scenario',
    id: newId(),
    comments: [],
    tags: [],
    keyword: primaryKeyword(outline ? dialect.scenarioOutline : dialect.scenario).trim(),
    name: '',
    description: '',
    steps: [
      { id: newId(), comments: [], keyword: primaryKeyword(dialect.given), text: '' },
      { id: newId(), comments: [], keyword: primaryKeyword(dialect.when), text: '' },
      { id: newId(), comments: [], keyword: primaryKeyword(dialect.then), text: '' },
    ],
    examples: [],
  };
}

export function newBackground(dialect: DialectKeywords): BackgroundModel {
  return {
    kind: 'background',
    id: newId(),
    comments: [],
    keyword: primaryKeyword(dialect.background).trim(),
    name: '',
    description: '',
    steps: [{ id: newId(), comments: [], keyword: primaryKeyword(dialect.given), text: '' }],
  };
}

export function newRule(dialect: DialectKeywords): RuleModel {
  return {
    kind: 'rule',
    id: newId(),
    comments: [],
    tags: [],
    keyword: primaryKeyword(dialect.rule).trim(),
    name: '',
    description: '',
    children: [newScenario(dialect)],
  };
}

export function emptyDocument(dialect: DialectKeywords): GherkinDocumentModel {
  return {
    language: dialect.code,
    trailingComments: [],
    feature: {
      id: newId(),
      comments: [],
      tags: [],
      keyword: primaryKeyword(dialect.feature).trim(),
      name: '',
      description: '',
      children: [newScenario(dialect)],
    },
  };
}
