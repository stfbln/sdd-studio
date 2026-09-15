import { Fragment, useRef, useState } from 'react';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { ChipsInput } from '../../../webview/components/ChipsInput';
import { IconButton } from '../../../webview/components/IconButton';
import { requestFocus } from '../../../webview/focus';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Field, Section } from '../../../webview/structured/fields';
import { normalizeBlock, normalizeTitle } from '../core/edits';
import type { Bullet, ConsequenceType, Consequence, Heading, MatrixCell, Option, ProCon, ProConType, Rating } from '../core/parse';
import { goTo, useAdr, useDraft, frontMatterOf, anchorId } from './state';

const STATUS_OPTIONS = ['proposed', 'accepted', 'rejected', 'deprecated'];

/** "Show in text" link for content the form keeps as written. */
function TextLink({ heading, label }: { heading: Heading; label?: string }) {
  const { openAsText } = useAdr();
  return (
    <button type="button" className="link-button" title={`Line ${heading.line + 1}`} onClick={() => openAsText(heading.line + 1)}>
      {label ?? `${'#'.repeat(heading.level)} ${heading.text}`}
    </button>
  );
}

function OverviewSection() {
  const { doc, model, edit } = useAdr();
  const fm = frontMatterOf(doc);
  const [title, setTitle] = useDraft(model.title?.text ?? '', normalizeTitle);
  const [status, setStatus] = useDraft(fm.status, (v) => v.trim());
  const [date, setDate] = useDraft(fm.date, (v) => v.trim());
  return (
    <div id={anchorId('overview')}>
      <Section title="Overview" icon="notebook">
        <Field label="Title" required hint="Short title: the problem solved and the option found.">
          <input
            className={`input title-input ${title.trim() ? '' : 'invalid'}`}
            value={title}
            placeholder="Use PostgreSQL for the order store"
            onChange={(e) => {
              setTitle(e.target.value);
              edit({ op: 'setTitle', value: e.target.value });
            }}
          />
        </Field>
        <div className="form-grid">
          <Field label="Status">
            <input
              className="input"
              list="adr-status-options"
              value={status}
              placeholder="proposed"
              onChange={(e) => {
                setStatus(e.target.value);
                edit({ op: 'setStatus', value: e.target.value });
              }}
            />
            <datalist id="adr-status-options">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Date">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                edit({ op: 'setDate', value: e.target.value });
              }}
            />
          </Field>
        </div>
        <Field label="Decision makers" hint="Who made the decision.">
          <ChipsInput values={fm.decisionMakers} onChange={(v) => edit({ op: 'setDecisionMakers', value: v })} placeholder="Add a name…" />
        </Field>
        <Field label="Consulted" hint="Whose opinions were sought before deciding (two-way communication).">
          <ChipsInput values={fm.consulted} onChange={(v) => edit({ op: 'setConsulted', value: v })} placeholder="Add a name…" />
        </Field>
        <Field label="Informed" hint="Who is kept up to date once decided (one-way communication).">
          <ChipsInput values={fm.informed} onChange={(v) => edit({ op: 'setInformed', value: v })} placeholder="Add a name…" />
        </Field>
      </Section>
    </div>
  );
}

function ContextSection() {
  const { model, edit } = useAdr();
  const [context, setContext] = useDraft(model.context?.text ?? '', normalizeBlock);
  return (
    <div id={anchorId('context')}>
      <Section title="Context and Problem Statement" icon="question">
        <Field label="Context and Problem Statement" hint="Describe the context and the problem in a few sentences, or in the form of an illustrative story. Markdown is allowed.">
          <AutoTextarea
            value={context}
            placeholder="We need to choose a datastore for the order history that…"
            onChange={(value) => {
              setContext(value);
              edit({ op: 'setContext', value });
            }}
          />
        </Field>
      </Section>
    </div>
  );
}

