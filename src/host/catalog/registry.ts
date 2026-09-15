import type { SpecIndex } from './SpecIndex';

/** Spec indexes of every module, so a module can offer the specs of the others (e.g. the software catalog). */
const indexes: SpecIndex<unknown>[] = [];

export function registerSpecIndex<Extra>(index: SpecIndex<Extra>): SpecIndex<Extra> {
  indexes.push(index as SpecIndex<unknown>);
  return index;
}

export const registeredSpecIndexes = (): readonly SpecIndex<unknown>[] => indexes;
