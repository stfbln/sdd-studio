import { KEEP_HEADER_RULE, schemaRule, type FileInstructions } from '../../../shared/instructions';
import { purposeRule } from '../../../shared/purposes';

/** Update instructions of an OpenCLI description. */
export function openCliInstructions(fileName: string): FileInstructions {
  return {
    style: /\.json$/i.test(fileName) ? 'json' : 'hash',
    format: 'an OpenCLI description of a command-line tool',
    docs: 'https://opencli.org',
    schema: 'https://opencli.org/draft.json',
    rules: [
      purposeRule('opencli'),
      schemaRule('opencli'),
      'The root command is under "command" (name, description, options, arguments, commands, exitCodes, examples); subcommands nest the same way under "commands".',
      'Option names keep their dashes (--config, with -c under aliases); recursive: true makes an option available to every subcommand.',
      'Arguments (of commands and options) have a name, required and arity {minimum, maximum}; acceptedValues lists the allowed values.',
      KEEP_HEADER_RULE,
    ],
  };
}
