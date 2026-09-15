import { useSpecEditor } from '../../../webview/structured/state';
import { itemsOf, type OtmCollection, type OtmLocation } from '../core/otm';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with threat model locations. */
export const useOtm = () => useSpecEditor<OtmLocation>();

export const itemLocation = (collection: OtmCollection, index: number): OtmLocation => ({ kind: 'item', collection, index });

/** Falls back to the project page when the item no longer exists (deleted in the text...). */
export function validLocation(spec: unknown, location: OtmLocation): OtmLocation {
  if (location.kind === 'item' && location.index < itemsOf(spec, location.collection).length) return location;
  return { kind: 'project' };
}
