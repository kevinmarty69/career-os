import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { applicationCompanySourcesSchema } from '../application-contract';
import {
  createRunInputSchema,
  deploymentModeSchema,
  instanceStatusSchema,
  persistedEvidenceArchiveSchema,
  persistedRecruiterStrategySchema,
  persistedResearchSchema,
  persistedRunSchema,
  researchSelectionInputSchema,
  reviewIssueDecisionInputSchema,
  reviewIssueDecisionResultSchema,
  reviewStartInputSchema,
  strategyStartInputSchema,
  strategyApprovalInputSchema,
  workerServiceSchema,
  workerServices,
  type PersistedRun,
  type ReviewIssueDecisionResult,
  type InstanceStatus,
  type WorkerAvailability,
  type WorkerService,
} from '../run-contract';
import { pageSpecSchema, profileSchema, type Profile } from '../schemas';
import { COMPANY_RESEARCH_RUN_TOKEN_BUDGET } from './local-openai-client';
import { REVIEW_RUN_TOKEN_BUDGET } from './local-openai-review-client';
import { RECRUITER_STRATEGY_RUN_TOKEN_BUDGET } from './local-openai-strategy-client';

export type RunSession = {
  userId: string;
  tenantId: string;
  tenantName: string;
};

export class RunConflictError extends Error {}
export class RunRejectedError extends Error {}
export class RunRateLimitError extends Error {}
export class WorkerUnavailableError extends Error {
  constructor(readonly service: WorkerService) {
    super(`Worker service ${service} is unavailable.`);
  }
}

const MAX_ACTIVE_RUNS_PER_TENANT = 5;
const MAX_RUNS_PER_TENANT_HOUR = 30;
const PENDING_WAIT_MS = 10_000;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function readInstanceStatus(
  session: RunSession,
): Promise<InstanceStatus> {
  const mode = deploymentMode();
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      const services = await tx<
        Array<{
          service: WorkerService;
          status: 'fresh' | 'stale' | 'missing';
        }>
      >`select requested.service, status.status
        from unnest(${tx.array(workerServices)}::text[])
          with ordinality requested(service, position)
        cross join lateral app.worker_service_status(requested.service) status
        order by requested.position`;
      return instanceStatusSchema.parse({
        mode,
        services,
      });
    });
  } finally {
    await sql.end();
  }
}

function deploymentMode() {
  const mode = process.env.CAREER_OS_DEPLOYMENT_MODE ?? 'self-hosted';
  return deploymentModeSchema.parse(mode);
}

