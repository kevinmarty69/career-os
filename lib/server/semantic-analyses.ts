import 'server-only';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { z } from 'zod';
import type { JobMatch } from '../hard-match';
import {
  prepareSemanticAnalysisInput,
  semanticAnalysisArtifactSchema,
  type SemanticAnalysisInput,
} from '../semantic-match';
import {
  buildSemanticProofIndex,
  persistedSemanticAnalysisSchema,
  semanticAnalysisResultSchema,
  type SemanticAnalysisResult,
} from '../semantic-analysis-contract';
import { searchProfileSchema } from '../search-profile';
import { LocalModelClientError } from './local-openai-client';
import {
  LocalOpenAISemanticMatchClient,
  type LocalSemanticMatchResult,
} from './local-openai-semantic-client';
import { createJobMatch } from './job-matches';
import type { PublicationSession } from './publications';

export class SemanticAnalysisModelNotConfiguredError extends Error {}
export class SemanticAnalysisInputUnavailableError extends Error {}

type SemanticClient = Pick<LocalOpenAISemanticMatchClient, 'generate'>;

type PreparationRow = {
  match_id: string;
  discovered_job_id: string;
  job_revision: string;
  company: string | null;
  role: string | null;
  description: string | null;
  search_profile_id: string;
  search_profile_revision: string;
  search_profile_snapshot: unknown;
  living_profile_id: string;
  living_profile_revision: string;
  profile_snapshot: unknown;
  source_record_id: string | null;
  source_url: string | null;
  observed_at: Date | null;
  content_sha256: string | null;
};

type AnalysisRow = {
  id: string;
  version: string;
  job_match_id: string;
  discovered_job_id: string;
  job_revision: string;
  search_profile_id: string;
  search_profile_revision: string;
  living_profile_id: string;
  living_profile_revision: string;
  input_hash: string;
  input: unknown;
  artifact: unknown;
  provider: string;
  model: string;
  provider_request_id: string | null;
  reserved_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cost_budget_micros: string;
  cost_micros: string;
  latency_ms: number;
  created_at: Date;
};

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  return postgres(url, { max: 5, idle_timeout: 5 });
}

export async function runSemanticAnalysis(
  session: PublicationSession,
  rawJobId: string,
  rawSearchProfileId: string,
  client?: SemanticClient,
): Promise<SemanticAnalysisResult> {
  const match = await createJobMatch(session, rawJobId, {
    searchProfileId: rawSearchProfileId,
  });
  if (!match.evaluation.eligibleForPriority)
    return semanticAnalysisResultSchema.parse({
      status: 'blocked',
      reason: 'hard_constraints',
      match,
    });
  if (!match.livingProfile)
    throw new SemanticAnalysisInputUnavailableError(
      'A living profile revision is required.',
    );
  return {
    status: 'completed',
    analysis: await persistSemanticAnalysis(
      session,
      { ...match, livingProfile: match.livingProfile },
      client,
    ),
  };
}

export async function readLatestSemanticAnalysis(
  session: PublicationSession,
  rawJobId: string,
  rawSearchProfileId: string,
) {
  const jobId = z.string().uuid().parse(rawJobId);
  const searchProfileId = z.string().uuid().parse(rawSearchProfileId);
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [row] = await tx<AnalysisRow[]>`select ${analysisColumns(tx)}
        from app.semantic_analyses where tenant_id = ${session.tenantId}
          and discovered_job_id = ${jobId}
          and search_profile_id = ${searchProfileId}
        order by created_at desc, id desc limit 1`;
      return row
        ? semanticAnalysisResultSchema.parse({
            status: 'completed',
            analysis: projection(row),
          })
        : undefined;
    });
  } finally {
    await sql.end();
  }
}

