import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationTimelineInputSchema } from '../../lib/application-timeline';

test('application timeline input is strict, bounded and timezone-aware', () => {
  const valid = {
    kind: 'interview',
    title: 'Technical interview',
    note: 'Follow up next Tuesday.',
    occurredAt: '2026-09-04T14:30:00.000Z',
  };
  assert.deepEqual(applicationTimelineInputSchema.parse(valid), valid);
  assert.equal(
    applicationTimelineInputSchema.safeParse({ ...valid, extra: true }).success,
    false,
  );
  assert.equal(
    applicationTimelineInputSchema.safeParse({
      ...valid,
      occurredAt: '2026-09-04T14:30:00',
    }).success,
    false,
  );
  assert.equal(
    applicationTimelineInputSchema.safeParse({
      ...valid,
      note: 'x'.repeat(2_001),
    }).success,
    false,
  );
});
