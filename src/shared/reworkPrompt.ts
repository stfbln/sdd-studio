/**
 * "Rework with AI": a prompt asking an LLM to improve the wording, clarity and grammar of a spec
 * file, reusing its own update instructions (`FileInstructions`) as the rules to keep its structure,
 * facts and decisions unchanged. References the file by path instead of embedding its content: the
 * assistant is expected to open and edit the file itself (an agentic chat inside this workspace),
 * not to be pasted the result back by the user.
 */
import type { FileInstructions, InstructionRule } from './instructions';
import { MCP_SERVER_NAME, MCP_TOOLS } from './mcpTools';

function ruleLines(rule: InstructionRule): string[] {
  const [text, ...items] = typeof rule === 'string' ? [rule] : rule;
  return [`- ${text}`, ...items.map((item) => `  - ${item}`)];
}

export function reworkPrompt(fileName: string, instructions: FileInstructions): string {
  const lines = [
    `# Rework ${fileName}`,
    '',
    `Open \`${fileName}\` yourself and improve its wording, clarity and grammar. It is ${instructions.format}${instructions.docs ? ` (see ${instructions.docs})` : ''}.`,
    '',
    '## Rules',
    '',
    '- Edit the file directly, in place: do not ask the user to paste anything back.',
    '- Only touch the wording: keep the same structure, facts, decisions and values.',
    ...instructions.rules.flatMap(ruleLines),
    `- If a \`${MCP_SERVER_NAME}\` MCP server is available, call its \`${MCP_TOOLS.checkSpecFile}\` tool on the file afterward and fix anything it reports.`,
  ];
  return `${lines.join('\n')}\n`;
}
