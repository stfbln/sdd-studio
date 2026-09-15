/** Naming helpers shared by all modules (no VS Code dependency). */

/** "Crème brûlée: add to cart!" -> "creme-brulee-add-to-cart" (or "creme_brulee_add_to_cart"). */
export function slugify(text: string, separator: '-' | '_' = '-'): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, separator)
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80)
    .replace(/[-_]+$/, '');
}

/** "a feature", "an API spec" (based on the first letter, good enough for UI labels). */
export function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}
