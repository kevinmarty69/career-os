import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  FakeAgentProvider,
  runAgentTeam,
  type AgentRunState,
} from '../agent-runtime';
import {
  createRunInputSchema,
  persistedRunSchema,
  reviewIssueDecisionInputSchema,
  reviewIssueDecisionResultSchema,
  runtimeReviewSchema,
  type PersistedRun,
  type ReviewIssueDecisionResult,
} from '../run-contract';
import { pageSpecSchema, profileSchema, type Profile } from '../schemas';

export type RunSession = {
  userId: string;
  tenantId: string;
  tenantName: string;
};

export class RunConflictError extends Error {}
export class RunRejectedError extends Error {}

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function createPersistedRun(
  session: RunSession,
  rawInput: unknown,
  idempotencyKey: string,
  signal?: AbortSignal,
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

      const [application] = await tx<
        Array<{
          company: string;
          role: string;
          raw_text: string;
          url: string | null;
          accent: string;
          revision: string;
        }>
      >`select company, role, raw_text, url, accent, revision
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
        raw_text, url, extraction_status
      ) values (
        ${opportunityId}, ${session.tenantId}, ${input.applicationId},
        ${input.applicationRevision}, ${application.company}, ${application.role},
        ${application.raw_text}, ${application.url}, 'ready'
      )`;
      await tx`insert into app.workflow_runs (
        id, tenant_id, opportunity_id, profile_id, source_profile_id,
        source_profile_revision, idempotency_key, state, status, token_budget,
        cost_budget_micros, deadline_at, input_hash
      ) values (
        ${runId}, ${session.tenantId}, ${opportunityId}, ${snapshot.id},
        ${living.id}, ${living.revision}, ${key}, 'research', 'running', 10000,
        0, now() + interval '1 hour', ${inputHash}
      )`;

      const state = await runAgentTeam({
        tenantId: session.tenantId,
        runId,
        profile: snapshot.profile,
        opportunity: {
          company: application.company,
          role: application.role,
          description: application.raw_text,
          ...(application.url ? { url: application.url } : {}),
          accent: application.accent,
        },
        provider: new FakeAgentProvider(),
        tokenBudget: 10_000,
        costBudgetMicros: 0,
        maxRevisions: 3,
        signal,
      });
      if (state.usage.costMicros !== 0)
        throw new RunRejectedError('The local provider reported a cost.');

      await persistState(tx, session, inputHash, state);
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
      return readRunProjection(tx, session.tenantId, runId);
    });
  } finally {
    await sql.end();
  }
}

