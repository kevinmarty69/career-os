import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationTaskInputSchema,
  updateApplicationTaskInputSchema,
} from '../../lib/application-task';

test('application tasks require a bounded action and an absolute due date', () => {
  const task = {
    kind: 'follow_up',
    title: 'Follow up after the interview',
    dueAt: '2026-09-08T08:00:00.000Z',
  };
  assert.deepEqual(applicationTaskInputSchema.parse(task), task);
  assert.equal(
    applicationTaskInputSchema.safeParse({
      ...task,
      dueAt: '2026-09-08T08:00:00',
    }).success,
    false,
  );
  assert.equal(
    applicationTaskInputSchema.safeParse({ ...task, title: 'x'.repeat(201) })
      .success,
    false,
  );
  assert.equal(
    updateApplicationTaskInputSchema.safeParse({
      completed: true,
      expectedRevision: 0,
    }).success,
    false,
  );
});
