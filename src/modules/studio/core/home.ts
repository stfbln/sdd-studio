/** How the home page arranges the kinds of specs, whatever order the modules registered them in. */
import type { StudioKind } from './protocol';

/**
 * Reading order of the spec formats: the general spec of an entity, the behaviour it shows,
 * the contracts of its interfaces, then what is modelled around it.
 */
const SPEC_ORDER = ['spec', 'gherkin', 'openapi', 'asyncapi', 'proto', 'opencli', 'otm', 'openslo', 'adr'];

export interface StudioGroups {
  /** The software catalog: the entry point of the workspace. */
  catalog: StudioKind | undefined;
  /** The spec formats, in reading order; kinds this page does not know about come last. */
  specs: StudioKind[];
}

export function groupKinds(kinds: readonly StudioKind[]): StudioGroups {
  const rank = (kind: StudioKind) => {
    const index = SPEC_ORDER.indexOf(kind.kind);
    return index === -1 ? SPEC_ORDER.length : index;
  };
  return {
    catalog: kinds.find((k) => k.kind === 'backstage'),
    specs: kinds.filter((k) => k.kind !== 'backstage').sort((a, b) => rank(a) - rank(b)),
  };
}
