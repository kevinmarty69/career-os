import { z } from 'zod';
import { reviewIssueDecisionInputSchema } from './run-contract';

export const decisionScopeSchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
});
export type DecisionScope = z.infer<typeof decisionScopeSchema>;
export const queuedDecisionSchema = decisionScopeSchema
  .extend({
    version: z.literal(1),
    key: z.uuid(),
    runId: z.uuid(),
    applicationId: z.uuid(),
    input: reviewIssueDecisionInputSchema,
    createdAt: z.iso.datetime(),
    blocked: z.boolean().default(false),
  })
  .strict();
export type QueuedDecision = z.infer<typeof queuedDecisionSchema>;
const prefix = 'career-os:decision-outbox:v1:';
type Store = Pick<
  Storage,
  'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'
>;
export function sameDecisionScope(a: DecisionScope, b: DecisionScope) {
  return a.userId === b.userId && a.tenantId === b.tenantId;
}
export function queuedDecisions(
  storage: Store,
  scope: DecisionScope,
): QueuedDecision[] {
  const items: QueuedDecision[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const item = queuedDecisionSchema.parse(
        JSON.parse(storage.getItem(key) ?? 'null'),
      );
      if (key === prefix + item.key && sameDecisionScope(item, scope))
        items.push(item);
    } catch {
      /* Corrupt entries are never replayed. */
    }
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function queueDecision(storage: Store, raw: QueuedDecision) {
  const item = queuedDecisionSchema.parse(raw);
  const existing = queuedDecisions(storage, item);
  if (existing.length >= 50) throw new Error('Outbox full');
  if (
    existing.some(
      (other) =>
        other.runId === item.runId &&
        other.input.reviewId === item.input.reviewId &&
        other.input.issueIndex === item.input.issueIndex,
    )
  )
    throw new Error('Decision already queued');
  storage.setItem(prefix + item.key, JSON.stringify(item));
}
export function removeQueuedDecision(storage: Store, key: string) {
  storage.removeItem(prefix + z.uuid().parse(key));
}

/** No text, token or source is stored. Server authorization and idempotency remain authoritative. */
export async function replayDecisions(
  storage: Store,
  scope: DecisionScope,
  send: (item: QueuedDecision) => Promise<Response>,
  now = Date.now(),
) {
  let sent = 0;
  for (const item of queuedDecisions(storage, scope)) {
    if (item.blocked) continue;
    if (now - Date.parse(item.createdAt) > 7 * 86400_000) {
      storage.setItem(
        prefix + item.key,
        JSON.stringify({ ...item, blocked: true }),
      );
      continue;
    }
    let response: Response;
    try {
      response = await send(item);
    } catch {
      break;
    }
    if (response.ok) {
      removeQueuedDecision(storage, item.key);
      sent++;
    } else if ([400, 404, 409, 422].includes(response.status)) {
      storage.setItem(
        prefix + item.key,
        JSON.stringify({ ...item, blocked: true }),
      );
    } else break; // Auth changes, rate limits and outages retain the same idempotency key.
  }
  return sent;
}
