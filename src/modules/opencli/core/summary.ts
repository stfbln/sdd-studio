import type { SpecDetails } from '../../../shared/catalog';
import { getIn } from '../../../shared/structured/edits';
import { detectFormat, parseSpec } from '../../../shared/structured/specText';
import { analyzeOpenCli, cliName, countOptions, listCommands, openCliVersion } from './opencli';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * YAML/JSON file declaring `opencli:` with a version, next to an `info` or `command` key.
 * Cheap, no parsing; the version check keeps package.json files depending on "opencli" out.
 */
export function looksLikeOpenCli(fileName: string, text: string): boolean {
  if (!/\.(ya?ml|json)$/i.test(fileName)) return false;
  const head = text.slice(0, 8000);
  return /^\s*["']?opencli["']?\s*:\s*["']?\d/m.test(head) && /^\s*["']?(info|command)["']?\s*:/m.test(text);
}

/** Catalog row of an OpenCLI description. */
export function summarizeOpenCli(fileName: string, text: string): SpecDetails {
  const result = parseSpec(text, detectFormat(fileName, text));
  if (!result.ok) {
    const first = result.errors[0];
    return {
      name: /^\s*["']?title["']?\s*:\s*["']?([^"'\n,]+)/m.exec(text)?.[1]?.trim() ?? '',
      tags: [],
      details: [],
      error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message}` : 'Syntax error',
    };
  }
  const spec = result.value;
  const title = getIn(spec, ['info', 'title']);
  const version = getIn(spec, ['info', 'version']);
  const name = cliName(spec);
  // The root command is not counted: "3 commands" means what users can type after the executable.
  const commands = listCommands(spec).length - 1;
  return {
    name: typeof title === 'string' ? title : name,
    tags: name && name !== title ? [name] : [],
    details: [
      `OpenCLI ${openCliVersion(spec) ?? '?'}`,
      ...(version !== undefined ? [`v${String(version)}`] : []),
      plural(Math.max(commands, 0), 'command'),
      plural(countOptions(spec), 'option'),
    ],
    problems: analyzeOpenCli(spec).length,
  };
}
