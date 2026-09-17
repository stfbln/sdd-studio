/**
 * Mermaid flowchart of a chosen part of the software catalog, made to draw C4 context (C1) and
 * container (C2) diagrams.
 *
 * An entity is drawn *inside* the entity it belongs to (its domain, system, parent component or
 * parent network), so the hierarchy is nesting, not arrows; every other relationship the catalog
 * records (APIs, dependencies, deployment, code, ownership) becomes a labelled arrow, by group.
 * Colours and shapes come from the category, and are written in the diagram itself so it looks the
 * same wherever it is rendered.
 */
import { slugify } from '../../../shared/naming';
import {
  CATEGORIES,
  CODE,
  HIERARCHY,
  NETWORKS,
  ORGANIZATION,
  PARENT_FIELDS,
  parentRelation,
  relationshipOf,
  resourceTypeOf,
  reverseRelationship,
  runsIn,
  summaryLabel,
  type Category,
  type EntitySummary,
} from './model';

export type LabelMode = 'name' | 'description';
export type Direction = 'TB' | 'LR';

export interface DiagramOptions {
  /** Keys of the entities to draw. */
  selected: string[];
  /** Keys of the entities the diagram is about; they get a stronger outline. */
  focus?: string[];
  direction: Direction;
  labels: LabelMode;
  /** Ids of the relation groups drawn as arrows. */
  relations: string[];
}

export interface RelationGroup {
  id: string;
  label: string;
  hint: string;
}

/** Relationships that can be drawn, as the picker offers them. */
export const RELATION_GROUPS: RelationGroup[] = [
  { id: 'apis', label: 'APIs', hint: 'Which component provides each API, and which ones consume it.' },
  { id: 'dependencies', label: 'Dependencies', hint: 'What a component or resource uses, reads, calls…: other components, resources, data assets, and networks it uses without running in them.' },
  { id: 'deployment', label: 'Deployment', hint: 'Networks entities run in, platforms and infrastructure they are deployed on, and sites hosting those.' },
  { id: 'code', label: 'Code and artifacts', hint: 'Repositories holding the code, and what builds each artifact.' },
  { id: 'ownership', label: 'Ownership', hint: 'The group or user owning each entity.' },
];

export const DEFAULT_DIAGRAM: DiagramOptions = { selected: [], direction: 'LR', labels: 'name', relations: ['apis', 'dependencies'] };

/** Categories offered for selection, in the groups of the outline. */
export const DIAGRAM_GROUPS: { id: string; label: string; categories: Category[] }[] = [
  { id: 'software', label: 'Software', categories: HIERARCHY },
  { id: 'infrastructure', label: 'Infrastructure', categories: NETWORKS },
  { id: 'code', label: 'Code and artifacts', categories: CODE },
  { id: 'organization', label: 'Organization', categories: ORGANIZATION },
];

/* Shapes and colours -------------------------------------------------------- */

/** Node shape per category, as the opening and closing part of a Mermaid node. */
const SHAPES: Record<Category, [string, string]> = {
  domain: ['["', '"]'],
  system: ['["', '"]'],
  component: ['["', '"]'],
  api: ['(["', '"])'],
  resource: ['[("', '")]'],
  dataAsset: ['[/"', '"/]'],
  network: ['{{"', '"}}'],
  platform: ['[["', '"]]'],
  infrastructure: ['[["', '"]]'],
  site: ['{{"', '"}}'],
  artifact: ['[["', '"]]'],
  repository: ['[["', '"]]'],
  group: ['("', '")'],
  user: ['("', '")'],
  location: ['["', '"]'],
  other: ['["', '"]'],
};

