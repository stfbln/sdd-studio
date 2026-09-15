import { useSpecEditor } from '../../../webview/structured/state';
import type { CliLocation } from '../core/opencli';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with OpenCLI locations. */
export const useCli = () => useSpecEditor<CliLocation>();
