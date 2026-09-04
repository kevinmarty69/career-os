import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultLocale, resolveLocale } from '../../lib/i18n/locale';

test('uses English when no persisted locale exists', () => {
  assert.equal(defaultLocale, 'en');
  assert.equal(resolveLocale(undefined), 'en');
  assert.equal(resolveLocale(null), 'en');
});

test('normalizes supported locale variants', () => {
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('FR-fr'), 'fr');
  assert.equal(resolveLocale('fr_FR'), 'fr');
});

test('falls back to English for unsupported or malformed values', () => {
  assert.equal(resolveLocale('de-DE'), 'en');
  assert.equal(resolveLocale(''), 'en');
});
