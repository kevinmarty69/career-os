import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { runWorkerLoop, safeWorkerLog } from '../../scripts/worker-loop';

test('logs only bounded operational fields', () => {
  assert.deepEqual(
    safeWorkerLog({
      status: 'completed',
      runId: 'run-1',
      stored: 4,
      secret: 'private candidate content',
      content: { prompt: 'private candidate content' },
    }),
    { status: 'completed', runId: 'run-1', stored: 4 },
  );

  assert.deepEqual(
    safeWorkerLog({
      status: 'completed',
      prompt: 'private prompt',
      input: 'private CV',
      output: 'private model output',
      evidence: 'private evidence',
      email: 'candidate@example.com',
    }),
    { status: 'completed' },
  );
});

test('fails immediately when the first iteration fails', async () => {
  const signals = new EventEmitter();
  let calls = 0;
  const errors: string[] = [];

  await assert.rejects(
    runWorkerLoop({
      workerName: 'Test',
      once: false,
      signalSource: signals,
      iteration: async () => {
        calls += 1;
        throw new Error('database credential rejected');
      },
      logError: (message) => errors.push(message),
    }),
    /failed before becoming ready/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(errors, ['Test worker iteration failed.']);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('retries an iteration failure only after one success', async () => {
  const signals = new EventEmitter();
  const logs: string[] = [];
  const errors: string[] = [];
  let calls = 0;

  await runWorkerLoop({
    workerName: 'Test',
    once: false,
    signalSource: signals,
    idleDelayMs: 0,
    retryDelayMs: 0,
    log: (message) => logs.push(message),
    logError: (message) => errors.push(message),
    iteration: async () => {
      calls += 1;
      if (calls === 2) throw new Error('temporary database outage');
      if (calls === 3) signals.emit('SIGTERM');
      return { status: 'idle' };
    },
  });

  assert.equal(calls, 3);
  assert.equal(logs.length, 2);
  assert.deepEqual(errors, ['Test worker iteration failed.']);
});

test('drains the active iteration after a shutdown signal', async () => {
  const signals = new EventEmitter();
  let release!: (result: { status: string }) => void;
  let started!: () => void;
  const active = new Promise<{ status: string }>((resolve) => {
    release = resolve;
  });
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let settled = false;
  let calls = 0;

  const running = runWorkerLoop({
    workerName: 'Test',
    once: false,
    signalSource: signals,
    log: () => undefined,
    logError: () => undefined,
    iteration: async () => {
      calls += 1;
      started();
      return active;
    },
  });
  void running.then(() => {
    settled = true;
  });

  await began;
  signals.emit('SIGINT');
  await Promise.resolve();
  assert.equal(settled, false);
  release({ status: 'completed' });
  await running;
  assert.equal(calls, 1);
});

test('interrupts an idle wait and preserves once mode', async () => {
  const signals = new EventEmitter();
  let calls = 0;
  await runWorkerLoop({
    workerName: 'Test',
    once: false,
    signalSource: signals,
    idleDelayMs: 60_000,
    log: () => queueMicrotask(() => signals.emit('SIGTERM')),
    iteration: async () => {
      calls += 1;
      return { status: 'idle' };
    },
  });
  assert.equal(calls, 1);

  calls = 0;
  await runWorkerLoop({
    workerName: 'Test',
    once: true,
    signalSource: signals,
    log: () => undefined,
    iteration: async () => {
      calls += 1;
      return { status: 'completed' };
    },
  });
  assert.equal(calls, 1);
});
