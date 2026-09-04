import { z } from 'zod';
import {
  applicationCompanySourcesSchema,
  type Application,
} from './application-contract';
import { httpUrlSchema, optionalHttpUrl } from './http-url';
import {
  persistedEvidenceArchiveSchema,
  persistedRecruiterStrategySchema,
  persistedResearchSchema,
  workerAvailabilitySchema,
  type PersistedRun,
} from './run-contract';
import { pageSpecSchema, profileSchema, type Profile } from './schemas';
import type { Opportunity, Strategy, WorkflowEvent } from './workflow';

export type WorkspaceReview = {
  reviewer: 'recruiter' | 'hiring-manager' | 'factuality';
  passed: boolean;
  findings: string[];
  reviewId?: string;
  issues?: Array<{
    section: string;
    message: string;
    blocking: boolean;
    claimId?: string;
    evidenceIds?: string[];
  }>;
};

export type ReviewDecision = {
  reviewId: string;
  issueIndex: number;
  decision: 'keep' | 'correct';
};

export type ApplicationDossier = {
  id: string;
  applicationId?: string;
  applicationRevision?: number;
  opportunity: Opportunity;
  strategy?: Strategy;
  spec?: z.infer<typeof pageSpecSchema>;
  runId?: string;
  runStatus?: PersistedRun['status'];
  runStage?: string;
  runSteps?: PersistedRun['steps'];
  workerAvailability?: PersistedRun['workerAvailability'];
  runProfile?: Profile;
  runResearch?: PersistedRun['research'];
  runEvidenceArchive?: PersistedRun['evidenceArchive'];
  runStrategy?: PersistedRun['strategy'];
  pageSpecId?: string;
  pageSpecHash?: string;
  pageSpecArtifactId?: string;
  pageSpecArtifactHash?: string;
  selectedResearchSignalIds?: string[];
  reviews: WorkspaceReview[];
  reviewDecisions: ReviewDecision[];
  publicationEligible?: boolean;
  approved: boolean;
  capability?: string;
  events: WorkflowEvent[];
  paused: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SavedWorkspaceV2 = {
  version: 2;
  profile: Profile;
  profileOrigin: 'empty' | 'demo' | 'user';
  dossiers: ApplicationDossier[];
  selectedDossierId?: string;
};

export type DossierStatus =
  | 'Partagée'
  | 'Validée'
  | 'Revue requise'
  | 'Prête à valider'
  | 'Brouillon prêt'
  | 'Analyse en cours'
  | 'Sélection des preuves'
  | 'Composition en cours'
  | 'Vérifications en cours'
  | 'Vérifications arrêtées'
  | 'Analyse terminée'
  | 'Génération arrêtée'
  | 'À compléter'
  | 'Offre prête';
export type DossierStage = 'Brouillon' | 'À valider' | 'Envoyée';
export type DossierNextView =
  'brief' | 'journey' | 'draft' | 'review' | 'share';
export type ReviewProcessState = 'idle' | 'running' | 'failed' | 'complete';
export type ScopedShareLink = {
  scope: string;
  dossierId: string;
  url: string;
};

const emptyProfileSchema = z
  .object({
    name: z.literal(''),
    headline: z.literal(''),
    sources: z.array(z.never()).max(0),
    evidence: z.array(z.never()).max(0),
    claims: z.array(z.never()).max(0),
  })
  .strict();
const workspaceProfileSchema = z.union([profileSchema, emptyProfileSchema]);
const opportunitySchema = z
  .object({
    company: z.string().max(200),
    role: z.string().max(200),
    description: z.string().max(20_000),
    url: httpUrlSchema.optional(),
    companySources: applicationCompanySourcesSchema.optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })
  .strict();
const strategySchema: z.ZodType<Strategy> = z
  .object({
    thesis: z.string(),
    selectedClaimIds: z.array(z.string()),
    gaps: z.array(z.string()),
    matches: z.array(
      z
        .object({
          requirement: z.string(),
          claimId: z.string().optional(),
          evidenceIds: z.array(z.string()),
          gap: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const workflowEventSchema: z.ZodType<WorkflowEvent> = z
  .object({
    actor: z.enum([
      'system',
      'company-researcher',
      'recruiter-strategist',
      'page-composer',
      'recruiter',
      'hiring-manager',
      'fact-checker',
    ]),
    action: z.string(),
    artifact: z.string().optional(),
    costMicros: z.number().int().nonnegative(),
  })
  .strict();
const workspaceReviewSchema: z.ZodType<WorkspaceReview> = z
  .object({
    reviewer: z.enum(['recruiter', 'hiring-manager', 'factuality']),
    passed: z.boolean(),
    findings: z.array(z.string()),
    reviewId: z.string().uuid().optional(),
    issues: z
      .array(
        z
          .object({
            section: z.string(),
            message: z.string(),
            blocking: z.boolean(),
            claimId: z.string().uuid().optional(),
            evidenceIds: z.array(z.string().uuid()).max(2).optional(),
          })
          .strict(),
      )
      .max(5)
      .optional(),
  })
  .strict();
const reviewDecisionSchema: z.ZodType<ReviewDecision> = z
  .object({
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().min(0).max(4),
    decision: z.enum(['keep', 'correct']),
  })
  .strict();
const applicationDossierSchema: z.ZodType<ApplicationDossier> = z
  .object({
    id: z.string().uuid(),
    applicationId: z.string().uuid().optional(),
    applicationRevision: z.number().int().positive().optional(),
    opportunity: opportunitySchema,
    strategy: strategySchema.optional(),
    spec: pageSpecSchema.optional(),
    runId: z.string().uuid().optional(),
    runStatus: z
      .enum([
        'running',
        'paused',
        'awaiting_approval',
        'completed',
        'blocked',
        'budget_exhausted',
        'cancelled',
        'failed',
      ])
      .optional(),
    runStage: z.string().min(1).max(100).optional(),
    runSteps: z
      .array(
        z
          .object({
            stage: z.string().min(1).max(100),
            status: z.enum([
              'pending',
              'leased',
              'in_flight',
              'completed',
              'failed',
              'cancelled',
            ]),
            attempt: z.number().int().positive(),
            failureCode: z.string().min(1).max(100).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    workerAvailability: workerAvailabilitySchema.optional(),
    runProfile: profileSchema.optional(),
    runResearch: persistedResearchSchema.optional(),
    runEvidenceArchive: persistedEvidenceArchiveSchema.optional(),
    runStrategy: persistedRecruiterStrategySchema.optional(),
    pageSpecId: z.string().uuid().optional(),
    pageSpecHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    pageSpecArtifactId: z.string().uuid().optional(),
    pageSpecArtifactHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    selectedResearchSignalIds: z
      .array(z.string().regex(/^signal-(?:[1-9]|1\d|20)$/))
      .max(20)
      .optional(),
    reviews: z.array(workspaceReviewSchema),
    reviewDecisions: z.array(reviewDecisionSchema),
    publicationEligible: z.boolean().optional(),
    approved: z.boolean(),
    capability: z.string().uuid().optional(),
    events: z.array(workflowEventSchema),
    paused: z.boolean(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((dossier, context) => {
    if (Boolean(dossier.applicationId) !== Boolean(dossier.applicationRevision))
      context.addIssue({
        code: 'custom',
        path: ['applicationId'],
        message: 'Persisted application identity and revision must coexist.',
      });
  });
const savedWorkspaceV2Schema: z.ZodType<SavedWorkspaceV2> = z
  .object({
    version: z.literal(2),
    profile: workspaceProfileSchema,
    profileOrigin: z.enum(['empty', 'demo', 'user']),
    dossiers: z.array(applicationDossierSchema).max(500),
    selectedDossierId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((workspace, context) => {
    const ids = new Set<string>();
    for (const [index, dossier] of workspace.dossiers.entries()) {
      if (ids.has(dossier.id))
        context.addIssue({
          code: 'custom',
          path: ['dossiers', index, 'id'],
          message: 'Dossier IDs must be unique.',
        });
      ids.add(dossier.id);
    }
  });

const legacyWorkspaceSchema = z
  .object({
    profile: workspaceProfileSchema,
    profileOrigin: z.enum(['empty', 'demo', 'user']).optional(),
    opportunity: opportunitySchema,
    strategy: strategySchema.optional(),
    spec: pageSpecSchema.optional(),
    runId: z.string().uuid().optional(),
    runProfile: profileSchema.optional(),
    reviews: z.array(workspaceReviewSchema),
    reviewDecisions: z.array(reviewDecisionSchema).optional(),
    publicationEligible: z.boolean().optional(),
    approved: z.boolean(),
    capability: z.string().uuid().optional(),
    events: z.array(workflowEventSchema).optional(),
    paused: z.boolean().optional(),
  })
  .strict();

const EMPTY_OPPORTUNITY: Opportunity = {
  company: '',
  role: '',
  description: '',
  accent: '#5847e8',
};
const DEMO_OPPORTUNITY: Opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description:
    'Build dependable customer-facing workflows with a small product team.',
  accent: '#21504b',
};

type CreationOptions = {
  id?: string;
  now?: number;
};
type RestoreOptions = {
  createId?: () => string;
  now?: () => number;
};

export function createEmptyWorkspace(): SavedWorkspaceV2 {
  return {
    version: 2,
    profile: { name: '', headline: '', sources: [], evidence: [], claims: [] },
    profileOrigin: 'empty',
    dossiers: [],
  };
}

export function createEmptyDossier(
  options: CreationOptions = {},
): ApplicationDossier {
  return createDossier(EMPTY_OPPORTUNITY, options);
}

export function createDemoDossier(
  options: CreationOptions = {},
): ApplicationDossier {
  return createDossier(DEMO_OPPORTUNITY, options);
}

export function restoreWorkspace(
  raw: string | null,
  options: RestoreOptions = {},
): SavedWorkspaceV2 {
  if (!raw) return createEmptyWorkspace();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createEmptyWorkspace();
  }
  removeUnsupportedCachedUrls(parsed);

  const current = savedWorkspaceV2Schema.safeParse(parsed);
  if (current.success) return normalizeSelection(current.data);

  const legacy = legacyWorkspaceSchema.safeParse(parsed);
  if (!legacy.success) return createEmptyWorkspace();
  const profileOrigin =
    legacy.data.profileOrigin ??
    (legacy.data.profile.sources.some((source) =>
      source.id.startsWith('source-demo-'),
    )
      ? 'demo'
      : legacy.data.profile.name
        ? 'user'
        : 'empty');
  if (profileOrigin === 'empty') return createEmptyWorkspace();

  const now = options.now?.() ?? Date.now();
  const id = options.createId?.() ?? crypto.randomUUID();
  return {
    version: 2,
    profile: legacy.data.profile,
    profileOrigin,
    dossiers: [
      {
        id,
        opportunity: legacy.data.opportunity,
        ...(legacy.data.strategy ? { strategy: legacy.data.strategy } : {}),
        ...(legacy.data.spec ? { spec: legacy.data.spec } : {}),
        ...(legacy.data.runId ? { runId: legacy.data.runId } : {}),
        ...(legacy.data.runProfile
          ? { runProfile: legacy.data.runProfile }
          : {}),
        reviews: legacy.data.reviews,
        reviewDecisions: legacy.data.reviewDecisions ?? [],
        ...(legacy.data.publicationEligible === undefined
          ? {}
          : { publicationEligible: legacy.data.publicationEligible }),
        approved: legacy.data.approved,
        ...(legacy.data.capability
          ? { capability: legacy.data.capability }
          : {}),
        events: legacy.data.events ?? [],
        paused: legacy.data.paused ?? false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    selectedDossierId: id,
  };
}

function removeUnsupportedCachedUrls(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const workspace = value as Record<string, unknown>;
  sanitizeOpportunity(workspace.opportunity);
  if (!Array.isArray(workspace.dossiers)) return;
  for (const dossier of workspace.dossiers) {
    if (!dossier || typeof dossier !== 'object') continue;
    const candidate = dossier as Record<string, unknown>;
    sanitizeOpportunity(candidate.opportunity);
    if (!candidate.runResearch || typeof candidate.runResearch !== 'object')
      continue;
    const source = (candidate.runResearch as Record<string, unknown>).source;
    sanitizeUrl(source);
  }
}

function sanitizeOpportunity(value: unknown) {
  sanitizeUrl(value);
}

function sanitizeUrl(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if ('url' in record && !optionalHttpUrl(record.url)) delete record.url;
}

export function updateDossier(
  workspace: SavedWorkspaceV2,
  dossierId: string,
  update: (dossier: ApplicationDossier) => ApplicationDossier,
  updatedAt = Date.now(),
): SavedWorkspaceV2 {
  let found = false;
  const dossiers = workspace.dossiers.map((dossier) => {
    if (dossier.id !== dossierId) return dossier;
    found = true;
    return { ...update(dossier), id: dossier.id, updatedAt };
  });
  return found ? { ...workspace, dossiers } : workspace;
}

export function mergePersistedApplications(
  workspace: SavedWorkspaceV2,
  applications: Application[],
): SavedWorkspaceV2 {
  const localByApplicationId = new Map(
    workspace.dossiers.flatMap((dossier) =>
      dossier.applicationId ? [[dossier.applicationId, dossier] as const] : [],
    ),
  );
  const synced = applications.map((application) => {
    const existing = localByApplicationId.get(application.applicationId);
    const opportunity: Opportunity = {
      company: application.company,
      role: application.role,
      description: application.description,
      ...(application.url ? { url: application.url } : {}),
      ...(application.companySources
        ? { companySources: application.companySources }
        : {}),
      accent: application.accent,
    };
    if (existing?.applicationRevision === application.revision)
      return { ...existing, opportunity };
    return {
      id: existing?.id ?? application.applicationId,
      applicationId: application.applicationId,
      applicationRevision: application.revision,
      opportunity,
      reviews: [],
      reviewDecisions: [],
      approved: false,
      ...(existing?.capability ? { capability: existing.capability } : {}),
      events: [],
      paused: false,
      createdAt: existing?.createdAt ?? Date.parse(application.createdAt),
      updatedAt: Date.parse(application.updatedAt),
    } satisfies ApplicationDossier;
  });
  const dossiers = [
    ...workspace.dossiers.filter((dossier) => !dossier.applicationId),
    ...synced,
  ];
  const selectedDossierId = dossiers.some(
    (dossier) => dossier.id === workspace.selectedDossierId,
  )
    ? workspace.selectedDossierId
    : dossiers[0]?.id;
  return { ...workspace, dossiers, selectedDossierId };
}

export function selectDossier(
  workspace: SavedWorkspaceV2,
  dossierId: string,
): SavedWorkspaceV2 {
  if (
    workspace.selectedDossierId === dossierId ||
    !workspace.dossiers.some((dossier) => dossier.id === dossierId)
  )
    return workspace;
  return { ...workspace, selectedDossierId: dossierId };
}

export function invalidateDossiersAfterProfileChange(
  workspace: SavedWorkspaceV2,
  profile: Profile,
  profileOrigin: SavedWorkspaceV2['profileOrigin'] = 'user',
  updatedAt = Date.now(),
): SavedWorkspaceV2 {
  return {
    ...workspace,
    profile,
    profileOrigin,
    dossiers: workspace.dossiers.map((dossier) => ({
      id: dossier.id,
      ...(dossier.applicationId
        ? { applicationId: dossier.applicationId }
        : {}),
      ...(dossier.applicationRevision === undefined
        ? {}
        : { applicationRevision: dossier.applicationRevision }),
      opportunity: dossier.opportunity,
      reviews: [],
      reviewDecisions: [],
      approved: false,
      ...(dossier.capability ? { capability: dossier.capability } : {}),
      events: [],
      paused: false,
      createdAt: dossier.createdAt,
      updatedAt,
    })),
  };
}

export function dossierStatus(dossier: ApplicationDossier): DossierStatus {
  if (dossier.capability) return 'Partagée';
  if (dossier.approved) return 'Validée';
  const reviewState = reviewProcessState(dossier);
  if (reviewState === 'running') return 'Vérifications en cours';
  if (reviewState === 'failed') return 'Vérifications arrêtées';
  if (dossier.runId && dossier.runStatus === 'running') {
    const steps = dossier.runSteps ?? [];
    if (dossier.spec) return 'Brouillon prêt';
    if (
      steps.some(
        (step) =>
          ['recruiter-strategist', 'page-composer'].includes(step.stage) &&
          step.status !== 'completed',
      )
    )
      return 'Composition en cours';
    if (
      steps.some(
        (step) =>
          step.stage === 'evidence-archivist' && step.status !== 'completed',
      )
    )
      return 'Sélection des preuves';
    return 'Analyse en cours';
  }
  if (dossier.runId && !dossier.spec && dossier.runStatus === 'paused')
    return 'Analyse terminée';
  if (
    dossier.runId &&
    ['budget_exhausted', 'cancelled', 'failed'].includes(
      dossier.runStatus ?? '',
    )
  )
    return 'Génération arrêtée';
  if (
    dossier.spec &&
    reviewsComplete(dossier.reviews) &&
    unresolvedIssueCount(dossier) > 0
  )
    return 'Revue requise';
  if (dossier.spec && reviewGateReady(dossier)) return 'Prête à valider';
  if (dossier.spec) return 'Brouillon prêt';
  return opportunityReady(dossier.opportunity) ? 'Offre prête' : 'À compléter';
}

export function opportunityReady(opportunity: Opportunity) {
  return Boolean(
    opportunity.company.trim() &&
    opportunity.role.trim() &&
    opportunity.description.trim(),
  );
}

export function visibleShareUrl(
  link: ScopedShareLink | undefined,
  scope: string,
  dossierId: string,
) {
  return link?.scope === scope && link.dossierId === dossierId ? link.url : '';
}

export function dossierStage(dossier: ApplicationDossier): DossierStage {
  if (dossier.capability) return 'Envoyée';
  return dossier.spec && reviewsComplete(dossier.reviews)
    ? 'À valider'
    : 'Brouillon';
}

export function dossierNextView(dossier: ApplicationDossier): DossierNextView {
  if (dossier.capability || dossier.approved) return 'share';
  if (dossier.spec && reviewsComplete(dossier.reviews)) return 'review';
  if (dossier.spec && dossier.runStatus === 'running') return 'journey';
  if (dossier.spec) return 'draft';
  return dossier.runId ? 'journey' : 'brief';
}

export function reviewsComplete(
  reviews: Array<Pick<WorkspaceReview, 'reviewer'>>,
) {
  return (
    reviews.length === 3 &&
    new Set(reviews.map(({ reviewer }) => reviewer)).size === 3 &&
    ['recruiter', 'hiring-manager', 'factuality'].every((reviewer) =>
      reviews.some((review) => review.reviewer === reviewer),
    )
  );
}

export function reviewProcessState(
  dossier: Pick<ApplicationDossier, 'reviews' | 'runStatus' | 'runSteps'>,
): ReviewProcessState {
  if (reviewsComplete(dossier.reviews)) return 'complete';
  const steps =
    dossier.runSteps?.filter((step) => step.stage.endsWith('-reviewer')) ?? [];
  if (
    steps.some((step) => ['failed', 'cancelled'].includes(step.status)) ||
    (steps.length > 0 &&
      ['budget_exhausted', 'cancelled', 'failed'].includes(
        dossier.runStatus ?? '',
      ))
  )
    return 'failed';
  if (
    steps.some((step) =>
      ['pending', 'leased', 'in_flight'].includes(step.status),
    )
  )
    return 'running';
  return 'idle';
}

function createDossier(
  opportunity: Opportunity,
  options: CreationOptions,
): ApplicationDossier {
  const now = options.now ?? Date.now();
  return {
    id: options.id ?? crypto.randomUUID(),
    opportunity: { ...opportunity },
    reviews: [],
    reviewDecisions: [],
    approved: false,
    events: [],
    paused: false,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeSelection(workspace: SavedWorkspaceV2): SavedWorkspaceV2 {
  if (
    workspace.selectedDossierId &&
    workspace.dossiers.some(({ id }) => id === workspace.selectedDossierId)
  )
    return workspace;
  const selectedDossierId = workspace.dossiers[0]?.id;
  return selectedDossierId
    ? { ...workspace, selectedDossierId }
    : { ...workspace, selectedDossierId: undefined };
}

export function reviewGateReady(
  dossier: Pick<ApplicationDossier, 'publicationEligible' | 'reviews'>,
): boolean {
  return (
    reviewsComplete(dossier.reviews) && dossier.publicationEligible === true
  );
}

export function unresolvedReviewIssues(
  reviews: WorkspaceReview[],
  decisions: ReviewDecision[] = [],
) {
  if (!reviewsComplete(reviews)) return [];
  const resolved = new Set(
    decisions.map(({ issueIndex, reviewId }) => `${reviewId}:${issueIndex}`),
  );
  return reviews.flatMap((review) => {
    const issues = review.issues?.length
      ? review.issues
      : review.findings.map((message) => ({
          section: '',
          message,
          blocking: false,
        }));
    return issues
      .map((issue, issueIndex) => ({ issue, issueIndex, review }))
      .filter(
        ({ issueIndex }) =>
          !review.reviewId || !resolved.has(`${review.reviewId}:${issueIndex}`),
      );
  });
}

export function applyPersistedRun(
  dossier: ApplicationDossier,
  run: PersistedRun,
): ApplicationDossier {
  const reviewable = Boolean(run.spec);
  const reviews = reviewable ? run.reviews : [];
  return {
    ...dossier,
    runId: run.runId,
    runStatus: run.status,
    runStage: run.stage,
    runSteps: run.steps,
    workerAvailability: run.workerAvailability,
    runProfile: run.profile,
    runResearch: run.research,
    runEvidenceArchive: run.evidenceArchive,
    runStrategy: run.strategy,
    pageSpecId: run.pageSpecId,
    pageSpecHash: run.pageSpecHash,
    pageSpecArtifactId: run.pageSpecArtifactId,
    pageSpecArtifactHash: run.pageSpecArtifactHash,
    selectedResearchSignalIds:
      dossier.runResearch?.artifactId === run.research?.artifactId
        ? dossier.selectedResearchSignalIds
        : run.research?.signals.map((signal) => signal.signalId),
    spec: reviewable ? run.spec : undefined,
    reviews,
    reviewDecisions: reviewable ? run.reviewDecisions : [],
    publicationEligible: reviewable ? run.publicationEligible : false,
    approved: false,
    capability: undefined,
    events: persistedEvents(run),
  };
}

export function hasCurrentRunProjection(
  dossier: ApplicationDossier,
  run: PersistedRun,
) {
  const reviewable = Boolean(run.spec);
  return (
    dossier.runId === run.runId &&
    dossier.runStatus === run.status &&
    dossier.runStage === run.stage &&
    JSON.stringify(dossier.runSteps ?? []) === JSON.stringify(run.steps) &&
    JSON.stringify(dossier.workerAvailability) ===
      JSON.stringify(run.workerAvailability) &&
    JSON.stringify(dossier.runResearch) === JSON.stringify(run.research) &&
    JSON.stringify(dossier.runEvidenceArchive) ===
      JSON.stringify(run.evidenceArchive) &&
    JSON.stringify(dossier.runStrategy) === JSON.stringify(run.strategy) &&
    JSON.stringify(dossier.events) === JSON.stringify(persistedEvents(run)) &&
    dossier.pageSpecId === run.pageSpecId &&
    dossier.pageSpecHash === run.pageSpecHash &&
    dossier.pageSpecArtifactId === run.pageSpecArtifactId &&
    dossier.pageSpecArtifactHash === run.pageSpecArtifactHash &&
    Boolean(dossier.spec) === Boolean(reviewable && run.spec) &&
    JSON.stringify(dossier.reviews) ===
      JSON.stringify(reviewable ? run.reviews : []) &&
    JSON.stringify(dossier.reviewDecisions) ===
      JSON.stringify(reviewable ? run.reviewDecisions : []) &&
    dossier.publicationEligible ===
      (reviewable ? run.publicationEligible : false)
  );
}

export function persistedEvents(run: PersistedRun): WorkflowEvent[] {
  return run.events.map((event) => ({
    actor:
      event.actor === 'human' || event.actor === 'evidence-archivist'
        ? 'system'
        : event.actor,
    action: event.summary,
    artifact: event.artifactId,
    costMicros: event.costMicros,
  }));
}

function unresolvedIssueCount(dossier: ApplicationDossier): number {
  return unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions)
    .length;
}