function MoreInfoSection() {
  const { model, edit } = useAdr();
  const [more, setMore] = useDraft(model.more?.text ?? '', normalizeBlock);
  return (
    <div id={anchorId('more')}>
      <Section title="More Information" icon="info">
        <Field label="More Information" hint="Additional evidence, links to related decisions, confidence level, or how compliance is confirmed. Markdown is allowed.">
          <AutoTextarea
            value={more}
            placeholder="Links, confirmation notes…"
            onChange={(value) => {
              setMore(value);
              edit({ op: 'setMoreInformation', value });
            }}
          />
        </Field>
      </Section>
    </div>
  );
}

/* Decision drivers ----------------------------------------------------------------------------------- */

function DriverRow({ item, index, count }: { item: Bullet; index: number; count: number }) {
  const { edit } = useAdr();
  const [draft, setDraft] = useDraft(item.text, normalizeTitle);
  const row = useRef<HTMLLIElement>(null);
  const remove = () => edit({ op: 'deleteDriver', index });
  const setText = (text: string) => {
    setDraft(text);
    edit({ op: 'setDriver', index, text });
  };
  return (
    <li className="bullet-row" ref={row}>
      <input
        className="input grow"
        data-focus-key={`driver-${index}`}
        aria-label={`Decision driver ${index + 1}`}
        value={draft}
        placeholder="Empty driver: removed when you leave it"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            requestFocus('driver-add');
          } else if (e.key === 'Backspace' && !draft) {
            e.preventDefault();
            remove();
            requestFocus(index > 0 ? `driver-${index - 1}` : 'driver-add');
          }
        }}
        onBlur={(e) => {
          if (!normalizeTitle(draft) && !row.current?.contains(e.relatedTarget as Node | null)) remove();
        }}
      />
      <span className="row-actions">
        <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => edit({ op: 'moveDriver', index, toIndex: index - 1 })} />
        <IconButton icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => edit({ op: 'moveDriver', index, toIndex: index + 1 })} />
        <IconButton icon="trash" label="Delete decision driver" onClick={remove} />
      </span>
    </li>
  );
}

function AddBullet({ focusKey, placeholder, onAdd }: { focusKey: string; placeholder: string; onAdd(text: string): void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!normalizeTitle(draft)) return;
    onAdd(draft);
    setDraft('');
  };
  return (
    <div className="bullet-add">
      <input
        className="input grow"
        data-focus-key={`${focusKey}-add`}
        aria-label={placeholder}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Escape') setDraft('');
        }}
      />
      <IconButton icon="add" label="Add" showLabel variant="secondary" disabled={!normalizeTitle(draft)} onClick={add} />
    </div>
  );
}

function DriversSection() {
  const { model, edit } = useAdr();
  const items = model.drivers?.list.items ?? [];
  return (
    <div id={anchorId('drivers')}>
      <Section title="Decision Drivers" icon="compass" count={items.length}>
        <p className="muted small">Forces that shape the decision: cost, team familiarity, performance, compliance…</p>
        {items.length > 0 && (
          <ul className="bullet-list">
            {items.map((item, index) => (
              <DriverRow key={index} item={item} index={index} count={items.length} />
            ))}
          </ul>
        )}
        <AddBullet focusKey="driver" placeholder="Add a decision driver…" onAdd={(text) => edit({ op: 'addDriver', text })} />
      </Section>
    </div>
  );
}

/* Considered options ---------------------------------------------------------------------------------- */

function OptionRow({ item, index, count }: { item: Option; index: number; count: number }) {
  const { edit } = useAdr();
  const [title, setTitle] = useDraft(item.title, normalizeTitle);
  const [description, setDescription] = useDraft(item.description, normalizeBlock);
  const commit = (t: string, d: string) => edit({ op: 'setOption', index, title: t, description: d });
  return (
    <li className="option-row">
      <div className="option-row-main">
        <input
          className="input option-title"
          aria-label={`Option ${index + 1} title`}
          value={title}
          placeholder={`Option ${index + 1}`}
          onChange={(e) => {
            setTitle(e.target.value);
            commit(e.target.value, description);
          }}
        />
        <span className="row-actions">
          <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => edit({ op: 'moveOption', index, toIndex: index - 1 })} />
          <IconButton icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => edit({ op: 'moveOption', index, toIndex: index + 1 })} />
          <IconButton icon="trash" label="Delete option" onClick={() => edit({ op: 'deleteOption', index })} />
        </span>
      </div>
      <AutoTextarea
        aria-label={`Option ${index + 1} description`}
        value={description}
        placeholder="Short description of this option…"
        onChange={(value) => {
          setDescription(value);
          commit(title, value);
        }}
      />
    </li>
  );
}

