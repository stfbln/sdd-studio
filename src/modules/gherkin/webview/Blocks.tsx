import { memo, useContext, useMemo, useState, type ReactNode } from 'react';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { IconButton } from '../../../webview/components/IconButton';
import { TagsInput } from '../../../webview/components/TagsInput';
import { requestFocus } from '../../../webview/focus';
import type { BackgroundModel, FeatureChild, FeatureModel, RuleModel, ScenarioModel } from '../core/model';
import { isOutlineKeyword, scenarioParameters } from '../core/parameters';
import { ExamplesSection } from './ExamplesSection';
import { CollapseContext, useActions, useDialect } from './state';
import { StepsEditor } from './StepsEditor';
import { newBackground, newRule, newScenario } from './tree';

type Named = { name: string; description: string };

export function FeatureCard({ feature }: { feature: FeatureModel }) {
  const { edit } = useActions();
  const set = (recipe: (f: FeatureModel) => void) => edit<FeatureModel>(feature.id, recipe);
  return (
    <>
      <section className="card feature-card">
        <div className="feature-head">
          <span className="keyword-badge keyword-feature">{feature.keyword}</span>
          <input
            className={`input title-input ${feature.name.trim() ? '' : 'invalid'}`}
            data-focus-key={`${feature.id}:name`}
            placeholder="Feature name"
            value={feature.name}
            onChange={(e) => set((f) => void (f.name = e.target.value))}
          />
        </div>
        <TagsInput tags={feature.tags} onChange={(tags) => set((f) => void (f.tags = tags))} placeholder="Add tags (e.g. @smoke)" />
        <AutoTextarea
          className="description"
          placeholder={'Describe the business value, e.g.\nAs a customer\nI want to …\nSo that …'}
          value={feature.description}
          onChange={(description) => set((f) => void (f.description = description))}
        />
      </section>
      <ChildrenList parentId={feature.id} items={feature.children} allowRules />
    </>
  );
}

function ChildrenList({ parentId, items, allowRules }: { parentId: string; items: FeatureChild[]; allowRules?: boolean }) {
  const { edit } = useActions();
  const dialect = useDialect();
  const hasBackground = items.some((c) => c.kind === 'background');

  const add = (child: FeatureChild, atStart = false) => {
    edit<{ children: FeatureChild[] }>(parentId, (p) => void (atStart ? p.children.unshift(child) : p.children.push(child)));
    requestFocus(`${child.id}:name`);
  };

  return (
    <div className="children">
      {items.map((child, index) => {
        const position = { index, count: items.length };
        if (child.kind === 'background') return <BackgroundCard key={child.id} background={child} {...position} />;
        if (child.kind === 'rule') return <RuleCard key={child.id} rule={child} {...position} />;
        return <ScenarioCard key={child.id} scenario={child} {...position} />;
      })}
      <div className="add-bar">
        <IconButton icon="add" label="Scenario" showLabel variant="secondary" onClick={() => add(newScenario(dialect))} />
        <IconButton icon="add" label="Scenario Outline" showLabel variant="secondary" onClick={() => add(newScenario(dialect, true))} />
        {!hasBackground && (
          <IconButton icon="add" label="Background" showLabel variant="secondary" onClick={() => add(newBackground(dialect), true)} />
        )}
        {allowRules && <IconButton icon="add" label="Rule" showLabel variant="secondary" onClick={() => add(newRule(dialect))} />}
      </div>
    </div>
  );
}

interface CardProps {
  id: string;
  kind: string;
  title: ReactNode;
  summary?: string;
  index: number;
  count: number;
  children: ReactNode;
}

function Card({ id, kind, title, summary, index, count, children }: CardProps) {
  const { collapsed, toggle } = useContext(CollapseContext);
  const { move, duplicate, remove } = useActions();
  const isCollapsed = collapsed.has(id);
  return (
    <section className={`card card-${kind} ${isCollapsed ? 'collapsed' : ''}`} id={`node-${id}`}>
      <header className="card-header">
        <IconButton
          icon={isCollapsed ? 'chevron-right' : 'chevron-down'}
          label={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={() => toggle(id)}
        />
        <div className="card-title">{title}</div>
        {isCollapsed && summary && <span className="muted card-summary">{summary}</span>}
        <div className="row-actions card-actions">
          <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => move(id, -1)} />
          <IconButton icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => move(id, 1)} />
          <IconButton icon="copy" label="Duplicate" onClick={() => duplicate(id)} />
          <IconButton icon="trash" label="Delete" onClick={() => remove(id)} />
        </div>
      </header>
      {!isCollapsed && <div className="card-body">{children}</div>}
    </section>
  );
}