async function persistSemanticAnalysis(
  session: PublicationSession,
  match: JobMatch & { livingProfile: NonNullable<JobMatch['livingProfile']> },
  client?: SemanticClient,
) {
  const sql = database();
  try {
    return await sql.begin(async (tx) => {
      await authorize(tx, session);
      const [row] = await tx<PreparationRow[]>`
        select matched.id match_id, matched.discovered_job_id,
          matched.job_revision, job.company, job.role, job.description,
          matched.search_profile_id, matched.search_profile_revision,
          matched.search_profile_snapshot, matched.living_profile_id,
          matched.living_profile_revision, history.snapshot profile_snapshot,
          source.source_record_id, source.source_url, source.observed_at,
          source.content_sha256
        from app.job_matches matched
        join app.discovered_jobs job
          on job.tenant_id = matched.tenant_id
          and job.id = matched.discovered_job_id
          and job.revision = matched.job_revision
        join app.profile_revisions history
          on history.tenant_id = matched.tenant_id
          and history.profile_id = matched.living_profile_id
          and history.revision = matched.living_profile_revision
        left join lateral (
          select observation.source_record_id,
            record.final_url source_url, observation.observed_at,
            observation.content_sha256
          from app.job_observations observation
          join app.job_source_records record
            on record.tenant_id = observation.tenant_id
            and record.id = observation.source_record_id
          where observation.tenant_id = matched.tenant_id
            and observation.discovered_job_id = matched.discovered_job_id
            and observation.change_kind <> 'unchanged'
          order by observation.observed_at desc, observation.id desc limit 1
        ) source on true
        where matched.tenant_id = ${session.tenantId}
          and matched.id = ${match.matchId}
          and matched.decision = 'priority'
          and matched.discovered_job_id = ${match.opportunityId}
          and matched.job_revision = ${match.jobRevision}
          and matched.search_profile_id = ${match.searchProfileId}
          and matched.search_profile_revision = ${match.searchProfileRevision}
          and matched.living_profile_id = ${match.livingProfile.profileId}
          and matched.living_profile_revision = ${match.livingProfile.revision}
        for share of job`;
      const input = preparation(row);
      const inputHash = createHash('sha256')
        .update(JSON.stringify({ jobMatchId: match.matchId, input }))
        .digest('hex');
      await tx`select pg_advisory_xact_lock(hashtextextended(
        ${`semantic-analysis:${session.tenantId}:${inputHash}`}, 0
      ))`;
      const [existing] = await tx<AnalysisRow[]>`select ${analysisColumns(tx)}
        from app.semantic_analyses where tenant_id = ${session.tenantId}
          and input_hash = ${inputHash}`;
      if (existing) return projection(existing);

      const generated = await (client ?? configuredClient()).generate(input);
      validateGenerated(generated, input);
      const [created] = await tx<
        AnalysisRow[]
      >`insert into app.semantic_analyses (
        tenant_id, version, schema_version, job_match_id, discovered_job_id,
        job_revision, search_profile_id, search_profile_revision,
        living_profile_id, living_profile_revision, input_hash, input, artifact,
        provider, model, provider_request_id, reserved_tokens, input_tokens,
        output_tokens, cost_budget_micros, cost_micros, latency_ms
      ) values (
        ${session.tenantId}, 1, 1, ${match.matchId}, ${match.opportunityId},
        ${match.jobRevision}, ${match.searchProfileId},
        ${match.searchProfileRevision}, ${match.livingProfile.profileId},
        ${match.livingProfile.revision}, ${inputHash}, ${tx.json(input)},
        ${tx.json(generated.output)}, ${generated.provider}, ${generated.model},
        ${generated.providerRequestId ?? null}, ${generated.usage.reservedTokens},
        ${generated.usage.inputTokens}, ${generated.usage.outputTokens}, 0,
        ${generated.usage.costMicros}, ${generated.usage.latencyMs}
      ) returning ${analysisColumns(tx)}`;
      return projection(created);
    });
  } finally {
    await sql.end();
  }
}

