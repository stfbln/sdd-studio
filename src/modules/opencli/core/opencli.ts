/**
 * OpenCLI knowledge used by the form editor, the catalog and the checks.
 *
 * An OpenCLI description has `opencli` (spec version), `info` and a root `command` whose
 * `commands` nest recursively. Drafts before April 2026 put the root command fields
 * (`options`, `arguments`, `commands`...) directly in the document: both layouts are read
 * and edited in place.
 */
import { getIn, isObject, type Json, type JsonObject, type SpecEdit, type SpecPath } from '../../../shared/structured/edits';

/** Page of the form: the general page or a command, addressed by its names from the root (root = []). */
export type CliLocation = { kind: 'general' } | { kind: 'command'; names: string[] };

export interface CliIssue {
  severity: 'error' | 'warning';
  message: string;
  location: CliLocation;
}

export const OPENCLI_VERSION = '0.1';

/** Command fields found at the top level of documents written with the old layout. */
export const LEGACY_ROOT_FIELDS = ['options', 'arguments', 'commands', 'exitCodes', 'examples', 'interactive', 'metadata', 'hidden', 'aliases', 'description'];

export const COMMON_LICENSES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-3.0-only', 'MPL-2.0', 'ISC', 'Unlicense'];

export const COMMON_EXIT_CODES: { code: number; description: string }[] = [
  { code: 0, description: 'Success' },
  { code: 1, description: 'General error' },
  { code: 2, description: 'Invalid usage or arguments' },
  { code: 126, description: 'Command cannot execute' },
  { code: 127, description: 'Command not found' },
  { code: 130, description: 'Interrupted (Ctrl+C)' },
];

export const asArray = (value: unknown): Json[] => (Array.isArray(value) ? value : []);
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