function NameInput({ id, value, placeholder, onChange }: { id: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <input
      className="input name-input"
      data-focus-key={`${id}:name`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Descriptions are optional, so they stay hidden behind a link until used. */
function DescriptionField<T extends Named>({ id, value }: { id: string; value: string }) {
  const { edit } = useActions();
  const [open, setOpen] = useState(false);
  if (!value && !open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        <span className="codicon codicon-note" /> Add description
      </button>
    );
  }
  return (
    <AutoTextarea
      className="description"
      placeholder="Free text describing this block"
      autoFocus={open && !value}
      value={value}
      onBlur={() => setOpen(false)}
      onChange={(description) => edit<T>(id, (n) => void (n.description = description))}
    />
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ScenarioCard = memo(function ScenarioCard({ scenario, index, count }: { scenario: ScenarioModel; index: number; count: number }) {
  const { edit } = useActions();
  const dialect = useDialect();
  const parameters = useMemo(() => scenarioParameters(scenario), [scenario]);
  const set = (recipe: (s: ScenarioModel) => void) => edit<ScenarioModel>(scenario.id, recipe);
  const outline = isOutlineKeyword(scenario.keyword, dialect);
  const keywords = [...new Set([...dialect.scenario, ...dialect.scenarioOutline, scenario.keyword].map((k) => k.trim()))];
  const rows = scenario.examples.reduce((n, e) => n + e.rows.length, 0);

  return (
    <Card
      id={scenario.id}
      kind={outline ? 'outline' : 'scenario'}
      index={index}
      count={count}
      summary={[plural(scenario.steps.length, 'step'), scenario.examples.length ? plural(rows, 'example') : '', scenario.tags.join(' ')]
        .filter(Boolean)
        .join(' · ')}
      title={
        <>
          <select
            className="keyword-select keyword-badge"
            aria-label="Scenario type"
            value={scenario.keyword.trim()}
            onChange={(e) => set((s) => void (s.keyword = e.target.value))}
          >
            {keywords.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <NameInput id={scenario.id} value={scenario.name} placeholder="Scenario name" onChange={(v) => set((s) => void (s.name = v))} />
        </>
      }
    >
      <TagsInput tags={scenario.tags} onChange={(tags) => set((s) => void (s.tags = tags))} />
      <DescriptionField<ScenarioModel> id={scenario.id} value={scenario.description} />
      <StepsEditor ownerId={scenario.id} steps={scenario.steps} parameters={parameters} />
      {(outline || scenario.examples.length > 0 || parameters.length > 0) && (
        <ExamplesSection scenario={scenario} parameters={parameters} />
      )}
    </Card>
  );
});

const BackgroundCard = memo(function BackgroundCard({ background, index, count }: { background: BackgroundModel; index: number; count: number }) {
  const { edit } = useActions();
  return (
    <Card
      id={background.id}
      kind="background"
      index={index}
      count={count}
      summary={plural(background.steps.length, 'step')}
      title={
        <>
          <span className="keyword-badge" title="Steps run before each scenario">
            {background.keyword}
          </span>
          <NameInput
            id={background.id}
            value={background.name}
            placeholder="Name (optional) — runs before every scenario"
            onChange={(v) => edit<BackgroundModel>(background.id, (b) => void (b.name = v))}
          />
        </>
      }
    >
      <DescriptionField<BackgroundModel> id={background.id} value={background.description} />
      <StepsEditor ownerId={background.id} steps={background.steps} />
    </Card>
  );
});

const RuleCard = memo(function RuleCard({ rule, index, count }: { rule: RuleModel; index: number; count: number }) {
  const { edit } = useActions();
  const set = (recipe: (r: RuleModel) => void) => edit<RuleModel>(rule.id, recipe);
  return (
    <Card
      id={rule.id}
      kind="rule"
      index={index}
      count={count}
      summary={plural(rule.children.filter((c) => c.kind === 'scenario').length, 'scenario')}
      title={
        <>
          <span className="keyword-badge">{rule.keyword}</span>
          <NameInput id={rule.id} value={rule.name} placeholder="Business rule" onChange={(v) => set((r) => void (r.name = v))} />
        </>
      }
    >
      <TagsInput tags={rule.tags} onChange={(tags) => set((r) => void (r.tags = tags))} />
      <DescriptionField<RuleModel> id={rule.id} value={rule.description} />
      <ChildrenList parentId={rule.id} items={rule.children} />
    </Card>
  );
});