export async function createPersistedRun(
  session: RunSession,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const input = createRunInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const inputHash = hashJson(input);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(
        hashtextextended(${`${session.tenantId}:${key}`}, 0)
      )`;
      await authorize(tx, session, 'career_app');

      const [existing] = await tx<{ id: string; input_hash: string }[]>`
        select id, input_hash from app.workflow_runs
        where tenant_id = ${session.tenantId} and idempotency_key = ${key}`;
      if (existing) {
        if (existing.input_hash !== inputHash)
          throw new RunConflictError(
            'The idempotency key belongs to a different run input.',
          );
        return {
          created: false,
          run: await readRunProjection(tx, session.tenantId, existing.id),
        };
      }

      const worker = await readWorkerServiceStatus(tx, 'company-researcher');
      if (!worker.available)
        throw new WorkerUnavailableError('company-researcher');

      await tx`select pg_advisory_xact_lock(
        hashtextextended(${`${session.tenantId}:run-admission`}, 0)
      )`;
      const [admission] = await tx<
        Array<{ active: number; recent: number }>
      >`select
        (select count(*)::integer from app.workflow_runs
          where tenant_id = ${session.tenantId} and status = 'running') active,
        (select count(*)::integer from app.workflow_steps
          where tenant_id = ${session.tenantId}
            and stage = 'company-researcher'
            and created_at >= now() - interval '1 hour') recent`;
      if (
        admission.active >= MAX_ACTIVE_RUNS_PER_TENANT ||
        admission.recent >= MAX_RUNS_PER_TENANT_HOUR
      )
        throw new RunRateLimitError();

      const [application] = await tx<
        Array<{
          company: string;
          role: string;
          raw_text: string;
          url: string | null;
          accent: string;
          company_sources: unknown;
          revision: string;
        }>
      >`select company, role, raw_text, url, accent, company_sources, revision
        from app.applications
        where tenant_id = ${session.tenantId} and id = ${input.applicationId}
          and deleted_at is null
        for update`;
      if (!application)
        throw new RunRejectedError('Application is unavailable.');
      if (Number(application.revision) !== input.applicationRevision)
        throw new RunConflictError(
          'Run requires the current application revision.',
        );
      const companySources = applicationCompanySourcesSchema.parse(
        application.company_sources,
      );

      const living = await readLivingProfile(tx, session);
      if (!living || living.revision !== input.profileRevision)
        throw new RunConflictError(
          'Run requires the current saved Career Memory revision.',
        );

      const snapshot = await cloneProfileSnapshot(
        tx,
        session.tenantId,
        living.profile,
        living.revision,
      );
      const opportunityId = randomUUID();
      const runId = randomUUID();
      await tx`insert into app.opportunities (
        id, tenant_id, application_id, application_revision, company, role,
        raw_text, url, accent, company_sources, extraction_status
      ) values (
        ${opportunityId}, ${session.tenantId}, ${input.applicationId},
        ${input.applicationRevision}, ${application.company}, ${application.role},
        ${application.raw_text}, ${application.url}, ${application.accent},
        ${tx.json(companySources)}, 'ready'
      )`;
      await tx`insert into app.workflow_runs (
        id, tenant_id, opportunity_id, profile_id, source_profile_id,
        source_profile_revision, idempotency_key, state, status, token_budget,
        cost_budget_micros, deadline_at, input_hash
      ) values (
        ${runId}, ${session.tenantId}, ${opportunityId}, ${snapshot.id},
        ${living.id}, ${living.revision}, ${key}, 'research', 'running',
        ${COMPANY_RESEARCH_RUN_TOKEN_BUDGET + RECRUITER_STRATEGY_RUN_TOKEN_BUDGET + REVIEW_RUN_TOKEN_BUDGET * 2},
        0, now() + interval '1 hour', ${inputHash}
      )`;
      const researchInput = {
        schemaVersion: 2,
        company: application.company,
        role: application.role,
        description: application.raw_text,
        companySources,
        source: {
          kind: 'job-posting',
          ...(application.url ? { url: application.url } : {}),
          trust: 'untrusted-data',
        },
      };
      await tx`select app.enqueue_company_researcher_step(
        ${session.tenantId}, ${runId}, ${tx.json(researchInput)}
      )`;
      return {
        created: true,
        run: await readRunProjection(tx, session.tenantId, runId),
      };
    });
  } finally {
    await sql.end();
  }
}

export async function readPersistedRun(session: RunSession, rawRunId: string) {
  const runId = idempotencyKeySchema(rawRunId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      return readRunProjection(tx, session.tenantId, runId, true);
    });
  } finally {
    await sql.end();
  }
}

export async function confirmResearchSelection(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const runId = idempotencyKeySchema(rawRunId);
  const input = researchSelectionInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      const [result] = await tx<{ created: boolean }[]>`
        select app.confirm_research_signal_selection(
          ${session.tenantId}, ${runId}, ${input.researchArtifactId},
          ${input.selectedSignalIds}, ${key}
        ) as created`;
      return {
        created: result.created,
        run: await readRunProjection(tx, session.tenantId, runId),
      };
    });
  } catch (error) {
    if (isDatabaseConflict(error)) throw new RunConflictError();
    if (isDatabaseRejection(error)) throw new RunRejectedError();
    throw error;
  } finally {
    await sql.end();
  }
}

export async function startRecruiterStrategy(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const runId = idempotencyKeySchema(rawRunId);
  const input = strategyStartInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      const [result] = await tx<{ created: boolean }[]>`
        select app.confirm_evidence_archive_selection(
          ${session.tenantId}, ${runId}, ${input.evidenceArtifactId},
          ${input.evidenceArtifactHash}, ${key}
        ) as created`;
      return {
        created: result.created,
        run: await readRunProjection(tx, session.tenantId, runId),
      };
    });
  } catch (error) {
    if (isDatabaseConflict(error)) throw new RunConflictError();
    if (isDatabaseRejection(error)) throw new RunRejectedError();
    throw error;
  } finally {
    await sql.end();
  }
}

export async function approveRecruiterStrategy(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const runId = idempotencyKeySchema(rawRunId);
  const input = strategyApprovalInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      const [result] = await tx<{ created: boolean }[]>`
        select app.approve_recruiter_strategy(
          ${session.tenantId}, ${runId}, ${input.strategyArtifactId},
          ${input.strategyArtifactHash}, ${key}
        ) as created`;
      return {
        created: result.created,
        run: await readRunProjection(tx, session.tenantId, runId),
      };
    });
  } catch (error) {
    if (isDatabaseConflict(error)) throw new RunConflictError();
    if (isDatabaseRejection(error)) throw new RunRejectedError();
    throw error;
  } finally {
    await sql.end();
  }
}

export async function startPageSpecReviews(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const runId = idempotencyKeySchema(rawRunId);
  reviewStartInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session, 'career_app');
      const [result] = await tx<{ created: boolean }[]>`
        select app.start_page_spec_reviews(
          ${session.tenantId}, ${runId}, ${key}
        ) as created`;
      return {
        created: result.created,
        run: await readRunProjection(tx, session.tenantId, runId),
      };
    });
  } catch (error) {
    if (isDatabaseConflict(error)) throw new RunConflictError();
    if (isDatabaseRejection(error)) throw new RunRejectedError();
    throw error;
  } finally {
    await sql.end();
  }
}

export async function decideReviewIssue(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
) {
  const runId = idempotencyKeySchema(rawRunId);
  const input = reviewIssueDecisionInputSchema.parse(rawInput);
  const key = idempotencyKeySchema(idempotencyKey);
  const inputHash = hashJson({ runId, ...input });
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(
        hashtextextended(${`${session.tenantId}:review-decision:${key}`}, 0)
      )`;
      await authorize(tx, session, 'career_app');
      const [replay] = await tx<
        Array<StoredReviewDecision>
      >`select id, workflow_run_id, page_spec_id, review_id, issue_index, decision,
          corrected_run_id, input_hash
        from app.review_issue_decisions
        where tenant_id = ${session.tenantId} and idempotency_key = ${key}`;
      if (replay) {
        if (replay.input_hash !== inputHash)
          throw new RunConflictError(
            'The idempotency key belongs to another review decision.',
          );
        return {
          created: false,
          decision: await reviewDecisionProjection(
            tx,
            session.tenantId,
            replay,
          ),
        };
      }

      const [run] = await tx<
        Array<{
          profile_id: string;
          opportunity_id: string;
          source_profile_id: string | null;
          source_profile_revision: string | null;
          status: string;
        }>
      >`select profile_id, opportunity_id, source_profile_id,
          source_profile_revision, status
        from app.workflow_runs
        where tenant_id = ${session.tenantId} and id = ${runId}
        for update`;
      if (!run || !['blocked', 'awaiting_approval'].includes(run.status))
        throw new RunRejectedError('Run has no actionable review issue.');
      const [existingIssue] = await tx<
        Array<StoredReviewDecision>
      >`select id, workflow_run_id, page_spec_id, review_id, issue_index, decision,
          corrected_run_id, input_hash
        from app.review_issue_decisions
        where tenant_id = ${session.tenantId} and review_id = ${input.reviewId}
          and issue_index = ${input.issueIndex}`;
      if (existingIssue) {
        if (
          existingIssue.workflow_run_id !== runId ||
          existingIssue.input_hash !== inputHash
        )
          throw new RunConflictError('Review issue already has a decision.');
        return {
          created: false,
          decision: await reviewDecisionProjection(
            tx,
            session.tenantId,
            existingIssue,
          ),
        };
      }
      const [pageSpec] = await tx<
        Array<{ id: string; spec: unknown; spec_hash: string }>
      >`select id, spec, spec_hash from app.page_specs
        where tenant_id = ${session.tenantId} and workflow_run_id = ${runId}
          and invalidated_at is null
        order by version desc limit 1`;
      if (!pageSpec) throw new RunRejectedError('Run has no current PageSpec.');
      const [review] = await tx<
        Array<{
          id: string;
          reviewer: 'recruiter' | 'hiring_manager' | 'factuality';
          issues: unknown;
        }>
      >`select id, reviewer, issues from app.reviews
        where tenant_id = ${session.tenantId} and id = ${input.reviewId}
          and page_spec_id = ${pageSpec.id}
          and page_spec_hash = ${pageSpec.spec_hash}`;
      if (!review)
        throw new RunRejectedError('Review is not current for this run.');
      const issues = reviewIssues(review.issues);
      const issue = issues[input.issueIndex];
      if (!issue) throw new RunRejectedError('Review issue does not exist.');
      const issueText = issue.message;
      if (input.decision === 'keep' && review.reviewer === 'factuality')
        throw new RunRejectedError('Factuality objections cannot be kept.');

      const decisionId = randomUUID();
      let correctedRunId: string | undefined;
      if (input.decision === 'correct') {
        const worker = await readWorkerServiceStatus(tx, 'page-composer');
        if (!worker.available)
          throw new WorkerUnavailableError('page-composer');
        const [correction] = await tx<Array<{ run_id: string }>>`
          select app.start_page_spec_correction(
            ${session.tenantId}, ${runId}, ${pageSpec.id}, ${review.id},
            ${input.issueIndex}, ${decisionId}, ${key}, ${inputHash}
          ) as run_id`;
        correctedRunId = correction.run_id;
      }

      if (input.decision === 'keep') {
        await authorize(tx, session, 'career_app');
        await tx`insert into app.review_issue_decisions (
        id, tenant_id, workflow_run_id, page_spec_id, review_id, issue_index,
        issue_text, decision, corrected_run_id, decided_by, idempotency_key,
        input_hash
      ) values (
        ${decisionId}, ${session.tenantId}, ${runId}, ${pageSpec.id},
        ${review.id}, ${input.issueIndex}, ${issueText}, ${input.decision},
        ${correctedRunId ?? null}, ${session.userId}, ${key}, ${inputHash}
        )`;
        await tx`insert into app.workflow_events (
        tenant_id, workflow_run_id, actor, event_type, summary, payload
      ) values (
        ${session.tenantId}, ${runId}, 'human', 'review_issue_decided',
        ${`Human chose ${input.decision} for ${review.reviewer} issue ${input.issueIndex}.`},
        ${tx.json({
          decisionId,
          reviewId: review.id,
          issueIndex: input.issueIndex,
          decision: input.decision,
          ...(correctedRunId ? { correctedRunId } : {}),
          costMicros: 0,
        })}
        )`;
      }
      const publicationEligible =
        input.decision === 'keep' &&
        (await pageSpecReviewGate(
          tx,
          session.tenantId,
          pageSpec.id,
          pageSpec.spec_hash,
        ));
      if (publicationEligible)
        await tx`update app.workflow_runs set status = 'awaiting_approval',
          state = 'human_approval'
          where tenant_id = ${session.tenantId} and id = ${runId}`;
      const stored: StoredReviewDecision = {
        id: decisionId,
        workflow_run_id: runId,
        page_spec_id: pageSpec.id,
        review_id: review.id,
        issue_index: input.issueIndex,
        decision: input.decision,
        corrected_run_id: correctedRunId ?? null,
        input_hash: inputHash,
      };
      return {
        created: true,
        decision: await reviewDecisionProjection(tx, session.tenantId, stored),
      };
    });
  } catch (error) {
    if (isDatabaseConflict(error)) throw new RunConflictError();
    if (isDatabaseRejection(error)) throw new RunRejectedError();
    throw error;
  } finally {
    await sql.end();
  }
}

