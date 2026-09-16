import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { dirOf, relativePath } from '../../../shared/files';
import { AutoTextarea } from '../../../webview/components/AutoTextarea';
import { IconButton } from '../../../webview/components/IconButton';
import { requestFocus } from '../../../webview/focus';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Field, KeyInput, Section } from '../../../webview/structured/fields';
import {
  listOf,
  normalizeBlock,
  normalizeExample,
  normalizeExampleTitle,
  normalizeRequirement,
  normalizeRequirementDescription,
  normalizeTitle,
  sortByLevel,
  type ListRef,
} from '../core/edits';
import { groupKey, mergeInherited, parentPath, specName, type InheritedEntry } from '../core/inherit';
import {
  composeRequirement,
  CONFORMANCE_NOTICE,
  DEFAULT_KEYWORD_ICONS,
  findKeyword,
  KEYWORD_MEANINGS,
  KEYWORDS,
  levelDefinition,
  levelIntro,
  NO_KEYWORD_HEADING,
  withKeyword,
  type Keyword,
} from '../core/keywords';
import type { Example, Heading, Requirement, RequirementLevel, RequirementList as List } from '../core/parse';
import { allRequirements, defaultSubject, exampleCount, keywordCounts, plural } from '../core/summary';
import { anchorId, descriptionKey, exampleKey, goTo, groupId, inheritedGroupId, listKey, useDraft, useSpec } from './state';

export const keywordClass = (keyword: string | undefined) => (keyword ? `kw kw-${keyword.toLowerCase().replace(' ', '-')}` : 'kw kw-none');

/** "Show in text" link for content the form keeps as written. */
function TextLink({ heading, label }: { heading: Heading; label?: string }) {
  const { openAsText } = useSpec();
  return (
    <button type="button" className="link-button" title={`Line ${heading.line + 1}`} onClick={() => openAsText(heading.line + 1)}>
      {label ?? `${'#'.repeat(heading.level)} ${heading.text}`}
    </button>
  );
}

