import assert from 'node:assert/strict';
import test from 'node:test';
import { cn } from '../../components/ui';

test('designer typography never drops a semantic text color during class merging', () => {
  assert.equal(
    cn('text-amber-text', 'text-caption'),
    'text-amber-text text-caption',
  );
  assert.equal(cn('text-body-sm', 'text-white'), 'text-body-sm text-white');
  assert.equal(cn('text-caption', 'text-body-sm'), 'text-body-sm');
  assert.equal(cn('text-ink-600', 'text-white'), 'text-white');
});