type StoredReviewDecision = {
  id: string;
  workflow_run_id: string;
  page_spec_id: string;
  review_id: string;
  issue_index: number;
  decision: 'keep' | 'correct';
  corrected_run_id: string | null;
  input_hash: string;
};

async function reviewDecisionProjection(
  tx: postgres.TransactionSql,
  tenantId: string,
  decision: StoredReviewDecision,
): Promise<ReviewIssueDecisionResult> {
  const [pageSpec] = await tx<
    Array<{ spec_hash: string }>
  >`select spec_hash from app.page_specs
    where tenant_id = ${tenantId} and id = ${decision.page_spec_id}`;
  const publicationEligible =
    decision.decision === 'keep' &&
    !!pageSpec &&
    (await pageSpecReviewGate(
      tx,
      tenantId,
      decision.page_spec_id,
      pageSpec.spec_hash,
    ));
  const correctedRun = decision.corrected_run_id
    ? await readRunProjection(tx, tenantId, decision.corrected_run_id)
    : undefined;
  if (decision.corrected_run_id && !correctedRun)
    throw new RunRejectedError('Corrected run is missing.');
  return reviewIssueDecisionResultSchema.parse({
    decisionId: decision.id,
    runId: decision.workflow_run_id,
    reviewId: decision.review_id,
    issueIndex: decision.issue_index,
    decision: decision.decision,
    publicationEligible,
    ...(correctedRun ? { correctedRun } : {}),
  });
}

