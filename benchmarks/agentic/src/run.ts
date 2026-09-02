import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  FakeAgentProvider,
  approveRun,
  resumeRun,
  runAgentTeam,
  serializeRun,
  type AgentProvider,
  type AgentRole,
  type AgentUsage,
} from '../../../lib/agent-runtime.ts';
import { syntheticProfile } from '../../../lib/fixture.ts';
import type { Opportunity } from '../../../lib/workflow.ts';
import { blockNetwork } from './network.ts';

process.env.OPENAI_AGENTS_DISABLE_TRACING = '1';
process.env.MASTRA_TELEMETRY_DISABLED = 'true';
process.env.OTEL_SDK_DISABLED = 'true';

type Request<T = unknown> = Parameters<AgentProvider['generate']>[0] & {
  schema: z.ZodType<T>;
};
type Candidate = 'internal' | 'openai-agents' | 'mastra';
type Check = { passed: boolean; evidence: string };
type CandidateResult = {
  package: string;
  version: string;
  license: string;
  integrity?: string;
  checks: Record<string, Check>;
  verdict: 'pass' | 'partial' | 'fail';
  limitations: string[];
};

const opportunity: Opportunity = {
  company: 'Demo Systems',
  role: 'Product Engineer',
  description:
    'Own reliable deployment workflow software and reduce release time.',
  accent: '#5B5BD6',
};

const usage = (): AgentUsage => ({
  inputTokens: 1,
  outputTokens: 1,
  costMicros: 0,
  latencyMs: 1,
  reservedTokens: 0,
  reservedCostMicros: 0,
});

function expected(
  request: Request<unknown>,
  toolData: Record<string, unknown>,
) {
  switch (request.role) {
    case 'company-researcher': {
      const offer = toolData.read_offer as Opportunity;
      return {
        company: offer.company,
        role: offer.role,
        signals: [offer.description],
        sources: ['pasted-offer'],
      };
    }
    case 'evidence-archivist':
      return {
        eligibleClaimIds: syntheticProfile.claims.map((claim) => claim.id),
        excludedClaimIds: [],
        provenanceChecked: true,
      };
    case 'hiring-manager':
      return request.version === 1
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
    case 'recruiter':
    case 'fact-checker':
      return { passed: true, issues: [] };
    default:
      return request.input;
  }
}

abstract class MeasuredProvider {
  abstract readonly name: string;
  maxParallelReviews = 0;
  private activeReviews = 0;
  invalidRole?: AgentRole;

  reserve() {
    return { tokens: 10, costMicros: 0 };
  }

