import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultNotificationPreferences,
  markEventsRead,
  notificationPreferencesSchema,
} from '../../lib/notification-preferences';

test('read receipts are bounded, deduplicated and do not enable email delivery', () => {
  const saved = markEventsRead(
    defaultNotificationPreferences,
    Array.from({ length: 300 }, (_, index) => `event-${index}`),
  );
  assert.equal(saved.readEvents.length, 250);
  assert.equal(saved.readEvents[0], 'event-50');
  assert.equal(markEventsRead(saved, ['event-299']).readEvents.length, 250);
  assert.equal(saved.reviewReady, false);
  assert.equal(saved.pageOpened, false);
  assert.equal(
    notificationPreferencesSchema.safeParse({ ...saved, role: 'admin' })
      .success,
    false,
  );
  assert.throws(() => markEventsRead(saved, ['x'.repeat(301)]));
});
