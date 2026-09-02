import { z } from 'zod';
import {
  pageSpecSchema,
  profileSchema,
  type PageSpec,
  type Profile,
  type Review,
} from './schemas';
import {
  buildPageSpec,
  buildStrategy,
  type Opportunity,
  type Strategy,
} from './workflow';

const roleSchema = z.enum([
  'company-researcher',
  'evidence-archivist',
  'recruiter-strategist',
  'page-composer',
  'recruiter',
  'hiring-manager',
  'fact-checker',
]);
const runStatusSchema = z.enum([
  'running',
  'awaiting_approval',
  'completed',
  'blocked',
  'budget_exhausted',
  'cancelled',
  'failed',
]);
const issueSchema = z.object({
  reviewer: z.enum(['recruiter', 'hiring-manager', 'factuality']),
  section: z.string().min(1),
  message: z.string().min(1),
  blocking: z.boolean(),
  openedAtVersion: z.number().int().positive(),
  resolvedAtVersion: z.number().int().positive().optional(),
});
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  reservedTokens: z.number().int().nonnegative(),
  reservedCostMicros: z.number().int().nonnegative(),
});
const eventSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  actor: z.union([roleSchema, z.literal('system'), z.literal('human')]),
  type: z.enum([
    'step_started',
    'tool_called',
    'artifact_written',
    'issue_opened',
    'issue_resolved',
    'paused',
    'resumed',
    'cancelled',
    'failed',
    'completed',
  ]),
  summary: z.string().min(1),
  artifactId: z.string().optional(),
  costMicros: z.number().int().nonnegative(),
});
const artifactSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum([
    'research',
    'evidence_archive',
    'strategy',
    'page_spec',
    'review',
  ]),
  version: z.number().int().positive(),
  createdBy: roleSchema,
  body: z.unknown(),
});

const runStateSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  status: runStatusSchema,
  stage: z.string().min(1),
  revision: z.number().int().min(0).max(3),
  maxRevisions: z.number().int().min(0).max(3),
  tokenBudget: z.number().int().positive(),
  costBudgetMicros: z.number().int().nonnegative(),
  usage: usageSchema,
  artifacts: z.array(artifactSchema),
  issues: z.array(issueSchema),
  events: z.array(eventSchema),
  reviews: z.array(
    z.object({
      reviewer: z.enum(['recruiter', 'hiring-manager', 'factuality']),
      passed: z.boolean(),
      findings: z.array(z.string()),
    }),
  ),
  approved: z.boolean(),
});

export type AgentRole = z.infer<typeof roleSchema>;
export type AgentRunState = z.infer<typeof runStateSchema>;
export type AgentIssue = z.infer<typeof issueSchema>;
export type AgentUsage = z.infer<typeof usageSchema>;

const researchSchema = z
  .object({
    company: z.string(),
    role: z.string(),
    signals: z.array(z.string()),
    sources: z.array(z.string()),
  })
  .strict();
const archiveSchema = z
  .object({
    eligibleClaimIds: z.array(z.string()),
    excludedClaimIds: z.array(z.string()),
    provenanceChecked: z.literal(true),
  })
  .strict();
const strategySchema = z
  .object({
    thesis: z.string(),
    selectedClaimIds: z.array(z.string()).min(1),
    gaps: z.array(z.string()),
    matches: z.array(
      z.object({
        requirement: z.string(),
        claimId: z.string().optional(),
        evidenceIds: z.array(z.string()),
        gap: z.string().optional(),
      }),
    ),
  })
  .strict();
const reviewSchema = z
  .object({
    passed: z.boolean(),
    issues: z.array(
      z.object({
        section: z.string(),
        message: z.string(),
        blocking: z.boolean(),
      }),
    ),
  })
  .strict();

type ToolName =
  | 'read_offer'
  | 'list_eligible_claims'
  | 'read_strategy'
  | 'read_page_spec'
  | 'read_provenance';
type ModelOutput =
  | z.infer<typeof researchSchema>
  | z.infer<typeof archiveSchema>
  | Strategy
  | PageSpec
  | z.infer<typeof reviewSchema>;
