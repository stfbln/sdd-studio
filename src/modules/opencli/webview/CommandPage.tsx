import { useState } from 'react';
import { getIn, isObject, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Field, InlineInput, KeyInput, Section, TextAreaField } from '../../../webview/structured/fields';
import {
  analyzeOpenCli,
  argumentUsage,
  asArray,
  cliName,
  commandNameError,
  commandNames,
  COMMON_EXIT_CODES,
  commandPath,
  getCommand,
  helpText,
  inheritedOptions,
  isLegacyLayout,
  newCommand,
  optionNameError,
  optionNames,
  optionUsage,
  toCommandName,
  toOptionName,
  usageLine,
  valueName,
} from '../core/opencli';
import { AddInput, AritySelect, BoolCell, ChipsCell, Group, IntegerInput, MetadataEditor, MoveButtons, TextCell } from './controls';
import { sameLocation, useCli } from './state';

export function CommandPage({ names }: { names: string[] }) {
  const { spec, edit, navigate } = useCli();
  const path = commandPath(spec, names)!;
  const command = getCommand(spec, names)!;
  const isRoot = names.length === 0;
  const legacyRoot = isRoot && isLegacyLayout(spec);
  const parentNames = names.slice(0, -1);
  const parentPath = commandPath(spec, parentNames);
  const siblings = asArray(getCommand(spec, parentNames)?.commands);
  const index = siblings.findIndex((c) => isObject(c) && c.name === names[names.length - 1]);
  const siblingNames = siblings.filter((_, i) => i !== index).flatMap(commandNames);
  const issues = analyzeOpenCli(spec).filter((i) => sameLocation(i.location, { kind: 'command', names }));
  const exe = cliName(spec) || 'cli';

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-terminal" aria-hidden="true" />
        {names.length > 0 && (
          <span className="breadcrumb mono">
            {[exe, ...parentNames].map((n, i) => (
              <span key={i}>
                <button type="button" className="link-button" onClick={() => navigate({ kind: 'command', names: parentNames.slice(0, i) })}>
                  {n}
                </button>
                <span className="muted"> › </span>
              </span>
            ))}
          </span>
        )}
        {legacyRoot ? (
          <span className="mono title-text">{exe}</span>
        ) : (
          <KeyInput
            value={typeof command.name === 'string' ? command.name : ''}
            className="mono title-input"
            ariaLabel={isRoot ? 'Executable name' : 'Command name'}
            validate={(v) => commandNameError(v, siblingNames)}
            onCommit={(next) => {
              edit({ op: 'set', path: [...path, 'name'], value: next });
              if (!isRoot) navigate({ kind: 'command', names: [...parentNames, next] });
            }}
          />
        )}
        {!isRoot && parentPath && (
          <>
            <MoveButtons path={[...parentPath, 'commands']} index={index} count={siblings.length} label="command" />
            <IconButton
              icon="trash"
              label="Delete command"
              onClick={() => {
                edit({ op: 'delete', path });
                navigate({ kind: 'command', names: parentNames });
              }}
            />
          </>
        )}
      </div>
      <p className="muted small">
        {isRoot ? 'The executable users type. Its options and arguments apply when no subcommand is given.' : 'The word typed after its parent command.'} Press Enter to
        rename.
      </p>

      <div className="usage-line" title="Usage">
        <span className="muted">Usage</span>
        <code>{usageLine(spec, names)}</code>
      </div>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      <Section title="Command" icon="note">
        <div className="form-grid">
          <TextAreaField path={[...path, 'description']} label="Description" placeholder="What this command does, shown in --help" />
          <Field label="Aliases" hint="Other names for this command, e.g. ls for list">
            <ChipsCell path={[...path, 'aliases']} placeholder="Add alias" />
          </Field>
          <div className="checkbox-group">
            <label className="checkbox">
              <BoolCell path={[...path, 'hidden']} label="Hidden" /> Hidden from help
            </label>
            <label className="checkbox" title="The command prompts the user, so scripts and agents cannot run it unattended">
              <BoolCell path={[...path, 'interactive']} label="Interactive" /> Requires interactive input
            </label>
          </div>
        </div>
      </Section>

      <ArgumentsSection path={[...path, 'arguments']} />
      <OptionsSection names={names} path={path} command={command} />
      <SubcommandsSection names={names} path={path} command={command} />
      <ExitCodesSection path={[...path, 'exitCodes']} />
      <ExamplesSection path={[...path, 'examples']} prefix={[exe, ...names].join(' ')} />

      <Section title="Metadata" icon="tag" count={asArray(command.metadata).length}>
        <p className="muted small">Custom name/value pairs for tools reading this description.</p>
        <MetadataEditor path={[...path, 'metadata']} />
      </Section>

      <Section title="Help preview" icon="eye">
        <p className="muted small">What {[exe, ...names].join(' ')} --help could print from this description.</p>
        <pre className="help-preview">{helpText(spec, names)}</pre>
      </Section>
    </div>
  );
}

