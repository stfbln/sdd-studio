import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type Background, type Examples, type Rule, type Scenario, type Step } from '@cucumber/messages';
import type {
  BackgroundModel,
  ExamplesModel,
  FeatureChild,
  GherkinDocumentModel,
  GherkinParseError,
  RuleChild,
  RuleModel,
  ScenarioModel,
  StepModel,
} from './model';

export type ParseResult =
  | { ok: true; document: GherkinDocumentModel }
  | { ok: false; errors: GherkinParseError[] };

/** Anchors let us attach each comment to the first element that follows it. */
interface Anchor {
  line: number;
  comments: string[];
}

export function parseGherkin(source: string, newId: () => string = IdGenerator.uuid()): ParseResult {
  const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
  let ast;
  try {
    ast = parser.parse(source);
  } catch (err) {
    return { ok: false, errors: toParseErrors(err) };
  }

  const anchors: Anchor[] = [];
  const anchor = <T extends { comments: string[] }>(line: number, node: T): T => {
    anchors.push({ line, comments: node.comments });
    return node;
  };
  const firstLine = (location: { line: number }, tags: readonly { location: { line: number } }[] = []) =>
    Math.min(location.line, ...tags.map((t) => t.location.line));

  const step = (s: Step): StepModel => {
    const model: StepModel = { id: newId(), comments: [], keyword: s.keyword, text: s.text };
    if (s.dataTable) {
      model.dataTable = { rows: s.dataTable.rows.map((r) => r.cells.map((c) => c.value)) };
    }
    if (s.docString) {
      model.docString = {
        delimiter: s.docString.delimiter === '```' ? '```' : '"""',
        mediaType: s.docString.mediaType ?? '',
        content: s.docString.content,
      };
    }
    return anchor(s.location.line, model);
  };

  const examples = (e: Examples): ExamplesModel =>
    anchor(firstLine(e.location, e.tags), {
      id: newId(),
      comments: [],
      tags: e.tags.map((t) => t.name),
      keyword: e.keyword,
      name: e.name,
      description: dedent(e.description),
      header: e.tableHeader ? e.tableHeader.cells.map((c) => c.value) : [],
      rows: e.tableBody.map((r) => r.cells.map((c) => c.value)),
    });

  const background = (b: Background): BackgroundModel => {
    const model: BackgroundModel = anchor(b.location.line, {
      kind: 'background',
      id: newId(),
      comments: [],
      keyword: b.keyword,
      name: b.name,
      description: dedent(b.description),
      steps: [],
    });
    model.steps = b.steps.map(step);
    return model;
  };

  const scenario = (s: Scenario): ScenarioModel => {
    const model: ScenarioModel = anchor(firstLine(s.location, s.tags), {
      kind: 'scenario',
      id: newId(),
      comments: [],
      tags: s.tags.map((t) => t.name),
      keyword: s.keyword,
      name: s.name,
      description: dedent(s.description),
      steps: [],
      examples: [],
    });
    model.steps = s.steps.map(step);
    model.examples = s.examples.map(examples);
    return model;
  };

  const rule = (r: Rule): RuleModel => {
    const model: RuleModel = anchor(firstLine(r.location, r.tags), {
      kind: 'rule',
      id: newId(),
      comments: [],
      tags: r.tags.map((t) => t.name),
      keyword: r.keyword,
      name: r.name,
      description: dedent(r.description),
      children: [],
    });
    model.children = r.children.flatMap((c): RuleChild[] =>
      c.background ? [background(c.background)] : c.scenario ? [scenario(c.scenario)] : [],
    );
    return model;
  };

  const f = ast.feature;
  const document: GherkinDocumentModel = {
    language: f?.language ?? detectLanguage(source),
    feature: null,
    trailingComments: [],
  };

  if (f) {
    const feature = anchor(firstLine(f.location, f.tags), {
      id: newId(),
      comments: [] as string[],
      tags: f.tags.map((t) => t.name),
      keyword: f.keyword,
      name: f.name,
      description: dedent(f.description),
      children: [] as FeatureChild[],
    });
    feature.children = f.children.flatMap((c): FeatureChild[] =>
      c.background
        ? [background(c.background)]
        : c.scenario
          ? [scenario(c.scenario)]
          : c.rule
            ? [rule(c.rule)]
            : [],
    );
    document.feature = feature;
  }

  anchors.sort((a, b) => a.line - b.line);
  for (const comment of ast.comments) {
    const target = anchors.find((a) => a.line > comment.location.line);
    (target ? target.comments : document.trailingComments).push(comment.text.trim());
  }

  return { ok: true, document };
}

function detectLanguage(source: string): string {
  const match = /^\s*#\s*language\s*:\s*([a-zA-Z-]+)/m.exec(source);
  return match ? match[1] : 'en';
}

/** Removes the indentation shared by all non-blank lines, plus leading/trailing blank lines. */
export function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length),
    Number.MAX_SAFE_INTEGER,
  );
  return lines.map((l) => (l.trim() ? l.slice(indent).trimEnd() : '')).join('\n');
}

function toParseErrors(err: unknown): GherkinParseError[] {
  const list = (err as { errors?: unknown[] }).errors ?? [err];
  return list.map((e) => {
    const { message, location } = e as { message?: string; location?: { line: number; column?: number } };
    return { message: message ?? String(e), line: location?.line, column: location?.column };
  });
}