type GenerateRequest<T extends ModelOutput> = {
  role: AgentRole;
  tenantId: string;
  runId: string;
  version: number;
  schema: z.ZodType<T>;
  input: unknown;
  tools: Partial<Record<ToolName, () => unknown>>;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

type Reservation = { tokens: number; costMicros: number };

export interface AgentProvider {
  readonly name: string;
  reserve(input: unknown, maxOutputTokens: number): Reservation;
  generate<T extends ModelOutput>(
    request: GenerateRequest<T>,
  ): Promise<{ output: T; usage: AgentUsage; toolCalls: ToolName[] }>;
}

type FakeOptions = {
  invalidRole?: AgentRole;
  blockFactCheck?: boolean;
  requireRevision?: boolean;
};

export class FakeAgentProvider implements AgentProvider {
  readonly name = 'fake';
  constructor(
    private readonly options: FakeOptions = { requireRevision: true },
  ) {}

  reserve() {
    return { tokens: 60, costMicros: 0 };
  }

  async generate<T extends ModelOutput>(request: GenerateRequest<T>) {
    if (request.signal?.aborted)
      throw new DOMException('Run cancelled', 'AbortError');
    const toolCalls = Object.keys(request.tools) as ToolName[];
    const toolData = Object.fromEntries(
      toolCalls.map((name) => [name, request.tools[name]!()]),
    );
    if (this.options.invalidRole === request.role)
      return {
        output: request.schema.parse({ invalid: true }),
        usage: fakeUsage(),
        toolCalls,
      };

    let output: unknown;
    switch (request.role) {
      case 'company-researcher': {
        const opportunity = toolData.read_offer as Opportunity;
        output = {
          company: opportunity.company,
          role: opportunity.role,
          signals: [opportunity.description],
          sources: ['pasted-offer'],
        };
        break;
      }
      case 'evidence-archivist': {
        const profile = toolData.list_eligible_claims as Profile;
        output = {
          eligibleClaimIds: profile.claims
            .filter(
              (claim) =>
                claim.allowedUses.includes('application') &&
                claim.sensitivity !== 'restricted',
            )
            .map((claim) => claim.id),
          excludedClaimIds: profile.claims
            .filter(
              (claim) =>
                !claim.allowedUses.includes('application') ||
                claim.sensitivity === 'restricted',
            )
            .map((claim) => claim.id),
          provenanceChecked: true,
        };
        break;
      }
      case 'recruiter-strategist':
        output = request.input;
        break;
      case 'page-composer':
        output = request.input;
        break;
      case 'recruiter':
        output = { passed: true, issues: [] };
        break;
      case 'hiring-manager':
        output =
          this.options.requireRevision && request.version === 1
            ? {
                passed: false,
                issues: [
                  {
                    section: 'hero.thesis',
                    message: 'State the role-specific operating outcome.',
                    blocking: false,
                  },
                ],
              }
            : { passed: true, issues: [] };
        break;
      case 'fact-checker':
        output = this.options.blockFactCheck
          ? {
              passed: false,
              issues: [
                {
                  section: 'blocks.evidence',
                  message:
                    'A selected claim cannot be resolved to approved evidence.',
                  blocking: true,
                },
              ],
            }
          : { passed: true, issues: [] };
        break;
    }
    return {
      output: request.schema.parse(output),
      usage: fakeUsage(),
      toolCalls,
    };
  }
}

export class OpenAICompatibleProvider implements AgentProvider {
  readonly name = 'openai-compatible';
  constructor(
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
      inputCostPerMillion: number;
      outputCostPerMillion: number;
    },
  ) {}

  reserve(input: unknown, maxOutputTokens: number) {
    const inputTokens =
      new TextEncoder().encode(JSON.stringify(input)).length + 256;
    return {
      tokens: inputTokens + maxOutputTokens,
      costMicros:
        Math.ceil((inputTokens * this.config.inputCostPerMillion) / 1_000_000) +
        Math.ceil(
          (maxOutputTokens * this.config.outputCostPerMillion) / 1_000_000,
        ),
    };
  }

  async generate<T extends ModelOutput>(request: GenerateRequest<T>) {
    const started = performance.now();
    const response = await fetch(
      `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        signal: request.signal,
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: request.maxOutputTokens,
          messages: [
            {
              role: 'system',
              content: `Act only as ${request.role}. Return JSON matching the supplied schema.`,
            },
            { role: 'user', content: JSON.stringify(request.input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.role.replaceAll('-', '_'),
              strict: true,
              schema: z.toJSONSchema(request.schema),
            },
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Model provider returned ${response.status}.`);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content)
      throw new Error('Model provider returned no structured output.');
    const inputTokens = body.usage?.prompt_tokens;
    const outputTokens = body.usage?.completion_tokens;
    if (inputTokens === undefined || outputTokens === undefined)
      throw new Error('Model provider omitted authoritative usage.');
    return {
      output: request.schema.parse(JSON.parse(content)),
      usage: {
        inputTokens,
        outputTokens,
        costMicros:
          Math.ceil(
            (inputTokens * this.config.inputCostPerMillion) / 1_000_000,
          ) +
          Math.ceil(
            (outputTokens * this.config.outputCostPerMillion) / 1_000_000,
          ),
        latencyMs: Math.round(performance.now() - started),
        reservedTokens: 0,
        reservedCostMicros: 0,
      },
      toolCalls: [],
    };
  }
}