/* Arguments ---------------------------------------------------------------- */

/** Positional arguments of a command, or the values of an option (`ofOption`). */
function ArgumentsTable({ path, ofOption }: { path: SpecPath; ofOption?: boolean }) {
  const { spec, edit } = useCli();
  const args = asArray(getIn(spec, path));
  const [open, setOpen] = useState<number | null>(null);
  const label = ofOption ? 'value' : 'argument';

  return (
    <>
      {args.length > 0 && (
        <div className={`table arguments-table ${ofOption ? 'compact' : ''}`} role="table">
          <div className="table-head" role="row">
            <span>Name</span>
            <span>Values</span>
            <span title="Required">Req.</span>
            <span>Description</span>
            <span />
          </div>
          {args.map((arg, i) => {
            const rowPath = [...path, i];
            if (!isObject(arg)) return null;
            const accepted = asArray(arg.acceptedValues);
            return (
              <div key={i} className="table-group">
                <div className="table-row" role="row">
                  <span className="name-cell">
                    <TextCell path={[...rowPath, 'name']} placeholder="NAME" ariaLabel={ofOption ? 'Value name' : 'Argument name'} mono />
                    {arg.hidden === true && <span className="codicon codicon-eye-closed muted" title="Hidden" />}
                  </span>
                  <AritySelect path={rowPath} />
                  <BoolCell path={[...rowPath, 'required']} label="Required" />
                  <InlineInput path={[...rowPath, 'description']} placeholder="Description" />
                  <span className="cell-actions">
                    <IconButton
                      icon={open === i ? 'chevron-up' : 'chevron-down'}
                      label={open === i ? 'Hide details' : `More (accepted values${accepted.length ? `: ${accepted.length}` : ''}, group, order…)`}
                      className={accepted.length || arg.group || asArray(arg.metadata).length ? 'has-details' : ''}
                      onClick={() => setOpen(open === i ? null : i)}
                    />
                    <IconButton icon="trash" label={`Remove ${label}`} onClick={() => edit({ op: 'delete', path: rowPath })} />
                  </span>
                </div>
                {open === i && (
                  <div className="row-details">
                    <Field label="Accepted values" hint="Leave empty to accept any value">
                      <ChipsCell path={[...rowPath, 'acceptedValues']} placeholder="Add value" spaces />
                    </Field>
                    <div className="inline-fields">
                      <Field label="Group">
                        <InlineInput path={[...rowPath, 'group']} placeholder="e.g. Input" />
                      </Field>
                      <label className="checkbox">
                        <BoolCell path={[...rowPath, 'hidden']} label="Hidden" /> Hidden from help
                      </label>
                      <span className="grow" />
                      <span className="muted small">Order</span>
                      <MoveButtons path={path} index={i} count={args.length} label={label} />
                    </div>
                    <Group label="Metadata">
                      <MetadataEditor path={[...rowPath, 'metadata']} />
                    </Group>
                    <p className="muted small">
                      Shown as <code>{argumentUsage(arg)}</code>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ArgumentsSection({ path }: { path: SpecPath }) {
  const { spec, edit } = useCli();
  const args = asArray(getIn(spec, path));
  const names = args.map((a) => (isObject(a) ? String(a.name ?? '') : ''));
  return (
    <Section title="Arguments" icon="symbol-parameter" count={args.length}>
      <p className="muted small">Positional values typed after the command, in this order. Only the last one should take several values.</p>
      <ArgumentsTable path={path} />
      <AddInput
        label="Add argument"
        placeholder="FILE"
        normalize={(v) => v.trim()}
        validate={(v) => (names.includes(v) ? 'Already exists' : undefined)}
        onAdd={(name) => edit({ op: 'set', path: [...path, args.length], value: { name, required: true } })}
      />
    </Section>
  );
}

/* Options ------------------------------------------------------------------ */

function OptionsSection({ names, path, command }: { names: string[]; path: SpecPath; command: JsonObject }) {
  const { spec, edit, navigate } = useCli();
  const optionsPath = [...path, 'options'];
  const options = asArray(command.options);
  const taken = options.flatMap(optionNames);
  const inherited = inheritedOptions(spec, names);
  const [open, setOpen] = useState<number | null>(null);
  const [withValue, setWithValue] = useState(false);

  return (
    <Section title="Options" icon="settings" count={options.length}>
      <p className="muted small">Named flags like --verbose. Give an option a value name (e.g. FILE) when it expects a value.</p>
      {options.length > 0 && (
        <div className="table options-table" role="table">
          <div className="table-head" role="row">
            <span>Name</span>
            <span>Aliases</span>
            <span>Value</span>
            <span title="Required">Req.</span>
            <span>Description</span>
            <span />
          </div>
          {options.map((option, i) => {
            if (!isObject(option)) return null;
            const rowPath = [...optionsPath, i];
            return (
              <div key={i} className="table-group">
                <OptionRow path={rowPath} option={option} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
                {open === i && (
                  <div className="row-details">
                    <div className="inline-fields">
                      <label className="checkbox" title="Also available on every subcommand">
                        <BoolCell path={[...rowPath, 'recursive']} label="Recursive" /> Available on subcommands
                      </label>
                      <label className="checkbox">
                        <BoolCell path={[...rowPath, 'hidden']} label="Hidden" /> Hidden from help
                      </label>
                      <Field label="Group">
                        <InlineInput path={[...rowPath, 'group']} placeholder="e.g. Output" />
                      </Field>
                      <span className="grow" />
                      <span className="muted small">Order</span>
                      <MoveButtons path={optionsPath} index={i} count={options.length} label="option" />
                    </div>
                    <Group label="Values" hint="Values the option expects after its name. None: the option is a flag.">
                      <div className="option-values">
                        <ArgumentsTable path={[...rowPath, 'arguments']} ofOption />
                        <IconButton
                          icon="add"
                          label="Add value"
                          showLabel
                          onClick={() =>
                            edit({
                              op: 'set',
                              path: [...rowPath, 'arguments', asArray(option.arguments).length],
                              value: { name: valueName(String(option.name ?? '')), required: true },
                            })
                          }
                        />
                      </div>
                    </Group>
                    <Group label="Metadata">
                      <MetadataEditor path={[...rowPath, 'metadata']} />
                    </Group>
                    <p className="muted small">
                      Shown as <code>{optionUsage(option)}</code>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <AddInput
        label="Add option"
        placeholder="--output or Output format"
        normalize={toOptionName}
        validate={(v) => optionNameError(v, taken)}
        onAdd={(name) => {
          const value: JsonObject = { name };
          if (withValue) value.arguments = [{ name: valueName(name), required: true }];
          edit({ op: 'set', path: [...optionsPath, options.length], value });
        }}
      >
        <label className="checkbox">
          <input type="checkbox" checked={withValue} onChange={(e) => setWithValue(e.target.checked)} /> takes a value
        </label>
      </AddInput>

      {inherited.length > 0 && (
        <div className="inherited-options">
          <span className="muted small">Inherited from parent commands (recursive):</span>
          {inherited.map(({ from, option }, i) => (
            <button key={i} type="button" className="link-button inherited-option" onClick={() => navigate({ kind: 'command', names: from })}>
              <code>{optionUsage(option)}</code>
              <span className="muted"> from {[cliName(spec) || 'root', ...from].join(' ')}</span>
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function OptionRow({ path, option, open, onToggle }: { path: SpecPath; option: JsonObject; open: boolean; onToggle(): void }) {
  const { edit } = useCli();
  const args = asArray(option.arguments);
  const first = isObject(args[0]) ? args[0] : undefined;
  const details = option.recursive === true || option.hidden === true || !!option.group || args.length > 1 || asArray(option.metadata).length > 0;

  const setValueName = (text: string) => {
    const edits: SpecEdit[] = [];
    if (!text) edits.push(args.length <= 1 ? { op: 'delete', path: [...path, 'arguments'] } : { op: 'delete', path: [...path, 'arguments', 0] });
    else if (first) edits.push({ op: 'set', path: [...path, 'arguments', 0, 'name'], value: text });
    else edits.push({ op: 'set', path: [...path, 'arguments'], value: [{ name: text, required: true }] });
    edit(edits);
  };

  return (
    <div className="table-row" role="row">
      <span className="name-cell">
        <TextCell path={[...path, 'name']} placeholder="--name" ariaLabel="Option name" mono />
        {option.recursive === true && <span className="codicon codicon-type-hierarchy-sub muted" title="Available on subcommands" />}
        {option.hidden === true && <span className="codicon codicon-eye-closed muted" title="Hidden" />}
      </span>
      <ChipsCell path={[...path, 'aliases']} placeholder="-n" />
      {args.length > 1 ? (
        <button type="button" className="link-button muted" onClick={onToggle}>
          {args.length} values
        </button>
      ) : (
        <ValueNameInput value={first ? String(first.name ?? '') : ''} onCommit={setValueName} />
      )}
      <BoolCell path={[...path, 'required']} label="Required" />
      <InlineInput path={[...path, 'description']} placeholder="Description" />
      <span className="cell-actions">
        <IconButton
          icon={open ? 'chevron-up' : 'chevron-down'}
          label={open ? 'Hide details' : 'More (recursive, hidden, group, values, order…)'}
          className={details ? 'has-details' : ''}
          onClick={onToggle}
        />
        <IconButton icon="trash" label="Remove option" onClick={() => edit({ op: 'delete', path })} />
      </span>
    </div>
  );
}

/** Name of the single value of an option; empty makes the option a flag. Committed on blur. */
function ValueNameInput({ value, onCommit }: { value: string; onCommit(value: string): void }) {
  return (
    <KeyInput
      value={value}
      className="mono"
      placeholder="flag"
      ariaLabel="Value name"
      validate={(v) => (/\s/.test(v.trim()) ? 'No spaces' : undefined)}
      onCommit={(v) => onCommit(v.trim())}
    />
  );
}

/* Subcommands -------------------------------------------------------------- */

function SubcommandsSection({ names, path, command }: { names: string[]; path: SpecPath; command: JsonObject }) {
  const { edit, navigate } = useCli();
  const commandsPath = [...path, 'commands'];
  const children = asArray(command.commands);
  const taken = children.flatMap(commandNames);

  return (
    <Section title="Subcommands" icon="list-tree" count={children.length}>
      {children.length === 0 && <p className="muted small">No subcommands. Add some for tools like git (git commit, git push…).</p>}
      {children.map((child, i) => {
        if (!isObject(child)) return null;
        const name = String(child.name ?? '');
        const aliases = asArray(child.aliases).map(String);
        const counts = [
          asArray(child.arguments).length && `${asArray(child.arguments).length} arg.`,
          asArray(child.options).length && `${asArray(child.options).length} opt.`,
          asArray(child.commands).length && `${asArray(child.commands).length} sub.`,
        ].filter(Boolean);
        return (
          <div key={i} className="subcommand-row">
            <button type="button" className="operation-link" onClick={() => navigate({ kind: 'command', names: [...names, name] })}>
              <span className="codicon codicon-terminal" aria-hidden="true" />
              <span>
                <span className="mono subcommand-name">{name || '(no name)'}</span>
                {aliases.length > 0 && <span className="muted mono"> ({aliases.join(', ')})</span>}
                {child.hidden === true && <span className="codicon codicon-eye-closed muted" title="Hidden" />}
                {typeof child.description === 'string' && <span className="muted subcommand-description">{child.description.split('\n')[0]}</span>}
              </span>
              <span className="muted small">{counts.join(' · ')}</span>
            </button>
            <MoveButtons path={commandsPath} index={i} count={children.length} label="command" />
            <IconButton icon="trash" label="Delete command" onClick={() => edit({ op: 'delete', path: [...commandsPath, i] })} />
          </div>
        );
      })}
      <AddInput
        label="Add subcommand"
        placeholder="deploy"
        normalize={toCommandName}
        validate={(v) => commandNameError(v, taken)}
        onAdd={(name) => {
          edit({ op: 'set', path: [...commandsPath, children.length], value: newCommand(name) });
          navigate({ kind: 'command', names: [...names, name] });
        }}
      />
    </Section>
  );
}

/* Exit codes, examples ----------------------------------------------------- */

function ExitCodesSection({ path }: { path: SpecPath }) {
  const { spec, edit } = useCli();
  const codes = asArray(getIn(spec, path));
  const used = codes.map((c) => (isObject(c) ? c.code : undefined));
  const common = COMMON_EXIT_CODES.filter((c) => !used.includes(c.code));
  const nextCode = Math.max(0, ...used.filter((c): c is number => typeof c === 'number').map((c) => c + 1));

  return (
    <Section title="Exit codes" icon="debug-stop" count={codes.length}>
      {codes.length === 0 && <p className="muted small">What the process returns. 0 usually means success.</p>}
      {codes.map((code, i) => (
        <div key={i} className="list-row">
          <IntegerInput
            ariaLabel="Exit code"
            value={isObject(code) && typeof code.code === 'number' ? code.code : undefined}
            onCommit={(v) => edit({ op: 'set', path: [...path, i, 'code'], value: v ?? 0 })}
          />
          <InlineInput path={[...path, i, 'description']} placeholder="Description" grow />
          <IconButton icon="trash" label="Remove exit code" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
        </div>
      ))}
      <div className="row-buttons">
        <IconButton icon="add" label="Add exit code" showLabel onClick={() => edit({ op: 'set', path: [...path, codes.length], value: { code: nextCode, description: '' } })} />
        {common.length > 0 && (
          <select
            className="keyword-select"
            aria-label="Add a common exit code"
            value=""
            onChange={(e) => {
              const picked = COMMON_EXIT_CODES.find((c) => String(c.code) === e.target.value);
              if (picked) edit({ op: 'set', path: [...path, codes.length], value: { ...picked } });
            }}
          >
            <option value="">+ Common code…</option>
            {common.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.description}
              </option>
            ))}
          </select>
        )}
      </div>
    </Section>
  );
}

function ExamplesSection({ path, prefix }: { path: SpecPath; prefix: string }) {
  const { spec, edit } = useCli();
  const examples = asArray(getIn(spec, path));
  const [added, setAdded] = useState<number>();
  return (
    <Section title="Examples" icon="lightbulb" count={examples.length}>
      {examples.map((_, i) => (
        <div key={i} className="list-row">
          <span className="muted mono">$</span>
          <TextCell path={[...path, i]} placeholder={prefix} ariaLabel="Example" mono grow autoFocus={i === added} />
          <MoveButtons path={path} index={i} count={examples.length} label="example" />
          <IconButton icon="trash" label="Remove example" onClick={() => edit({ op: 'delete', path: [...path, i] })} />
        </div>
      ))}
      <IconButton
        icon="add"
        label="Add example"
        showLabel
        onClick={() => {
          // No trailing space: YAML would quote the value for good.
          edit({ op: 'set', path: [...path, examples.length], value: prefix });
          setAdded(examples.length);
        }}
      />
    </Section>
  );
}
