import { useId, useState, type KeyboardEvent } from 'react';

export interface ChipsInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  icon?: string;
  /** Turns typed text into chip values; defaults to splitting on commas. */
  normalize?: (raw: string) => string[];
  /** Offered while typing (native datalist). */
  suggestions?: string[];
  /** Optional warning shown on a chip (e.g. "not declared"). */
  chipWarning?: (value: string) => string | undefined;
  /** Whether a space ends the current chip (off for values that may contain spaces). */
  commitOnSpace?: boolean;
}

const defaultNormalize = (raw: string) => raw.split(',').map((v) => v.trim()).filter(Boolean);

/** Chip-style list editor: Enter, space or comma adds, Backspace on empty removes the last chip. */
export function ChipsInput({
  values,
  onChange,
  placeholder = 'Add…',
  icon,
  normalize = defaultNormalize,
  suggestions,
  chipWarning,
  commitOnSpace = true,
}: ChipsInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const commit = (raw = draft) => {
    const added = normalize(raw).filter((v, i, all) => !values.includes(v) && all.indexOf(v) === i);
    if (added.length) onChange([...values, ...added]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && commitOnSpace)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="tags" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {icon && <span className={`codicon codicon-${icon} tags-icon`} aria-hidden="true" />}
      {values.map((value) => {
        const warning = chipWarning?.(value);
        return (
          <span key={value} className={`tag ${warning ? 'tag-warning' : ''}`} title={warning}>
            {value}
            <button type="button" className="tag-remove" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              <span className="codicon codicon-close" />
            </button>
          </span>
        );
      })}
      <input
        className="tags-input"
        value={draft}
        list={suggestions ? listId : undefined}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => {
          // Picking a datalist option replaces the whole draft: add it right away.
          const picked = suggestions?.includes(e.target.value) && (e.nativeEvent as InputEvent).inputType !== 'insertText';
          if (picked) commit(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => commit()}
        size={Math.max(draft.length, values.length ? 4 : placeholder.length)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.filter((s) => !values.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
