/**
 * Editable, JSON-serializable representation of a .feature file.
 *
 * It is shared by the extension host (parse/serialize) and the webview (forms).
 * `id`s only exist to give UI lists stable keys; they are never written to disk.
 * Comments are attached to the element that follows them so they survive a
 * round-trip through the visual editor.
 */

export interface GherkinDocumentModel {
  /** Dialect code, e.g. "en", "fr". Written as `# language:` when not "en". */
  language: string;
  feature: FeatureModel | null;
  /** Comments after the last element of the file (or all comments of a file without a Feature). */
  trailingComments: string[];
}

interface NodeBase {
  id: string;
  /** Full comment lines (including `#`) that precede this node. */
  comments: string[];
}

export interface FeatureModel extends NodeBase {
  tags: string[];
  keyword: string;
  name: string;
  description: string;
  children: FeatureChild[];
}

export type FeatureChild = BackgroundModel | ScenarioModel | RuleModel;
export type RuleChild = BackgroundModel | ScenarioModel;

export interface BackgroundModel extends NodeBase {
  kind: 'background';
  keyword: string;
  name: string;
  description: string;
  steps: StepModel[];
}

export interface ScenarioModel extends NodeBase {
  kind: 'scenario';
  tags: string[];
  /** "Scenario", "Scenario Outline", "Example", ... in the document language. */
  keyword: string;
  name: string;
  description: string;
  steps: StepModel[];
  examples: ExamplesModel[];
}

export interface RuleModel extends NodeBase {
  kind: 'rule';
  tags: string[];
  keyword: string;
  name: string;
  description: string;
  children: RuleChild[];
}

export interface StepModel extends NodeBase {
  /** Keyword including its trailing space when the language uses one, e.g. "Given ". */
  keyword: string;
  text: string;
  dataTable?: DataTableModel;
  docString?: DocStringModel;
}

export interface DataTableModel {
  rows: string[][];
}

export interface DocStringModel {
  delimiter: '"""' | '```';
  mediaType: string;
  content: string;
}

export interface ExamplesModel extends NodeBase {
  tags: string[];
  keyword: string;
  name: string;
  description: string;
  /** Column names. An empty header means the Examples block has no table. */
  header: string[];
  rows: string[][];
}

/** Step keywords of a dialect, grouped by meaning. Values keep their trailing space. */
export interface DialectKeywords {
  code: string;
  name: string;
  native: string;
  feature: string[];
  background: string[];
  rule: string[];
  scenario: string[];
  scenarioOutline: string[];
  examples: string[];
  given: string[];
  when: string[];
  then: string[];
  and: string[];
  but: string[];
}

export interface LanguageOption {
  code: string;
  name: string;
  native: string;
}

export interface GherkinParseError {
  message: string;
  line?: number;
  column?: number;
}
