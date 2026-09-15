/**
 * Moves the keyboard focus to the element carrying `data-focus-key="<key>"` once React
 * has rendered it. Used after structural edits (new step, deleted row...).
 */
export function requestFocus(key: string, options: { select?: boolean } = {}) {
  let attempts = 0;
  const tryFocus = () => {
    const selector = `[data-focus-key="${CSS.escape(key)}"], [data-focus-alias="${CSS.escape(key)}"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
      if (options.select && el instanceof HTMLInputElement) el.select();
    } else if (attempts++ < 5) {
      requestAnimationFrame(tryFocus);
    }
  };
  requestAnimationFrame(tryFocus);
}