/** Fill and stroke of a node, and the lighter fill used when the entity contains other ones. */
const COLORS: Record<Category, { fill: string; stroke: string; cluster: string }> = {
  domain: { fill: '#ede9fe', stroke: '#7c3aed', cluster: '#faf7ff' },
  system: { fill: '#dbeafe', stroke: '#2563eb', cluster: '#f5f9ff' },
  component: { fill: '#e0f2fe', stroke: '#0284c7', cluster: '#f3fbff' },
  api: { fill: '#dcfce7', stroke: '#16a34a', cluster: '#f4fdf7' },
  resource: { fill: '#fef3c7', stroke: '#d97706', cluster: '#fffcf2' },
  dataAsset: { fill: '#ffe4e6', stroke: '#e11d48', cluster: '#fff5f6' },
  network: { fill: '#e2e8f0', stroke: '#475569', cluster: '#f8fafc' },
  platform: { fill: '#cffafe', stroke: '#0891b2', cluster: '#f2fdff' },
  infrastructure: { fill: '#ccfbf1', stroke: '#0d9488', cluster: '#f2fffc' },
  site: { fill: '#f1f5f9', stroke: '#64748b', cluster: '#fafcfe' },
  artifact: { fill: '#fae8ff', stroke: '#a21caf', cluster: '#fef7ff' },
  repository: { fill: '#f5f5f4', stroke: '#78716c', cluster: '#fbfbfa' },
  group: { fill: '#ffedd5', stroke: '#ea580c', cluster: '#fffaf3' },
  user: { fill: '#ffedd5', stroke: '#f97316', cluster: '#fffaf3' },
  location: { fill: '#f1f5f9', stroke: '#64748b', cluster: '#fafcfe' },
  other: { fill: '#f1f5f9', stroke: '#64748b', cluster: '#fafcfe' },
};

const TEXT_COLOR = '#0f172a';

/** Layout and colours written at the top of the diagram, so every renderer shows the same thing. */
const INIT = [
  '%%{init: {"theme": "base", "themeVariables": {',
  '"fontFamily": "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", "fontSize": "14px",',
  `"lineColor": "#8a94a6", "primaryColor": "#eef2f7", "primaryBorderColor": "#8a94a6", "primaryTextColor": "${TEXT_COLOR}",`,
  '"clusterBkg": "#f8fafc", "clusterBorder": "#cbd5e1", "edgeLabelBackground": "#ffffff"',
  '}, "flowchart": {"nodeSpacing": 55, "rankSpacing": 70, "padding": 12, "curve": "basis", "diagramPadding": 16}} }%%',
].join(' ');

/* Labels -------------------------------------------------------------------- */

const MAX_WIDTH = 30;
const MAX_DESCRIPTION_LINES = 3;

/** Mermaid reads `#code;` escapes, so characters that would end the label (`"`, or `|` on an arrow) or start a tag are written that way. */
export function escapeLabel(text: string): string {
  return text.replace(/#/g, '#35;').replace(/&/g, '#amp;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/"/g, '#quot;').replace(/\|/g, '#124;');
}

/** Cuts a description into lines short enough to keep the box narrow, with an ellipsis when it is long. */
export function wrapText(text: string, width = MAX_WIDTH, maxLines = MAX_DESCRIPTION_LINES): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)) {
    for (let rest = word; rest; ) {
      const piece = rest.length > width ? rest.slice(0, width) : rest;
      rest = rest.slice(piece.length);
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line = `${line} ${piece}`;
      else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1].replace(/[\s,;:.]+$/, '');
    lines.length = maxLines;
    lines[maxLines - 1] = `${last.length > width - 1 ? last.slice(0, width - 1) : last}…`;
  }
  return lines;
}

/** What a box says: the name, and with descriptions on, what the entity is and what it does. */
export function nodeLabel(entity: EntitySummary, mode: LabelMode): string {
  const lines = [summaryLabel(entity)];
  if (mode === 'description') {
    // A network, data asset or artifact is a Resource of that type: saying it twice adds nothing.
    const type = entity.type === resourceTypeOf(entity.category) ? undefined : entity.type;
    lines.push(`[${[CATEGORIES[entity.category].singular, type].filter(Boolean).join(' · ')}]`);
    if (entity.description) lines.push(...wrapText(entity.description));
  }
  return lines.map(escapeLabel).join('<br/>');
}