export async function decideReviewIssue(
  session: RunSession,
  rawRunId: string,
  rawInput: unknown,
  idempotencyKey: string,
  signal?: AbortSignal,
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

      const [existingIssue] = await tx<
        Array<StoredReviewDecision>
      >`select id, workflow_run_id, page_spec_id, review_id, issue_index, decision,
          corrected_run_id, input_hash
        from app.review_issue_decisions
        where tenant_id = ${session.tenantId} and review_id = ${review.id}
          and issue_index = ${input.issueIndex}`;
      if (existingIssue) {
        if (existingIssue.input_hash !== inputHash)
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

      const decisionId = randomUUID();
      let correctedRunId: string | undefined;
      if (input.decision === 'correct') {
        const correction = correctionConstraint(issue);
        const [profileRow] = await tx<
          Array<{ id: string; name: string; headline: string }>
        >`select id, name, headline from app.profiles
          where tenant_id = ${session.tenantId} and id = ${run.profile_id}`;
        const [opportunity] = await tx<
          Array<{
            company: string;
            role: string;
            raw_text: string | null;
            url: string | null;
          }>
        >`select company, role, raw_text, url from app.opportunities
          where tenant_id = ${session.tenantId} and id = ${run.opportunity_id}`;
        if (!profileRow || !opportunity?.raw_text)
          throw new RunRejectedError('Correction input is unavailable.');
        const profile = await readProfileGraph(
          tx,
          session.tenantId,
          profileRow,
        );
        const currentSpec = pageSpecSchema.parse(pageSpec.spec);
        correctedRunId = randomUUID();
        await tx`insert into app.workflow_runs (
          id, tenant_id, opportunity_id, profile_id, source_profile_id,
          source_profile_revision, state, status, token_budget,
          cost_budget_micros, deadline_at, input_hash
        ) values (
          ${correctedRunId}, ${session.tenantId}, ${run.opportunity_id},
          ${run.profile_id}, ${run.source_profile_id},
          ${run.source_profile_revision}, 'research', 'running', 10000, 0,
          now() + interval '1 hour', ${inputHash}
        )`;
        const correctedState = await runAgentTeam({
          tenantId: session.tenantId,
          runId: correctedRunId,
          profile,
          opportunity: {
            company: opportunity.company,
            role: opportunity.role,
            description: opportunity.raw_text,
            ...(opportunity.url ? { url: opportunity.url } : {}),
            accent: currentSpec.company.accent,
          },
          provider: new FakeAgentProvider(),
          tokenBudget: 10_000,
          costBudgetMicros: 0,
          maxRevisions: 3,
          correction,
          signal,
        });
        if (
          correctedState.status !== 'awaiting_approval' ||
          correctedState.reviews.length !== 3 ||
          correctedState.reviews.some((item) => !item.passed)
        )
          throw new RunRejectedError(
            'The local correction did not pass real reviews.',
          );
        await persistState(tx, session, inputHash, correctedState);
      }

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
      await authorize(tx, session, 'career_worker');
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
      await authorize(tx, session, 'career_app');
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

async function persistState(
  tx: postgres.TransactionSql,
  session: RunSession,
  inputHash: string,
  state: AgentRunState,
) {
  const artifactIds = new Map<string, string>();
  const pageSpecIds = new Map<number, string>();
  await authorize(tx, session, 'career_worker');
  for (const artifact of state.artifacts) {
    const artifactId = randomUUID();
    artifactIds.set(artifact.id, artifactId);
    await tx`insert into app.artifacts (
      id, tenant_id, workflow_run_id, kind, version, schema_version, body,
      created_by
    ) values (
      ${artifactId}, ${session.tenantId}, ${state.runId}, ${artifact.kind},
      ${artifact.version}, 1, ${tx.json(JSON.parse(JSON.stringify(artifact.body)))},
      ${toDatabaseActor(artifact.createdBy)}
    )`;
    if (artifact.kind !== 'page_spec') continue;
    const spec = pageSpecSchema.parse(artifact.body);
    const pageSpecId = randomUUID();
    pageSpecIds.set(artifact.version, pageSpecId);
    await tx`insert into app.page_specs (
      id, tenant_id, workflow_run_id, version, spec, input_hash
    ) values (
      ${pageSpecId}, ${session.tenantId}, ${state.runId}, ${artifact.version},
      ${tx.json(spec)}, ${inputHash}
    )`;
    const claimIds = new Set(
      spec.blocks.flatMap((block) =>
        'claimIds' in block ? block.claimIds : [],
      ),
    );
    for (const claimId of claimIds)
      await tx`insert into app.page_spec_claims (
        tenant_id, page_spec_id, claim_id
      ) values (${session.tenantId}, ${pageSpecId}, ${claimId})`;
  }

  for (const event of state.events) {
    const artifactId = event.artifactId
      ? artifactIds.get(event.artifactId)
      : undefined;
    await tx`insert into app.workflow_events (
      tenant_id, workflow_run_id, actor, event_type, summary, payload
    ) values (
      ${session.tenantId}, ${state.runId}, ${toDatabaseActor(event.actor)},
      ${event.type}, ${event.summary}, ${tx.json({
        ...(artifactId ? { artifactId } : {}),
        costMicros: event.costMicros,
      })}
    )`;
  }

  await authorize(tx, session, 'career_reviewer');
  for (const artifact of state.artifacts) {
    if (artifact.kind !== 'review') continue;
    const pageSpecId = pageSpecIds.get(artifact.version);
    if (!pageSpecId)
      throw new RunRejectedError('Review PageSpec mapping failed.');
    const [pageSpec] = await tx<
      { spec_hash: string }[]
    >`select spec_hash from app.page_specs
      where tenant_id = ${session.tenantId} and id = ${pageSpecId}`;
    if (!pageSpec)
      throw new RunRejectedError('Review PageSpec was not persisted.');
    for (const review of reviewArtifactSchema(artifact.body)) {
      const issues = state.issues
        .filter(
          (issue) =>
            issue.openedAtVersion === artifact.version &&
            issue.reviewer === review.reviewer,
        )
        .map((issue) => ({
          section: issue.section,
          message: issue.message,
          blocking: issue.blocking,
        }));
      await tx`insert into app.reviews (
        tenant_id, page_spec_id, reviewer, verdict, issues, page_spec_hash
      ) values (
        ${session.tenantId}, ${pageSpecId},
        ${review.reviewer === 'hiring-manager' ? 'hiring_manager' : review.reviewer},
        ${review.passed ? 'pass' : 'changes_required'},
        ${tx.json(issues)}, ${pageSpec.spec_hash}
      )`;
    }
  }

  await authorize(tx, session, 'career_app');
  await tx`update app.workflow_runs set
    state = ${state.stage}, status = ${state.status},
    revision_count = ${state.revision},
    used_tokens = ${state.usage.inputTokens + state.usage.outputTokens},
    used_cost_micros = ${state.usage.costMicros},
    reserved_tokens = 0, reserved_cost_micros = 0
    where tenant_id = ${session.tenantId} and id = ${state.runId}`;
}

async function readRunProjection(
  tx: postgres.TransactionSql,
  tenantId: string,
  runId: string,
): Promise<PersistedRun | undefined> {
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
      used_cost_micros
    from app.workflow_runs where tenant_id = ${tenantId} and id = ${runId}`;
  if (!run) return;
  const [snapshot] = await tx<
    Array<{ id: string; name: string; headline: string }>
  >`select id, name, headline from app.profiles
    where tenant_id = ${tenantId} and id = ${run.profile_id}`;
  if (!snapshot) throw new RunRejectedError('Run profile snapshot is missing.');
  const profile = await readProfileGraph(tx, tenantId, snapshot);
  const [pageSpec] = await tx<
    Array<{ id: string; spec: unknown }>
  >`select id, spec from app.page_specs
    where tenant_id = ${tenantId} and workflow_run_id = ${runId}
    order by version desc limit 1`;
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
  const events = await tx<
    Array<{
      actor: string;
      event_type: string;
      summary: string;
      payload: { artifactId?: unknown; costMicros?: unknown };
    }>
  >`select actor, event_type, summary, payload from app.workflow_events
    where tenant_id = ${tenantId} and workflow_run_id = ${runId}
    order by id`;

  return persistedRunSchema.parse({
    runId: run.id,
    status: run.status,
    stage: run.state,
    revision: run.revision_count,
    usedTokens: run.used_tokens,
    usedCostMicros: Number(run.used_cost_micros),
    profile,
    ...(pageSpec ? { spec: pageSpecSchema.parse(pageSpec.spec) } : {}),
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

async function authorize(
  tx: postgres.TransactionSql,
  session: RunSession,
  role: 'career_app' | 'career_worker' | 'career_reviewer',
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

function reviewArtifactSchema(value: unknown) {
  return runtimeReviewSchema.array().parse(value);
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
        },
      ];
    return [];
  });
}

function correctionConstraint(issue: { message: string; section?: string }) {
  if (
    issue.section !== 'hero.thesis' ||
    !/role-specific operating outcome/i.test(issue.message)
  )
    throw new RunRejectedError(
      'The local provider cannot apply this correction honestly.',
    );
  return {
    section: 'hero.thesis' as const,
    intent: 'foreground_role_specific_operating_outcome' as const,
    feedback: issue.message,
  };
}

function toDatabaseActor(actor: string) {
  return actor.replaceAll('-', '_');
}

function fromDatabaseActor(actor: string) {
  return actor.replaceAll('_', '-');
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