async function pageSpecReviewGate(
  tx: postgres.TransactionSql,
  tenantId: string,
  pageSpecId: string,
  pageSpecHash: string,
) {
  const [result] = await tx<{ allowed: boolean }[]>`
    select app.page_spec_review_gate(
      ${tenantId}, ${pageSpecId}, ${pageSpecHash}
    ) as allowed`;
  return result.allowed;
}

async function readLivingProfile(
  tx: postgres.TransactionSql,
  session: RunSession,
) {
  const [profile] = await tx<
    { id: string; name: string; headline: string; revision: string }[]
  >`select id, name, headline, revision from app.profiles
    where tenant_id = ${session.tenantId} and profile_kind = 'living'
    for share`;
  if (!profile) return;
  return {
    id: profile.id,
    revision: Number(profile.revision),
    profile: await readProfileGraph(tx, session.tenantId, profile),
  };
}

async function readProfileGraph(
  tx: postgres.TransactionSql,
  tenantId: string,
  profile: { id: string; name: string; headline: string },
) {
  const sources = await tx<
    Array<{
      id: string;
      kind: Profile['sources'][number]['kind'];
      title: string;
      locator: string | null;
      sensitivity: Profile['sources'][number]['sensitivity'];
      allowed_uses: Profile['sources'][number]['allowedUses'];
    }>
  >`select id, kind, title, locator, sensitivity, allowed_uses
    from app.sources where tenant_id = ${tenantId}
      and profile_id = ${profile.id} order by position, id`;
  const evidence = await tx<
    Array<{ id: string; source_id: string; label: string; excerpt: string }>
  >`select id, source_id, label, excerpt from app.evidence
    where tenant_id = ${tenantId} and profile_id = ${profile.id}
    order by position, id`;
  const claims = await tx<
    Array<{
      id: string;
      statement: string;
      level: Profile['claims'][number]['level'];
      sensitivity: Profile['claims'][number]['sensitivity'];
      allowed_uses: Profile['claims'][number]['allowedUses'];
    }>
  >`select id, statement, level, sensitivity, allowed_uses
    from app.claims where tenant_id = ${tenantId}
      and profile_id = ${profile.id} order by position, id`;
  const links = await tx<
    Array<{ claim_id: string; evidence_id: string }>
  >`select claim_id, evidence_id from app.claim_evidence
    where tenant_id = ${tenantId} and profile_id = ${profile.id}
    order by claim_id, position, evidence_id`;

  return profileSchema.parse({
    name: profile.name,
    headline: profile.headline,
    sources: sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title,
      ...(source.locator ? { locator: source.locator } : {}),
      sensitivity: source.sensitivity,
      allowedUses: source.allowed_uses,
      trust: 'untrusted-data' as const,
    })),
    evidence: evidence.map((item) => ({
      id: item.id,
      sourceId: item.source_id,
      label: item.label,
      excerpt: item.excerpt,
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      statement: claim.statement,
      level: claim.level,
      evidenceIds: links
        .filter((link) => link.claim_id === claim.id)
        .map((link) => link.evidence_id),
      sensitivity: claim.sensitivity,
      allowedUses: claim.allowed_uses,
    })),
  });
}