/* Relationships ------------------------------------------------------------- */

interface Edge {
  from: string;
  to: string;
  label: string;
  group: string;
  dashed?: boolean;
}

/** The group of the relationships the nesting shows: they are boxes inside boxes, never arrows. */
export const HIERARCHY_GROUP = 'hierarchy';

/** Seen from a focus, the nesting reads two ways: what holds it, and what it holds. */
export const AROUND_GROUP = 'around';
export const INSIDE_GROUP = 'inside';
export const HIERARCHY_GROUPS = [AROUND_GROUP, INSIDE_GROUP];

export interface Connection {
  /** Relation group, or `hierarchy` when the nesting shows it. */
  group: string;
  /**
   * What the entity writing the relationship does to the other one: "uses", "owned by"… Empty
   * when it is the reverse of a relationship written in words of its own (no known reverse).
   */
  forward: string;
  /** The same relationship read the other way round: "used by", "owns"… Empty like `forward`. */
  backward: string;
  dashed?: boolean;
  /** The arrow goes from the target to the entity writing the relationship (it wrote the reverse). */
  inverted?: boolean;
}

/** A relationship the nesting already shows, so it is not drawn as an arrow too. */
const isContainment = (entity: EntitySummary, field: string, target: EntitySummary) =>
  PARENT_FIELDS.includes(field) || (entity.category === 'network' && target.category === 'network' && (field === 'dependsOn' || field === 'dependencyOf'));

/**
 * What a relationship written by `writer` about `target` says, read from either end, and which way
 * the arrow points. Both sides of a relationship (`dependsOn` / `dependencyOf`) read the same way,
 * so it is only drawn once: the relationship written by the entity depending on the other one
 * ("uses" the internet rather than "runs in" it) names both.
 */
export function connectionOf(writer: EntitySummary, field: string, target: EntitySummary): Connection | undefined {
  if (isContainment(writer, field, target)) return { group: HIERARCHY_GROUP, forward: 'in', backward: 'contains' };
  switch (field) {
    case 'providesApis':
      return { group: 'apis', forward: 'provides', backward: 'provided by' };
    case 'consumesApis':
      return { group: 'apis', forward: 'consumes', backward: 'consumed by' };
    case 'dependsOn':
    case 'dependencyOf': {
      const inverted = field === 'dependencyOf';
      const [dependent, dependency] = inverted ? [target, writer] : [writer, target];
      const relation = dependent.relations.find((r) => r.field === 'dependsOn' && r.target === dependency.key) ?? { field: 'dependsOn', target: dependency.key };
      const label = relationshipOf(relation, dependency);
      const placed = runsIn(relation, dependency);
      const group = placed ? { group: 'deployment', dashed: true } : { group: 'dependencies' };
      const reverse = reverseRelationship(label);
      return inverted ? { ...group, forward: reverse, backward: label, inverted } : { ...group, forward: label, backward: reverse };
    }
    case 'deployedOn':
      return { group: 'deployment', forward: 'runs on', backward: 'hosts', dashed: true };
    case 'site':
      return { group: 'deployment', forward: 'hosted at', backward: 'hosts', dashed: true };
    case 'repository':
      return { group: 'code', forward: 'code in', backward: 'holds code for', dashed: true };
    case 'producedBy':
      return { group: 'code', forward: 'built by', backward: 'builds', dashed: true, inverted: true };
    case 'owner':
      return { group: 'ownership', forward: 'owned by', backward: 'owns', dashed: true, inverted: true };
    default:
      return undefined;
  }
}

/** The arrow a written relationship becomes, or nothing when the nesting already shows it. */
function edgeOf(writer: EntitySummary, field: string, target: EntitySummary): Edge | undefined {
  const connection = connectionOf(writer, field, target);
  if (!connection || connection.group === HIERARCHY_GROUP) return undefined;
  const { group, dashed } = connection;
  return connection.inverted
    ? { from: target.key, to: writer.key, label: connection.backward, group, ...(dashed ? { dashed } : {}) }
    : { from: writer.key, to: target.key, label: connection.forward, group, ...(dashed ? { dashed } : {}) };
}

