import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { IconButton } from './IconButton';

export interface ComboboxOption {
  /** Written in the field when picked. */
  value: string;
  /** Shown in the list instead of the value. */
  label?: string;
  /** Muted text after the label, e.g. the kind of an entity. */
  detail?: string;
}

/** Options containing the typed text (ignoring case), those whose value or label starts with it first. */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const starts: ComboboxOption[] = [];
  const contains: ComboboxOption[] = [];
  for (const option of options) {
    const main = [option.value, option.label ?? ''].map((t) => t.toLowerCase());
    if (main.some((t) => t.startsWith(q))) starts.push(option);
    else if ([...main, (option.detail ?? '').toLowerCase()].some((t) => t.includes(q))) contains.push(option);
  }
  return [...starts, ...contains];
}

/**
 * Text input with a list of options: opening it shows every option, typing filters them. Any text
 * stays allowed; picking an option writes its value.
 */
export function Combobox({
  value,
  options,
  onChange,
  className = '',
  placeholder,
  ariaLabel,
  empty = 'No match',
}: {
  value: string;
  options: ComboboxOption[];
  onChange(value: string): void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Shown when no option matches. */
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  // Undefined until something is typed: a filled field still lists every option when opened.
  const [query, setQuery] = useState<string>();
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const shown = query === undefined ? options : filterOptions(options, query);

  useEffect(() => {
    if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setOpen(true);
    setQuery(undefined);
    setActive(options.findIndex((o) => o.value === value));
  };
  const close = () => {
    setOpen(false);
    setQuery(undefined);
    setActive(-1);
  };
  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      if (!shown.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 && delta < 0 ? shown.length - 1 : (a + delta + shown.length) % shown.length));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
      else close();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="autocomplete combobox">
      <input
        ref={inputRef}
        className={`input ${className}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        // Not on click: clicking the label or hint of a field clicks its input too.
        onMouseDown={() => !open && show()}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      <IconButton
        icon={open ? 'chevron-up' : 'chevron-down'}
        label={open ? 'Hide options' : 'Show options'}
        className="combobox-toggle"
        tabIndex={-1}
        onMouseDown={(e) => {
          // Keeps the focus in the input, so the list does not close before it opens.
          e.preventDefault();
          inputRef.current?.focus();
          if (open) close();
          else show();
        }}
      />
      {open && (
        <ul
          id={listId}
          ref={listRef}
          className="suggestions combobox-options"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          // A click inside a field label would otherwise also click the input.
          onClick={(e) => e.preventDefault()}
        >
          {shown.length === 0 && <li className="combobox-empty muted">{empty}</li>}
          {shown.map((option, i) => (
            <li
              key={option.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${i === active ? 'active' : ''} ${option.value === value ? 'current' : ''}`}
              title={[option.label ?? option.value, option.detail].filter(Boolean).join(' · ')}
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => pick(option)}
            >
              {option.label ?? option.value}
              {option.detail && <span className="combobox-detail">{option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