async function cloneProfileSnapshot(
  tx: postgres.TransactionSql,
  tenantId: string,
  profile: Profile,
  revision: number,
) {
  const id = randomUUID();
  await tx`insert into app.profiles (
    id, tenant_id, name, headline, profile_kind, revision
  ) values (${id}, ${tenantId}, ${profile.name}, ${profile.headline}, 'snapshot', ${revision})`;

  const sourceIds = new Map<string, string>();
  const sources: Profile['sources'] = [];
  for (const [position, source] of profile.sources.entries()) {
    const sourceId = randomUUID();
    sourceIds.set(source.id, sourceId);
    await tx`insert into app.sources (
      id, tenant_id, profile_id, position, kind, title, locator, sensitivity,
      allowed_uses
    ) values (
      ${sourceId}, ${tenantId}, ${id}, ${position}, ${source.kind},
      ${source.title}, ${source.locator ?? null}, ${source.sensitivity},
      ${source.allowedUses}
    )`;
    sources.push({ ...source, id: sourceId });
  }

  const evidenceIds = new Map<string, string>();
  const evidence: Profile['evidence'] = [];
  for (const [position, item] of profile.evidence.entries()) {
    const evidenceId = randomUUID();
    const sourceId = sourceIds.get(item.sourceId);
    if (!sourceId)
      throw new RunRejectedError('Snapshot source mapping failed.');
    evidenceIds.set(item.id, evidenceId);
    await tx`insert into app.evidence (
      id, tenant_id, profile_id, source_id, position, label, excerpt
    ) values (
      ${evidenceId}, ${tenantId}, ${id}, ${sourceId}, ${position},
      ${item.label}, ${item.excerpt}
    )`;
    evidence.push({ ...item, id: evidenceId, sourceId });
  }

  const claims: Profile['claims'] = [];
  for (const [position, claim] of profile.claims.entries()) {
    const claimId = randomUUID();
    const mappedEvidenceIds = claim.evidenceIds.map((evidenceId) => {
      const mapped = evidenceIds.get(evidenceId);
      if (!mapped)
        throw new RunRejectedError('Snapshot evidence mapping failed.');
      return mapped;
    });
    await tx`insert into app.claims (
      id, tenant_id, profile_id, position, statement, level, sensitivity,
      allowed_uses
    ) values (
      ${claimId}, ${tenantId}, ${id}, ${position}, ${claim.statement},
      ${claim.level}, ${claim.sensitivity}, ${claim.allowedUses}
    )`;
    for (const [linkPosition, evidenceId] of mappedEvidenceIds.entries())
      await tx`insert into app.claim_evidence (
        tenant_id, profile_id, claim_id, evidence_id, position
      ) values (
        ${tenantId}, ${id}, ${claimId}, ${evidenceId}, ${linkPosition}
      )`;
    claims.push({ ...claim, id: claimId, evidenceIds: mappedEvidenceIds });
  }

  return {
    id,
    profile: profileSchema.parse({
      name: profile.name,
      headline: profile.headline,
      sources,
      evidence,
      claims,
    }),
  };
}