export function configuredAgentProvider(
  env: Record<string, string | undefined> = process.env,
): AgentProvider {
  if (env.CAREER_OS_AGENT_PROVIDER !== 'openai-compatible')
    return new FakeAgentProvider();
  if (env.CAREER_OS_ALLOW_NETWORK_PROVIDER !== 'true')
    throw new Error('Network providers are disabled by default.');
  const baseUrl = env.CAREER_OS_OPENAI_BASE_URL;
  const apiKey = env.CAREER_OS_OPENAI_API_KEY;
  const model = env.CAREER_OS_OPENAI_MODEL;
  const inputCostPerMillion = Number(
    env.CAREER_OS_INPUT_COST_MICROS_PER_MILLION,
  );
  const outputCostPerMillion = Number(
    env.CAREER_OS_OUTPUT_COST_MICROS_PER_MILLION,
  );
  if (
    !baseUrl ||
    !apiKey ||
    !model ||
    !Number.isFinite(inputCostPerMillion) ||
    !Number.isFinite(outputCostPerMillion)
  )
    throw new Error(
      'The openai-compatible provider requires URL, key, model and explicit pricing.',
    );
  const host = new URL(baseUrl).hostname;
  if (
    env.CAREER_OS_ALLOW_REMOTE_PROVIDER !== 'true' &&
    !['localhost', '127.0.0.1', '::1'].includes(host)
  )
    throw new Error('Remote providers require explicit opt-in.');
  return new OpenAICompatibleProvider({
    baseUrl,
    apiKey,
    model,
    inputCostPerMillion,
    outputCostPerMillion,
  });
}

