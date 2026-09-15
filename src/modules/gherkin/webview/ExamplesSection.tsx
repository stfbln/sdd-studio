import { memo } from 'react';
import { GridEditor } from '../../../webview/components/GridEditor';
import { IconButton } from '../../../webview/components/IconButton';
import { TagsInput } from '../../../webview/components/TagsInput';
import { requestFocus } from '../../../webview/focus';
import type { ExamplesModel, ScenarioModel } from '../core/model';
import {
  addColumn,
  analyzeExamples,
  isOutlineKeyword,
  newExamples,
  renameColumn,
  substitute,
  suggestParameterName,
} from '../core/parameters';
import { HighlightParameters } from './StepsEditor';
import { useActions, useDialect } from './state';
import { newId, primaryKeyword } from './tree';

interface Props {
  scenario: ScenarioModel;
  parameters: string[];
}

export function ExamplesSection({ scenario, parameters }: Props) {
  const { edit } = useActions();
  const dialect = useDialect();
  const outline = isOutlineKeyword(scenario.keyword, dialect);

  const addExamples = () => {
    const created = newExamples(dialect, parameters, newId);
    edit<ScenarioModel>(scenario.id, (s) => {
      s.examples.push(created);
      if (!outline) s.keyword = primaryKeyword(dialect.scenarioOutline).trim();
    });
    requestFocus(created.header.length ? `${created.id}:1:0` : `${created.id}:name`);
  };

  return (
    <div className="examples-section">
      <div className="section-title">
        <span className="codicon codicon-table" aria-hidden="true" />
        {parameters.length > 0 ? (
          <span className="param-list" title="Parameters used by the steps: each needs a column in the Examples tables">
            <span>Parameters</span>
            {parameters.map((p) => (
              <span key={p} className="param-token">
                &lt;{p}&gt;
              </span>
            ))}
          </span>
        ) : (
          <span>Examples</span>
        )}
      </div>

      {scenario.examples.length === 0 && (
        <p className="notice">
          {parameters.length > 0 ? (
            <>
              <span className="codicon codicon-info" /> This scenario uses {parameters.length} parameter
              {parameters.length > 1 ? 's' : ''}. Add an Examples table to give them values: each row runs the scenario once.
            </>
          ) : (
            <>
              <span className="codicon codicon-lightbulb" /> Type <code>&lt;name&gt;</code> in a step, or select a value and click{' '}
              <span className="codicon codicon-symbol-variable" /> to turn it into a parameter.
            </>
          )}
        </p>
      )}

      {scenario.examples.map((examples, index) => (
        <ExamplesEditor
          key={examples.id}
          scenario={scenario}
          examples={examples}
          parameters={parameters}
          index={index}
          count={scenario.examples.length}
        />
      ))}

      <IconButton icon="add" label="Add examples table" showLabel variant="secondary" onClick={addExamples} />
    </div>
  );
}

interface EditorProps {
  scenario: ScenarioModel;
  examples: ExamplesModel;
  parameters: string[];
  index: number;
  count: number;
}

const ExamplesEditor = memo(function ExamplesEditor({ scenario, examples, parameters, index, count }: EditorProps) {
  const { edit, remove, move, duplicate } = useActions();
  const { missing, unused } = analyzeExamples(parameters, examples);
  const setExamples = (recipe: (e: ExamplesModel) => void) => edit<ExamplesModel>(examples.id, recipe);
  const renameSuggestion = missing.length === 1 && unused.length === 1 ? { from: unused[0], to: missing[0] } : undefined;

  const rowValues = (row: string[]) => Object.fromEntries(examples.header.map((h, i) => [h, row[i] ?? '']));

  return (
    <div className="examples-block">
      <div className="examples-head">
        <span className="keyword-badge">{examples.keyword}</span>
        <input
          className="input input-small examples-name"
          data-focus-key={`${examples.id}:name`}
          placeholder="Name (optional)"
          value={examples.name}
          onChange={(e) => setExamples((x) => void (x.name = e.target.value))}
        />
        <TagsInput tags={examples.tags} onChange={(tags) => setExamples((x) => void (x.tags = tags))} />
        <div className="row-actions">
          <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => move(examples.id, -1)} />
          <IconButton icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => move(examples.id, 1)} />
          <IconButton icon="copy" label="Duplicate table" onClick={() => duplicate(examples.id)} />
          <IconButton icon="trash" label="Delete table" onClick={() => remove(examples.id)} />
        </div>
      </div>

      {missing.length > 0 && (
        <div className="notice notice-warning">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            No column for{' '}
            {missing.map((p) => (
              <span key={p} className="param-token">
                &lt;{p}&gt;
              </span>
            ))}
          </span>
          {renameSuggestion && (
            <button
              type="button"
              className="btn btn-secondary btn-labelled"
              onClick={() => setExamples((x) => void Object.assign(x, renameColumn(x, renameSuggestion.from, renameSuggestion.to)))}
            >
              Rename “{renameSuggestion.from}” to “{renameSuggestion.to}”
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-labelled"
            onClick={() =>
              setExamples((x) => {
                let next: ExamplesModel = x;
                for (const p of missing) next = addColumn(next, p);
                if (!next.rows.length) next = { ...next, rows: [next.header.map(() => '')] };
                Object.assign(x, next);
              })
            }
          >
            Add {missing.length > 1 ? `${missing.length} columns` : 'column'}
          </button>
        </div>
      )}

      <GridEditor
        gridKey={examples.id}
        rows={[examples.header, ...examples.rows]}
        headerRow
        headerPlaceholder="parameter"
        onChange={(matrix) =>
          setExamples((x) => {
            x.header = matrix[0] ?? [];
            x.rows = x.header.length ? matrix.slice(1) : [];
          })
        }
        newColumnName={(matrix) => missing.find((p) => !matrix[0]?.includes(p)) ?? suggestParameterName('column', matrix[0] ?? [])}
        columnWarning={(c) => {
          const name = examples.header[c];
          if (!name?.trim()) return 'Column name is required';
          if (examples.header.indexOf(name) !== c) return `Duplicate column “${name}”`;
          if (unused.includes(name)) return `<${name}> is not used by any step`;
          return undefined;
        }}
        rowTitle={(r) =>
          r === 0
            ? undefined
            : scenario.steps.map((s) => `${s.keyword}${substitute(s.text, examples.header, examples.rows[r - 1])}`).join('\n')
        }
      />

      {examples.rows.length > 0 && examples.header.length > 0 && (
        <details className="preview">
          <summary>
            Preview the {examples.rows.length} generated scenario{examples.rows.length > 1 ? 's' : ''}
          </summary>
          <div className="preview-list">
            {examples.rows.map((row, r) => (
              <div key={r} className="preview-item">
                <div className="preview-title">
                  <span className="muted">#{r + 1}</span> <HighlightParameters text={scenario.name || '(unnamed)'} values={rowValues(row)} />
                </div>
                {scenario.steps.map((s) => (
                  <div key={s.id} className="preview-step">
                    <span className="keyword">{s.keyword.trim()}</span> <HighlightParameters text={s.text} values={rowValues(row)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
});