function AddOption({ onAdd }: { onAdd(title: string): void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!normalizeTitle(draft)) return;
    onAdd(draft);
    setDraft('');
  };
  return (
    <div className="bullet-add">
      <input
        className="input grow"
        aria-label="New option title"
        placeholder="Add a considered option…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Escape') setDraft('');
        }}
      />
      <IconButton icon="add" label="Add" showLabel variant="secondary" disabled={!normalizeTitle(draft)} onClick={add} />
    </div>
  );
}

function OptionsSection() {
  const { model, edit } = useAdr();
  const items = model.options?.list.items ?? [];
  return (
    <div id={anchorId('options')}>
      <Section title="Considered Options" icon="list-unordered" count={items.length}>
        {items.length > 0 && (
          <ul className="option-list">
            {items.map((item, index) => (
              <OptionRow key={index} item={item} index={index} count={items.length} />
            ))}
          </ul>
        )}
        <AddOption onAdd={(title) => edit({ op: 'addOption', title })} />
      </Section>
    </div>
  );
}

/* Options comparison matrix --------------------------------------------------------------------------- */

const RATINGS: { value: Rating; label: string }[] = [
  { value: undefined, label: '—' },
  { value: 'meets', label: '✅ Meets' },
  { value: 'partial', label: '⚠️ Partial' },
  { value: 'fails', label: '❌ Fails' },
];