async function readRunProjection(
  tx: postgres.TransactionSql,
  tenantId: string,
  runId: string,
  resolveLeaf = false,
): Promise<PersistedRun | undefined> {
  const [leaf] = resolveLeaf
    ? await tx<Array<{ id: string }>>`with recursive descendants as (
        select candidate.id, candidate.parent_run_id, candidate.revision_count
        from app.workflow_runs candidate
        where candidate.tenant_id = ${tenantId} and candidate.id = ${runId}
        union all
        select child.id, child.parent_run_id, child.revision_count
        from app.workflow_runs child
        join descendants parent on child.tenant_id = ${tenantId}
          and child.parent_run_id = parent.id
      )
      select id from descendants order by revision_count desc limit 1`
    : [{ id: runId }];
  if (!leaf) return;
  const [run] = await tx<
    Array<{
      id: string;
      profile_id: string;
      status: PersistedRun['status'];
      state: string;
      revision_count: number;
      used_tokens: number;
      used_cost_micros: string;
    }>
  >`select id, profile_id, status, state, revision_count, used_tokens,
      used_cost_micros from app.workflow_runs
    where tenant_id = ${tenantId} and id = ${leaf.id}`;
  if (!run) return;
  const ancestors = await tx<Array<{ id: string; depth: number }>>`
    with recursive lineage as (
      select candidate.id, candidate.parent_run_id, 0 depth
      from app.workflow_runs candidate
      where candidate.tenant_id = ${tenantId} and candidate.id = ${run.id}
      union all
      select parent.id, parent.parent_run_id, child.depth + 1
      from app.workflow_runs parent
      join lineage child on parent.tenant_id = ${tenantId}
        and parent.id = child.parent_run_id
    )
    select id, depth from lineage order by depth`;
  const lineageRunIds = ancestors.map(({ id }) => id);
  const [snapshot] = await tx<
    Array<{ id: string; name: string; headline: string }>
  >`select id, name, headline from app.profiles
    where tenant_id = ${tenantId} and id = ${run.profile_id}`;
  if (!snapshot) throw new RunRejectedError('Run profile snapshot is missing.');
  const profile = await readProfileGraph(tx, tenantId, snapshot);
  const [researchArtifact] = await tx<
    Array<{ id: string; body: unknown; artifact_hash: string }>
  >`select id, body, encode(digest(body::text, 'sha256'), 'hex') artifact_hash
    from app.artifacts
    where tenant_id = ${tenantId}
      and workflow_run_id = any(${tx.array(lineageRunIds)}::uuid[])
      and kind = 'research'
    order by array_position(${tx.array(lineageRunIds)}::uuid[], workflow_run_id),
      version desc limit 1`;
  const [evidenceArtifact] = await tx<
    Array<{ id: string; body: unknown; artifact_hash: string }>
  >`
    select id, body, encode(digest(body::text, 'sha256'), 'hex') artifact_hash
    from app.artifacts
    where tenant_id = ${tenantId}
      and workflow_run_id = any(${tx.array(lineageRunIds)}::uuid[])
      and kind = 'evidence_archive'
    order by array_position(${tx.array(lineageRunIds)}::uuid[], workflow_run_id),
      version desc limit 1`;
  const [strategyArtifact] = await tx<
    Array<{ id: string; body: unknown; artifact_hash: string }>
  >`
    select id, body, encode(digest(body::text, 'sha256'), 'hex') artifact_hash
    from app.artifacts
    where tenant_id = ${tenantId}
      and workflow_run_id = any(${tx.array(lineageRunIds)}::uuid[])
      and kind = 'strategy'
    order by array_position(${tx.array(lineageRunIds)}::uuid[], workflow_run_id),
      version desc limit 1`;
  const [pageSpec] = await tx<
    Array<{
      id: string;
      spec: unknown;
      spec_hash: string;
      source_artifact_id: string | null;
      source_artifact_hash: string | null;
    }>
  >`select page.id, page.spec, page.spec_hash, page.source_artifact_id,
      encode(digest(artifact.body::text, 'sha256'), 'hex') source_artifact_hash
    from app.page_specs page
    join app.artifacts artifact on artifact.tenant_id = page.tenant_id
      and artifact.id = page.source_artifact_id
    where page.tenant_id = ${tenantId} and page.workflow_run_id = ${run.id}
      and page.invalidated_at is null and page.source_artifact_id is not null
    order by page.version desc limit 1`;
  const reviews = pageSpec
    ? await tx<
        Array<{
          id: string;
          reviewer: 'recruiter' | 'hiring_manager' | 'factuality';
          verdict: 'pass' | 'changes_required';
          issues: unknown;
        }>
      >`select id, reviewer, verdict, issues from app.reviews
        where tenant_id = ${tenantId} and page_spec_id = ${pageSpec.id}
        order by case reviewer when 'recruiter' then 1
          when 'hiring_manager' then 2 else 3 end`
    : [];
  const reviewDecisions = pageSpec
    ? await tx<
        Array<{
          review_id: string;
          issue_index: number;
          decision: 'keep' | 'correct';
        }>
      >`select decision.review_id, decision.issue_index, decision.decision
        from app.review_issue_decisions decision
        join app.reviews review on review.tenant_id = decision.tenant_id
          and review.id = decision.review_id
        where decision.tenant_id = ${tenantId}
          and decision.page_spec_id = ${pageSpec.id}
        order by decision.created_at, decision.id`
    : [];
  const publicationEligible = pageSpec
    ? await pageSpecReviewGate(tx, tenantId, pageSpec.id, pageSpec.spec_hash)
    : false;
  const events = await tx<
    Array<{
      actor: string;
      event_type: string;
      summary: string;
      payload: { artifactId?: unknown; costMicros?: unknown };
    }>
  >`select actor, event_type, summary, payload from app.workflow_events
    where tenant_id = ${tenantId}
      and workflow_run_id = any(${tx.array(lineageRunIds)}::uuid[])
    order by array_position(${tx.array(lineageRunIds)}::uuid[], workflow_run_id)
      desc, id`;
  const steps = await tx<
    Array<{
      stage: string;
      status: PersistedRun['steps'][number]['status'];
      attempt: number;
      failure_code: string | null;
      pending_for_ms: string;
    }>
  >`select stage, status, attempt, failure_code,
      greatest(0, extract(epoch from (clock_timestamp() - created_at)) * 1000)::text
        pending_for_ms
    from app.workflow_steps
    where tenant_id = ${tenantId} and workflow_run_id = ${run.id}
    order by created_at, id`;
  const workerAvailability = await projectWorkerAvailability(tx, steps);

  return persistedRunSchema.parse({
    runId: run.id,
    status: run.status,
    stage: run.state,
    revision: run.revision_count,
    usedTokens: run.used_tokens,
    usedCostMicros: Number(run.used_cost_micros),
    profile,
    workerAvailability,
    steps: steps.map((step) => ({
      stage: step.stage,
      status: step.status,
      attempt: step.attempt,
      ...(step.failure_code ? { failureCode: step.failure_code } : {}),
    })),
    ...(researchArtifact
      ? {
          research: researchProjection(
            researchArtifact.id,
            researchArtifact.artifact_hash,
            researchArtifact.body,
          ),
        }
      : {}),
    ...(evidenceArtifact
      ? {
          evidenceArchive: persistedEvidenceArchiveSchema.parse({
            ...(typeof evidenceArtifact.body === 'object' &&
            evidenceArtifact.body !== null
              ? evidenceArtifact.body
              : {}),
            artifactId: evidenceArtifact.id,
            artifactHash: evidenceArtifact.artifact_hash,
          }),
        }
      : {}),
    ...(strategyArtifact
      ? {
          strategy: persistedRecruiterStrategySchema.parse({
            ...(typeof strategyArtifact.body === 'object' &&
            strategyArtifact.body !== null
              ? strategyArtifact.body
              : {}),
            artifactId: strategyArtifact.id,
            artifactHash: strategyArtifact.artifact_hash,
          }),
        }
      : {}),
    ...(pageSpec
      ? {
          pageSpecId: pageSpec.id,
          pageSpecHash: pageSpec.spec_hash,
          ...(pageSpec.source_artifact_id
            ? { pageSpecArtifactId: pageSpec.source_artifact_id }
            : {}),
          ...(pageSpec.source_artifact_hash
            ? { pageSpecArtifactHash: pageSpec.source_artifact_hash }
            : {}),
          spec: pageSpecSchema.parse(pageSpec.spec),
        }
      : {}),
    reviews: reviews.map((review) => ({
      reviewId: review.id,
      reviewer:
        review.reviewer === 'hiring_manager'
          ? ('hiring-manager' as const)
          : review.reviewer,
      passed: review.verdict === 'pass',
      findings: reviewFindings(review.issues),
      issues: reviewIssues(review.issues),
    })),
    reviewDecisions: reviewDecisions.map((decision) => ({
      reviewId: decision.review_id,
      issueIndex: decision.issue_index,
      decision: decision.decision,
    })),
    publicationEligible,
    events: events.map((event) => ({
      actor: fromDatabaseActor(event.actor),
      type: event.event_type,
      summary: event.summary,
      ...(typeof event.payload.artifactId === 'string'
        ? { artifactId: event.payload.artifactId }
        : {}),
      costMicros:
        typeof event.payload.costMicros === 'number'
          ? event.payload.costMicros
          : 0,
    })),
  });
}

