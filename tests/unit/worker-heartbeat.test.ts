import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import { keepWorkerHeartbeatFresh } from '../../lib/server/worker-heartbeat';

test('refreshes a busy worker heartbeat without overlapping writes', async () => {
  let active = 0;
  let maximumActive = 0;
  let refreshes = 0;
  const stop = keepWorkerHeartbeatFresh(
    async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      refreshes += 1;
      await wait(4);
      active -= 1;
    },
    2,
    () => undefined,
  );

  await wait(18);
  await stop();

  assert.ok(refreshes >= 2);
  assert.equal(maximumActive, 1);
  const stoppedAt = refreshes;
  await wait(6);
  assert.equal(refreshes, stoppedAt);
});
