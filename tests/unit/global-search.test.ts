import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchGlobalIndex,
  type GlobalSearchItem,
} from '../../lib/global-search';

const index: GlobalSearchItem[] = [
  {
    id: 'application-1',
    kind: 'application',
    title: 'Signal Forge · Staff Platform Engineer',
    detail: 'Reliable developer infrastructure',
    href: '/applications/application-1',
  },
  {
    id: 'claim-1',
    kind: 'claim',
    title: 'Réduit le temps de build de 11 à 7 minutes',
    detail: 'verified',
    href: '/memory',
  },
];

test('searches every term across accents and result fields', () => {
  assert.deepEqual(
    searchGlobalIndex(index, 'reduit build').map(({ id }) => id),
    ['claim-1'],
  );
  assert.deepEqual(
    searchGlobalIndex(index, 'signal platform').map(({ id }) => id),
    ['application-1'],
  );
});
