import type { GherkinDocumentModel, StepModel } from './model';

export function collectSteps(doc: GherkinDocumentModel): StepModel[] {
  const steps: StepModel[] = [];
  for (const child of doc.feature?.children ?? []) {
    const leaves = child.kind === 'rule' ? child.children : [child];
    for (const leaf of leaves) steps.push(...leaf.steps);
  }
  return steps;
}
