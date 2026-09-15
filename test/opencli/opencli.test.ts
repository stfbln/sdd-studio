import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeOpenCli,
  arityOf,
  arityPreset,
  commandPath,
  getCommand,
  helpText,
  inheritedOptions,
  isLegacyLayout,
  listCommands,
  migrateLayoutEdits,
  newOpenCliDocument,
  newOpenCliTemplate,
  optionUsage,
  toCommandName,
  toOptionName,
  usageLine,
  valueName,
} from '../../src/modules/opencli/core/opencli';
import { looksLikeOpenCli, summarizeOpenCli } from '../../src/modules/opencli/core/summary';
import { applyEditsToValue, type JsonObject, type SpecEdit } from '../../src/shared/structured/edits';
import { applySpecEdits, parseSpec } from '../../src/shared/structured/specText';

const sample = (name: string) => readFileSync(join(__dirname, '../../samples/cli', name), 'utf8');
const parsed = (text: string, format: 'yaml' | 'json') => {
  const result = parseSpec(text, format);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value as JsonObject;
};
const YAML = sample('acme-deploy.opencli.yaml');
const spec = parsed(YAML, 'yaml');

describe('OpenCLI detection and summary', () => {
  it('recognizes OpenCLI files but not package.json files depending on a package called opencli', () => {
    expect(looksLikeOpenCli('a.opencli.yaml', YAML)).toBe(true);
    expect(looksLikeOpenCli('todo.json', sample('todo.opencli.json'))).toBe(true);
    expect(looksLikeOpenCli('package.json', '{\n  "name": "x",\n  "dependencies": {\n    "opencli": "^1.2.0"\n  }\n}')).toBe(false);
    expect(looksLikeOpenCli('notes.md', YAML)).toBe(false);
  });

  it('summarizes commands and options', () => {
    const summary = summarizeOpenCli('acme.opencli.yaml', YAML);
    expect(summary.name).toBe('Acme deploy');
    expect(summary.tags).toEqual(['acme']);
    expect(summary.details).toEqual(['OpenCLI 0.1', 'v2.3.0', '5 commands', '5 options']);
    expect(summary.problems).toBe(0);
    expect(summarizeOpenCli('x.json', '{ "opencli": "0.1", "info": { "title": "Broken" ').error).toMatch(/^Line 1: /);
  });
});

describe('commands', () => {
  it('addresses nested commands by name', () => {
    expect(commandPath(spec, [])).toEqual(['command']);
    expect(commandPath(spec, ['config', 'set'])).toEqual(['command', 'commands', 2, 'commands', 1]);
    expect(getCommand(spec, ['config', 'nope'])).toBeUndefined();
    expect(listCommands(spec).map((c) => c.names.join(' '))).toEqual(['', 'deploy', 'rollback', 'config', 'config get', 'config set']);
  });

  it('collects recursive options of the ancestors', () => {
    expect(inheritedOptions(spec, ['config', 'get']).map((o) => o.option.name)).toEqual(['--verbose', '--config']);
    expect(inheritedOptions(spec, [])).toEqual([]);
  });

  it('reads arity defaults and presets', () => {
    expect(arityOf({ name: 'A' })).toEqual({ minimum: 1, maximum: 1 });
    expect(arityOf({ name: 'A', arity: { minimum: 0 } })).toEqual({ minimum: 0, maximum: undefined });
    expect(arityPreset({ minimum: 1 })).toBe('oneOrMore');
    expect(arityPreset({ minimum: 2, maximum: 3 })).toBe('custom');
  });

  it('renders usage lines and help', () => {
    expect(usageLine(spec, ['config', 'set'])).toBe('acme config set [OPTIONS] <KEY> <VALUES>...');
    expect(usageLine(spec, ['rollback'])).toBe('acme rollback [OPTIONS] <SERVICE> [RELEASE]');
    expect(usageLine(spec, [])).toBe('acme [OPTIONS] [COMMAND]');
    expect(optionUsage({ name: '--config', aliases: ['-c'], arguments: [{ name: 'FILE', required: true }] })).toBe('-c, --config <FILE>');
    const help = helpText(spec, ['deploy']);
    expect(help).toContain('Usage:\n  acme deploy [OPTIONS] <SERVICE>');
    expect(help).toContain('-e, --env <ENVIRONMENT>  Target environment. (required)');
    expect(help).toContain('-c, --config <FILE>');
    expect(help).toContain('Examples:\n  acme deploy billing --env staging');
  });

  it('suggests names', () => {
    expect(toOptionName('Output format')).toBe('--output-format');
    expect(toOptionName('v')).toBe('-v');
    expect(toOptionName('-x')).toBe('-x');
    expect(valueName('--output-format')).toBe('OUTPUT_FORMAT');
    expect(toCommandName('Acme Deploy')).toBe('acme-deploy');
  });
});