async function projectWorkerAvailability(
  tx: postgres.TransactionSql,
  steps: Array<{
    stage: string;
    status: PersistedRun['steps'][number]['status'];
    pending_for_ms: string;
  }>,
): Promise<WorkerAvailability> {
  const active = steps.find((step) =>
    ['pending', 'leased', 'in_flight'].includes(step.status),
  );
  if (!active) return { state: 'ready' };
  const activeService = workerServiceSchema.parse(active.stage);
  if (active.status === 'in_flight')
    return { state: 'ready', service: activeService };

  const service = await readWorkerServiceStatus(tx, activeService);
  if (!service.available)
    return {
      state: 'unavailable',
      service: activeService,
    };
  return {
    state:
      active.status === 'pending' &&
      Number(active.pending_for_ms) >= PENDING_WAIT_MS
        ? 'waiting'
        : 'ready',
    service: activeService,
  };
}

async function readWorkerServiceStatus(
  tx: postgres.TransactionSql,
  service: WorkerService,
) {
  const [status] = await tx<Array<{ status: string }>>`select status
    from app.worker_service_status(${service})`;
  return {
    available: status?.status === 'fresh',
  };
}

async function authorize(
  tx: postgres.TransactionSql,
  session: RunSession,
  role: 'career_app' | 'career_reviewer',
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe(`set local role ${role}`);
}