export function openCliVersion(spec: unknown): string | undefined {
  const value = isObject(spec) ? spec.opencli : undefined;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

/** True when the root command fields are at the top level (layout of drafts before April 2026). */
export function isLegacyLayout(spec: unknown): boolean {
  return isObject(spec) && !isObject(spec.command) && LEGACY_ROOT_FIELDS.some((k) => k in spec);
}

/** Where the root command lives in the document. */
export const rootCommandPath = (spec: unknown): SpecPath => (isLegacyLayout(spec) ? [] : ['command']);

/** Name of the executable: the root command name, or the title for the old layout. */
export function cliName(spec: unknown): string {
  if (isLegacyLayout(spec)) return str(getIn(spec, ['info', 'title'])) ?? '';
  return str(getIn(spec, ['command', 'name'])) ?? '';
}

/* Commands ----------------------------------------------------------------- */

export interface CommandInfo {
  names: string[];
  path: SpecPath;
  command: JsonObject;
  /** Index in the parent's `commands` (-1 for the root). */
  index: number;
}

/** Document path of a command, following the first sibling with each name. */
export function commandPath(spec: unknown, names: string[]): SpecPath | undefined {
  let path = rootCommandPath(spec);
  if (!isObject(getIn(spec, path)) && !(path.length === 0 && isObject(spec))) return undefined;
  for (const name of names) {
    const index = asArray(getIn(spec, [...path, 'commands'])).findIndex((c) => isObject(c) && c.name === name);
    if (index < 0) return undefined;
    path = [...path, 'commands', index];
  }
  return path;
}

export function getCommand(spec: unknown, names: string[]): JsonObject | undefined {
  const path = commandPath(spec, names);
  const value = path && (path.length ? getIn(spec, path) : spec);
  return isObject(value) ? value : undefined;
}

/** Subcommands of a command, in file order. */
export function subcommands(spec: unknown, names: string[]): CommandInfo[] {
  const path = commandPath(spec, names);
  if (!path) return [];
  return asArray(getIn(spec, [...path, 'commands'])).flatMap((command, index): CommandInfo[] =>
    isObject(command) ? [{ names: [...names, str(command.name) ?? ''], path: [...path, 'commands', index], command, index }] : [],
  );
}

/** The root command and all its descendants, depth first. */
export function listCommands(spec: unknown): CommandInfo[] {
  const root = getCommand(spec, []);
  if (!root) return [];
  const result: CommandInfo[] = [{ names: [], path: rootCommandPath(spec), command: root, index: -1 }];
  const walk = (names: string[]) => {
    for (const child of subcommands(spec, names)) {
      result.push(child);
      walk(child.names);
    }
  };
  walk([]);
  return result;
}

/** Options declared on ancestors with `recursive: true`, closest ancestor first. */
export function inheritedOptions(spec: unknown, names: string[]): { from: string[]; option: JsonObject }[] {
  const result: { from: string[]; option: JsonObject }[] = [];
  for (let depth = names.length - 1; depth >= 0; depth--) {
    const from = names.slice(0, depth);
    for (const option of asArray(getCommand(spec, from)?.options)) {
      if (isObject(option) && option.recursive === true) result.push({ from, option });
    }
  }
  return result;
}

/* Arguments and arity ------------------------------------------------------ */

export interface Arity {
  minimum: number;
  /** undefined: unlimited. */
  maximum?: number;
}

/** Arity of an argument; the default is exactly one value, and a missing maximum means unlimited. */
export function arityOf(argument: unknown): Arity {
  const arity = isObject(argument) ? argument.arity : undefined;
  if (!isObject(arity)) return { minimum: 1, maximum: 1 };
  const minimum = typeof arity.minimum === 'number' ? arity.minimum : 1;
  const maximum = typeof arity.maximum === 'number' ? arity.maximum : undefined;
  return { minimum, maximum };
}

export const ARITY_PRESETS = [
  { id: 'one', label: 'Exactly one value', arity: { minimum: 1, maximum: 1 } },
  { id: 'optional', label: 'Zero or one value', arity: { minimum: 0, maximum: 1 } },
  { id: 'oneOrMore', label: 'One or more values', arity: { minimum: 1 } },
  { id: 'any', label: 'Zero or more values', arity: { minimum: 0 } },
] as const;

export function arityPreset(arity: Arity): string {
  return ARITY_PRESETS.find((p) => p.arity.minimum === arity.minimum && ('maximum' in p.arity ? p.arity.maximum : undefined) === arity.maximum)?.id ?? 'custom';
}

export const isMultiple = (arity: Arity) => arity.maximum === undefined || arity.maximum > 1;

/** `<FILE>`, `[FILE]`, `<FILES>...` as shown in usage lines. */
export function argumentUsage(argument: JsonObject): string {
  const name = str(argument.name) || 'VALUE';
  const arity = arityOf(argument);
  const required = argument.required === true;
  return `${required ? '<' : '['}${name}${required ? '>' : ']'}${isMultiple(arity) ? '...' : ''}`;
}

/** `-c, --configuration <CONFIGURATION>` */
export function optionUsage(option: JsonObject): string {
  const names = [...asArray(option.aliases).map(String), str(option.name) ?? ''].filter(Boolean);
  names.sort((a, b) => a.replace(/^-+/, '').length - b.replace(/^-+/, '').length || a.length - b.length);
  const args = asArray(option.arguments).filter(isObject).map(argumentUsage);
  return [names.join(', '), ...args].join(' ');
}

/** `tool remote add [OPTIONS] <NAME> <URL> [COMMAND]` */
export function usageLine(spec: unknown, names: string[]): string {
  const command = getCommand(spec, names);
  if (!command) return '';
  const visible = (list: unknown) => asArray(list).filter((x): x is JsonObject => isObject(x) && x.hidden !== true);
  const hasOptions = visible(command.options).length > 0 || inheritedOptions(spec, names).some((o) => o.option.hidden !== true);
  const parts = [
    cliName(spec) || 'cli',
    ...names,
    ...(hasOptions ? ['[OPTIONS]'] : []),
    ...visible(command.arguments).map(argumentUsage),
    ...(visible(command.commands).length ? ['[COMMAND]'] : []),
  ];
  return parts.join(' ');
}

/** What `tool <command> --help` could print, to preview the description. */
export function helpText(spec: unknown, names: string[]): string {
  const command = getCommand(spec, names);
  if (!command) return '';
  const lines: string[] = [];
  const description = names.length ? str(command.description) : (str(command.description) ?? str(getIn(spec, ['info', 'summary'])) ?? str(getIn(spec, ['info', 'description'])));
  if (description) lines.push(description.trim(), '');
  lines.push('Usage:', `  ${usageLine(spec, names)}`);

  const table = (title: string, rows: [string, string][]) => {
    if (!rows.length) return;
    const width = Math.min(Math.max(...rows.map((r) => r[0].length)), 32);
    lines.push('', `${title}:`);
    for (const [left, right] of rows) {
      const first = right.split('\n')[0] ?? '';
      lines.push(left.length > width ? `  ${left}\n  ${' '.repeat(width)}  ${first}`.trimEnd() : `  ${left.padEnd(width)}  ${first}`.trimEnd());
    }
  };
  const visible = (list: unknown) => asArray(list).filter((x): x is JsonObject => isObject(x) && x.hidden !== true);
  const describe = (item: JsonObject) => {
    const accepted = asArray(item.acceptedValues).map(String);
    const extra = [item.required === true ? 'required' : '', accepted.length ? `one of: ${accepted.join(', ')}` : ''].filter(Boolean);
    return [str(item.description) ?? '', extra.length ? `(${extra.join('; ')})` : ''].filter(Boolean).join(' ');
  };

  table('Arguments', visible(command.arguments).map((a) => [argumentUsage(a), describe(a)]));
  table('Options', [
    ...visible(command.options).map((o): [string, string] => [optionUsage(o), describe(o)]),
    ...inheritedOptions(spec, names)
      .filter((o) => o.option.hidden !== true)
      .map((o): [string, string] => [optionUsage(o.option), describe(o.option)]),
  ]);
  table(
    'Commands',
    visible(command.commands).map((c) => [[str(c.name) ?? '', ...asArray(c.aliases).map(String)].join(', '), (str(c.description) ?? '').split('\n')[0]]),
  );
  table('Exit codes', asArray(command.exitCodes).filter(isObject).map((e) => [String(e.code ?? ''), str(e.description) ?? '']));
  const examples = asArray(command.examples).map(String);
  if (examples.length) lines.push('', 'Examples:', ...examples.map((e) => `  ${e}`));
  return lines.join('\n');
}

/* Names -------------------------------------------------------------------- */

/** Every name an option answers to. */
export const optionNames = (option: unknown) => (isObject(option) ? [str(option.name) ?? '', ...asArray(option.aliases).map(String)].filter(Boolean) : []);
export const commandNames = (command: unknown) => (isObject(command) ? [str(command.name) ?? '', ...asArray(command.aliases).map(String)].filter(Boolean) : []);

export function commandNameError(value: string, siblings: string[]): string | undefined {
  if (!value.trim()) return 'Name required';
  if (/\s/.test(value)) return 'No spaces';
  if (siblings.includes(value)) return 'Already used by another command';
  return undefined;
}

export function optionNameError(value: string, taken: string[]): string | undefined {
  if (!value.trim()) return 'Name required';
  if (/\s/.test(value)) return 'No spaces';
  if (taken.includes(value)) return 'Already used by another option';
  return undefined;
}

/** "Output format" -> "--output-format" */
export function toOptionName(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('-') || trimmed.startsWith('/')) return trimmed.replace(/\s+/g, '-');
  const kebab = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join('-')
    .toLowerCase();
  return kebab.length === 1 ? `-${kebab}` : kebab ? `--${kebab}` : '';
}

