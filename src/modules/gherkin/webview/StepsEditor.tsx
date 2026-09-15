import { current } from 'immer';
import { Fragment, memo, useContext, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { GridEditor } from '../../../webview/components/GridEditor';
import { IconButton } from '../../../webview/components/IconButton';
import { requestFocus } from '../../../webview/focus';
import type { DialectKeywords, ScenarioModel, StepModel } from '../core/model';
import { extractParameter, suggestParameterName } from '../core/parameters';
import { SuggestionsContext, useActions, useDialect } from './state';
import { newId, newStep, primaryKeyword } from './tree';

interface StepsEditorProps {
  /** Scenario or Background owning the steps. */
  ownerId: string;
  steps: StepModel[];
  /** Parameters of the owning scenario; undefined for a Background (no parameters there). */
  parameters?: string[];
}

export function StepsEditor({ ownerId, steps, parameters }: StepsEditorProps) {
  const { edit } = useActions();
  const dialect = useDialect();

  const addStep = () => {
    const step = newStep(dialect, steps[steps.length - 1]);
    edit<{ steps: StepModel[] }>(ownerId, (owner) => void owner.steps.push(step));
    requestFocus(step.id);
  };

  return (
    <div className="steps">
      {steps.map((step, index) => (
        <StepRow
          key={step.id}
          step={step}
          ownerId={ownerId}
          index={index}
          count={steps.length}
          parameters={parameters}
        />
      ))}
      <div className="steps-footer">
        <IconButton icon="add" label="Add step" showLabel onClick={addStep} />
        <span className="hint">Enter adds a step · Alt+↑/↓ moves it</span>
      </div>
    </div>
  );
}

function stepKeywordOptions(dialect: DialectKeywords, currentKeyword: string) {
  const options = [
    { value: primaryKeyword(dialect.given), group: 'given' },
    { value: primaryKeyword(dialect.when), group: 'when' },
    { value: primaryKeyword(dialect.then), group: 'then' },
    { value: primaryKeyword(dialect.and), group: 'and' },
    { value: primaryKeyword(dialect.but), group: 'but' },
    { value: '* ', group: 'any' },
  ];
  if (!options.some((o) => o.value === currentKeyword)) {
    const group = (['given', 'when', 'then', 'and', 'but'] as const).find((g) => dialect[g].includes(currentKeyword));
    options.push({ value: currentKeyword, group: group ?? 'any' });
  }
  return options;
}

function keywordGroup(dialect: DialectKeywords, keyword: string) {
  return (['given', 'when', 'then', 'and', 'but'] as const).find((g) => dialect[g].includes(keyword) && keyword.trim() !== '*') ?? 'any';
}

interface StepRowProps {
  step: StepModel;
  ownerId: string;
  index: number;
  count: number;
  parameters?: string[];
}

const StepRow = memo(function StepRow({ step, ownerId, index, count, parameters }: StepRowProps) {
  const { edit, remove, move } = useActions();
  const dialect = useDialect();
  const inputRef = useRef<HTMLInputElement>(null);
  const [extraction, setExtraction] = useState<{ start: number; end: number; name: string } | null>(null);

  const setStep = (recipe: (s: StepModel) => void) => edit<StepModel>(step.id, recipe);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const created = newStep(dialect, step);
      edit<{ steps: StepModel[] }>(ownerId, (owner) => void owner.steps.splice(index + 1, 0, created));
      requestFocus(created.id);
    } else if (e.key === 'Backspace' && step.text === '' && count > 1) {
      e.preventDefault();
      remove(step.id);
      requestFocus(`${ownerId}:step:${Math.max(0, index - 1)}`);
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(step.id, e.key === 'ArrowUp' ? -1 : 1);
      requestFocus(step.id);
    }
  };

  const startExtraction = () => {
    const input = inputRef.current;
    if (!input || !parameters) return;
    let start = input.selectionStart ?? 0;
    let end = input.selectionEnd ?? 0;
    if (start === end) {
      // No selection: take the word under the cursor.
      const text = step.text;
      while (start > 0 && !/[\s"'<>]/.test(text[start - 1])) start--;
      while (end < text.length && !/[\s"'<>]/.test(text[end])) end++;
    }
    const value = step.text.slice(start, end);
    if (!value.trim()) {
      input.focus();
      return;
    }
    setExtraction({ start, end, name: suggestParameterName(value, parameters) });
  };

  const confirmExtraction = (name: string) => {
    if (!extraction) return;
    edit<ScenarioModel>(ownerId, (scenario) =>
      void Object.assign(scenario, extractParameter(current(scenario), step.id, extraction, name, dialect, newId)),
    );
    setExtraction(null);
    requestFocus(step.id);
  };

  const group = keywordGroup(dialect, step.keyword);

  return (
    <div className={`step step-${group}`}>
      <div className="step-line">
        <select
          className="keyword-select step-keyword"
          value={step.keyword}
          aria-label="Step keyword"
          onChange={(e) => setStep((s) => void (s.keyword = e.target.value))}
        >
          {stepKeywordOptions(dialect, step.keyword).map((o) => (
            <option key={o.value} value={o.value}>
              {o.value.trim()}
            </option>
          ))}
        </select>

        <StepTextInput
          inputRef={inputRef}
          value={step.text}
          focusKeys={[step.id, `${ownerId}:step:${index}`]}
          onChange={(text) => setStep((s) => void (s.text = text))}
          onKeyDown={onKeyDown}
        />

        <div className="row-actions">
          {parameters && (
            <IconButton
              icon="symbol-variable"
              label="Turn the selected text into a parameter"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startExtraction}
            />
          )}
          <IconButton
            icon="table"
            label="Add a data table"
            disabled={!!step.dataTable || !!step.docString}
            onClick={() => {
              setStep((s) => void (s.dataTable = { rows: [['', ''], ['', '']] }));
              requestFocus(`${step.id}:table:0:0`);
            }}
          />
          <IconButton
            icon="quote"
            label="Add a doc string"
            disabled={!!step.dataTable || !!step.docString}
            onClick={() => {
              setStep((s) => void (s.docString = { delimiter: '"""', mediaType: '', content: '' }));
              requestFocus(`${step.id}:doc`);
            }}
          />
          <IconButton icon="arrow-up" label="Move up (Alt+↑)" disabled={index === 0} onClick={() => move(step.id, -1)} />
          <IconButton icon="arrow-down" label="Move down (Alt+↓)" disabled={index === count - 1} onClick={() => move(step.id, 1)} />
          <IconButton icon="trash" label="Delete step" onClick={() => remove(step.id)} />
        </div>
      </div>

      {extraction && (
        <ParameterPrompt
          value={step.text.slice(extraction.start, extraction.end)}
          initialName={extraction.name}
          onConfirm={confirmExtraction}
          onCancel={() => setExtraction(null)}
        />
      )}

      {step.dataTable && (
        <div className="step-argument">
          <GridEditor
            gridKey={`${step.id}:table`}
            rows={step.dataTable.rows}
            headerRow
            headerPlaceholder=""
            onChange={(rows) =>
              setStep((s) => void (s.dataTable = { rows: rows.some((r) => r.length) ? rows : [] }))
            }
            footer={
              <IconButton icon="trash" label="Remove table" showLabel onClick={() => setStep((s) => void delete s.dataTable)} />
            }
          />
        </div>
      )}

      {step.docString && (
        <div className="step-argument docstring">
          <div className="docstring-head">
            <select
              className="keyword-select"
              aria-label="Delimiter"
              value={step.docString.delimiter}
              onChange={(e) => setStep((s) => void (s.docString!.delimiter = e.target.value as '"""' | '```'))}
            >
              <option value={'"""'}>"""</option>
              <option value="```">```</option>
            </select>
            <input
              className="input input-small"
              placeholder="Content type (e.g. json)"
              value={step.docString.mediaType}
              onChange={(e) => setStep((s) => void (s.docString!.mediaType = e.target.value.replace(/\s/g, '')))}
            />
            <IconButton icon="trash" label="Remove doc string" onClick={() => setStep((s) => void delete s.docString)} />
          </div>
          <AutoTextarea
            className="mono"
            data-focus-key={`${step.id}:doc`}
            placeholder="Multi-line text passed to the step"
            value={step.docString.content}
            spellCheck={false}
            onChange={(content) => setStep((s) => void (s.docString!.content = content))}
          />
        </div>
      )}
    </div>
  );
});

interface StepTextInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  focusKeys: string[];
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** Step text field with suggestions taken from steps used across the workspace. */
function StepTextInput({ inputRef, value, focusKeys, onChange, onKeyDown }: StepTextInputProps) {
  const suggestions = useContext(SuggestionsContext);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!open || query.length < 2) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of suggestions) {
      if (s === value) continue;
      const lower = s.toLowerCase();
      if (lower.startsWith(query)) starts.push(s);
      else if (lower.includes(query)) contains.push(s);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [open, value, suggestions]);

  const pick = (text: string) => {
    onChange(text);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + delta + matches.length) % matches.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
        e.preventDefault();
        pick(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
    }
    onKeyDown(e);
  };

  return (
    <div className="autocomplete">
      <input
        ref={inputRef}
        className={`input step-text ${value.trim() ? '' : 'invalid'}`}
        data-focus-key={focusKeys[0]}
        data-focus-alias={focusKeys[1]}
        value={value}
        placeholder="Describe the step…"
        spellCheck
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {matches.length > 0 && (
        <ul className="suggestions" role="listbox">
          {matches.map((m, i) => (
            <li
              key={m}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <HighlightParameters text={m} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HighlightParameters({ text, values }: { text: string; values?: Record<string, string> }): ReactNode {
  const parts = text.split(/(<[^<>\n]+>)/g);
  return parts.map((part, i) => {
    const match = /^<([^<>\n]+)>$/.exec(part);
    if (!match) return <Fragment key={i}>{part}</Fragment>;
    const value = values?.[match[1]];
    return values && value !== undefined ? (
      <mark key={i} className="param-value" title={`<${match[1]}>`}>
        {value || '∅'}
      </mark>
    ) : (
      <span key={i} className="param-token">
        {part}
      </span>
    );
  });
}

interface ParameterPromptProps {
  value: string;
  initialName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function ParameterPrompt({ value, initialName, onConfirm, onCancel }: ParameterPromptProps) {
  const [name, setName] = useState(initialName);
  const error = !name.trim() ? 'A name is required' : /[<>|\n]/.test(name) ? 'Characters < > | are not allowed' : undefined;
  const confirm = () => !error && onConfirm(name.trim());
  return (
    <div className="parameter-prompt" role="dialog" aria-label="Create parameter">
      <span className="codicon codicon-symbol-variable" aria-hidden="true" />
      <span>
        Replace <mark className="param-value">{value}</mark> with parameter
      </span>
      <span className="param-token">&lt;</span>
      <input
        className={`input input-small ${error ? 'invalid' : ''}`}
        value={name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm();
          if (e.key === 'Escape') onCancel();
        }}
        title={error}
      />
      <span className="param-token">&gt;</span>
      <button type="button" className="btn btn-primary btn-labelled" disabled={!!error} onClick={confirm}>
        Create
      </button>
      <button type="button" className="btn btn-secondary btn-labelled" onClick={onCancel}>
        Cancel
      </button>
      <span className="hint">The original value is added to the Examples table.</span>
    </div>
  );
}
