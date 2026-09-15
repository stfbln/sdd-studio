import { useSpecEditor } from '../../../webview/structured/state';
import { entityAt, type OpenSloLocation } from '../core/model';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with OpenSLO locations. */
export const useOpenSlo = () => useSpecEditor<OpenSloLocation>();

export const entityLocation = (index: number): OpenSloLocation => ({ kind: 'entity', index });

/** Falls back to the overview when the object no longer exists (deleted, renamed in text...). */
export function validLocation(spec: unknown, location: OpenSloLocation): OpenSloLocation {
  if (location.kind === 'entity' && entityAt(spec, location.index)) return location;
  return { kind: 'overview' };
}
