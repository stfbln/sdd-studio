import { dialects } from '@cucumber/gherkin';
import type {
  BackgroundModel,
  DialectKeywords,
  FeatureChild,
  GherkinDocumentModel,
  LanguageOption,
  RuleChild,
  ScenarioModel,
  StepModel,
} from './model';

export function getDialect(code: string): DialectKeywords {
  const d = dialects[code] ?? dialects.en;
  return {
    code: dialects[code] ? code : 'en',
    name: d.name,
    native: d.native,
    feature: [...d.feature],
    background: [...d.background],
    rule: [...d.rule],
    scenario: [...d.scenario],
    scenarioOutline: [...d.scenarioOutline],
    examples: [...d.examples],
    given: [...d.given],
    when: [...d.when],
    then: [...d.then],
    and: [...d.and],
    but: [...d.but],
  };
}

export function listLanguages(): LanguageOption[] {
  return Object.entries(dialects)
    .map(([code, d]) => ({ code, name: d.name, native: d.native }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type BlockCategory = 'feature' | 'background' | 'rule' | 'scenario' | 'scenarioOutline' | 'examples';
const STEP_CATEGORIES = ['given', 'when', 'then', 'and', 'but'] as const;

/** First keyword of a category, skipping the language-neutral "* " step keyword. */
function primary(list: string[]): string {
  return list.find((k) => k.trim() !== '*') ?? list[0];
}

/** Rewrites every keyword of the document into another language, keeping their meaning. */
export function translateDocument(doc: GherkinDocumentModel, to: string): GherkinDocumentModel {
  const from = getDialect(doc.language);
  const target = getDialect(to);
  const block = (keyword: string, ...categories: BlockCategory[]) => {
    for (const c of categories) {
      if (from[c].some((k) => k.trim() === keyword.trim())) return primary(target[c]).trim();
    }
    return primary(target[categories[0]]).trim();
  };
  const step = (s: StepModel): StepModel => {
    if (s.keyword.trim() === '*') return s;
    const category = STEP_CATEGORIES.find((c) => from[c].includes(s.keyword)) ?? 'given';
    return { ...s, keyword: primary(target[category]) };
  };

  const scenario = (s: ScenarioModel): ScenarioModel => ({
    ...s,
    keyword: block(s.keyword, 'scenario', 'scenarioOutline'),
    steps: s.steps.map(step),
    examples: s.examples.map((e) => ({ ...e, keyword: block(e.keyword, 'examples') })),
  });
  const background = (b: BackgroundModel): BackgroundModel => ({
    ...b,
    keyword: block(b.keyword, 'background'),
    steps: b.steps.map(step),
  });
  const ruleChild = (c: RuleChild): RuleChild => (c.kind === 'background' ? background(c) : scenario(c));
  const featureChild = (c: FeatureChild): FeatureChild =>
    c.kind === 'rule' ? { ...c, keyword: block(c.keyword, 'rule'), children: c.children.map(ruleChild) } : ruleChild(c);

  const f = doc.feature;
  return {
    ...doc,
    language: target.code,
    feature: f && { ...f, keyword: block(f.keyword, 'feature'), children: f.children.map(featureChild) },
  };
}