/* Hierarchy ----------------------------------------------------------------- */

export interface HierarchyRow {
  entity: EntitySummary;
  /** 0 for entities whose parent is not in the list. */
  depth: number;
}

const ORDER: Category[] = [...HIERARCHY, ...NETWORKS, ...CODE, ...ORGANIZATION, 'location', 'other'];

const byCategoryThenName = (a: EntitySummary, b: EntitySummary) =>
  ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || summaryLabel(a).localeCompare(summaryLabel(b));

/**
 * Entities as a tree flattened into rows, each below the entity holding it. Only entities of
 * `categories` are kept (when given), and the tree is built among those, as the outline does.
 */
export function hierarchyRows(entities: EntitySummary[], categories?: Category[]): HierarchyRow[] {
  const kept = categories ? entities.filter((e) => categories.includes(e.category)) : [...entities];
  const inList = new Set(kept.map((e) => e.key));
  const parentOf = new Map(kept.map((e) => [e.key, parentRelation(e, entities)?.target]));
  const childrenOf = new Map<string, EntitySummary[]>();
  for (const entity of kept) {
    const parent = parentOf.get(entity.key);
    if (parent && inList.has(parent) && parent !== entity.key) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), entity]);
  }
  const rows: HierarchyRow[] = [];
  const placed = new Set<string>();
  const visit = (entity: EntitySummary, depth: number) => {
    if (placed.has(entity.key)) return;
    placed.add(entity.key);
    rows.push({ entity, depth });
    [...(childrenOf.get(entity.key) ?? [])].sort(byCategoryThenName).forEach((child) => visit(child, depth + 1));
  };
  const roots = kept.filter((e) => {
    const parent = parentOf.get(e.key);
    return !parent || parent === e.key || !inList.has(parent);
  });
  [...roots].sort(byCategoryThenName).forEach((entity) => visit(entity, 0));
  // Entities caught in a loop of parents.
  kept.filter((e) => !placed.has(e.key)).sort(byCategoryThenName).forEach((entity) => visit(entity, 0));
  return rows;
}

/** Keys of `key` and of everything below it in the rows (its subtree). */
export function subtreeKeys(rows: HierarchyRow[], key: string): string[] {
  const start = rows.findIndex((r) => r.entity.key === key);
  if (start < 0) return [];
  const keys = [key];
  for (let i = start + 1; i < rows.length && rows[i].depth > rows[start].depth; i++) keys.push(rows[i].entity.key);
  return keys;
}

/* What a focus is connected to ---------------------------------------------- */

export interface RelatedEntity {
  entity: EntitySummary;
  /** Relation groups the connections belong to, plus `around` and `inside` for the nesting. */
  groups: string[];
  /** How it relates to the focus, read from this entity: "used by Shop API", "in Online shop". */
  connections: string[];
}

/** Order the groups of connections are offered in: the boxes first, then what talks to what. */
const GROUP_ORDER = [...HIERARCHY_GROUPS, ...RELATION_GROUPS.map((g) => g.id)];

/**
 * Entities the focus is connected to, with what each connection says. Everything the catalog
 * records counts: what the focus points to, and what points at the focus. Entities with no
 * connection to the focus are not here.
 */
