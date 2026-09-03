import { z } from 'zod';
import type { Application } from './application-contract';
import type { PersistedRun } from './run-contract';
import { pageSpecSchema, profileSchema, type Profile } from './schemas';
import type { Opportunity, Strategy, WorkflowEvent } from './workflow';

export type WorkspaceReview = {
  reviewer: 'recruiter' | 'hiring-manager' | 'factuality';
  passed: boolean;
  findings: string[];
  reviewId?: string;
  issues?: Array<{ section: string; message: string; blocking: boolean }>;
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
  runProfile?: Profile;
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
  | 'Analyse terminée'
  | 'Génération arrêtée'
  | 'À compléter'
  | 'Offre prête';
export type DossierStage = 'Brouillon' | 'À valider' | 'Envoyée';
export type DossierNextView = 'brief' | 'journey' | 'review' | 'share';
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
    url: z.string().url().max(2_048).optional(),
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
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
const reviewDecisionSchema: z.ZodType<ReviewDecision> = z
  .object({
    reviewId: z.string().uuid(),
    issueIndex: z.number().int().min(0).max(99),
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
    runProfile: profileSchema.optional(),
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
  if (dossier.runId && !dossier.spec && dossier.runStatus === 'running')
    return 'Analyse en cours';
  if (dossier.runId && !dossier.spec && dossier.runStatus === 'paused')
    return 'Analyse terminée';
  if (
    dossier.runId &&
    !dossier.spec &&
    ['budget_exhausted', 'cancelled', 'failed'].includes(
      dossier.runStatus ?? '',
    )
  )
    return 'Génération arrêtée';
  if (dossier.spec && unresolvedIssueCount(dossier) > 0) return 'Revue requise';
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
  return dossier.spec && dossier.reviews.length ? 'À valider' : 'Brouillon';
}

export function dossierNextView(dossier: ApplicationDossier): DossierNextView {
  if (dossier.capability || dossier.approved) return 'share';
  if (dossier.spec && dossier.reviews.length) return 'review';
  return dossier.spec || dossier.runId ? 'journey' : 'brief';
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

function reviewGateReady(dossier: ApplicationDossier): boolean {
  return (
    dossier.publicationEligible ??
    (dossier.reviews.length === 3 &&
      dossier.reviews.every((review) => review.passed))
  );
}

function unresolvedIssueCount(dossier: ApplicationDossier): number {
  const resolved = new Set(
    dossier.reviewDecisions.map(
      ({ issueIndex, reviewId }) => `${reviewId}:${issueIndex}`,
    ),
  );
  return dossier.reviews.reduce((count, review) => {
    const issues = review.issues?.length
      ? review.issues
      : review.findings.map((message) => ({
          section: '',
          message,
          blocking: false,
        }));
    return (
      count +
      issues.filter(
        (_, issueIndex) =>
          !review.reviewId || !resolved.has(`${review.reviewId}:${issueIndex}`),
      ).length
    );
  }, 0);
}