/** "--output-format" -> "OUTPUT_FORMAT", used as the value name of an option. */
export function valueName(optionName: string): string {
  return (optionName.replace(/^[-/]+/, '').replace(/[^\p{L}\p{N}]+/gu, '_').toUpperCase() || 'VALUE');
}

export function uniqueName(base: string, taken: string[]): string {
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}${i}`;
  return name;
}

/** "My Tool" -> "my-tool" */
export const toCommandName = (text: string) =>
  text
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .split(/[^\p{L}\p{N}._]+/u)
    .filter(Boolean)
    .join('-')
    .toLowerCase();

/* Checks ------------------------------------------------------------------- */

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
const isInteger = (value: unknown) => typeof value === 'number' && Number.isInteger(value);

export function analyzeOpenCli(spec: unknown): CliIssue[] {
  const issues: CliIssue[] = [];
  const general: CliLocation = { kind: 'general' };
  const add = (severity: CliIssue['severity'], message: string, location: CliLocation = general) => issues.push({ severity, message, location });
  if (!isObject(spec)) return issues;

  const version = openCliVersion(spec);
  if (!version) add('error', 'The "opencli" version is missing');
  if (!isObject(spec.info)) add('error', 'The "info" object is missing');
  else {
    if (!str(spec.info.title)?.trim()) add('error', 'The CLI title is required');
    if (spec.info.version === undefined || String(spec.info.version).trim() === '') add('error', 'The CLI version is required');
    const email = getIn(spec, ['info', 'contact', 'email']);
    if (typeof email === 'string' && email && !/.+@.+\..+/.test(email)) add('warning', `Contact email "${email}" is not a valid email address`);
    for (const path of [['contact', 'url'], ['license', 'url']]) {
      const url = getIn(spec.info, path);
      if (typeof url === 'string' && url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) add('warning', `${path[0] === 'contact' ? 'Contact' : 'License'} URL "${url}" should be an absolute URI`);
    }
  }
  if (isLegacyLayout(spec)) add('warning', 'Root command fields are at the top level (older draft): the current specification puts them in "command"');
  else if (!isObject(spec.command)) add('error', 'The root "command" is missing');

  for (const info of listCommands(spec)) {
    const { command, names } = info;
    const location: CliLocation = { kind: 'command', names };
    const label = names.length ? names.join(' ') : 'Root command';
    const at = (severity: CliIssue['severity'], message: string) => add(severity, `${label}: ${message}`, location);

    if (!(names.length === 0 && isLegacyLayout(spec)) && !str(command.name)?.trim()) at('error', 'name is required');
    const aliasDupes = duplicates(asArray(command.aliases).map(String));
    if (aliasDupes.length) at('error', `duplicate alias ${aliasDupes.join(', ')}`);

    const children = asArray(command.commands).filter(isObject);
    for (const name of duplicates(children.flatMap(commandNames))) at('error', `several subcommands are called "${name}"`);

    // Options: own names must be unique, and should not hide an inherited option.
    const options = asArray(command.options).filter(isObject);
    options.forEach((option, i) => {
      if (!str(option.name)?.trim()) at('error', `option #${i + 1} has no name`);
      const dupes = duplicates(asArray(option.aliases).map(String));
      if (dupes.length) at('error', `option ${option.name}: duplicate alias ${dupes.join(', ')}`);
      checkArguments(asArray(option.arguments), `option ${option.name ?? i + 1}`, at, true);
    });
    for (const name of duplicates(options.flatMap(optionNames))) at('error', `several options use "${name}"`);
    const own = new Set(options.flatMap(optionNames));
    for (const { from, option } of inheritedOptions(spec, names)) {
      const clash = optionNames(option).find((n) => own.has(n));
      if (clash) at('warning', `option "${clash}" hides the recursive option of ${from.length ? from.join(' ') : 'the root command'}`);
    }

    checkArguments(asArray(command.arguments), 'argument', at, false);

    const codes = asArray(command.exitCodes).filter(isObject);
    codes.forEach((code) => {
      if (!isInteger(code.code)) at('error', `exit code "${String(code.code ?? '')}" must be an integer`);
    });
    for (const code of duplicates(codes.filter((c) => isInteger(c.code)).map((c) => String(c.code)))) at('error', `exit code ${code} is listed twice`);

    asArray(command.metadata).forEach((m, i) => {
      if (!isObject(m) || !str(m.name)?.trim()) at('error', `metadata #${i + 1} has no name`);
    });
  }
  return issues;
}