export function relatedEntities(entities: EntitySummary[], focus: string[]): RelatedEntity[] {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const chosen = new Set(focus.filter((key) => byKey.has(key)));
  const found = new Map<string, { entity: EntitySummary; groups: Set<string>; connections: Set<string> }>();
  const add = (entity: EntitySummary, group: string, phrase: string) => {
    const known = found.get(entity.key) ?? { entity, groups: new Set<string>(), connections: new Set<string>() };
    known.groups.add(group);
    known.connections.add(phrase);
    found.set(entity.key, known);
  };

  // A relationship with no known reverse is read from the focus instead: "Shop API fetches prices from it".
  const phrase = (verb: string, reverse: string, label: string) => (verb ? `${verb} ${label}` : `${label} ${reverse} it`);

  for (const key of chosen) {
    const self = byKey.get(key)!;
    const label = summaryLabel(self);
    // What the focus says about others, read from the other entity ("used by Shop API"). A
    // hierarchy field written by the focus points at what holds it.
    for (const relation of self.relations) {
      const target = byKey.get(relation.target);
      if (!target || chosen.has(target.key)) continue;
      const connection = connectionOf(self, relation.field, target);
      if (connection) add(target, connection.group === HIERARCHY_GROUP ? AROUND_GROUP : connection.group, phrase(connection.backward, connection.forward, label));
    }
    // What others say about the focus, read from them ("provides Petstore API", "in Online shop").
    for (const other of entities) {
      if (chosen.has(other.key)) continue;
      for (const relation of other.relations.filter((r) => r.target === key)) {
        const connection = connectionOf(other, relation.field, self);
        if (connection) add(other, connection.group === HIERARCHY_GROUP ? INSIDE_GROUP : connection.group, phrase(connection.forward, connection.backward, label));
      }
    }
  }

  const rank = (groups: Set<string>) => Math.min(...[...groups].map((g) => GROUP_ORDER.indexOf(g)));
  return [...found.values()]
    .map((r) => ({ entity: r.entity, groups: [...r.groups].sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)), connections: [...r.connections] }))
    .sort((a, b) => rank(new Set(a.groups)) - rank(new Set(b.groups)) || byCategoryThenName(a.entity, b.entity));
}

/* The diagram --------------------------------------------------------------- */

/**
 * The closest entity above `entity` in the hierarchy that is drawn too: an entity whose system is
 * left out of the diagram still lands in its domain instead of floating alone.
 */
function nearestChosen(entity: EntitySummary, entities: EntitySummary[], chosen: Set<string>, byKey: Map<string, EntitySummary>): string | undefined {
  const seen = new Set([entity.key]);
  let parent = parentRelation(entity, entities)?.target;
  while (parent && !seen.has(parent)) {
    if (chosen.has(parent)) return parent;
    seen.add(parent);
    const next = byKey.get(parent);
    parent = next && parentRelation(next, entities)?.target;
  }
  return undefined;
}

export interface Diagram {
  /** Mermaid source, empty when nothing is selected. */
  text: string;
  /** Entities drawn and arrows drawn, for the summary shown next to the diagram. */
  entities: number;
  arrows: number;
  /** Selected entities the catalog no longer has (deleted or renamed since). */
  missing: string[];
}

/** Mermaid node ids: letters, digits and underscores, unique, and readable in the source. */
function nodeIds(drawn: EntitySummary[]): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const entity of drawn) {
    const base = `${entity.category.toLowerCase()}_${slugify(entity.name, '_') || 'entity'}`;
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
    taken.add(id);
    ids.set(entity.key, id);
  }
  return ids;
}

