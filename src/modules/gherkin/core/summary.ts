import type { SpecDetails } from '../../../shared/catalog';
import { parseGherkin } from './parse';
import { collectSteps } from './traverse';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Catalog row of a .feature file, plus its step texts (used for suggestions). */
export function summarizeFeature(text: string): { summary: SpecDetails; steps: string[] } {
  const result = parseGherkin(text);
  if (!result.ok) {
    const first = result.errors[0];
    return {
      summary: {
        name: /^\s*[^#\s@|][^:\n]*:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '',
        tags: [],
        details: [],
        error: first ? `${first.line ? `Line ${first.line}: ` : ''}${first.message.replace(/^\(\d+:\d+\):\s*/, '')}` : 'Syntax error',
      },
      steps: [],
    };
  }

  const feature = result.document.feature;
  const scenarios = (feature?.children ?? []).flatMap((c) => (c.kind === 'rule' ? c.children : [c])).filter((c) => c.kind === 'scenario');
  const exampleRows = scenarios.reduce((n, s) => n + s.examples.reduce((m, e) => m + e.rows.length, 0), 0);
  return {
    summary: {
      name: feature?.name ?? '',
      tags: feature?.tags ?? [],
      details: [plural(scenarios.length, 'scenario'), ...(exampleRows ? [plural(exampleRows, 'example')] : [])],
    },
    steps: collectSteps(result.document).map((s) => s.text).filter(Boolean),
  };
}