function Cell({ optionIndex, driverIndex, cell }: { optionIndex: number; driverIndex: number; cell: MatrixCell }) {
  const { edit } = useAdr();
  const [note, setNote] = useDraft(cell.note, (v) => v.trim());
  const set = (rating: Rating, value: string) => edit({ op: 'setCell', option: optionIndex, driver: driverIndex, rating, note: value });
  return (
    <div className="matrix-cell">
      <select
        className={`rating-select rating-${cell.rating ?? 'none'}`}
        aria-label="Rating"
        value={cell.rating ?? ''}
        onChange={(e) => set((e.target.value || undefined) as Rating, note)}
      >
        {RATINGS.map((r) => (
          <option key={r.label} value={r.value ?? ''}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        className="input mono note-input"
        aria-label="Note"
        placeholder="Note…"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          set(cell.rating, e.target.value);
        }}
      />
    </div>
  );
}

function MatrixSection() {
  const { model } = useAdr();
  const options = model.options?.list.items ?? [];
  const drivers = model.drivers?.list.items ?? [];
  const rows = model.matrix?.rows ?? [];
  return (
    <div id={anchorId('matrix')}>
      <Section title="Options Comparison" icon="table">
        {!options.length || !drivers.length ? (
          <p className="muted small">Add at least one decision driver and one considered option to compare them here.</p>
        ) : (
          <div className="matrix-table" style={{ gridTemplateColumns: `minmax(12ch, 1fr) repeat(${drivers.length}, minmax(14ch, 1fr))` }}>
            <div className="matrix-head matrix-corner">Option</div>
            {drivers.map((d, j) => (
              <div key={j} className="matrix-head">
                {d.text}
              </div>
            ))}
            {options.map((o, i) => (
              <Fragment key={i}>
                <div className="matrix-row-label">{o.title || `Option ${i + 1}`}</div>
                {drivers.map((_, j) => (
                  <Cell key={j} optionIndex={i} driverIndex={j} cell={rows[i]?.[j] ?? { rating: undefined, note: '' }} />
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* Decision outcome and its consequences --------------------------------------------------------------- */

function ConsequenceRow({ item, index, count }: { item: Consequence; index: number; count: number }) {
  const { edit } = useAdr();
  const [draft, setDraft] = useDraft(item.text, normalizeTitle);
  const commit = (type: ConsequenceType, text: string) => edit({ op: 'setConsequence', index, type, text });
  return (
    <li className="bullet-row">
      <select className="type-select" aria-label="Good or bad" value={item.type} onChange={(e) => commit(e.target.value as ConsequenceType, draft)}>
        <option value="good">Good</option>
        <option value="bad">Bad</option>
      </select>
      <input
        className="input grow"
        aria-label={`Consequence ${index + 1}`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(item.type, e.target.value);
        }}
      />
      <span className="row-actions">
        <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => edit({ op: 'moveConsequence', index, toIndex: index - 1 })} />
        <IconButton icon="arrow-down" label="Move down" disabled={index === count - 1} onClick={() => edit({ op: 'moveConsequence', index, toIndex: index + 1 })} />
        <IconButton icon="trash" label="Delete consequence" onClick={() => edit({ op: 'deleteConsequence', index })} />
      </span>
    </li>
  );
}

function ConsequenceAdd({ onAdd }: { onAdd(type: ConsequenceType, text: string): void }) {
  const [type, setType] = useState<ConsequenceType>('good');
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!normalizeTitle(draft)) return;
    onAdd(type, draft);
    setDraft('');
  };
  return (
    <div className="bullet-add">
      <select className="type-select" aria-label="Good or bad" value={type} onChange={(e) => setType(e.target.value as ConsequenceType)}>
        <option value="good">Good</option>
        <option value="bad">Bad</option>
      </select>
      <input
        className="input grow"
        aria-label="New consequence"
        placeholder="because…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <IconButton icon="add" label="Add" showLabel variant="secondary" disabled={!normalizeTitle(draft)} onClick={add} />
    </div>
  );
}

function OutcomeSection() {
  const { model, edit } = useAdr();
  const options = model.options?.list.items ?? [];
  const outcome = model.outcome;
  const [rationale, setRationale] = useDraft(outcome?.rationale ?? '', normalizeBlock);
  const selected = outcome?.selectedOption;
  const consequences = outcome?.consequences.list.items ?? [];
  const commitOutcome = (option: number | undefined, value: string) => edit({ op: 'setOutcome', selectedOption: option, rationale: value });
  return (
    <div id={anchorId('outcome')}>
      <Section title="Decision Outcome" icon="target">
        <Field label="Chosen option">
          <select className="input" value={selected ?? ''} onChange={(e) => commitOutcome(e.target.value === '' ? undefined : Number(e.target.value), rationale)}>
            <option value="">Not decided yet</option>
            {options.map((o, i) => (
              <option key={i} value={i}>
                {o.title || `Option ${i + 1}`}
              </option>
            ))}
          </select>
        </Field>
        {outcome?.unmatchedChoice && (
          <p className="notice notice-warning small">
            <span className="codicon codicon-warning" aria-hidden="true" /> The chosen option “{outcome.unmatchedChoice}” no longer matches a considered option. Pick
            one again above.
          </p>
        )}
        <Field label="Because" hint="Why this option was chosen over the others.">
          <AutoTextarea
            value={rationale}
            placeholder="it best balances cost and the team's familiarity"
            onChange={(value) => {
              setRationale(value);
              commitOutcome(selected, value);
            }}
          />
        </Field>
        <div className="subsection">
          <h3>Consequences</h3>
          {consequences.length > 0 && (
            <ul className="bullet-list">
              {consequences.map((item, index) => (
                <ConsequenceRow key={index} item={item} index={index} count={consequences.length} />
              ))}
            </ul>
          )}
          <ConsequenceAdd onAdd={(type, text) => edit({ op: 'addConsequence', type, text })} />
        </div>
      </Section>
    </div>
  );
}

/* Pros and cons of the options ------------------------------------------------------------------------- */

function ProConRow({ optionIndex, item, index, count }: { optionIndex: number; item: ProCon; index: number; count: number }) {
  const { edit } = useAdr();
  const [draft, setDraft] = useDraft(item.text, normalizeTitle);
  const commit = (type: ProConType, text: string) => edit({ op: 'setProCon', option: optionIndex, index, type, text });
  return (
    <li className="bullet-row">
      <select className="type-select" aria-label="Good, neutral or bad" value={item.type} onChange={(e) => commit(e.target.value as ProConType, draft)}>
        <option value="good">Good</option>
        <option value="neutral">Neutral</option>
        <option value="bad">Bad</option>
      </select>
      <input
        className="input grow"
        aria-label={`Pro or con ${index + 1}`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(item.type, e.target.value);
        }}
      />
      <span className="row-actions">
        <IconButton icon="arrow-up" label="Move up" disabled={index === 0} onClick={() => edit({ op: 'moveProCon', option: optionIndex, index, toIndex: index - 1 })} />
        <IconButton
          icon="arrow-down"
          label="Move down"
          disabled={index === count - 1}
          onClick={() => edit({ op: 'moveProCon', option: optionIndex, index, toIndex: index + 1 })}
        />
        <IconButton icon="trash" label="Delete" onClick={() => edit({ op: 'deleteProCon', option: optionIndex, index })} />
      </span>
    </li>
  );
}

function ProConAdd({ optionIndex, onAdd }: { optionIndex: number; onAdd(type: ProConType, text: string): void }) {
  const [type, setType] = useState<ProConType>('good');
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!normalizeTitle(draft)) return;
    onAdd(type, draft);
    setDraft('');
  };
  return (
    <div className="bullet-add">
      <select className="type-select" aria-label="Good, neutral or bad" value={type} onChange={(e) => setType(e.target.value as ProConType)}>
        <option value="good">Good</option>
        <option value="neutral">Neutral</option>
        <option value="bad">Bad</option>
      </select>
      <input
        className="input grow"
        aria-label={`New pro or con for option ${optionIndex + 1}`}
        placeholder="because…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <IconButton icon="add" label="Add" showLabel variant="secondary" disabled={!normalizeTitle(draft)} onClick={add} />
    </div>
  );
}

function ProsConsSection() {
  const { model, edit } = useAdr();
  const options = model.options?.list.items ?? [];
  const prosCons = model.prosCons?.options ?? [];
  return (
    <div id={anchorId('prosCons')}>
      <Section title="Pros and Cons of the Options" icon="thumbsup">
        {!options.length ? (
          <p className="muted small">Add considered options first.</p>
        ) : (
          options.map((o, i) => {
            const items = prosCons[i]?.list.items ?? [];
            return (
              <div key={i} className="procon-card">
                <h3>{o.title || `Option ${i + 1}`}</h3>
                {items.length > 0 && (
                  <ul className="bullet-list">
                    {items.map((item, index) => (
                      <ProConRow key={index} optionIndex={i} item={item} index={index} count={items.length} />
                    ))}
                  </ul>
                )}
                <ProConAdd optionIndex={i} onAdd={(type, text) => edit({ op: 'addProCon', option: i, type, text })} />
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}

/* Other sections ---------------------------------------------------------------------------------------- */

function OtherSections() {
  const { model, openAsText } = useAdr();
  const others = model.sections.filter((s) => s.kind === 'other');
  if (!others.length) return null;
  return (
    <div id="adr-other">
      <Section title="Other sections" icon="list-flat" count={others.length}>
        <p className="muted small">
          Kept as written. Edit them{' '}
          <button type="button" className="link-button" onClick={() => openAsText()}>
            in the text editor
          </button>
          .
        </p>
        <ul className="other-sections">
          {others.map((s) => (
            <li key={s.heading.line}>
              <TextLink heading={s.heading} /> <span className="muted small">line {s.heading.line + 1}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function AdrPage() {
  const { issues } = useAdr();
  return (
    <div className="page adr-page">
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={goTo} />}
      <OverviewSection />
      <ContextSection />
      <DriversSection />
      <OptionsSection />
      <MatrixSection />
      <OutcomeSection />
      <ProsConsSection />
      <MoreInfoSection />
      <OtherSections />
    </div>
  );
}