describe('checks', () => {
  it('reports the problems of a description', () => {
    const broken: JsonObject = {
      opencli: '0.1',
      info: { title: 'x', version: '', contact: { email: 'nope' } },
      command: {
        name: 'x',
        options: [{ name: '--verbose', recursive: true }, { name: '-q', aliases: ['--verbose'] }],
        arguments: [
          { name: 'FILES', arity: { minimum: 1 } },
          { name: 'OUT', required: true, arity: { minimum: 3, maximum: 2 } },
          { name: 'OUT', required: true, arity: { minimum: 0, maximum: 1 } },
        ],
        exitCodes: [{ code: 1 }, { code: 1 }, { code: 'x' }],
        commands: [{ name: 'run', aliases: ['r'] }, { name: 'r' }, { name: 'sub', options: [{ name: '--verbose' }] }],
      },
    };
    const messages = analyzeOpenCli(broken).map((i) => `${i.severity}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'error: The CLI version is required',
        'warning: Contact email "nope" is not a valid email address',
        'error: Root command: several subcommands are called "r"',
        'error: Root command: several options use "--verbose"',
        'error: Root command: argument OUT: minimum is greater than maximum',
        'warning: Root command: argument OUT: required but accepts zero values',
        'error: Root command: several arguments are called "OUT"',
        'warning: Root command: argument FILES takes several values but is not the last argument',
        'error: Root command: exit code "x" must be an integer',
        'error: Root command: exit code 1 is listed twice',
        'warning: sub: option "--verbose" hides the recursive option of the root command',
      ]),
    );
    expect(analyzeOpenCli(parsed(sample('todo.opencli.json'), 'json'))).toEqual([]);
  });
});

describe('older layout', () => {
  const legacy: JsonObject = {
    opencli: '0.1',
    info: { title: 'Old Tool', version: '1' },
    options: [{ name: '--help' }],
    commands: [{ name: 'run' }],
  };

  it('edits the root command at the top level and can move it into command', () => {
    expect(isLegacyLayout(legacy)).toBe(true);
    expect(commandPath(legacy, ['run'])).toEqual(['commands', 0]);
    expect(usageLine(legacy, [])).toBe('Old Tool [OPTIONS] [COMMAND]');
    expect(analyzeOpenCli(legacy).map((i) => i.severity)).toEqual(['warning']);

    const migrated = applyEditsToValue(legacy, migrateLayoutEdits(legacy));
    expect(migrated).toEqual({ opencli: '0.1', info: legacy.info, command: { name: 'old-tool', options: [{ name: '--help' }], commands: [{ name: 'run' }] } });
    expect(isLegacyLayout(migrated)).toBe(false);
  });
});

describe('templates', () => {
  it('writes valid JSON and YAML with the version as a string', () => {
    for (const format of ['json', 'yaml'] as const) {
      const value = parsed(newOpenCliTemplate('My Tool', format), format);
      expect(value).toEqual(newOpenCliDocument('My Tool'));
      expect(value.opencli).toBe('0.1');
      expect(analyzeOpenCli(value)).toEqual([]);
    }
    expect(newOpenCliTemplate('My Tool', 'yaml')).toContain('opencli: "0.1"\ninfo:\n  title: My Tool\n  version: "1.0.0"');
  });
});

describe('move edit', () => {
  const move: SpecEdit = { op: 'move', path: ['command', 'commands', 2], to: 0 };

  it('moves array items in YAML, keeping comments', () => {
    const text = 'command:\n  commands:\n    - name: a\n    # the b command\n    - name: b\n    - name: c # last\n';
    const result = applySpecEdits(text, 'yaml', [move]);
    expect(result).toBe('command:\n  commands:\n    - name: c # last\n    - name: a\n    # the b command\n    - name: b\n');
    expect(parsed(result, 'yaml')).toEqual(applyEditsToValue(parsed(text, 'yaml'), [move]));
  });

  it('moves array items in JSON', () => {
    const text = '{\n  "command": {\n    "commands": [\n      { "name": "a" },\n      { "name": "b" },\n      { "name": "c" }\n    ]\n  }\n}\n';
    const down: SpecEdit = { op: 'move', path: ['command', 'commands', 0], to: 1 };
    for (const edit of [move, down]) {
      const result = applySpecEdits(text, 'json', [edit]);
      expect(parsed(result, 'json')).toEqual(applyEditsToValue(parsed(text, 'json'), [edit]));
    }
    expect(applyEditsToValue(parsed(text, 'json'), [down])).toEqual({ command: { commands: [{ name: 'b' }, { name: 'a' }, { name: 'c' }] } });
  });
});

describe('YAML template', () => {
  it('keeps option names unquoted', () => {
    const yaml = newOpenCliTemplate('Tool', 'yaml');
    expect(yaml).toContain('    - name: --help\n      aliases:\n        - -h\n');
    expect(yaml).toContain('commands: []');
  });
});
