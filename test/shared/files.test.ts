import { describe, expect, it } from 'vitest';
import { featureFileName, featureTemplate } from '../../src/modules/gherkin/core/files';
import { parseGherkin } from '../../src/modules/gherkin/core/parse';
import {
  fileNameError,
  folderError,
  joinPath,
  normalizeFolder,
  parentFolder,
  replaceExtension,
  withExtension,
} from '../../src/shared/files';
import { slugify } from '../../src/shared/naming';

describe('slugs', () => {
  it('turns names into file names', () => {
    expect(slugify('Shopping cart checkout')).toBe('shopping-cart-checkout');
    expect(slugify('  Crème brûlée: add to cart! ')).toBe('creme-brulee-add-to-cart');
    expect(slugify('User  <admin> / login_v2')).toBe('user-admin-login-v2');
    expect(slugify('!!!')).toBe('');
    expect(featureFileName('Pay by card')).toBe('pay-by-card.feature');
    expect(featureFileName('   ')).toBe('');
  });

  it('keeps slugs to a reasonable length without a trailing dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('paths', () => {
  it('normalizes folders', () => {
    expect(normalizeFolder(' /features\\cart//payments/ ')).toBe('features/cart/payments');
    expect(normalizeFolder('')).toBe('');
    expect(joinPath('features/', 'a.feature')).toBe('features/a.feature');
    expect(joinPath('', 'a.feature')).toBe('a.feature');
    expect(parentFolder('features/cart/a.feature')).toBe('features/cart');
    expect(parentFolder('a.feature')).toBe('');
  });

  it('validates folders and file names', () => {
    expect(folderError('features/cart')).toBeUndefined();
    expect(folderError('features/../secret')).toMatch(/not allowed/);
    expect(folderError('features/a:b')).toMatch(/cannot contain/);
    expect(fileNameError('checkout.feature', ['.feature'])).toBeUndefined();
    expect(fileNameError('', ['.feature'])).toMatch(/required/);
    expect(fileNameError('.feature', ['.feature'])).toMatch(/required/);
    expect(fileNameError('a/b.feature')).toMatch(/cannot contain/);
  });

  it('handles known extensions', () => {
    const openapi = ['.openapi.yaml', '.openapi.json', '.yaml', '.yml', '.json'];
    expect(withExtension('checkout', ['.feature'], '.feature')).toBe('checkout.feature');
    expect(withExtension('checkout.FEATURE', ['.feature'], '.feature')).toBe('checkout.FEATURE');
    expect(withExtension('orders.yaml', openapi, '.openapi.yaml')).toBe('orders.yaml');
    expect(replaceExtension('orders.openapi.yaml', openapi, '.openapi.json')).toBe('orders.openapi.json');
    expect(replaceExtension('orders', openapi, '.openapi.json')).toBe('orders.openapi.json');
  });

  it('produces a valid feature from the template', () => {
    const result = parseGherkin(featureTemplate(' Pay by card '));
    expect(result.ok && result.document.feature?.name).toBe('Pay by card');
  });
});
