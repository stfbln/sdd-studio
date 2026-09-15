import { useSpecEditor } from '../../../webview/structured/state';
import type { SpecLocation } from '../core/openapi';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with OpenAPI locations. */
export const useSpec = () => useSpecEditor<SpecLocation>();