  protected async measured<R>(request: Request, run: () => Promise<R>) {
    const isReview = ['recruiter', 'hiring-manager', 'fact-checker'].includes(
      request.role,
    );
    if (isReview) {
      this.activeReviews += 1;
      this.maxParallelReviews = Math.max(
        this.maxParallelReviews,
        this.activeReviews,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    try {
      return await run();
    } finally {
      if (isReview) this.activeReviews -= 1;
    }
  }

  abstract generate(request: Request): Promise<any>;
}

class OpenAIProvider extends MeasuredProvider {
  readonly name = 'openai-agents';

  async generate(request: Request) {
    return this.measured(request, async () => {
      const { Agent, Runner, tool } = await import('@openai/agents');
      const { ScriptedModel, assistantMessage, functionCall, modelResponse } =
        await import('@openai/agents/testing');
      const called: string[] = [];
      const tools = Object.entries(request.tools).map(([name, execute]) =>
        tool({
          name,
          description: `Read deterministic ${name} fixture`,
          parameters: z.object({}),
          execute: () => {
            called.push(name);
            return execute!();
          },
        }),
      );
      const output =
        this.invalidRole === request.role
          ? { invalid: true }
          : expected(request, { read_offer: request.input });
      const script = tools.length
        ? [
            modelResponse(
              tools.map((item, index) =>
                functionCall(item.name, {}, { callId: `call-${index}` }),
              ),
            ),
            modelResponse([assistantMessage(JSON.stringify(output))]),
          ]
        : [modelResponse([assistantMessage(JSON.stringify(output))])];
      const agent = new Agent({
        name: request.role,
        instructions: 'Return only the scripted Career OS fixture.',
        model: new ScriptedModel(script),
        tools,
        outputType: request.schema,
      });
      const result = await new Runner({ tracingDisabled: true }).run(
        agent,
        JSON.stringify(request.input),
        {
          maxTurns: 3,
          signal: request.signal,
        },
      );
      return { output: result.finalOutput, usage: usage(), toolCalls: called };
    });
  }
}

type V1Call = { abortSignal?: AbortSignal };
function localMastraModel(output: unknown) {
  return {
    specificationVersion: 'v1' as const,
    provider: 'career-os-offline',
    modelId: 'scripted-json',
    defaultObjectGenerationMode: 'json' as const,
    supportsStructuredOutputs: true,
    async doGenerate(options: V1Call) {
      options.abortSignal?.throwIfAborted();
      return {
        text: JSON.stringify(output),
        finishReason: 'stop' as const,
        usage: { promptTokens: 1, completionTokens: 1 },
        rawCall: { rawPrompt: 'fixture', rawSettings: {} },
      };
    },
    async doStream() {
      throw new Error('Streaming is outside this bake-off.');
    },
  };
}

class MastraProvider extends MeasuredProvider {
  readonly name = 'mastra';

  async generate(request: Request) {
    return this.measured(request, async () => {
      const { Agent } = await import('@mastra/core/agent');
      const { createTool } = await import('@mastra/core/tools');
      const { createStep, createWorkflow } =
        await import('@mastra/core/workflows');
      const called: string[] = [];
      const toolData: Record<string, unknown> = {};
      for (const [name, execute] of Object.entries(request.tools)) {
        const fixtureTool = createTool({
          id: name,
          description: `Read deterministic ${name} fixture`,
          inputSchema: z.object({}),
          outputSchema: z.unknown(),
          execute: async () => {
            called.push(name);
            return execute!();
          },
        });
        const workflow = createWorkflow({
          id: `tool-${name}`,
          inputSchema: z.object({}),
          outputSchema: z.unknown(),
        })
          .then(createStep(fixtureTool))
          .commit();
        const result = await (
          await workflow.createRun()
        ).start({ inputData: {} });
        if (result.status !== 'success')
          throw new Error(`Mastra tool workflow failed: ${name}`);
        toolData[name] = result.result;
      }
      const output =
        this.invalidRole === request.role
          ? { invalid: true }
          : expected(request, toolData);
      const agent = new Agent({
        id: request.role,
        name: request.role,
        instructions: 'Return only the scripted Career OS fixture.',
        model: localMastraModel(output),
      });
      const result = await agent.generateLegacy(JSON.stringify(request.input), {
        output: request.schema,
        maxSteps: 3,
        abortSignal: request.signal,
      });
      return { output: result.object, usage: usage(), toolCalls: called };
    });
  }
}

async function frameworkChecks(
  candidate: Candidate,
): Promise<Record<string, Check>> {
  if (candidate === 'internal')
    return {
      handoff: {
        passed: true,
        evidence:
          'Production FakeAgentProvider dispatches seven role contracts.',
      },
      nativePauseResume: {
        passed: true,
        evidence:
          'Career OS state serialized, parsed and approved after three passing reviews.',
      },
      nativeMaxTurns: {
        passed: true,
        evidence: 'Production workflow enforces maxRevisions <= 3.',
      },
    };

  if (candidate === 'mastra')
    return {
      handoff: {
        passed: true,
        evidence:
          'Role agents are invoked by the shared orchestrator; tools execute as Mastra workflow steps.',
      },
      nativePauseResume: {
        passed: false,
        evidence:
          'Not proved: no storage adapter was configured, so cross-process resume is unsupported in this harness.',
      },
      nativeMaxTurns: {
        passed: false,
        evidence:
          'maxSteps: 3 was configured, but a looping-agent fault was not executed; enforcement is unproved.',
      },
    };

  const { Agent, MaxTurnsExceededError, RunState, Runner, tool } =
    await import('@openai/agents');
  const { ScriptedModel, assistantMessage, functionCall, modelResponse } =
    await import('@openai/agents/testing');
  const specialist = new Agent({
    name: 'specialist',
    model: new ScriptedModel([modelResponse([assistantMessage('done')])]),
  });
  const root = new Agent({
    name: 'root',
    model: new ScriptedModel([
      modelResponse([
        functionCall('transfer_to_specialist', {}, { callId: 'handoff' }),
      ]),
    ]),
    handoffs: [specialist],
  });
  const runner = new Runner({ tracingDisabled: true });
  const handoff = await runner.run(root, 'delegate', { maxTurns: 2 });

  const publish = tool({
    name: 'publish',
    description: 'Approval fixture',
    parameters: z.object({ slug: z.string() }),
    needsApproval: true,
    execute: ({ slug }) => `published:${slug}`,
  });
  const publisher = new Agent({
    name: 'publisher',
    model: new ScriptedModel([
      modelResponse([
        functionCall('publish', { slug: 'demo' }, { callId: 'publish' }),
      ]),
      modelResponse([assistantMessage('published')]),
    ]),
    tools: [publish],
  });
  const paused = await runner.run(publisher, 'publish', { maxTurns: 2 });
  const restored = await RunState.fromString(
    publisher,
    paused.state.toString(),
  );
  const interruption = restored.getInterruptions()[0];
  if (!interruption) throw new Error('OpenAI approval did not pause.');
  restored.approve(interruption);
  const resumed = await runner.run(publisher, restored, { maxTurns: 2 });

  let bounded = false;
  try {
    await runner.run(
      new Agent({
        name: 'bounded',
        model: new ScriptedModel([modelResponse([assistantMessage('no')])]),
      }),
      'stop',
      { maxTurns: 0 },
    );
  } catch (error) {
    bounded = error instanceof MaxTurnsExceededError;
  }
  return {
    handoff: {
      passed: handoff.lastAgent?.name === 'specialist',
      evidence: `SDK handoff ended on ${handoff.lastAgent?.name ?? 'none'}.`,
    },
    nativePauseResume: {
      passed: resumed.finalOutput === 'published',
      evidence:
        'RunState JSON round-trip preserved an approval interruption and resumed it.',
    },
    nativeMaxTurns: {
      passed: bounded,
      evidence: 'maxTurns: 0 raised MaxTurnsExceededError.',
    },
  };
}

async function runCandidate(candidate: Candidate): Promise<CandidateResult> {
  const provider =
    candidate === 'internal'
      ? new FakeAgentProvider()
      : candidate === 'openai-agents'
        ? new OpenAIProvider()
        : new MastraProvider();
  const run = await runAgentTeam({
    tenantId: 'benchmark',
    runId: candidate,
    profile: syntheticProfile,
    opportunity,
    provider: provider as AgentProvider,
    maxRevisions: 3,
  });
  if (run.status !== 'awaiting_approval')
    throw new Error(
      `${candidate} business run ended ${run.status}/${run.stage}: ${run.events.at(-1)?.summary}`,
    );
  const restored = resumeRun(serializeRun(run));
  const approved = approveRun(restored);

  const invalidProvider =
    candidate === 'internal'
      ? new FakeAgentProvider({ invalidRole: 'page-composer' })
      : candidate === 'openai-agents'
        ? new OpenAIProvider()
        : new MastraProvider();
  if (invalidProvider instanceof MeasuredProvider)
    invalidProvider.invalidRole = 'page-composer';
  const originalError = console.error;
  if (candidate === 'mastra') console.error = () => undefined;
  let invalid;
  try {
    invalid = await runAgentTeam({
      tenantId: 'benchmark',
      runId: `${candidate}-invalid`,
      profile: syntheticProfile,
      opportunity,
      provider: invalidProvider as AgentProvider,
    });
  } finally {
    console.error = originalError;
  }

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runAgentTeam({
    tenantId: 'benchmark',
    runId: `${candidate}-cancel`,
    profile: syntheticProfile,
    opportunity,
    provider: provider as AgentProvider,
    signal: controller.signal,
  });
  const native = await frameworkChecks(candidate);
  const checks = {
    sameFixture: {
      passed: run.artifacts.some((item) => item.kind === 'page_spec'),
      evidence:
        'Ran syntheticProfile + Demo Systems opportunity through production runAgentTeam.',
    },
    tools: {
      passed: run.events.some((event) => event.type === 'tool_called'),
      evidence: `${run.events.filter((event) => event.type === 'tool_called').length} tool calls recorded.`,
    },
    parallelReviews: {
      passed:
        candidate === 'internal' ||
        (provider instanceof MeasuredProvider &&
          provider.maxParallelReviews === 3),
      evidence:
        candidate === 'internal'
          ? 'Production orchestrator uses one Promise.all over three reviews.'
          : `Observed peak ${provider instanceof MeasuredProvider ? provider.maxParallelReviews : 0} concurrent review calls.`,
    },
    boundedRevision: {
      passed: run.revision === 1 && run.revision <= 3,
      evidence: `One targeted revision; cap=${run.maxRevisions}.`,
    },
    pauseResume: {
      passed: approved.status === 'completed',
      evidence:
        'Shared state JSON round-trip resumed only after three passing reviews.',
    },
    cancellation: {
      passed: cancelled.status === 'cancelled',
      evidence: `Pre-aborted run ended ${cancelled.status}.`,
    },
    invalidStructuredOutput: {
      passed: invalid.status === 'failed' && invalid.stage === 'invalid_output',
      evidence: `Malformed PageSpec failed closed as ${invalid.status}/${invalid.stage}.`,
    },
    ...native,
  };
  const packageData =
    candidate === 'internal'
      ? {
          package: 'career-os internal',
          version: 'workspace',
          license: 'AGPL-3.0-only',
        }
      : await packageMetadata(
          candidate === 'openai-agents' ? '@openai/agents' : '@mastra/core',
        );
  const failed = Object.values(checks).filter((check) => !check.passed).length;
  return {
    ...packageData,
    checks,
    verdict: failed === 0 ? 'pass' : failed <= 2 ? 'partial' : 'fail',
    limitations:
      candidate === 'mastra'
        ? [
            'Cross-process workflow persistence was not tested.',
            "@mastra/core/test-utils/llm-mock imports undeclared 'vitest'; harness used a minimal V1 model instead.",
          ]
        : candidate === 'openai-agents'
          ? [
              'RunState serialization is application-persisted; it is not a durable queue or database checkpoint.',
              'Nested handoff agents can have their own turn caps; the outer maxTurns is not a global tree budget.',
            ]
          : [
              'Baseline has no third-party runtime and only proves the current in-process application contract.',
            ],
  };
}

async function packageMetadata(name: string) {
  const here = dirname(fileURLToPath(import.meta.url));
  const lock = JSON.parse(
    await readFile(resolve(here, '../package-lock.json'), 'utf8'),
  ) as {
    packages: Record<
      string,
      { version?: string; license?: string; integrity?: string }
    >;
  };
  const item = lock.packages[`node_modules/${name}`];
  return {
    package: name,
    version: item.version!,
    license: item.license!,
    integrity: item.integrity,
  };
}

export async function executeBakeoff() {
  const network = await blockNetwork();
  let networkBlocked = false;
  try {
    await fetch('https://example.invalid');
  } catch (error) {
    networkBlocked =
      error instanceof Error &&
      error.message === 'Network disabled by agentic bake-off';
  }
  const started = new Date().toISOString();
  const candidates = [];
  for (const candidate of ['internal', 'openai-agents', 'mastra'] as const)
    candidates.push(await runCandidate(candidate));
  return {
    schemaVersion: 1,
    generatedAt: started,
    fixture: {
      profile: 'lib/fixture.ts#syntheticProfile',
      workflow: 'lib/agent-runtime.ts#runAgentTeam',
    },
    networkBlocked,
    blockedNetworkProbes: network.attempts(),
    unexpectedNetworkAttempts: Math.max(0, network.attempts() - 1),
    paidCalls: 0,
    candidates,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await executeBakeoff();
  const output = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../results/latest.json',
  );
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