function checkArguments(list: Json[], owner: string, at: (severity: CliIssue['severity'], message: string) => void, ofOption: boolean) {
  const args = list.filter(isObject);
  const label = (arg: JsonObject, i: number) => (ofOption ? `${owner} value ${str(arg.name) ?? i + 1}` : `argument ${str(arg.name) ?? `#${i + 1}`}`);
  args.forEach((arg, i) => {
    if (!str(arg.name)?.trim()) at('error', `${ofOption ? `${owner}: value` : 'argument'} #${i + 1} has no name`);
    if (isObject(arg.arity)) {
      const { minimum, maximum } = arg.arity;
      if (minimum !== undefined && (!isInteger(minimum) || (minimum as number) < 0)) at('error', `${label(arg, i)}: minimum must be a whole number ≥ 0`);
      if (maximum !== undefined && (!isInteger(maximum) || (maximum as number) < 0)) at('error', `${label(arg, i)}: maximum must be a whole number ≥ 0`);
      if (isInteger(minimum) && isInteger(maximum) && (minimum as number) > (maximum as number)) at('error', `${label(arg, i)}: minimum is greater than maximum`);
    }
    if (arg.required === true && arityOf(arg).minimum === 0) at('warning', `${label(arg, i)}: required but accepts zero values`);
  });
  if (!ofOption) {
    for (const name of duplicates(args.map((a) => str(a.name) ?? '').filter(Boolean))) at('error', `several arguments are called "${name}"`);
    // Positional arguments: an optional or variadic argument can only be last.
    args.forEach((arg, i) => {
      const next = args.slice(i + 1);
      if (!next.length) return;
      if (isMultiple(arityOf(arg))) at('warning', `${label(arg, i)} takes several values but is not the last argument`);
      else if (arg.required !== true && next.some((n) => n.required === true)) at('warning', `${label(arg, i)} is optional but followed by a required argument`);
    });
  }
}

/* Counting and templates --------------------------------------------------- */

export function countOptions(spec: unknown): number {
  return listCommands(spec).reduce((n, c) => n + asArray(c.command.options).length, 0);
}

/** Edits moving the old top-level root command fields into `command`. */
export function migrateLayoutEdits(spec: unknown): SpecEdit[] {
  if (!isObject(spec) || !isLegacyLayout(spec)) return [];
  const command: JsonObject = { name: toCommandName(str(getIn(spec, ['info', 'title'])) ?? '') || 'cli' };
  for (const [key, value] of Object.entries(spec)) if (LEGACY_ROOT_FIELDS.includes(key)) command[key] = value;
  return [...Object.keys(command).filter((k) => k !== 'name').map((k): SpecEdit => ({ op: 'delete', path: [k] })), { op: 'set', path: ['command'], value: command }];
}

export function newCommand(name: string): JsonObject {
  return { name, description: '' };
}

export function newOpenCliDocument(title: string): JsonObject {
  const name = toCommandName(title) || 'my-cli';
  return {
    opencli: OPENCLI_VERSION,
    info: { title, version: '1.0.0', summary: `Command line interface of ${title}` },
    command: {
      name,
      options: [
        { name: '--help', aliases: ['-h'], description: 'Show help and usage information.', recursive: true },
        { name: '--version', description: 'Show version information.' },
      ],
      commands: [],
      exitCodes: [
        { code: 0, description: 'Success' },
        { code: 1, description: 'General error' },
      ],
      examples: [`${name} --help`],
    },
  };
}

export function newOpenCliTemplate(title: string, format: 'json' | 'yaml'): string {
  const doc = newOpenCliDocument(title);
  if (format === 'json') return JSON.stringify(doc, null, 2) + '\n';
  // Small YAML writer: keeps the template free of the yaml dependency and readable.
  const scalar = (v: Json) => (typeof v === 'string' && (v === '' || /^[\s?:,[\]{}#&*!|>'"%@`]|^-(\s|$)|[:#]\s|\s$|^(true|false|null|~|[\d.+-]+)$/i.test(v)) ? JSON.stringify(v) : String(v));
  const write = (value: Json, indent: string): string[] => {
    if (Array.isArray(value)) {
      if (!value.length) return [];
      return value.flatMap((item) => {
        if (isObject(item)) {
          const [first, ...rest] = write(item, indent + '  ');
          return [`${indent}- ${first.trimStart()}`, ...rest];
        }
        return [`${indent}- ${scalar(item)}`];
      });
    }
    if (isObject(value)) {
      return Object.entries(value).flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.length ? [`${indent}${k}:`, ...write(v, indent + '  ')] : [`${indent}${k}: []`];
        if (isObject(v)) return [`${indent}${k}:`, ...write(v, indent + '  ')];
        return [`${indent}${k}: ${scalar(v)}`];
      });
    }
    return [`${indent}${scalar(value)}`];
  };
  return write(doc, '').join('\n') + '\n';
}
