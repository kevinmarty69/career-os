import 'server-only';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import {
  aggregateOpportunityDecisionFeedback,
  opportunityDecisionEventSchema,
  opportunityDecisionInputSchema,
  opportunityDecisionSchema,
  type OpportunityDecision,
  type OpportunityDecisionEvent,
} from '../opportunity-decision';
import type { PublicationSession } from './publications';

export class OpportunityDecisionConflictError extends Error {}
export class OpportunityDecisionNotFoundError extends Error {}

type DecisionRow = {
  id: string;
  discovered_job_id: string;
  search_profile_id: string | null;
  disposition: 'saved' | 'ignored' | 'archived';
  qualification: 'priority' | 'interesting' | 'exploratory' | 'ignore';
  reason:
    | 'strong_fit'
    | 'career_direction'
    | 'hard_constraint'
    | 'weak_evidence'
    | 'compensation'
    | 'location'
    | 'company'
    | 'duplicate'
    | 'closed'
    | 'other';
  note: string | null;
  revision: string;
  actor: 'human';
  actor_id: string;
  created_at: Date;
  updated_at: Date;
};

type EventRow = Omit<DecisionRow, 'id' | 'updated_at'> & {
  id: string;
  decision_id: string;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function listOpportunityDecisions(session: PublicationSession) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const decisions = await tx<DecisionRow[]>`
        select id, discovered_job_id, search_profile_id, disposition,
          qualification, reason, note, revision, actor, actor_id, created_at,
          updated_at
        from app.opportunity_decisions where tenant_id = ${session.tenantId}
        order by updated_at desc, id desc limit 100`;
      const events = await tx<EventRow[]>`
        select id, decision_id, discovered_job_id, search_profile_id,
          disposition, qualification, reason, note, revision, actor, actor_id,
          created_at
        from app.opportunity_decision_events
        where tenant_id = ${session.tenantId}
        order by created_at desc, id desc limit 10000`;
      const historyByDecision = new Map<string, OpportunityDecisionEvent[]>();
      for (const event of events) {
        const history = historyByDecision.get(event.decision_id) ?? [];
        if (history.length < 100) history.push(projectEvent(event));
        historyByDecision.set(event.decision_id, history);
      }
      const projectedDecisions = decisions.map((row) =>
        projectDecision(row, historyByDecision.get(row.id) ?? []),
      );
      return {
        decisions: projectedDecisions,
        feedback: aggregateOpportunityDecisionFeedback(projectedDecisions),
      };
    });
  } finally {
    await sql.end();
  }
}

export async function saveOpportunityDecision(
  session: PublicationSession,
  rawOpportunityId: string,
  rawInput: unknown,
  rawIdempotencyKey: string | null,
): Promise<OpportunityDecision> {
  const opportunityId = z.string().uuid().parse(rawOpportunityId);
  const input = opportunityDecisionInputSchema.parse(rawInput);
  const idempotencyKey = z.string().uuid().parse(rawIdempotencyKey);
  const inputHash = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
  const sql = database();
  try {
    const result = await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [job] = await tx<{ id: string }[]>`
        select id from app.discovered_jobs
        where tenant_id = ${session.tenantId} and id = ${opportunityId}
        for share`;
      if (!job) return null;
      if (input.searchProfileId) {
        const [profile] = await tx<{ id: string }[]>`
          select id from app.search_profiles
          where tenant_id = ${session.tenantId}
            and id = ${input.searchProfileId}
          for share`;
        if (!profile) return null;
      }
      let raw: unknown;
      try {
        const [row] = await tx<{ decision: unknown }[]>`
          select app.apply_opportunity_decision(
            ${session.tenantId}, ${opportunityId}, ${input.searchProfileId},
            ${input.disposition}, ${input.qualification}, ${input.reason},
            ${input.note}, ${input.expectedRevision}, ${idempotencyKey},
            ${inputHash}
          ) as decision`;
        raw = row.decision;
      } catch (error) {
        const message = postgresErrorMessage(error);
        if (
          message.includes('revision conflict') ||
          message.includes('idempotency conflict')
        )
          throw new OpportunityDecisionConflictError(message, {
            cause: error,
          });
        if (
          message.includes('job not found') ||
          message.includes('search profile not found')
        )
          throw new OpportunityDecisionNotFoundError(message, { cause: error });
        throw error;
      }
      const decision = opportunityDecisionSchema
        .omit({ history: true })
        .parse(raw);
      const historyRows = await tx<EventRow[]>`
        select id, decision_id, discovered_job_id, search_profile_id,
          disposition, qualification, reason, note, revision, actor, actor_id,
          created_at
        from app.opportunity_decision_events
        where tenant_id = ${session.tenantId}
          and decision_id = ${decision.decisionId}
        order by created_at desc, id desc limit 100`;
      return opportunityDecisionSchema.parse({
        ...decision,
        history: historyRows.map(projectEvent),
      });
    });
    if (!result) throw new OpportunityDecisionNotFoundError();
    return result;
  } finally {
    await sql.end();
  }
}

function projectDecision(
  row: DecisionRow,
  history: OpportunityDecisionEvent[],
): OpportunityDecision {
  return opportunityDecisionSchema.parse({
    decisionId: row.id,
    opportunityId: row.discovered_job_id,
    searchProfileId: row.search_profile_id,
    disposition: row.disposition,
    qualification: row.qualification,
    reason: row.reason,
    note: row.note,
    revision: Number(row.revision),
    actor: row.actor,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    history,
  });
}

function projectEvent(row: EventRow): OpportunityDecisionEvent {
  return opportunityDecisionEventSchema.parse({
    eventId: row.id,
    searchProfileId: row.search_profile_id,
    disposition: row.disposition,
    qualification: row.qualification,
    reason: row.reason,
    note: row.note,
    revision: Number(row.revision),
    actor: row.actor,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  });
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}

function postgresErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}
