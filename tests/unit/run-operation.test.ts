import assert from 'node:assert/strict';
import test from 'node:test';
import { persistedRunOperation } from '../../lib/run-operation';

test('reuses a persisted run operation after reload and rotates on retry', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  const first = persistedRunOperation(storage, 'run', '{"revision":1}');
  const afterReload = persistedRunOperation(storage, 'run', '{"revision":1}');
  const retry = persistedRunOperation(storage, 'run', '{"revision":1}', true);
  const changedInput = persistedRunOperation(storage, 'run', '{"revision":2}');

  assert.equal(afterReload.key, first.key);
  assert.notEqual(retry.key, first.key);
  assert.notEqual(changedInput.key, retry.key);
});