export async function runAgentTeam(input: {
  tenantId: string;
  runId: string;
  profile: Profile;
  opportunity: Opportunity;
  provider?: AgentProvider;
  tokenBudget?: number;
  costBudgetMicros?: number;
  maxRevisions?: number;
  signal?: AbortSignal;
}): Promise<AgentRunState> {
  const profile = profileSchema.parse(input.profile);
  const provider = input.provider ?? configuredAgentProvider();
  const state: AgentRunState = runStateSchema.parse({
    tenantId: input.tenantId,
    runId: input.runId,
    status: 'running',
    stage: 'research',
    revision: 0,
    maxRevisions: input.maxRevisions ?? 2,
    tokenBudget: input.tokenBudget ?? 10_000,
    costBudgetMicros: input.costBudgetMicros ?? 100_000,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
      latencyMs: 0,
      reservedTokens: 0,
      reservedCostMicros: 0,
    },
    artifacts: [],
    issues: [],
    events: [],
    reviews: [],
    approved: false,
  });

  try {
    const research = await step(
      state,
      provider,
      'company-researcher',
      researchSchema,
      input.opportunity,
      { read_offer: () => input.opportunity },
      input.signal,
    );
    writeArtifact(state, 'research', 'company-researcher', research.output, 1);
    const archive = await step(
      state,
      provider,
      'evidence-archivist',
      archiveSchema,
      { research: research.output },
      { list_eligible_claims: () => profile },
      input.signal,
    );
    writeArtifact(
      state,
      'evidence_archive',
      'evidence-archivist',
      archive.output,
      1,
    );
    const strategy = buildStrategy(profile, input.opportunity);
    const strategyResult = await step(
      state,
      provider,
      'recruiter-strategist',
      strategySchema,
      strategy,
      {
        read_offer: () => input.opportunity,
        list_eligible_claims: () => profile,
      },
      input.signal,
    );
    writeArtifact(
      state,
      'strategy',
      'recruiter-strategist',
      strategyResult.output,
      1,
    );

    let spec = buildPageSpec(profile, input.opportunity, strategyResult.output);
    while (true) {
      const version = state.revision + 1;
      state.stage = 'compose';
      if (version > 1)
        spec = reviseFailedSections(
          spec,
          state.issues.filter((issue) => !issue.resolvedAtVersion),
          version,
        );
      const composed = await step(
        state,
        provider,
        'page-composer',
        pageSpecSchema,
        spec,
        { read_strategy: () => strategyResult.output },
        input.signal,
      );
      spec = composed.output;
      writeArtifact(state, 'page_spec', 'page-composer', spec, version);

      state.stage = 'review';
      const recruiterInput = { spec };
      const hiringInput = { spec, strategy: strategyResult.output };
      const factInput = { spec, provenance: profile };
      preflight(state, provider, [recruiterInput, hiringInput, factInput]);
      const [recruiter, hiring, factuality] = await Promise.all([
        step(
          state,
          provider,
          'recruiter',
          reviewSchema,
          recruiterInput,
          { read_page_spec: () => spec },
          input.signal,
        ),
        step(
          state,
          provider,
          'hiring-manager',
          reviewSchema,
          hiringInput,
          {
            read_page_spec: () => spec,
            read_strategy: () => strategyResult.output,
          },
          input.signal,
        ),
        step(
          state,
          provider,
          'fact-checker',
          reviewSchema,
          factInput,
          { read_page_spec: () => spec, read_provenance: () => profile },
          input.signal,
        ),
      ]);
      state.reviews = [
        toReview('recruiter', recruiter.output),
        toReview('hiring-manager', hiring.output),
        toReview('factuality', factuality.output),
      ];
      const currentIssues = [
        ...openIssues(state, 'recruiter', recruiter.output, version),
        ...openIssues(state, 'hiring-manager', hiring.output, version),
        ...openIssues(state, 'factuality', factuality.output, version),
      ];
      writeArtifact(state, 'review', 'fact-checker', state.reviews, version);
      if (currentIssues.some((issue) => issue.blocking)) {
        state.status = 'blocked';
        state.stage = 'fact_check_blocked';
        break;
      }
      if (currentIssues.length === 0) {
        state.status = 'awaiting_approval';
        state.stage = 'human_approval';
        event(
          state,
          'system',
          'paused',
          'All reviews passed; human approval required.',
        );
        break;
      }
      if (state.revision >= state.maxRevisions) {
        state.status = 'blocked';
        state.stage = 'revision_limit';
        break;
      }
      state.revision += 1;
      for (const issue of currentIssues)
        issue.resolvedAtVersion = state.revision + 1;
      event(
        state,
        'page-composer',
        'issue_resolved',
        `Targeted revision ${state.revision + 1} scheduled for ${currentIssues.map((issue) => issue.section).join(', ')}.`,
      );
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      state.status = 'cancelled';
      state.stage = 'cancelled';
      event(
        state,
        'system',
        'cancelled',
        'Run cancelled before the next durable step.',
      );
    } else if (error instanceof BudgetExceededError) {
      state.status = 'budget_exhausted';
      state.stage = 'budget_exhausted';
      event(state, 'system', 'paused', error.message);
    } else {
      state.status = 'failed';
      state.stage = 'invalid_output';
      event(
        state,
        'system',
        'failed',
        error instanceof Error ? error.message : 'Unknown agent failure.',
      );
    }
  }
  return runStateSchema.parse(state);
}

export function serializeRun(state: AgentRunState) {
  return JSON.stringify(runStateSchema.parse(state));
}

export function resumeRun(serialized: string) {
  return runStateSchema.parse(JSON.parse(serialized));
}

export function approveRun(stateInput: AgentRunState) {
  const state = structuredClone(runStateSchema.parse(stateInput));
  if (
    state.status !== 'awaiting_approval' ||
    state.reviews.length !== 3 ||
    state.reviews.some((review) => !review.passed)
  )
    throw new Error('Run is not eligible for human approval.');
  state.approved = true;
  state.status = 'completed';
  state.stage = 'publication_ready';
  event(state, 'human', 'resumed', 'Human approved the reviewed PageSpec.');
  event(state, 'system', 'completed', 'Run is ready for private publication.');
  return runStateSchema.parse(state);
}

export function latestPageSpec(state: AgentRunState) {
  const artifact = state.artifacts
    .filter((item) => item.kind === 'page_spec')
    .at(-1);
  return artifact ? pageSpecSchema.parse(artifact.body) : undefined;
}

