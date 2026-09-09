import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  queueDecision,
  queuedDecisions,
  replayDecisions,
  type QueuedDecision,
} from '../../lib/decision-outbox';

test('outbox survives reload, isolates scopes and preserves rejected or uncertain decisions', async () => {
  const values = new Map<string, string>();
  const store = {
    get length() {
      return values.size;
    },
    key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const item: QueuedDecision = {
    version: 1,
    key: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    runId: randomUUID(),
    applicationId: randomUUID(),
    input: { reviewId: randomUUID(), issueIndex: 0, decision: 'keep' },
    createdAt: new Date().toISOString(),
    blocked: false,
  };
  queueDecision(store, item);
  assert.throws(() => queueDecision(store, { ...item, key: randomUUID() }));
  assert.equal(
    queuedDecisions(store, { ...item, tenantId: randomUUID() }).length,
    0,
  );
  assert.equal(
    queuedDecisions(store, { ...item, userId: randomUUID() }).length,
    0,
  );
  const keys: string[] = [];
  await replayDecisions(store, item, async (entry) => {
    keys.push(entry.key);
    return new Response(null, { status: 503 });
  });
  assert.equal(queuedDecisions(store, item).length, 1);
  await replayDecisions(store, item, async (entry) => {
    keys.push(entry.key);
    return new Response(null, { status: 409 });
  });
  assert.equal(queuedDecisions(store, item)[0].blocked, true);
  await replayDecisions(store, item, async () => {
    throw new Error('Blocked entry must not retry');
  });
  assert.deepEqual(keys, [item.key, item.key]);
  const next = { ...item, runId: randomUUID(), key: randomUUID() };
  queueDecision(store, next);
  assert.equal(
    await replayDecisions(
      store,
      item,
      async () => new Response(null, { status: 200 }),
    ),
    1,
  );
  assert.equal(queuedDecisions(store, item).length, 1);
  const stale = {
    ...item,
    runId: randomUUID(),
    key: randomUUID(),
    createdAt: '2020-01-01T00:00:00.000Z',
  };
  queueDecision(store, stale);
  await replayDecisions(store, item, async () => {
    throw new Error('Expired entry must not send');
  });
  assert.equal(
    queuedDecisions(store, item).filter((entry) => entry.blocked).length,
    2,
  );
});
