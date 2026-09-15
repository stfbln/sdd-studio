import { IconButton } from '../../../webview/components/IconButton';
import { KeyInput, Section } from '../../../webview/structured/fields';
import { findEnum, findMessage, identifierError, isTrueOption, namesInMessage, nextEnumNumber, topLevelNames, toUpperSnakeCase, renameTypeEdits } from '../core/analysis';
import type { ProtoPath } from '../core/model';
import { AddRow, CommentField, NumberInput, OptionCheckbox, OtherOptions, ReservedSection, UsedBy } from './controls';
import { useProto } from './state';

export function EnumPage({ path }: { path: ProtoPath }) {
  const { file, edit, navigate, imports, syntax } = useProto();
  const entry = findEnum(file, path);
  if (!entry) return null;
  const e = entry.node;
  const parentPath = path.slice(0, -1);
  const parent = parentPath.length ? findMessage(file, parentPath) : undefined;
  // Enum values live in the scope enclosing the enum, next to the enum itself.
  const scopeNames = parent ? namesInMessage(parent.node) : topLevelNames(file);
  const prefix = `${toUpperSnakeCase(e.name)}_`;
  const allowAlias = isTrueOption(e.options, 'allow_alias');

  return (
    <div className="page">
      <div className="page-title-row">
        <span className="codicon codicon-symbol-enum" aria-hidden="true" />
        <KeyInput
          value={e.name}
          className="title-input mono"
          ariaLabel="Enum name"
          validate={(v) => identifierError(v, scopeNames)}
          onCommit={(name) => {
            edit(renameTypeEdits(file, path, name, imports));
            navigate({ kind: 'enum', path: [...parentPath, `enum:${name}`] });
          }}
        />
        <IconButton
          icon="trash"
          label="Delete enum"
          onClick={() => {
            edit({ op: 'delete', target: path });
            navigate(parent ? { kind: 'message', path: parentPath } : { kind: 'general' });
          }}
        />
      </div>
      <p className="muted small">
        <span className="mono">{entry.fullName}</span>
        {parent && (
          <>
            {' · nested in '}
            <button type="button" className="link-button" onClick={() => navigate({ kind: 'message', path: parentPath })}>
              {parent.node.name}
            </button>
          </>
        )}
      </p>

      <Section title="Enum" icon="symbol-enum">
        <CommentField target={path} value={e.comment} />
        <div className="inline-fields">
          <OptionCheckbox target={path} options={e.options} name="allow_alias" label="Allow aliases" hint="Lets several values share the same number" />
          <OptionCheckbox target={path} options={e.options} name="deprecated" label="Deprecated" />
        </div>
        <OtherOptions options={e.options} handled={['allow_alias', 'deprecated']} />
      </Section>

      <Section title="Values" icon="symbol-enum-member" count={e.values.length}>
        {syntax !== 'proto2' && <p className="muted small">The first value must be 0; by convention it is {prefix}UNSPECIFIED and means "not set".</p>}
        <div className="table values-table">
          <div className="table-head">
            <span>Name</span>
            <span>Number</span>
            <span>Description</span>
            <span />
          </div>
          {e.values.map((v, i) => {
            const valuePath = [...path, `value:${v.name}`];
            const shared = e.values.filter((other) => other !== v && other.number === v.number);
            return (
              <div key={v.name} className="table-row">
                <KeyInput
                  value={v.name}
                  className="mono"
                  ariaLabel="Value name"
                  validate={(next) => identifierError(next, [...scopeNames, ...e.values.map((x) => x.name)])}
                  onCommit={(name) => edit({ op: 'rename', target: valuePath, name })}
                />
                <NumberInput
                  value={v.number}
                  ariaLabel="Value number"
                  invalid={
                    shared.length && !allowAlias
                      ? `Also used by ${shared.map((x) => x.name).join(', ')}`
                      : i === 0 && syntax !== 'proto2' && v.number !== 0
                        ? 'The first value must be 0'
                        : undefined
                  }
                  onChange={(number) => edit({ op: 'setNumber', target: valuePath, number })}
                />
                <ValueComment path={valuePath} value={v.comment} />
                <span className="row-buttons">
                  <OptionCheckbox target={valuePath} options={v.options} name="deprecated" label="Deprecated" />
                  <IconButton icon="trash" label="Delete value" onClick={() => edit({ op: 'delete', target: valuePath })} />
                </span>
              </div>
            );
          })}
        </div>
        <AddRow
          label="Add value"
          placeholder={`${prefix}NEW_VALUE`}
          initial={e.values.length ? prefix : ''}
          validate={(v) => identifierError(v, [...scopeNames, ...e.values.map((x) => x.name)])}
          onAdd={(name) => edit({ op: 'add', parent: path, element: { kind: 'value', name, number: nextEnumNumber(e) } })}
        />
      </Section>

      <ReservedSection target={path} reserved={e.reserved} what="value" />
      <UsedBy fullName={entry.fullName} />
    </div>
  );
}

function ValueComment({ path, value }: { path: ProtoPath; value: string }) {
  const { edit } = useProto();
  return (
    <input
      className="input"
      aria-label="Value description"
      placeholder="Description"
      defaultValue={value}
      key={value}
      onBlur={(e) => e.target.value.trim() !== value && edit({ op: 'setComment', target: path, comment: e.target.value.trim() })}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