async function step<T extends ModelOutput>(
  state: AgentRunState,
  provider: AgentProvider,
  role: AgentRole,
  schema: z.ZodType<T>,
  input: unknown,
  tools: GenerateRequest<T>['tools'],
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new DOMException('Run cancelled', 'AbortError');
  const maxOutputTokens = 512;
  const reservation = provider.reserve(input, maxOutputTokens);
  reserve(state, reservation, role);
  event(state, role, 'step_started', `${role} started.`);
  try {
    const result = await provider.generate({
      role,
      tenantId: state.tenantId,
      runId: state.runId,
      version: state.revision + 1,
      schema,
      input,
      tools,
      maxOutputTokens,
      signal,
    });
    if (
      result.usage.inputTokens + result.usage.outputTokens >
        reservation.tokens ||
      result.usage.costMicros > reservation.costMicros
    )
      throw new Error(`Provider usage exceeded its reservation for ${role}.`);
    state.usage.inputTokens += result.usage.inputTokens;
    state.usage.outputTokens += result.usage.outputTokens;
    state.usage.costMicros += result.usage.costMicros;
    state.usage.latencyMs += result.usage.latencyMs;
    for (const tool of result.toolCalls)
      event(state, role, 'tool_called', `${role} called ${tool}.`);
    return result;
  } finally {
    state.usage.reservedTokens -= reservation.tokens;
    state.usage.reservedCostMicros -= reservation.costMicros;
  }
}

function preflight(
  state: AgentRunState,
  provider: AgentProvider,
  inputs: unknown[],
) {
  const total = inputs
    .map((input) => provider.reserve(input, 512))
    .reduce(
      (sum, item) => ({
        tokens: sum.tokens + item.tokens,
        costMicros: sum.costMicros + item.costMicros,
      }),
      { tokens: 0, costMicros: 0 },
    );
  assertBudget(state, total, 'parallel review');
}

function reserve(
  state: AgentRunState,
  reservation: Reservation,
  operation: string,
) {
  assertBudget(state, reservation, operation);
  state.usage.reservedTokens += reservation.tokens;
  state.usage.reservedCostMicros += reservation.costMicros;
}

function assertBudget(
  state: AgentRunState,
  reservation: Reservation,
  operation: string,
) {
  if (
    state.usage.inputTokens +
      state.usage.outputTokens +
      state.usage.reservedTokens +
      reservation.tokens >
      state.tokenBudget ||
    state.usage.costMicros +
      state.usage.reservedCostMicros +
      reservation.costMicros >
      state.costBudgetMicros
  )
    throw new BudgetExceededError(
      `Budget stopped the run before ${operation}.`,
    );
}

function writeArtifact(
  state: AgentRunState,
  kind: AgentRunState['artifacts'][number]['kind'],
  createdBy: AgentRole,
  body: unknown,
  version: number,
) {
  const artifactId = `${kind}-v${version}`;
  state.artifacts.push({
    id: artifactId,
    tenantId: state.tenantId,
    runId: state.runId,
    kind,
    version,
    createdBy,
    body,
  });
  event(
    state,
    createdBy,
    'artifact_written',
    `${createdBy} wrote ${artifactId}.`,
    artifactId,
  );
}

function openIssues(
  state: AgentRunState,
  reviewer: Review['reviewer'],
  result: z.infer<typeof reviewSchema>,
  version: number,
) {
  return result.issues.map((issue) => {
    const opened: AgentIssue = { reviewer, ...issue, openedAtVersion: version };
    state.issues.push(opened);
    event(
      state,
      reviewer === 'factuality' ? 'fact-checker' : reviewer,
      'issue_opened',
      issue.message,
    );
    return opened;
  });
}

function toReview(
  reviewer: Review['reviewer'],
  result: z.infer<typeof reviewSchema>,
): Review {
  return {
    reviewer,
    passed: result.passed,
    findings: result.issues.map((issue) => issue.message),
  };
}

function reviseFailedSections(
  spec: PageSpec,
  issues: AgentIssue[],
  version: number,
): PageSpec {
  if (!issues.every((issue) => issue.section === 'hero.thesis')) return spec;
  return pageSpecSchema.parse({
    ...spec,
    hero: {
      ...spec.hero,
      thesis: `${spec.hero.thesis} Revision ${version} foregrounds the operating outcome required by this role.`,
    },
  });
}

function event(
  state: AgentRunState,
  actor: AgentRunState['events'][number]['actor'],
  type: AgentRunState['events'][number]['type'],
  summary: string,
  artifactId?: string,
) {
  state.events.push({
    tenantId: state.tenantId,
    runId: state.runId,
    actor,
    type,
    summary,
    artifactId,
    costMicros: state.usage.costMicros,
  });
}

function fakeUsage(): AgentUsage {
  return {
    inputTokens: 40,
    outputTokens: 20,
    costMicros: 0,
    latencyMs: 0,
    reservedTokens: 0,
    reservedCostMicros: 0,
  };
}

class BudgetExceededError extends Error {}
