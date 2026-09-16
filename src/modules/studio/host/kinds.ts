import type * as vscode from 'vscode';
import { CatalogPanel } from '../../../host/catalog/CatalogPanel';
import { registeredSpecIndexes } from '../../../host/catalog/registry';
import type { SpecIndex } from '../../../host/catalog/SpecIndex';
import { SPEC_PURPOSES, type PurposeKind } from '../../../shared/purposes';
import type { StudioKind } from '../core/protocol';

/** What the home page and the SDD Studio view show of every kind of spec registered by the modules. */
export function describeKinds(): Promise<StudioKind[]> {
  return Promise.all(registeredSpecIndexes().map((index) => describeKind(index)));
}

/** Opens the catalog page of one kind, named by `CatalogInfo.kind`. */
export function openOverview(context: vscode.ExtensionContext, kind: string) {
  const index = registeredSpecIndexes().find((i) => i.kind.info.kind === kind);
  if (index) CatalogPanel.show(context, index);
}

/** One kind: its texts, what the workspace holds of it and the problems found there. */
async function describeKind(index: SpecIndex<unknown>): Promise<StudioKind> {
  const { info } = index.kind;
  const specs = await index.summaries().catch(() => []);
  return {
    kind: info.kind,
    title: info.title,
    singular: info.singular,
    plural: info.plural,
    icon: info.icon,
    purpose: SPEC_PURPOSES[info.kind as PurposeKind]?.summary ?? '',
    count: specs.length,
    problems: specs.reduce((total, spec) => total + (spec.error ? 1 : (spec.problems ?? 0)), 0),
  };
}
