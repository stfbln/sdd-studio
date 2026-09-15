import type { DialectKeywords, ExamplesModel, ScenarioModel, StepModel } from './model';

const PARAMETER = /<([^<>\n]+)>/g;

/** Parameter names referenced as `<name>` in a scenario, in order of first appearance. */
export function scenarioParameters(scenario: Pick<ScenarioModel, 'name' | 'steps'>): string[] {
  const found = new Set<string>();
  const scan = (text: string | undefined) => {
    if (!text) return;
    for (const m of text.matchAll(PARAMETER)) found.add(m[1]);
  };
  scan(scenario.name);
  for (const step of scenario.steps) {
    scan(step.text);
    step.dataTable?.rows.forEach((row) => row.forEach(scan));
    scan(step.docString?.content);
    scan(step.docString?.mediaType);
  }
  return [...found];
}

export interface ExamplesAnalysis {
  /** Parameters used in steps but absent from this table header. */
  missing: string[];
  /** Header columns that no step refers to. */
  unused: string[];
}

export function analyzeExamples(parameters: string[], examples: Pick<ExamplesModel, 'header'>): ExamplesAnalysis {
  return {
    missing: parameters.filter((p) => !examples.header.includes(p)),
    unused: examples.header.filter((h) => !parameters.includes(h)),
  };
}

/** Replaces `<name>` placeholders with the values of one Examples row. */
export function substitute(text: string, header: string[], row: string[]): string {
  return text.replace(PARAMETER, (whole, name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? '') : whole;
  });
}

export function isOutlineKeyword(keyword: string, dialect: DialectKeywords): boolean {
  return dialect.scenarioOutline.some((k) => k.trim() === keyword.trim());
}

/** Turns free text into a parameter name: "12 cucumbers" -> "12_cucumbers". */
export function suggestParameterName(text: string, taken: string[]): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30) || 'value';
  const stem = /^\d/.test(base) ? `value_${base}` : base;
  let name = stem;
  for (let i = 2; taken.includes(name); i++) name = `${stem}_${i}`;
  return name;
}

export function addColumn(examples: ExamplesModel, name: string, value = ''): ExamplesModel {
  return { ...examples, header: [...examples.header, name], rows: examples.rows.map((r) => [...r, value]) };
}

export function renameColumn(examples: ExamplesModel, from: string, to: string): ExamplesModel {
  return { ...examples, header: examples.header.map((h) => (h === from ? to : h)) };
}

export function removeColumn(examples: ExamplesModel, index: number): ExamplesModel {
  return {
    ...examples,
    header: examples.header.filter((_, i) => i !== index),
    rows: examples.rows.map((r) => r.filter((_, i) => i !== index)),
  };
}

/**
 * Replaces the selected part of a step text by `<name>` and records the original
 * value in every Examples table, turning the scenario into an outline if needed.
 */
export function extractParameter(
  scenario: ScenarioModel,
  stepId: string,
  selection: { start: number; end: number },
  name: string,
  dialect: DialectKeywords,
  newId: () => string,
): ScenarioModel {
  const step = scenario.steps.find((s) => s.id === stepId);
  if (!step) return scenario;
  const value = step.text.slice(selection.start, selection.end);
  const steps: StepModel[] = scenario.steps.map((s) =>
    s.id === stepId
      ? { ...s, text: s.text.slice(0, selection.start) + `<${name}>` + s.text.slice(selection.end) }
      : s,
  );

  let examples = scenario.examples.map((e) => {
    if (e.header.includes(name)) return e;
    const withColumn = addColumn(e, name, value);
    return withColumn.rows.length ? withColumn : { ...withColumn, rows: [withColumn.header.map((h) => (h === name ? value : ''))] };
  });
  if (!examples.length) {
    examples = [newExamples(dialect, scenarioParameters({ name: scenario.name, steps }), newId, { [name]: value })];
  }

  return {
    ...scenario,
    keyword: isOutlineKeyword(scenario.keyword, dialect) ? scenario.keyword : dialect.scenarioOutline[0].trim(),
    steps,
    examples,
  };
}

export function newExamples(
  dialect: DialectKeywords,
  parameters: string[],
  newId: () => string,
  values: Record<string, string> = {},
): ExamplesModel {
  return {
    id: newId(),
    comments: [],
    tags: [],
    keyword: dialect.examples[0].trim(),
    name: '',
    description: '',
    header: [...parameters],
    rows: parameters.length ? [parameters.map((p) => values[p] ?? '')] : [],
  };
}