export function buildDiagram(entities: EntitySummary[], options: DiagramOptions): Diagram {
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const chosen = new Set(options.selected.filter((key) => byKey.has(key)));
  const missing = options.selected.filter((key) => !byKey.has(key));
  const drawn = entities.filter((e) => chosen.has(e.key));
  if (!drawn.length) return { text: '', entities: 0, arrows: 0, missing };

  // Nesting: the closest selected entity above this one, so leaving a system out does not lose its parts.
  const containerOf = new Map<string, string>();
  for (const entity of drawn) {
    const container = nearestChosen(entity, entities, chosen, byKey);
    if (container) containerOf.set(entity.key, container);
  }
  const childrenOf = new Map<string, EntitySummary[]>();
  for (const entity of drawn) {
    const container = containerOf.get(entity.key);
    if (container) childrenOf.set(container, [...(childrenOf.get(container) ?? []), entity]);
  }

  const ids = nodeIds(drawn);
  const clusters: EntitySummary[] = [];
  const nodesByCategory = new Map<Category, string[]>();
  const lines: string[] = [];

  const render = (entity: EntitySummary, depth: number) => {
    const pad = '  '.repeat(depth + 1);
    const id = ids.get(entity.key)!;
    const label = nodeLabel(entity, options.labels);
    const children = childrenOf.get(entity.key) ?? [];
    if (!children.length) {
      const [open, close] = SHAPES[entity.category];
      nodesByCategory.set(entity.category, [...(nodesByCategory.get(entity.category) ?? []), id]);
      lines.push(`${pad}${id}${open}${label}${close}`);
      return;
    }
    clusters.push(entity);
    lines.push(`${pad}subgraph ${id}["${label}"]`);
    [...children].sort(byCategoryThenName).forEach((child) => render(child, depth + 1));
    lines.push(`${pad}end`);
  };
  drawn.filter((e) => !containerOf.has(e.key)).sort(byCategoryThenName).forEach((entity) => render(entity, 0));

  // Arrows: every relationship between two drawn entities that the nesting does not already show.
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const entity of drawn) {
    for (const relation of entity.relations) {
      const target = byKey.get(relation.target);
      if (!target || !chosen.has(target.key) || isContainment(entity, relation.field, target)) continue;
      const edge = edgeOf(entity, relation.field, target);
      if (!edge || edge.from === edge.to || !options.relations.includes(edge.group)) continue;
      if (containerOf.get(edge.from) === edge.to || containerOf.get(edge.to) === edge.from) continue;
      const key = `${edge.from}|${edge.to}|${edge.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  }
  if (edges.length) lines.push('');
  for (const edge of edges) lines.push(`  ${ids.get(edge.from)} ${edge.dashed ? '-.->' : '-->'}|${escapeLabel(edge.label)}| ${ids.get(edge.to)}`);

  // Colours: one class per category of plain box, one style per box holding other ones, and a
  // stronger outline for the entities the diagram is about.
  const inFocus = new Set((options.focus ?? []).filter((key) => chosen.has(key)));
  const width = (entity: EntitySummary) => (inFocus.has(entity.key) ? '2.5px' : '1px');
  const styles: string[] = [];
  for (const [category, list] of [...nodesByCategory].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
    const { fill, stroke } = COLORS[category];
    styles.push(`  classDef ${category} fill:${fill},stroke:${stroke},stroke-width:1px,color:${TEXT_COLOR};`);
    styles.push(`  class ${list.join(',')} ${category};`);
  }
  for (const entity of [...clusters, ...drawn.filter((e) => inFocus.has(e.key) && !childrenOf.has(e.key))]) {
    const colors = COLORS[entity.category];
    const fill = childrenOf.has(entity.key) ? colors.cluster : colors.fill;
    styles.push(`  style ${ids.get(entity.key)} fill:${fill},stroke:${colors.stroke},stroke-width:${width(entity)},color:${TEXT_COLOR};`);
  }
  if (styles.length) lines.push('', ...styles);

  return { text: [INIT, `flowchart ${options.direction}`, ...lines].join('\n'), entities: drawn.length, arrows: edges.length, missing };
}

/** Title offered for the diagram: the entity everything hangs from, when there is only one. */
export function suggestedTitle(entities: EntitySummary[], selected: string[]): string {
  const chosen = new Set(selected);
  const byKey = new Map(entities.map((e) => [e.key, e]));
  const roots = entities.filter((e) => chosen.has(e.key) && !nearestChosen(e, entities, chosen, byKey));
  return roots.length === 1 ? summaryLabel(roots[0]) : '';
}

/** The markdown file an exported diagram is written to: GitHub, GitLab and VS Code render the fence. */
export function diagramMarkdown(title: string, diagram: string): string {
  return [
    `# ${title.trim() || 'Software catalog diagram'}`,
    '',
    '<!-- Diagram of the software catalog, exported by SDD Studio. To change it, open the catalog,',
    '     choose the entities on the Diagram page and export again over this file. -->',
    '',
    '```mermaid',
    diagram,
    '```',
    '',
  ].join('\n');
}
