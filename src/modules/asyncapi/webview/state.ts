import { useSpecEditor } from '../../../webview/structured/state';
import { majorVersion, type AsyncApiMajor, type AsyncLocation } from '../core/asyncapi';

export { sameLocation, useField } from '../../../webview/structured/state';

/** Editor context typed with AsyncAPI locations, plus the major version (2 or 3). */
export function useAsync() {
  const context = useSpecEditor<AsyncLocation>();
  return { ...context, major: (majorVersion(context.spec) ?? 3) as AsyncApiMajor };
}

/** "orderCreated" -> "orderCreated2" when taken. */
export function uniqueName(base: string, taken: string[]): string {
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}${i}`;
  return name;
}

/** "orders/{id}.created" -> "OrdersIdCreated" */
export function pascal(text: string): string {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

export const idError = (value: string, taken: string[]) =>
  !/^[A-Za-z0-9._-]+$/.test(value) ? 'Letters, digits, . _ - only' : taken.includes(value) ? 'Already exists' : undefined;