/** The more general specs this one refines, listed on the "Extends:" line under the title. */
function ExtendsField() {
  const { model, edit, context, openFile } = useSpec();
  const parents = model.extends?.parents ?? [];
  const written = parents.map((p) => p.target).join(', ');
  const [draft, setDraft] = useDraft(written, normalizeTitle);
  const specs = context?.specs ?? [];
  const listed = new Set(parents.flatMap((p) => (context ? (parentPath(context.file, p.target) ?? []) : [])));
  const setParents = (next: { target: string; label?: string }[]) => edit({ op: 'setExtends', parents: next });
  const add = (path: string) => {
    const spec = specs.find((s) => s.path === path);
    if (!spec || !context) return;
    setParents([...parents, { target: relativePath(dirOf(context.file), spec.path), label: spec.title }]);
  };
  return (
    <Field
      label="Extends"
      hint={
        <>
          The more general specs this one refines, written as an “Extends: [Title](path)” line under the title. Their requirements apply here too: only write below
          what is specific to this spec, or what overrides an inherited requirement. When two of them disagree, the first one applies.
        </>
      }
    >
      <div className="extends-field">
        {parents.length > 0 && (
          <ul className="extends-list">
            {parents.map((parent, index) => {
              const resolved = context ? parentPath(context.file, parent.target) : undefined;
              const known = specs.find((s) => s.path === resolved);
              return (
                <li key={index} className="extends-row">
                  <span className="codicon codicon-type-hierarchy-super" aria-hidden="true" />
                  {known && resolved ? (
                    <button type="button" className="link-button" title={resolved} onClick={() => openFile(resolved)}>
                      {parent.label || known.title || parent.target}
                    </button>
                  ) : (
                    <span title={parent.target}>{parent.label || parent.target}</span>
                  )}
                  {context && !known && <span className="op-label warning">not found</span>}
                  <IconButton
                    icon="close"
                    label={`Stop extending ${parent.label || parent.target}`}
                    onClick={() => setParents(parents.filter((_, i) => i !== index))}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {context ? (
          <select
            className="input extends-add"
            aria-label="Extend another spec"
            value=""
            onChange={(e) => add(e.target.value)}
            disabled={specs.every((spec) => listed.has(spec.path))}
          >
            <option value="">{parents.length ? 'Extend another spec…' : 'Extend a spec…'}</option>
            {specs
              .filter((spec) => !listed.has(spec.path))
              .map((spec) => (
                <option key={spec.path} value={spec.path}>
                  {spec.title ? `${spec.title} — ${spec.path}` : spec.path}
                </option>
              ))}
          </select>
        ) : (
          <input
            className="input"
            aria-label="Specs extended"
            placeholder="../generics/data-storage.spec.md, ../generics/audit-logging.spec.md"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setParents(e.target.value.split(',').map((target) => ({ target })));
            }}
          />
        )}
      </div>
    </Field>
  );
}

function OverviewSection() {
  const { model, edit } = useSpec();
  const [title, setTitle] = useDraft(model.title?.text ?? '', normalizeTitle);
  const [description, setDescription] = useDraft(model.description.text, normalizeBlock);
  return (
    <div id={anchorId('overview')}>
      <Section title="Overview" icon="book">
        <Field label="Title" required hint="The system or component this spec presents.">
          <input
            className={`input title-input ${title.trim() ? '' : 'invalid'}`}
            value={title}
            placeholder="Payment service"
            onChange={(e) => {
              setTitle(e.target.value);
              edit({ op: 'setTitle', value: e.target.value });
            }}
          />
        </Field>
        <Field label="Description" hint="What it is and what it does. Markdown is allowed.">
          <AutoTextarea
            value={description}
            placeholder="Takes card and wallet payments for the web shop…"
            onChange={(value) => {
              setDescription(value);
              edit({ op: 'setDescription', value });
            }}
          />
        </Field>
        <ExtendsField />
      </Section>
    </div>
  );
}

/** One inherited requirement, shown read-only above the requirements of this spec with its key word. */
function InheritedRow({ entry }: { entry: InheritedEntry }) {
  const { openFile } = useSpec();
  const { spec, requirement, overridden, through } = entry;
  return (
    <li className="requirement-row inherited-row">
      <span className="requirement-number" aria-hidden="true">
        <span className="codicon codicon-type-hierarchy-super" title={`Inherited from ${specName(spec)}`} />
      </span>
      <span
        className={`kind-badge ${keywordClass(requirement.keyword)}`}
        title={requirement.keyword ? KEYWORD_MEANINGS[requirement.keyword] : 'No RFC 2119 key word in capitals'}
      >
        {requirement.keyword ?? '—'}
      </span>
      <div className="inherited-text">
        <span className={`sentence ${overridden ? 'overridden' : ''}`}>{requirement.text}</span>
        <span className="inherited-source">
          from
          <button type="button" className="link-button" title={spec.path} onClick={() => openFile(spec.path)}>
            {specName(spec)}
          </button>
          {through && <span className="muted">(through {through})</span>}
          {overridden && (
            <span className="op-label">
              overridden {overridden.by ? `by ${overridden.by}` : 'here'}: {overridden.keyword ?? 'no key word'}
            </span>
          )}
        </span>
        {requirement.description && <span className="sentence inherited-description">{requirement.description}</span>}
        {requirement.examples.length > 0 && (
          <ul className="example-list">
            {requirement.examples.map((example, position) => (
              <li key={position} className="example-row read-only">
                <span className="example-label">{example.title || `Example ${position + 1}`}</span>
                <span className="sentence">{example.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function InheritedRows({ entries }: { entries: InheritedEntry[] }) {
  if (!entries.length) return null;
  return (
    <ol className="requirement-list inherited-list">
      {entries.map((entry, index) => (
        <InheritedRow key={index} entry={entry} />
      ))}
    </ol>
  );
}

function ContextSection() {
  const { model, edit } = useSpec();
  const [context, setContext] = useDraft(model.context?.text ?? '', normalizeBlock);
  return (
    <div id={anchorId('context')}>
      <Section title="Context" icon="globe">
        <Field label="Context" hint={<>Written as a “## Context” section once filled. Markdown is allowed.</>}>
          <AutoTextarea
            value={context}
            placeholder="Where it fits: users, surrounding systems, constraints, assumptions…"
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

/** Key word picker; the key word itself lives in the sentence. */
function KeywordSelect({ written, onChange, label, disabled, focusKey }: { written?: string; onChange(keyword: string): void; label: string; disabled?: boolean; focusKey?: string }) {
  const keyword = written ? (findKeyword(written)?.keyword ?? written) : undefined;
  return (
    <select
      className={`keyword-select compact ${keywordClass(keyword)}`}
      aria-label={label}
      title={keyword ? KEYWORD_MEANINGS[keyword as Keyword] : 'No RFC 2119 key word in capitals'}
      value={written ?? ''}
      disabled={disabled}
      data-focus-key={focusKey}
      onChange={(e) => onChange(e.target.value)}
    >
      {!written && <option value="">—</option>}
      {written && !KEYWORDS.includes(written as Keyword) && <option value={written}>{written}</option>}
      {KEYWORDS.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
}

/** One example scenario of a requirement: a title ("Example 2" when empty) and the case; an empty one is removed when it is left. */
function ExampleRow({ group, index, example, position, count }: { group: ListRef; index: number; example: Example; position: number; count: number }) {
  const { edit } = useSpec();
  const [draft, setDraft] = useDraft(example.text, normalizeExample);
  const [title, setTitle] = useDraft(example.title, normalizeExampleTitle);
  const row = useRef<HTMLLIElement>(null);
  const remove = () => edit({ op: 'deleteExample', group, index, example: position });
  const leave = (next: EventTarget | null) => {
    if (!normalizeExample(draft) && !normalizeExampleTitle(title) && !row.current?.contains(next as Node | null)) remove();
  };
  return (
    <li className="example-row" ref={row}>
      <input
        className="input example-title"
        value={title}
        aria-label={`Title of example ${position + 1} of requirement ${index + 1}`}
        data-focus-key={exampleKey(group, index, position, 'title')}
        placeholder={`Example ${position + 1}`}
        title={`Title of the example, written in bold above it; “Example ${position + 1}” when none is given`}
        onChange={(e) => {
          setTitle(e.target.value);
          edit({ op: 'setExampleTitle', group, index, example: position, title: e.target.value });
        }}
        onKeyDown={(e) => {
          // The case is in the same row: focused at once, so the next keystrokes go there.
          if (e.key === 'Enter') row.current?.querySelector('textarea')?.focus();
        }}
        onBlur={(e) => leave(e.relatedTarget)}
      />
      <AutoTextarea
        value={draft}
        aria-label={`Example ${position + 1} of requirement ${index + 1}`}
        data-focus-key={exampleKey(group, index, position)}
        placeholder="Empty example: removed when you leave it"
        onChange={(text) => {
          setDraft(text);
          edit({ op: 'setExample', group, index, example: position, text });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            requestFocus(exampleKey(group, index, undefined, 'title'));
          } else if (e.key === 'Backspace' && !draft && !title) {
            e.preventDefault();
            remove();
            requestFocus(position > 0 ? exampleKey(group, index, position - 1) : exampleKey(group, index, undefined, 'title'));
          }
        }}
        onBlur={(e) => leave(e.relatedTarget)}
      />
      <span className="row-actions">
        <IconButton icon="arrow-up" label="Move example up" disabled={position === 0} onClick={() => edit({ op: 'moveExample', group, index, example: position, to: position - 1 })} />
        <IconButton icon="arrow-down" label="Move example down" disabled={position === count - 1} onClick={() => edit({ op: 'moveExample', group, index, example: position, to: position + 1 })} />
        <IconButton icon="trash" label="Delete example" onClick={remove} />
      </span>
    </li>
  );
}

/**
 * Example scenarios of one requirement, written after its description: "**Title**\" with the case on
 * the next line, "**Example 2**\" when no title is given. Without examples, the add box only shows
 * while the requirement is being edited.
 */
function ExampleList({ group, index, examples }: { group: ListRef; index: number; examples: Example[] }) {
  const { edit } = useSpec();
  const [title, setTitle] = useState('');
  const [typed, setTyped] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const caseInput = useRef<HTMLInputElement>(null);
  const numbered = `Example ${examples.length + 1}`;
  const ready = !!(normalizeExample(typed) || normalizeExampleTitle(title));
  const add = () => {
    if (!ready) return;
    edit({ op: 'addExample', group, index, text: typed, title });
    setTitle('');
    setTyped('');
    titleInput.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setTitle('');
      setTyped('');
    }
  };
  return (
    <div className={`requirement-examples ${examples.length || typed || title ? '' : 'empty'}`}>
      <ul className="example-list">
        {examples.map((example, position) => (
          <ExampleRow key={position} group={group} index={index} example={example} position={position} count={examples.length} />
        ))}
        <li className="example-row example-add">
          <input
            ref={titleInput}
            className="input example-title"
            data-focus-key={exampleKey(group, index, undefined, 'title')}
            aria-label={`Title of the new example of requirement ${index + 1}`}
            placeholder={numbered}
            title={`Title of the new example, written in bold above it; “${numbered}” when none is given`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              onKeyDown(e);
              if (e.key === 'Enter') caseInput.current?.focus();
            }}
          />
          <input
            ref={caseInput}
            className="input"
            data-focus-key={exampleKey(group, index)}
            aria-label={`New example of requirement ${index + 1}`}
            placeholder="One concrete case, with real values, e.g. “A 20 EUR basket paid with a declined card leaves the order unpaid”"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              onKeyDown(e);
              if (e.key === 'Enter') add();
            }}
          />
          <IconButton icon="add" label="Add example" disabled={!ready} onClick={add} />
        </li>
      </ul>
    </div>
  );
}

/** Description of a requirement (details, rationale), written between its heading and its examples; an empty one only shows while the requirement is being edited. */
function DescriptionField({ group, index, description }: { group: ListRef; index: number; description: string }) {
  const { edit } = useSpec();
  const [draft, setDraft] = useDraft(description, normalizeRequirementDescription);
  return (
    <div className={`requirement-description ${draft ? '' : 'empty'}`}>
      <AutoTextarea
        value={draft}
        aria-label={`Description of requirement ${index + 1}`}
        data-focus-key={descriptionKey(group, index)}
        placeholder="Add a description: details or rationale, written between the requirement and its examples. Markdown is allowed."
        onChange={(text) => {
          setDraft(text);
          edit({ op: 'setRequirementDescription', group, index, text });
        }}
      />
    </div>
  );
}

function RequirementRow({ group, item, index, level }: { group: ListRef; item: Requirement; index: number; level: RequirementLevel }) {
  const { model, edit } = useSpec();
  const [draft, setDraft] = useDraft(item.text, normalizeRequirement);
  const row = useRef<HTMLLIElement>(null);
  const key = listKey(group);
  const groups = model.requirements?.groups ?? [];
  const remove = () => edit({ op: 'deleteRequirement', group, index });
  const move = (toGroup: ListRef, toIndex?: number) => edit({ op: 'moveRequirement', group, index, toGroup, toIndex });
  /** The sentence is a heading, on one line. Taking another key word moves it under that key word: the focus follows it. */
  const setText = (value: string, focusSuffix = '') => {
    const text = value.replace(/[ \t]*\r?\n[ \t]*/g, ' ');
    setDraft(text);
    edit({ op: 'setRequirement', group, index, text });
    const keyword = findKeyword(text)?.keyword;
    if (!keyword || keyword === item.level) return;
    const items = (listOf(model, group)?.items ?? []).map((other, position) => ({ level: position === index ? keyword : other.level, position }));
    const typing = document.activeElement;
    requestFocus(`${key}-${sortByLevel(items).findIndex((other) => other.position === index)}${focusSuffix}`, {
      caret: typing instanceof HTMLTextAreaElement ? typing.selectionStart : undefined,
    });
  };

  return (
    <li className="requirement-row" ref={row}>
      <span className="requirement-number" aria-hidden="true">
        {item.checkbox ? <span className={`codicon codicon-${/x/i.test(item.checkbox) ? 'pass-filled' : 'circle-large-outline'}`} title={`Task list item ${item.checkbox.trim()}, kept as written`} /> : `${index + 1}.`}
      </span>
      <KeywordSelect
        written={findKeyword(draft)?.written}
        label={`Key word of requirement ${index + 1}`}
        focusKey={`${key}-${index}-kw`}
        onChange={(k) => setText(withKeyword(draft, k), '-kw')}
      />
      <AutoTextarea
        value={draft}
        aria-label={`Requirement ${index + 1}`}
        data-focus-key={`${key}-${index}`}
        placeholder="Empty requirement: removed when you leave it"
        onChange={(text) => setText(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey || e.altKey) requestFocus(descriptionKey(group, index));
            else requestFocus(`${key}-add`);
          } else if (e.key === 'Backspace' && !draft) {
            e.preventDefault();
            remove();
            requestFocus(index > 0 ? `${key}-${index - 1}` : `${key}-add`);
          }
        }}
        onBlur={(e) => {
          if (!normalizeRequirement(draft) && !row.current?.contains(e.relatedTarget as Node | null)) remove();
        }}
      />
      <span className="requirement-actions row-actions">
        {groups.length > 0 && (
          <select
            className="keyword-select compact group-select"
            aria-label="Group"
            title="Move to another group"
            value={group ?? ''}
            onChange={(e) => move(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">No group</option>
            {groups.map((g, i) => (
              <option key={i} value={i}>
                {g.heading.text}
              </option>
            ))}
          </select>
        )}
        <IconButton icon="note" label={item.description ? 'Description' : 'Add a description'} onClick={() => requestFocus(descriptionKey(group, index))} />
        <IconButton icon="beaker" label={item.examples.length ? `Examples (${item.examples.length})` : 'Add an example scenario'} onClick={() => requestFocus(exampleKey(group, index, undefined, 'title'))} />
        <IconButton icon="arrow-up" label="Move up" disabled={index === level.start} onClick={() => move(group, index - 1)} />
        <IconButton icon="arrow-down" label="Move down" disabled={index === level.start + level.count - 1} onClick={() => move(group, index + 1)} />
        <IconButton icon="trash" label="Delete requirement" onClick={remove} />
      </span>
      <DescriptionField group={group} index={index} description={item.description} />
      <ExampleList group={group} index={index} examples={item.examples} />
    </li>
  );
}

/** Adds a requirement: a sentence with a key word is kept as typed, otherwise "<subject> <KEY WORD> <text>". */
function AddRequirement({ focusKey, onAdd }: { focusKey: string; onAdd(text: string): void }) {
  const { model } = useSpec();
  const [draft, setDraft] = useState('');
  const [keyword, setKeyword] = useState<Keyword>('MUST');
  const typed = findKeyword(draft);
  const sentence = composeRequirement(keyword, draft, defaultSubject(model));
  const add = () => {
    if (!sentence) return;
    onAdd(sentence);
    setDraft('');
  };
  return (
    <div className="requirement-add">
      <KeywordSelect written={typed?.written ?? keyword} label="Key word of the new requirement" disabled={!!typed} onChange={(k) => setKeyword(k as Keyword)} />
      <div className="requirement-add-input">
        <input
          className="input"
          data-focus-key={`${focusKey}-add`}
          aria-label="New requirement"
          placeholder={`Add a requirement, e.g. “${defaultSubject(model)} ${keyword} …”`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') setDraft('');
          }}
        />
        {draft.trim() && sentence !== draft.trim() && (
          <span className="field-hint add-preview">
            Adds: <span className="add-preview-text">{sentence}</span>
          </span>
        )}
      </div>
      <IconButton icon="add" label="Add" showLabel variant="secondary" disabled={!sentence} onClick={add} />
    </div>
  );
}

/** Levels in the order they are written: the key words, then the requirements without one. */
const LEVELS: (Keyword | undefined)[] = [...KEYWORDS, undefined];

/**
 * The requirements of a list under a header per key word, as the file writes them: the inherited ones
 * with that key word first, then the ones of this spec. `list` is undefined for a group only the
 * specs extended have.
 */
function Levels({ group, list, inherited }: { group: ListRef; list?: List; inherited: InheritedEntry[] }) {
  const icons = useSpec().context?.keywordIcons ?? DEFAULT_KEYWORD_ICONS;
  const levels = LEVELS.flatMap((keyword) => {
    const own = list?.levels.find((level) => level.keyword === keyword);
    const entries = inherited.filter((entry) => entry.requirement.keyword === keyword);
    return own || entries.length ? [{ keyword, own, entries }] : [];
  });
  return (
    <>
      {levels.map(({ keyword, own, entries }) => (
        <div key={keyword ?? ''} className="requirement-level">
          <div className="requirement-level-header">
            <span className={`kind-badge ${keywordClass(keyword)}`} title={levelDefinition(keyword)}>
              {[icons[keyword ?? NO_KEYWORD_HEADING], keyword ?? NO_KEYWORD_HEADING].filter(Boolean).join(' ')}
            </span>
            <span className="muted small">{keyword ? KEYWORD_MEANINGS[keyword] : 'Level not stated: pick a key word for each of them'}</span>
            <span className="count">{(own?.count ?? 0) + entries.length}</span>
            {own?.heading && (own.customHeading || own.intro !== levelIntro(keyword)) && (
              <span className="muted small">
                <span className="codicon codicon-note" aria-hidden="true" /> {own.customHeading ? `“${own.heading.text}”` : own.intro ? 'notes' : 'no definition'} kept as written:{' '}
                <TextLink heading={own.heading} label="show in text" />
              </span>
            )}
          </div>
          <InheritedRows entries={entries} />
          {list && own && own.count > 0 && (
            <ol className="requirement-list">
              {list.items.slice(own.start, own.start + own.count).map((item, i) => (
                <RequirementRow key={own.start + i} group={group} item={item} index={own.start + i} level={own} />
              ))}
            </ol>
          )}
        </div>
      ))}
    </>
  );
}

/** The requirements of a list, level by level, then the add box. */
function RequirementList({ group, inherited }: { group: ListRef; inherited: InheritedEntry[] }) {
  const { model, edit } = useSpec();
  const list = listOf(model, group);
  const items = list?.items ?? [];
  return (
    <>
      {list?.notes && group !== null && (
        <p className="muted small">
          <span className="codicon codicon-note" aria-hidden="true" /> This group also has notes kept as written:{' '}
          <TextLink heading={model.requirements!.groups[group].heading} label="show in text" />.
        </p>
      )}
      <Levels group={group} list={list} inherited={inherited} />
      {!items.length && group !== null && (
        <p className="muted small empty-group">
          {inherited.length ? 'Nothing of its own yet: ' : 'No requirements yet: '}add one below, or move one here with the group picker of a requirement.
        </p>
      )}
      <AddRequirement focusKey={listKey(group)} onAdd={(text) => edit({ op: 'addRequirement', group, text })} />
    </>
  );
}

/** A group only the specs extended have: its requirements are read-only until this spec adds one of its own. */
function InheritedGroupBlock({ name, entries, index }: { name: string; entries: InheritedEntry[]; index: number }) {
  const { edit } = useSpec();
  return (
    <div id={inheritedGroupId(index)} className="requirement-group inherited-group">
      <header className="requirement-group-header">
        <span className="codicon codicon-symbol-namespace" aria-hidden="true" />
        <span className="group-name inherited-name">{name}</span>
        <span className="op-label muted">inherited</span>
        <span className="count">{entries.length}</span>
      </header>
      <Levels group={null} inherited={entries} />
      <AddRequirement focusKey={`i${index}`} onAdd={(text) => edit({ op: 'addGroup', name, text })} />
    </div>
  );
}

function GroupBlock({ group, inherited }: { group: number; inherited: InheritedEntry[] }) {
  const { model, edit } = useSpec();
  const groups = model.requirements!.groups;
  const { heading, items, notes } = groups[group];
  const move = (toIndex: number, button: string) => {
    edit({ op: 'moveGroup', group, toIndex });
    // The blocks are keyed by position: follow the group to its new place.
    requestFocus(`g${toIndex}-${button}`);
  };
  const content = [items.length ? plural(items.length, 'requirement') : '', notes ? 'its notes' : ''].filter(Boolean).join(' and ');
  return (
    <div id={groupId(group)} className="requirement-group">
      <header className="requirement-group-header">
        <span className="codicon codicon-symbol-namespace" aria-hidden="true" />
        <KeyInput
          value={heading.text}
          className="group-name"
          ariaLabel="Group name"
          validate={(v) => (normalizeTitle(v) ? undefined : 'A group needs a name')}
          onCommit={(name) => edit({ op: 'renameGroup', group, name })}
        />
        <span className="count">{items.length}</span>
        <span className="requirement-group-actions row-actions">
          <IconButton icon="arrow-up" label="Move group up" data-focus-key={`g${group}-up`} disabled={group === 0} onClick={() => move(group - 1, 'up')} />
          <IconButton
            icon="arrow-down"
            label="Move group down"
            data-focus-key={`g${group}-down`}
            disabled={group === groups.length - 1}
            onClick={() => move(group + 1, 'down')}
          />
          <IconButton icon="trash" label={content ? `Delete group with ${content}` : 'Delete group'} onClick={() => edit({ op: 'deleteGroup', group })} />
        </span>
      </header>
      <RequirementList group={group} inherited={inherited} />
    </div>
  );
}

/** Names a new group: written to the file as an empty "### " heading after the other groups. */
function NewGroup({ onDone }: { onDone(): void }) {
  const { model, edit } = useSpec();
  const [name, setName] = useState('');
  const index = model.requirements?.groups.length ?? 0;
  const create = () => {
    if (!normalizeTitle(name)) return;
    edit({ op: 'addGroup', name });
    onDone();
    requestFocus(`g${index}-add`);
  };
  return (
    <div className="requirement-group pending">
      <header className="requirement-group-header">
        <span className="codicon codicon-symbol-namespace" aria-hidden="true" />
        <input
          className="input group-name"
          autoFocus
          aria-label="New group name"
          placeholder="Group name, e.g. Security"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') onDone();
          }}
        />
        <IconButton icon="check" label="Create group" showLabel variant="secondary" disabled={!normalizeTitle(name)} onClick={create} />
        <IconButton icon="close" label="Cancel" onClick={onDone} />
      </header>
    </div>
  );
}

function RequirementsSection() {
  const { model, context, edit } = useSpec();
  const [creating, setCreating] = useState(false);
  const requirements = model.requirements;
  const counts = keywordCounts(model);
  const examples = exampleCount(model);
  const groups = requirements?.groups ?? [];
  const inherited = useMemo(() => mergeInherited(model, context?.inheritance), [model, context]);
  const inheritedIn = (name: string | null) => inherited.byGroup.get(groupKey(name)) ?? [];
  const problems = context?.inheritance.problems ?? [];
  return (
    <div id={anchorId('requirements')}>
      <Section
        title="Requirements"
        icon="checklist"
        count={allRequirements(model).length}
        actions={[
          ...counts.map((c) => (
            <span key={c.keyword} className={`kind-badge ${keywordClass(c.keyword)}`} title={KEYWORD_MEANINGS[c.keyword]}>
              {c.count} {c.keyword}
            </span>
          )),
          ...(examples ? [<span key="examples" className="kind-badge" title="Example scenarios listed under the requirements">{plural(examples, 'example')}</span>] : []),
          ...(inherited.total ? [<span key="inherited" className="kind-badge inherited-badge" title="Requirements of the specs this one extends">{inherited.total} inherited</span>] : []),
        ]}
      >
        <p className="muted small">
          Write each requirement as a sentence with an{' '}
          <a className="link-button" href="https://www.rfc-editor.org/rfc/rfc2119">
            RFC 2119
          </a>{' '}
          key word in capitals: <b>MUST</b> / <b>MUST NOT</b> for absolute requirements, <b>SHOULD</b> / <b>SHOULD NOT</b> for recommendations with justified
          exceptions, <b>MAY</b> for options. Each one is written as a heading under the heading of its key word: picking another key word moves it there. While
          you edit a requirement, a description (details, rationale) and example scenarios can be added under it: one concrete case each, with real values, and a
          title when it helps. Enter in a requirement moves to the add box, Shift+Enter to its description.
        </p>
        {inherited.total > 0 && (
          <p className="muted small">
            <span className="codicon codicon-type-hierarchy-super" aria-hidden="true" /> The requirements of the specs this one extends are listed first in each
            group, read-only: they apply here too and are edited in the spec that states them. Writing the same sentence with another key word overrides one.
          </p>
        )}
        {problems.map((problem) => (
          <p key={problem} className="notice small">
            <span className="codicon codicon-warning" aria-hidden="true" /> {problem}
          </p>
        ))}
        <label className="checkbox" title={`Written at the start of the section:\n${CONFORMANCE_NOTICE}`}>
          <input
            type="checkbox"
            checked={requirements ? !!requirements.notice : true}
            disabled={!requirements}
            onChange={(e) => edit({ op: 'setNotice', enabled: e.target.checked })}
          />{' '}
          Start with the BCP 14 conformance sentence (“The key words "MUST", "MUST NOT"… are to be interpreted as described in RFC 2119…”)
        </label>
        {requirements?.list.notes && (
          <p className="notice small">
            <span className="codicon codicon-info" aria-hidden="true" />
            The section also has text kept as written: <TextLink heading={requirements.section.heading} label="show in text" />
          </p>
        )}
        <div className="requirement-group main-list">
          {(groups.length > 0 || inherited.extraGroups.length > 0) && <div className="muted small">Without group</div>}
          <RequirementList group={null} inherited={inheritedIn(null)} />
        </div>
        {groups.map((group, i) => (
          <GroupBlock key={i} group={i} inherited={inheritedIn(group.heading.text)} />
        ))}
        {inherited.extraGroups.map((name, i) => (
          <InheritedGroupBlock key={name} name={name} entries={inheritedIn(name)} index={i} />
        ))}
        {creating ? (
          <NewGroup onDone={() => setCreating(false)} />
        ) : (
          <div>
            <IconButton icon="add" label="Add group" showLabel onClick={() => setCreating(true)} title="Group requirements under a “### ” heading, e.g. Security" />
          </div>
        )}
      </Section>
    </div>
  );
}

export function SpecPage() {
  const { model, issues, openAsText } = useSpec();
  const others = model.sections.filter((s) => s.kind === 'other');
  return (
    <div className="page spec-page">
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={goTo} />}
      <OverviewSection />
      <ContextSection />
      <RequirementsSection />
      {others.length > 0 && (
        <div id="spec-other">
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
      )}
    </div>
  );
}