function preparation(row: PreparationRow | undefined): SemanticAnalysisInput {
  if (
    !row?.description ||
    !row.source_record_id ||
    !row.source_url ||
    !row.observed_at ||
    !row.content_sha256
  )
    throw new SemanticAnalysisInputUnavailableError(
      'The exact semantic input is unavailable.',
    );
  const searchProfile = searchProfileSchema.parse(row.search_profile_snapshot);
  return prepareSemanticAnalysisInput({
    schemaVersion: 1,
    purpose: 'application',
    job: {
      opportunityId: row.discovered_job_id,
      revision: Number(row.job_revision),
      company: row.company,
      role: row.role,
      description: row.description,
      source: {
        sourceRecordId: row.source_record_id,
        url: row.source_url,
        fetchedAt: row.observed_at.toISOString(),
        contentSha256: row.content_sha256,
        trust: 'untrusted-data',
      },
    },
    softPreferences: searchProfile.softPreferences,
    livingProfile: {
      profileSnapshotId: row.living_profile_id,
      revision: Number(row.living_profile_revision),
      profile: row.profile_snapshot,
    },
  });
}

function validateGenerated(
  result: LocalSemanticMatchResult,
  input: SemanticAnalysisInput,
) {
  const artifact = semanticAnalysisArtifactSchema.parse(result.output);
  if (
    artifact.opportunityId !== input.job.opportunityId ||
    artifact.jobRevision !== input.job.revision ||
    artifact.profileSnapshotId !== input.profile.profileSnapshotId ||
    artifact.profileRevision !== input.profile.revision ||
    result.provider !== 'openai-compatible-local' ||
    result.usage.costMicros !== 0 ||
    result.usage.reservedCostMicros !== 0
  )
    throw new LocalModelClientError('INVALID_RESPONSE');
}

function configuredClient() {
  const baseUrl = process.env.CAREER_OS_LOCAL_MODEL_BASE_URL;
  const model = process.env.CAREER_OS_LOCAL_MODEL;
  if (!baseUrl || !model) throw new SemanticAnalysisModelNotConfiguredError();
  try {
    return new LocalOpenAISemanticMatchClient({
      baseUrl,
      apiKey: process.env.CAREER_OS_LOCAL_MODEL_API_KEY ?? 'local-only',
      model,
    });
  } catch (error) {
    if (error instanceof LocalModelClientError)
      throw new SemanticAnalysisModelNotConfiguredError();
    throw error;
  }
}

function projection(row: AnalysisRow) {
  const artifact = semanticAnalysisArtifactSchema.parse(row.artifact);
  const result = persistedSemanticAnalysisSchema.parse({
    analysisId: row.id,
    version: Number(row.version),
    jobMatchId: row.job_match_id,
    opportunityId: row.discovered_job_id,
    jobRevision: Number(row.job_revision),
    searchProfileId: row.search_profile_id,
    searchProfileRevision: Number(row.search_profile_revision),
    livingProfile: {
      profileId: row.living_profile_id,
      revision: Number(row.living_profile_revision),
    },
    inputHash: row.input_hash,
    artifact,
    proofIndex: buildSemanticProofIndex(row.input, artifact),
    usage: {
      provider: row.provider,
      model: row.model,
      ...(row.provider_request_id
        ? { providerRequestId: row.provider_request_id }
        : {}),
      reservedTokens: row.reserved_tokens,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costBudgetMicros: Number(row.cost_budget_micros),
      costMicros: Number(row.cost_micros),
      latencyMs: row.latency_ms,
    },
    createdAt: row.created_at.toISOString(),
  });
  if (
    artifact.opportunityId !== result.opportunityId ||
    artifact.jobRevision !== result.jobRevision ||
    artifact.profileSnapshotId !== result.livingProfile.profileId ||
    artifact.profileRevision !== result.livingProfile.revision
  )
    throw new Error('Stored semantic analysis lineage is inconsistent.');
  return result;
}

function analysisColumns(tx: postgres.TransactionSql) {
  return tx`id, version, job_match_id, discovered_job_id, job_revision,
    search_profile_id, search_profile_revision, living_profile_id,
    living_profile_revision, input_hash, input, artifact, provider, model,
    provider_request_id, reserved_tokens, input_tokens, output_tokens,
    cost_budget_micros, cost_micros, latency_ms, created_at`;
}

async function authorize(
  tx: postgres.TransactionSql,
  session: PublicationSession,
) {
  await tx`select set_config('request.jwt.claim.sub', ${session.userId}, true),
    set_config('request.jwt.claim.tenant_id', ${session.tenantId}, true)`;
  await tx.unsafe('set local role career_app');
}