function idempotencyKeySchema(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : (() => {
        throw new RunRejectedError('A UUID idempotency key is required.');
      })();
}

function reviewFindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((issue) => {
    if (typeof issue === 'string' && issue.length > 0) return [issue];
    if (
      issue &&
      typeof issue === 'object' &&
      'message' in issue &&
      typeof issue.message === 'string' &&
      issue.message.length > 0
    )
      return [issue.message];
    return [];
  });
}

function reviewIssues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((issue) => {
    if (
      issue &&
      typeof issue === 'object' &&
      'section' in issue &&
      typeof issue.section === 'string' &&
      issue.section.length > 0 &&
      'message' in issue &&
      typeof issue.message === 'string' &&
      issue.message.length > 0 &&
      'blocking' in issue &&
      typeof issue.blocking === 'boolean'
    )
      return [
        {
          section: issue.section,
          message: issue.message,
          blocking: issue.blocking,
          ...('claimId' in issue && typeof issue.claimId === 'string'
            ? { claimId: issue.claimId }
            : {}),
          ...('evidenceIds' in issue && Array.isArray(issue.evidenceIds)
            ? { evidenceIds: issue.evidenceIds }
            : {}),
        },
      ];
    return [];
  });
}

function fromDatabaseActor(actor: string) {
  return actor.replaceAll('_', '-');
}

function researchProjection(
  artifactId: string,
  artifactHash: string,
  rawBody: unknown,
) {
  if (!rawBody || typeof rawBody !== 'object' || !('signals' in rawBody))
    throw new RunRejectedError('Run research artifact is invalid.');
  const body = rawBody as Record<string, unknown>;
  if (!Array.isArray(body.signals))
    throw new RunRejectedError('Run research artifact is invalid.');
  return persistedResearchSchema.parse({
    ...body,
    artifactId,
    artifactHash,
    signals: body.signals.map((signal, index) => ({
      ...(signal && typeof signal === 'object' ? signal : {}),
      signalId: `signal-${index + 1}`,
    })),
  });
}

function isDatabaseConflict(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('selection conflict') ||
      error.message.includes('strategy approval conflict') ||
      error.message.includes('review start conflict') ||
      error.message.includes('idempotency key conflict'))
  );
}

function isDatabaseRejection(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('research selection') ||
      error.message.includes('evidence archive') ||
      error.message.includes('strategy ') ||
      error.message.includes('review run unavailable') ||
      error.message.includes('review PageSpec unavailable') ||
      error.message.includes('review PageSpec lineage rejected') ||
      error.message.includes('review input unavailable') ||
      error.message.includes('page correction'))
  );
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
