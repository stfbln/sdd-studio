import { getIn, isObject } from '../../../shared/structured/edits';
import { IconButton } from '../../../webview/components/IconButton';
import { ProblemsList } from '../../../webview/structured/EditorFrame';
import { Field, Section, TextAreaField, TextField } from '../../../webview/structured/fields';
import {
  analyzeOpenCli,
  cliName,
  COMMON_LICENSES,
  countOptions,
  isLegacyLayout,
  listCommands,
  migrateLayoutEdits,
  OPENCLI_VERSION,
} from '../core/opencli';
import { BoolCell } from './controls';
import { useCli } from './state';

const SEPARATORS = [
  { value: ' ', label: 'Space  (--output file.txt)' },
  { value: '=', label: 'Equals sign  (--output=file.txt)' },
  { value: ':', label: 'Colon  (--output:file.txt)' },
];

export function GeneralPage() {
  const { spec, edit, navigate, openAsText } = useCli();
  const issues = analyzeOpenCli(spec);
  const legacy = isLegacyLayout(spec);
  const commands = listCommands(spec);

  // The schema calls it optionSeparator, the specification text optionArgumentSeparator: keep whichever the file uses.
  const separatorKey = isObject(spec.conventions) && 'optionArgumentSeparator' in spec.conventions ? 'optionArgumentSeparator' : 'optionSeparator';
  const separator = getIn(spec, ['conventions', separatorKey]);
  const separatorValue = typeof separator === 'string' ? separator : ' ';
  const knownSeparator = SEPARATORS.some((s) => s.value === separatorValue);

  return (
    <div className="page">
      <h1 className="page-title">General</h1>
      {issues.length > 0 && <ProblemsList issues={issues} onNavigate={navigate} />}

      {legacy && (
        <div className="notice notice-warning">
          <span className="codicon codicon-warning" aria-hidden="true" />
          <span>
            This file uses the layout of earlier OpenCLI drafts: the root command's options, arguments and commands are at the top level. The current
            specification puts them in a <code>command</code> object with a name.
          </span>
          <button type="button" className="btn btn-primary btn-labelled" onClick={() => edit(migrateLayoutEdits(spec))}>
            Move them into command
          </button>
        </div>
      )}

      <Section title="CLI information" icon="info">
        <div className="form-grid">
          <TextField path={['info', 'title']} label="Title" required placeholder="Acme deploy tool" />
          <TextField path={['info', 'version']} label="Version" required placeholder="1.0.0" mono />
          <TextField path={['info', 'summary']} label="Summary" placeholder="One line describing the tool" />
          <TextAreaField path={['info', 'description']} label="Description" placeholder="What the tool is for" />
          <TextField path={['info', 'contact', 'name']} label="Contact name" />
          <TextField path={['info', 'contact', 'email']} label="Contact email" type="email" />
          <TextField path={['info', 'contact', 'url']} label="Contact URL" mono placeholder="https://" />
          <TextField path={['info', 'license', 'name']} label="License" placeholder="MIT License" />
          <TextField path={['info', 'license', 'identifier']} label="SPDX identifier" mono list="spdx-licenses" placeholder="MIT" />
          <TextField path={['info', 'license', 'url']} label="License URL" mono placeholder="https://" />
        </div>
        <datalist id="spdx-licenses">
          {COMMON_LICENSES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Section>

      <Section title="Conventions" icon="symbol-ruler">
        <p className="muted small">How users type options. These apply to every command.</p>
        <div className="form-grid">
          <Field label="Between an option and its value">
            <select
              className="keyword-select"
              value={knownSeparator ? separatorValue : '__custom__'}
              onChange={(e) =>
                edit(
                  e.target.value === ' '
                    ? { op: 'delete', path: ['conventions', separatorKey] }
                    : { op: 'set', path: ['conventions', separatorKey], value: e.target.value === '__custom__' ? separatorValue : e.target.value },
                )
              }
            >
              {SEPARATORS.map((s) => (
                <option key={s.label} value={s.value}>
                  {s.label}
                </option>
              ))}
              {!knownSeparator && <option value="__custom__">Other: “{separatorValue}”</option>}
            </select>
          </Field>
          <label className="checkbox" title="e.g. -abc instead of -a -b -c">
            <BoolCell path={['conventions', 'groupOptions']} label="Group short options" defaultValue /> Short options can be grouped (-abc = -a -b -c)
          </label>
        </div>
      </Section>

      <Section title="Commands" icon="terminal">
        <p>
          {commands.length ? (
            <>
              <button type="button" className="link-button mono" onClick={() => navigate({ kind: 'command', names: [] })}>
                {cliName(spec) || '(root command)'}
              </button>{' '}
              has {commands.length - 1} subcommand{commands.length === 2 ? '' : 's'} and {countOptions(spec)} option{countOptions(spec) === 1 ? '' : 's'} in total.
            </>
          ) : (
            <>
              <span className="muted">No root command yet.</span>{' '}
              <IconButton
                icon="add"
                label="Create root command"
                showLabel
                onClick={() => {
                  edit({ op: 'set', path: ['command'], value: { name: 'my-cli', options: [{ name: '--help', aliases: ['-h'], description: 'Show help.' }] } });
                  navigate({ kind: 'command', names: [] });
                }}
              />
            </>
          )}
        </p>
      </Section>

      <Section title="Specification" icon="book">
        <div className="form-grid">
          <TextField path={['opencli']} label="OpenCLI version" required mono placeholder={OPENCLI_VERSION} hint={`Version of the OpenCLI specification the file follows (latest: ${OPENCLI_VERSION}).`} />
        </div>
        <p className="muted small">
          Other top-level fields are kept as they are; edit them{' '}
          <button type="button" className="link-button" onClick={openAsText}>
            in the text editor
          </button>
          .
        </p>
      </Section>
    </div>
  );
}
