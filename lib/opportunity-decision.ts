import { z } from 'zod';

export const opportunityDispositionSchema = z.enum([
  'saved',
  'ignored',
  'archived',
]);

export const opportunityQualificationSchema = z.enum([
  'priority',
  'interesting',
  'exploratory',
  'ignore',
]);

export const opportunityDecisionReasonSchema = z.enum([
  'strong_fit',
  'career_direction',
  'hard_constraint',
  'weak_evidence',
  'compensation',
  'location',
  'company',
  'duplicate',
  'closed',
  'other',
]);

const decisionFieldsSchema = z
  .object({
    searchProfileId: z.string().uuid().nullable(),
    disposition: opportunityDispositionSchema,
    qualification: opportunityQualificationSchema,
    reason: opportunityDecisionReasonSchema,
    note: z.string().trim().max(500).nullable(),
  })
  .strict();

export const opportunityDecisionInputSchema = decisionFieldsSchema
  .extend({ expectedRevision: z.number().int().min(0) })
  .strict();

export const opportunityDecisionEventSchema = decisionFieldsSchema
  .extend({
    eventId: z.string().uuid(),
    revision: z.number().int().positive(),
    actor: z.literal('human'),
    actorId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const opportunityDecisionSchema = decisionFieldsSchema
  .extend({
    decisionId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    revision: z.number().int().positive(),
    actor: z.literal('human'),
    actorId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    history: z.array(opportunityDecisionEventSchema).max(100),
  })
  .strict();

export const opportunityFeedbackOutcomeSchema = z
  .object({
    disposition: opportunityDispositionSchema,
    qualification: opportunityQualificationSchema,
    reason: opportunityDecisionReasonSchema,
    count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const opportunityFeedbackAggregateSchema = z
  .object({
    searchProfileId: z.string().uuid(),
    outcomes: z.array(opportunityFeedbackOutcomeSchema).max(120),
  })
  .strict();

export const opportunityDecisionListResponseSchema = z
  .object({
    decisions: z.array(opportunityDecisionSchema).max(100),
    feedback: z.array(opportunityFeedbackAggregateSchema).max(100),
  })
  .strict();

export const opportunityDecisionMutationResponseSchema = z
  .object({ decision: opportunityDecisionSchema })
  .strict();

export type OpportunityDecisionInput = z.infer<
  typeof opportunityDecisionInputSchema
>;
export type OpportunityDecision = z.infer<typeof opportunityDecisionSchema>;
export type OpportunityDecisionEvent = z.infer<
  typeof opportunityDecisionEventSchema
>;
export type OpportunityDecisionReason = z.infer<
  typeof opportunityDecisionReasonSchema
>;
export type OpportunityFeedbackAggregate = z.infer<
  typeof opportunityFeedbackAggregateSchema
>;

export function aggregateOpportunityDecisionFeedback(
  events: readonly Pick<
    OpportunityDecision,
    'searchProfileId' | 'disposition' | 'qualification' | 'reason'
  >[],
): OpportunityFeedbackAggregate[] {
  const counts = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (!event.searchProfileId) continue;
    const outcomes = counts.get(event.searchProfileId) ?? new Map();
    const key = [event.disposition, event.qualification, event.reason].join(
      ':',
    );
    outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
    counts.set(event.searchProfileId, outcomes);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([searchProfileId, outcomes]) =>
      opportunityFeedbackAggregateSchema.parse({
        searchProfileId,
        outcomes: [...outcomes.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => {
            const [disposition, qualification, reason] = key.split(':');
            return { disposition, qualification, reason, count };
          }),
      }),
    );
}
