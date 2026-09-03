'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { applicationSchema } from '@/lib/application-contract';
import {
  jobPostingImportResponseSchema,
  type JobPostingImportResponse,
} from '@/lib/job-posting-extractor';
import { latestPageSpec, runAgentTeam } from '@/lib/agent-runtime';
import { syntheticProfile } from '@/lib/fixture';
import {
  agentRoles,
  buildStrategy,
  runReviews,
  type Opportunity,
  type Strategy,
  type WorkflowEvent,
} from '@/lib/workflow';
import {
  profileSchema,
  type PageSpec,
  type Profile,
  type Review,
} from '@/lib/schemas';
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
  type PersistedRun,
} from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';
import {
  importProfileFile,
  importProfileText,
  ProfileImportError,
  profileImportResultSchema,
  type ProfileImportCandidate,
  type ProfileImportResult,
} from '@/lib/profile-import';
import {
  createDemoDossier,
  createEmptyDossier,
  createEmptyWorkspace,
  dossierNextView,
  dossierStage,
  dossierStatus,
  invalidateDossiersAfterProfileChange,
  mergePersistedApplications,
  opportunityReady,
  reviewProcessState,
  reviewsComplete,
  restoreWorkspace,
  updateDossier,
  type ApplicationDossier,
  type ReviewDecision,
  type SavedWorkspaceV2,
  type ScopedShareLink,
  type WorkspaceReview,
  visibleShareUrl,
} from '@/lib/workspace-state';
type AllowedUse = Profile['claims'][number]['allowedUses'][number];
type ImportReviewCandidate = ProfileImportCandidate & {
  id: string;
  selected: boolean;
  sensitivity: Profile['claims'][number]['sensitivity'];
  allowedUses: AllowedUse[];
};
type ImportReview = Omit<ProfileImportResult, 'candidates'> & {
  name: string;
  headline: string;
  candidates: ImportReviewCandidate[];
  permissionsConfirmed: boolean;
  expiresAt: number;
};
type OnboardingMode = 'start' | 'paste' | 'review' | 'manual';
type PrimaryView = 'home' | 'applications' | 'memory' | 'activity' | 'settings';
type DossierView =
  'board' | 'brief' | 'company' | 'journey' | 'draft' | 'review' | 'share';

type RunPollingState = Record<string, string>;

const emptyProfile: Profile = {
  name: '',
  headline: '',
  sources: [],
  evidence: [],
  claims: [],
};
const fallbackDossier = createEmptyDossier({
  id: '00000000-0000-4000-8000-000000000000',
  now: 0,
});
const primaryViews: Array<[PrimaryView, string]> = [
  ['home', 'Accueil'],
  ['activity', 'À trancher'],
  ['applications', 'Candidatures'],
  ['memory', 'Mémoire pro'],
  ['settings', 'Réglages'],
];
const dossierViews: Array<[Exclude<DossierView, 'board'>, string]> = [
  ['brief', 'Offre'],
  ['company', 'Entreprise'],
  ['journey', 'Parcours'],
  ['draft', 'Page privée'],
  ['share', 'Partager'],
];
const importCandidateGroupLabels = {
  summary: 'Profil et synthèse',
  experience: 'Expériences',
  project: 'Projets',
  skill: 'Compétences',
  education: 'Formation',
  other: 'Autres informations',
} as const;

function restoreNavigation(workspace: SavedWorkspaceV2): {
  workspace: SavedWorkspaceV2;
  primaryView: PrimaryView;
  dossierView: DossierView;
} {
  if (workspace.profileOrigin === 'empty')
    return { workspace, primaryView: 'home', dossierView: 'brief' };
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  const primaryView = primaryViews.some(([view]) => view === requestedView)
    ? (requestedView as PrimaryView)
    : 'home';
  if (primaryView !== 'applications')
    return { workspace, primaryView, dossierView: 'brief' };

  const dossier = workspace.dossiers.find(
    ({ id }) => id === params.get('dossier'),
  );
  if (!dossier)
    return { workspace, primaryView: 'applications', dossierView: 'board' };
  const requestedTab = params.get('tab');
  const allowedTabs: DossierView[] = [
    'brief',
    'company',
    'journey',
    ...(dossier.spec ? (['draft'] as DossierView[]) : []),
    ...(dossier.spec && reviewsComplete(dossier.reviews)
      ? (['review'] as DossierView[])
      : []),
    ...(dossier.spec || dossier.capability ? (['share'] as DossierView[]) : []),
  ];
  return {
    workspace: { ...workspace, selectedDossierId: dossier.id },
    primaryView: 'applications',
    dossierView: allowedTabs.includes(requestedTab as DossierView)
      ? (requestedTab as DossierView)
      : dossierNextView(dossier),
  };
}

export function CareerWorkspace() {
  const session = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization();
  const [workspace, setWorkspace] =
    useState<SavedWorkspaceV2>(createEmptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [primaryView, setPrimaryView] = useState<PrimaryView>('home');
  const [dossierView, setDossierView] = useState<DossierView>('brief');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const generationPending = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [runPollingErrors, setRunPollingErrors] = useState<RunPollingState>({});
  const [runRefreshVersion, setRunRefreshVersion] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [decisionPending, setDecisionPending] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [shareLink, setShareLink] = useState<ScopedShareLink>();
  const [shareMessage, setShareMessage] = useState('');
  const [memoryError, setMemoryError] = useState('');
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [savedProfileJson, setSavedProfileJson] = useState('');
  const [memorySyncing, setMemorySyncing] = useState(false);
  const [memorySyncMessage, setMemorySyncMessage] = useState('');
  const [showMemoryHandoff, setShowMemoryHandoff] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('start');
  const [importReview, setImportReview] = useState<ImportReview>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [resolvedScope, setResolvedScope] = useState('anonymous');
  const [memoryDraft, setMemoryDraft] = useState({
    source: '',
    claim: '',
    evidence: '',
    level: 'declared' as 'verified' | 'declared' | 'inferred',
  });

  function openEvidenceInspector(claimId = '') {
    inspectorTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedClaimId(claimId);
    setInspectorOpen(true);
  }

  function closeEvidenceInspector() {
    setInspectorOpen(false);
    setSelectedClaimId('');
    requestAnimationFrame(() => inspectorTrigger.current?.focus());
  }
  const requestedScope = useRef('');
  const pendingDecisions = useRef(new Map<string, string>());
  const pendingImport = useRef<AbortController | undefined>(undefined);
  const activeTenantId = session.data?.session.activeOrganizationId;
  const currentScope = activeTenantId ?? 'anonymous';
  const workspaceReady = loaded && resolvedScope === currentScope;
  const storageKey = activeTenantId
    ? `career-os-workspace:${activeTenantId}`
    : 'career-os-demo';
  const onboardingStorageKey = activeTenantId
    ? `career-os-onboarding:${activeTenantId}`
    : 'career-os-onboarding:anonymous';
  const state =
    workspace.dossiers.find(
      (dossier) => dossier.id === workspace.selectedDossierId,
    ) ?? fallbackDossier;
  const selectedDossierIdRef = useRef(workspace.selectedDossierId);
  selectedDossierIdRef.current = workspace.selectedDossierId;
  const shareUrl = visibleShareUrl(shareLink, resolvedScope, state.id);

  useEffect(() => {
    if (session.isPending) return;
    const scope = currentScope;
    requestedScope.current = scope;
    const controller = new AbortController();

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setShareLink(undefined);
      setMemorySyncMessage('');
      setShowMemoryHandoff(false);
      setOnboardingMode('start');
      setImportReview(undefined);
      setImportError('');
      const saved = localStorage.getItem(storageKey);
      let nextWorkspace = restoreWorkspace(saved);
      let revision = 0;
      if (activeTenantId) {
        const [profileRequest, applicationsRequest] = await Promise.allSettled([
          fetch('/api/profile', {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/applications', {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) return;
        if (profileRequest.status === 'fulfilled' && profileRequest.value.ok) {
          const result = (await profileRequest.value.json()) as {
            profile: Profile | null;
            revision: number;
          };
          if (result.profile)
            nextWorkspace = {
              ...nextWorkspace,
              profile: result.profile,
              profileOrigin: 'user',
            };
          else if (nextWorkspace.profileOrigin === 'demo')
            nextWorkspace = {
              ...nextWorkspace,
              profile: emptyProfile,
              profileOrigin: 'empty',
              dossiers: [],
              selectedDossierId: undefined,
            };
          revision = result.revision;
        } else
          setMemorySyncMessage(
            'La mémoire professionnelle enregistrée n’a pas pu être chargée. Les changements locaux restent disponibles.',
          );
        if (
          applicationsRequest.status === 'fulfilled' &&
          applicationsRequest.value.ok
        ) {
          const payload = (await applicationsRequest.value.json()) as {
            applications: unknown;
          };
          nextWorkspace = mergePersistedApplications(
            nextWorkspace,
            applicationSchema.array().parse(payload.applications),
          );
        } else
          setMemorySyncMessage(
            (current) =>
              current ||
              'Les candidatures enregistrées n’ont pas pu être chargées. Les brouillons locaux restent disponibles.',
          );
      }
      if (nextWorkspace.profileOrigin === 'empty') {
        const storedReview = sessionStorage.getItem(onboardingStorageKey);
        const restored = restoreImportReview(storedReview);
        if (restored) {
          setImportReview(restored);
          setOnboardingMode('review');
        } else {
          sessionStorage.removeItem(onboardingStorageKey);
          if (importReviewExpired(storedReview))
            setImportError(
              'Cette revue a expiré après 30 minutes. Relancez l’import pour continuer.',
            );
        }
      } else sessionStorage.removeItem(onboardingStorageKey);
      if (controller.signal.aborted || requestedScope.current !== scope) return;
      const navigation = restoreNavigation(nextWorkspace);
      nextWorkspace = navigation.workspace;
      setPrimaryView(navigation.primaryView);
      setDossierView(navigation.dossierView);
      setWorkspace(nextWorkspace);
      setMemoryRevision(revision);
      setSavedProfileJson(
        revision ? JSON.stringify(nextWorkspace.profile) : '',
      );
      setResolvedScope(scope);
      setLoaded(true);
    })();

    return () => controller.abort();
  }, [
    activeTenantId,
    currentScope,
    onboardingStorageKey,
    session.isPending,
    storageKey,
  ]);

  useEffect(() => {
    if (workspaceReady)
      localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [storageKey, workspace, workspaceReady]);

  useEffect(() => {
    const scope = activeTenantId ?? 'anonymous';
    if (!loaded || resolvedScope !== scope) return;
    if (workspace.profileOrigin === 'empty' && importReview)
      sessionStorage.setItem(
        onboardingStorageKey,
        JSON.stringify(importReview),
      );
    else if (workspace.profileOrigin !== 'empty')
      sessionStorage.removeItem(onboardingStorageKey);
  }, [
    activeTenantId,
    importReview,
    loaded,
    onboardingStorageKey,
    resolvedScope,
    workspace.profileOrigin,
  ]);

  const importReviewExpiresAt = importReview?.expiresAt;
  useEffect(() => {
    if (!importReviewExpiresAt) return;
    const expiresIn = importReviewExpiresAt - Date.now();
    const expire = () => {
      pendingImport.current?.abort();
      pendingImport.current = undefined;
      sessionStorage.removeItem(onboardingStorageKey);
      setImportReview(undefined);
      setImporting(false);
      setOnboardingMode('start');
      setImportError(
        'Cette revue a expiré après 30 minutes. Relancez l’import pour continuer.',
      );
    };
    if (expiresIn <= 0) {
      expire();
      return;
    }
    const timeout = window.setTimeout(expire, expiresIn);
    return () => window.clearTimeout(timeout);
  }, [importReviewExpiresAt, onboardingStorageKey]);

  useEffect(() => {
    if (!workspaceReady) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    url.searchParams.delete('dossier');
    url.searchParams.delete('tab');
    if (primaryView !== 'home') url.searchParams.set('view', primaryView);
    if (primaryView === 'applications' && dossierView !== 'board') {
      if (workspace.selectedDossierId)
        url.searchParams.set('dossier', workspace.selectedDossierId);
      url.searchParams.set('tab', dossierView);
    }
    history.replaceState(history.state, '', url);
  }, [dossierView, primaryView, workspace.selectedDossierId, workspaceReady]);

  useEffect(() => {
    if (primaryView === 'applications' && dossierView === 'journey')
      window.scrollTo(0, 0);
  }, [dossierView, primaryView]);

  const selectedRunId = state.runId;
  const selectedRunStatus = state.runStatus;
  const selectedRunHasDraft = Boolean(state.spec);
  const selectedRunDossierId = state.id;
  useEffect(() => {
    if (
      !workspaceReady ||
      !activeTenantId ||
      !selectedRunId ||
      (selectedRunStatus && selectedRunStatus !== 'running')
    )
      return;

    const controller = new AbortController();
    let timer: number | undefined;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${selectedRunId}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('RUN_POLL_FAILED');
        const run = persistedRunSchema.parse(await response.json());
        if (stopped || run.runId !== selectedRunId) return;
        setRunPollingErrors((current) => {
          if (!current[selectedRunDossierId]) return current;
          const next = { ...current };
          delete next[selectedRunDossierId];
          return next;
        });
        setWorkspace((current) => {
          const dossier = current.dossiers.find(
            ({ id }) => id === selectedRunDossierId,
          );
          if (!dossier || hasCurrentRunProjection(dossier, run)) return current;
          return updateDossier(current, selectedRunDossierId, (candidate) =>
            applyPersistedRun(candidate, run),
          );
        });
        if (
          !selectedRunHasDraft &&
          run.spec &&
          primaryView === 'applications' &&
          dossierView === 'journey'
        )
          setDossierView('draft');
        if (run.status !== 'running') window.scrollTo(0, 0);
        if (run.status === 'running')
          timer = window.setTimeout(() => void poll(), 2_000);
      } catch {
        if (stopped || controller.signal.aborted) return;
        setRunPollingErrors((current) => ({
          ...current,
          [selectedRunDossierId]:
            'Impossible d’actualiser l’état. Les informations affichées peuvent être obsolètes.',
        }));
        timer = window.setTimeout(() => void poll(), 4_000);
      }
    };

    void poll();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [
    activeTenantId,
    dossierView,
    primaryView,
    runRefreshVersion,
    selectedRunDossierId,
    selectedRunHasDraft,
    selectedRunId,
    selectedRunStatus,
    workspaceReady,
  ]);

  if (!workspaceReady)
    return (
      <main className="workspace-loading" aria-busy="true">
        <span className="brand-mark light" aria-hidden="true">
          C
        </span>
        <p role="status">Chargement de l’espace…</p>
      </main>
    );

  const totalDecisionCount = workspace.dossiers.reduce(
    (total, dossier) =>
      total +
      unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions).length,
    0,
  );
  const status = dossierStatus(state);
  const currentReviewState = reviewProcessState(state);

  function updateApplicationDossier(
    dossierId: string,
    update: (dossier: ApplicationDossier) => ApplicationDossier,
  ) {
    setWorkspace((current) => updateDossier(current, dossierId, update));
  }

  async function persistApplication(dossier: ApplicationDossier) {
    const payload = {
      company: dossier.opportunity.company,
      role: dossier.opportunity.role,
      description: dossier.opportunity.description,
      ...(dossier.opportunity.url ? { url: dossier.opportunity.url } : {}),
      accent: dossier.opportunity.accent,
      stage: 'draft' as const,
    };
    const response = await fetch(
      dossier.applicationId
        ? `/api/applications/${dossier.applicationId}`
        : '/api/applications',
      {
        method: dossier.applicationId ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(!dossier.applicationId ? { 'idempotency-key': dossier.id } : {}),
        },
        body: JSON.stringify(
          dossier.applicationId
            ? { ...payload, expectedRevision: dossier.applicationRevision }
            : payload,
        ),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? 'APPLICATION_CONFLICT'
          : response.status === 400
            ? 'APPLICATION_REJECTED'
            : 'APPLICATION_FAILED',
      );
    const application = applicationSchema.parse(await response.json());
    updateApplicationDossier(dossier.id, (current) => ({
      ...current,
      applicationId: application.applicationId,
      applicationRevision: application.revision,
      opportunity: {
        company: application.company,
        role: application.role,
        description: application.description,
        ...(application.url ? { url: application.url } : {}),
        accent: application.accent,
      },
    }));
    return application;
  }

  async function generate(forceNewRun = false) {
    if (generationPending.current) return;
    const dossierId = state.id;
    if (!opportunityReady(state.opportunity)) {
      setGenerateError(
        'Complétez l’entreprise, le poste et la description avant de générer la page.',
      );
      setDossierView('brief');
      return;
    }
    const persistedWorkspace =
      Boolean(activeTenantId) && workspace.profileOrigin === 'user';
    if (
      persistedWorkspace &&
      JSON.stringify(workspace.profile) !== savedProfileJson
    ) {
      setGenerateError(
        'Enregistrez la mémoire professionnelle avant de générer la page.',
      );
      setPrimaryView('memory');
      return;
    }
    generationPending.current = true;
    setGenerating(true);
    setGenerateError('');
    try {
      const application = persistedWorkspace
        ? await persistApplication(state)
        : undefined;
      const persistedInput = JSON.stringify(
        application
          ? {
              applicationId: application.applicationId,
              applicationRevision: application.revision,
              profileRevision: memoryRevision,
            }
          : { opportunity: state.opportunity, profileRevision: memoryRevision },
      );
      let runId: string | undefined;
      const runProfile = workspace.profile;
      let reviews: WorkspaceReview[];
      let events: WorkflowEvent[];
      let spec: PageSpec | undefined;
      let strategy: Strategy | undefined;
      let publicationEligible = false;

      if (persistedWorkspace) {
        const operation = persistedRunOperation(
          localStorage,
          `career-os-run-request:${activeTenantId}:${dossierId}`,
          persistedInput,
          forceNewRun,
        );
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': operation.key,
          },
          body: persistedInput,
        });
        const workerUnavailable =
          response.status === 503 && (await isWorkerUnavailable(response));
        if (!response.ok)
          throw new Error(
            workerUnavailable
              ? 'RUN_WORKER_UNAVAILABLE'
              : response.status === 409
                ? 'RUN_CONFLICT'
                : response.status === 429
                  ? 'RUN_RATE_LIMITED'
                  : 'RUN_FAILED',
          );
        const persisted = persistedRunSchema.parse(await response.json());
        updateApplicationDossier(dossierId, (current) =>
          applyPersistedRun(current, persisted),
        );
        setRunPollingErrors((current) => {
          if (!current[dossierId]) return current;
          const next = { ...current };
          delete next[dossierId];
          return next;
        });
        setDossierView('journey');
        return;
      } else {
        strategy = buildStrategy(workspace.profile, state.opportunity);
        const localRun = await runAgentTeam({
          tenantId: 'local-demo',
          runId: crypto.randomUUID(),
          profile: workspace.profile,
          opportunity: state.opportunity,
        });
        spec = latestPageSpec(localRun);
        reviews = localRun.reviews;
        publicationEligible = reviews.every((review) => review.passed);
        events = localRun.events.map((event) => ({
          actor:
            event.actor === 'human' || event.actor === 'evidence-archivist'
              ? 'system'
              : event.actor,
          action: event.summary,
          artifact: event.artifactId,
          costMicros: event.costMicros,
        }));
      }
      if (!spec) throw new Error('Draft missing.');
      updateApplicationDossier(dossierId, (current) => ({
        ...current,
        strategy,
        spec,
        runId,
        runProfile,
        reviews,
        reviewDecisions: [],
        publicationEligible,
        approved: false,
        capability: undefined,
        events,
      }));
      setDossierView('journey');
    } catch (error) {
      setGenerateError(
        error instanceof Error && error.message === 'RUN_WORKER_UNAVAILABLE'
          ? 'Le service de traitement de cette instance n’est pas disponible. Démarrez les workers ou contactez l’administrateur, puis réessayez.'
          : error instanceof Error && error.message === 'RUN_CONFLICT'
            ? 'La candidature ou la mémoire professionnelle a changé dans une autre session. Rechargez avant de relancer.'
            : error instanceof Error && error.message === 'RUN_RATE_LIMITED'
              ? 'La limite d’analyses de cet espace est atteinte. Attendez qu’une analyse se termine ou réessayez plus tard.'
              : error instanceof Error &&
                  error.message === 'APPLICATION_CONFLICT'
                ? 'Cette candidature a changé dans une autre session. Rechargez-la avant de relancer.'
                : error instanceof Error &&
                    error.message === 'APPLICATION_REJECTED'
                  ? 'Complétez l’entreprise, le poste et la description avant de générer la page.'
                  : error instanceof Error &&
                      error.message.includes('not supported')
                    ? 'Aucune preuve ne correspond à ce poste. Ajustez le brief ou ajoutez une preuve pertinente, puis réessayez.'
                    : 'La génération s’est arrêtée sans modifier le brief. Réessayez lorsque vous êtes prêt.',
      );
    } finally {
      generationPending.current = false;
      setGenerating(false);
    }
  }

  function review() {
    if (!state.spec) return;
    const dossierId = state.id;
    const reviews = runReviews(
      state.runProfile ?? workspace.profile,
      state.spec,
    );
    updateApplicationDossier(dossierId, (current) => ({
      ...current,
      reviews,
      reviewDecisions: [],
      publicationEligible: reviews.every((item) => item.passed),
      approved: false,
      events: [
        ...current.events,
        ...reviews.map((result) => ({
          actor:
            result.reviewer === 'factuality'
              ? ('fact-checker' as const)
              : result.reviewer,
          action: result.passed
            ? 'Contrôle observable validé.'
            : `${result.findings.length} point(s) à trancher ouvert(s).`,
          artifact: `${result.reviewer}-review-v1`,
          costMicros: 0,
        })),
      ],
    }));
  }

  async function decideReviewIssue(
    review: WorkspaceReview,
    issueIndex: number,
    decision: ReviewDecision['decision'],
  ) {
    if (!state.runId || !review.reviewId) {
      setDecisionError(
        'Cette ancienne revue doit être régénérée avant de pouvoir être tranchée.',
      );
      return;
    }
    const dossierId = state.id;
    const runId = state.runId;
    const issueKey = `${review.reviewId}:${issueIndex}`;
    const operationKey = `${runId}:${issueKey}:${decision}`;
    const idempotencyKey =
      pendingDecisions.current.get(operationKey) ?? crypto.randomUUID();
    pendingDecisions.current.set(operationKey, idempotencyKey);
    setDecisionPending(issueKey);
    setDecisionError('');
    setDecisionMessage('');
    try {
      const response = await fetch(`/api/runs/${runId}/review-decisions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          reviewId: review.reviewId,
          issueIndex,
          decision,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'DECISION_CONFLICT'
            : response.status === 401
              ? 'AUTH_REQUIRED'
              : response.status === 400
                ? 'DECISION_REJECTED'
                : 'DECISION_FAILED',
        );
      const result = reviewIssueDecisionResultSchema.parse(
        await response.json(),
      );
      pendingDecisions.current.delete(operationKey);
      if (result.correctedRun) {
        updateApplicationDossier(dossierId, (current) => ({
          ...current,
          spec: result.correctedRun!.spec,
          runId: result.correctedRun!.runId,
          runProfile: result.correctedRun!.profile,
          reviews: result.correctedRun!.reviews,
          reviewDecisions: [],
          publicationEligible: result.correctedRun!.reviews.every(
            (item) => item.passed,
          ),
          approved: false,
          capability: undefined,
          events: persistedEvents(result.correctedRun!),
        }));
        setShareLink(undefined);
        setShareMessage('');
        setDecisionMessage(
          'Une nouvelle version a été générée et validée par les trois contrôles.',
        );
      } else {
        updateApplicationDossier(dossierId, (current) => ({
          ...current,
          reviewDecisions: [
            ...(current.reviewDecisions ?? []).filter(
              (item) =>
                item.reviewId !== result.reviewId ||
                item.issueIndex !== result.issueIndex,
            ),
            {
              reviewId: result.reviewId,
              issueIndex: result.issueIndex,
              decision: result.decision,
            },
          ],
          publicationEligible: result.publicationEligible,
          approved: false,
        }));
        setDecisionMessage(
          result.publicationEligible
            ? 'Votre décision est enregistrée. La candidature peut maintenant être validée.'
            : 'Votre décision est enregistrée. Il reste des points à trancher.',
        );
      }
    } catch (error) {
      setDecisionError(
        error instanceof Error && error.message === 'DECISION_CONFLICT'
          ? 'Une autre session a déjà tranché ce point différemment. Relancez la candidature depuis son état enregistré.'
          : error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Reconnectez-vous avant de trancher ce point.'
            : error instanceof Error && error.message === 'DECISION_REJECTED'
              ? 'Cette décision n’est pas autorisée pour ce contrôle. Revenez au brief pour produire une nouvelle version.'
              : 'La décision n’a pas pu être enregistrée. Vous pouvez réessayer sans risque de doublon.',
      );
    } finally {
      setDecisionPending('');
    }
  }

  async function confirmResearchSignals() {
    if (!activeTenantId || !state.runId || !state.runResearch) return;
    const selectedSignalIds = state.selectedResearchSignalIds ?? [];
    if (!selectedSignalIds.length) {
      setSelectionError('Conservez au moins un critère pour continuer.');
      return;
    }
    const dossierId = state.id;
    const runId = state.runId;
    const payload = JSON.stringify({
      researchArtifactId: state.runResearch.artifactId,
      selectedSignalIds,
    });
    const operation = persistedRunOperation(
      localStorage,
      `career-os-evidence-selection:${activeTenantId}:${runId}`,
      payload,
    );
    setSelectionPending(true);
    setSelectionError('');
    try {
      const response = await fetch(`/api/runs/${runId}/evidence-selection`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': operation.key,
        },
        body: payload,
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'SELECTION_CONFLICT'
            : response.status === 400
              ? 'SELECTION_REJECTED'
              : 'SELECTION_FAILED',
        );
      const run = persistedRunSchema.parse(await response.json());
      updateApplicationDossier(dossierId, (current) =>
        applyPersistedRun(current, run),
      );
      setRunRefreshVersion((current) => current + 1);
    } catch (error) {
      setSelectionError(
        error instanceof Error && error.message === 'SELECTION_CONFLICT'
          ? 'Cette analyse a déjà été confirmée avec une autre sélection.'
          : error instanceof Error && error.message === 'SELECTION_REJECTED'
            ? 'La sélection ne correspond plus à cette analyse. Actualisez le dossier.'
            : 'La sélection n’a pas été enregistrée. Vous pouvez réessayer sans perdre vos choix.',
      );
    } finally {
      setSelectionPending(false);
    }
  }

  async function startRecruiterStrategy() {
    if (!activeTenantId || !state.runId || !state.runEvidenceArchive) return;
    const dossierId = state.id;
    const runId = state.runId;
    const payload = JSON.stringify({
      evidenceArtifactId: state.runEvidenceArchive.artifactId,
      evidenceArtifactHash: state.runEvidenceArchive.artifactHash,
    });
    const operation = persistedRunOperation(
      localStorage,
      `career-os-strategy-start:${activeTenantId}:${runId}`,
      payload,
    );
    setSelectionPending(true);
    setSelectionError('');
    try {
      const response = await fetch(`/api/runs/${runId}/strategy`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': operation.key,
        },
        body: payload,
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'STRATEGY_CONFLICT'
            : response.status === 400
              ? 'STRATEGY_REJECTED'
              : 'STRATEGY_FAILED',
        );
      const run = persistedRunSchema.parse(await response.json());
      updateApplicationDossier(dossierId, (current) =>
        applyPersistedRun(current, run),
      );
      setRunRefreshVersion((current) => current + 1);
    } catch (error) {
      setSelectionError(
        error instanceof Error && error.message === 'STRATEGY_CONFLICT'
          ? 'Cette archive a déjà été validée avec une autre décision.'
          : error instanceof Error && error.message === 'STRATEGY_REJECTED'
            ? 'Cette archive n’est plus la version courante. Actualisez le dossier.'
            : 'La stratégie n’a pas démarré. Vous pouvez réessayer sans risque de doublon.',
      );
    } finally {
      setSelectionPending(false);
    }
  }

  async function approveRecruiterStrategy() {
    if (!activeTenantId || !state.runId || !state.runStrategy) return;
    const dossierId = state.id;
    const runId = state.runId;
    const payload = JSON.stringify({
      strategyArtifactId: state.runStrategy.artifactId,
      strategyArtifactHash: state.runStrategy.artifactHash,
    });
    const operation = persistedRunOperation(
      localStorage,
      `career-os-strategy-approval:${activeTenantId}:${runId}`,
      payload,
    );
    setSelectionPending(true);
    setSelectionError('');
    try {
      const response = await fetch(`/api/runs/${runId}/strategy/approval`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': operation.key,
        },
        body: payload,
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'APPROVAL_CONFLICT'
            : response.status === 400
              ? 'APPROVAL_REJECTED'
              : 'APPROVAL_FAILED',
        );
      const run = persistedRunSchema.parse(await response.json());
      updateApplicationDossier(dossierId, (current) =>
        applyPersistedRun(current, run),
      );
    } catch (error) {
      setSelectionError(
        error instanceof Error && error.message === 'APPROVAL_CONFLICT'
          ? 'Cette stratégie a déjà reçu une décision différente.'
          : error instanceof Error && error.message === 'APPROVAL_REJECTED'
            ? 'Cette stratégie n’est plus la version courante. Actualisez le dossier.'
            : 'La validation n’a pas été enregistrée. Vous pouvez réessayer sans risque de doublon.',
      );
    } finally {
      setSelectionPending(false);
    }
  }

  async function startReviews() {
    if (!state.spec) return;
    if (!state.runId) {
      review();
      setDossierView('review');
      return;
    }
    if (!activeTenantId) return;
    const dossierId = state.id;
    const runId = state.runId;
    const payload = '{}';
    const operation = persistedRunOperation(
      localStorage,
      `career-os-review-start:${activeTenantId}:${runId}`,
      payload,
    );
    setSelectionPending(true);
    setSelectionError('');
    try {
      const response = await fetch(`/api/runs/${runId}/reviews`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': operation.key,
        },
        body: payload,
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'REVIEW_CONFLICT'
            : response.status === 400
              ? 'REVIEW_REJECTED'
              : 'REVIEW_FAILED',
        );
      const run = persistedRunSchema.parse(await response.json());
      updateApplicationDossier(dossierId, (current) =>
        applyPersistedRun(current, run),
      );
      setDossierView('journey');
      setRunRefreshVersion((current) => current + 1);
    } catch (error) {
      setSelectionError(
        error instanceof Error && error.message === 'REVIEW_CONFLICT'
          ? 'Ces vérifications ont déjà été lancées depuis une autre version.'
          : error instanceof Error && error.message === 'REVIEW_REJECTED'
            ? 'Le brouillon n’est plus la version courante. Actualisez le dossier.'
            : 'Les vérifications n’ont pas démarré. Vous pouvez réessayer sans risque de doublon.',
      );
    } finally {
      setSelectionPending(false);
    }
  }

  async function publish() {
    if (!state.runId || !state.approved || !reviewGateReady(state)) return;
    const dossierId = state.id;
    const runId = state.runId;
    const scopeAtStart = resolvedScope;
    setPublishing(true);
    setPublishError('');
    try {
      const response = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('AUTH_REQUIRED');
        throw new Error('Publication rejected.');
      }
      const publication = (await response.json()) as {
        publicationId: string;
        rawToken: string;
      };
      if (requestedScope.current !== scopeAtStart) return;
      updateApplicationDossier(dossierId, (current) => ({
        ...current,
        capability: publication.publicationId,
      }));
      setShareLink({
        scope: scopeAtStart,
        dossierId,
        url: `/p/${publication.publicationId}#${publication.rawToken}`,
      });
      if (selectedDossierIdRef.current === dossierId)
        setShareMessage('Lien privé créé.');
    } catch (error) {
      setPublishError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Connectez-vous avant de créer un lien privé.'
          : 'Le lien privé n’a pas pu être créé. Vérifiez la connexion au serveur, puis réessayez.',
      );
    } finally {
      setPublishing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
    setShareMessage('Lien privé copié.');
  }

  async function revoke() {
    if (
      !state.capability ||
      !confirm(
        'Révoquer ce lien privé ? Toutes les personnes qui l’utilisent perdront leur accès.',
      )
    )
      return;
    const dossierId = state.id;
    const capability = state.capability;
    const response = await fetch(`/api/publications/${capability}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setPublishError(
        response.status === 401
          ? 'Connectez-vous pour révoquer ce lien privé.'
          : 'Le lien privé n’a pas pu être révoqué. Réessayez.',
      );
      return;
    }
    updateApplicationDossier(dossierId, (current) => ({
      ...current,
      capability: undefined,
    }));
    setShareLink(undefined);
    setShareMessage('Lien privé révoqué.');
  }

  async function signOut() {
    const result = await authClient.signOut();
    if (result.error) return;
    setShareLink(undefined);
    setShareMessage(
      state.capability
        ? 'Vous êtes déconnecté. Le lien privé existant reste actif jusqu’à sa révocation.'
        : 'Vous êtes déconnecté.',
    );
  }

  async function saveCareerMemory(profile = workspace.profile) {
    if (!activeTenantId) {
      setMemorySyncMessage(
        'Connectez-vous pour enregistrer la mémoire professionnelle dans un espace.',
      );
      return false;
    }
    setMemorySyncing(true);
    setMemorySyncMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile,
          expectedRevision: memoryRevision,
        }),
      });
      if (response.status === 409) throw new Error('PROFILE_CONFLICT');
      if (!response.ok) throw new Error('PROFILE_SAVE_FAILED');
      const result = (await response.json()) as {
        profile: Profile;
        revision: number;
      };
      setSavedProfileJson(JSON.stringify(result.profile));
      setMemoryRevision(result.revision);
      setWorkspace((current) =>
        invalidateDossiersAfterProfileChange(current, result.profile, 'user'),
      );
      setMemorySyncMessage(
        'Mémoire professionnelle enregistrée dans cet espace.',
      );
      return true;
    } catch (error) {
      setMemorySyncMessage(
        error instanceof Error && error.message === 'PROFILE_CONFLICT'
          ? 'La mémoire professionnelle a changé dans une autre session. Actualisez avant de l’enregistrer à nouveau.'
          : 'La mémoire professionnelle n’a pas pu être enregistrée. Vos changements locaux sont conservés.',
      );
      return false;
    } finally {
      setMemorySyncing(false);
    }
  }

  function prepareImport(result: ProfileImportResult) {
    const selectedByGroup = new Map<ProfileImportCandidate['group'], number>();
    const review: ImportReview = {
      ...result,
      name: result.suggestedName?.value ?? '',
      headline: result.suggestedHeadline?.value ?? '',
      candidates: result.candidates.map((candidate) => {
        const groupCount = selectedByGroup.get(candidate.group) ?? 0;
        const groupLimit = candidate.group === 'experience' ? 6 : 2;
        const selected =
          groupCount < groupLimit && isStrongImportCandidate(candidate);
        if (selected) selectedByGroup.set(candidate.group, groupCount + 1);
        return {
          ...candidate,
          id: crypto.randomUUID(),
          selected,
          sensitivity: 'private',
          allowedUses: ['application'],
        };
      }),
      permissionsConfirmed: false,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    updateImportReview(review);
    setOnboardingMode('review');
    setImportError('');
  }

  function updateImportReview(review: ImportReview) {
    setImportReview(review);
    if (workspace.profileOrigin === 'empty')
      sessionStorage.setItem(onboardingStorageKey, JSON.stringify(review));
  }

  function discardImportReview(message = '') {
    pendingImport.current?.abort();
    pendingImport.current = undefined;
    sessionStorage.removeItem(onboardingStorageKey);
    setImportReview(undefined);
    setImporting(false);
    setOnboardingMode('start');
    setImportError(message);
  }

  async function importFile(file: File) {
    pendingImport.current?.abort();
    const controller = new AbortController();
    pendingImport.current = controller;
    setImporting(true);
    setImportError('');
    try {
      prepareImport(await importProfileFile(file, controller.signal));
    } catch (error) {
      if (controller.signal.aborted) return;
      setImportError(importErrorMessage(error));
    } finally {
      if (pendingImport.current === controller)
        pendingImport.current = undefined;
      setImporting(false);
    }
  }

  async function importPastedText() {
    setImporting(true);
    setImportError('');
    try {
      prepareImport(await importProfileText(pasteText, 'CV collé'));
    } catch (error) {
      setImportError(importErrorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  async function acceptImport() {
    if (!importReview) return;
    const selected = importReview.candidates.filter((item) => item.selected);
    if (
      importReview.name.trim().length < 2 ||
      importReview.headline.trim().length < 2 ||
      selected.length === 0 ||
      !importReview.permissionsConfirmed
    ) {
      setImportError(
        'Renseignez votre identité, gardez au moins une affirmation et confirmez ses usages avant de continuer.',
      );
      return;
    }
    const sourceId = `source-${crypto.randomUUID()}`;
    const allowedUses = [
      ...new Set(selected.flatMap((item) => item.allowedUses)),
    ];
    const profileResult = profileSchema.safeParse({
      name: importReview.name.trim(),
      headline: importReview.headline.trim(),
      sources: [
        {
          id: sourceId,
          kind: 'document',
          title: importReview.source.displayName,
          locator: `sha256:${importReview.source.sha256}`,
          sensitivity: 'private',
          allowedUses,
          trust: 'untrusted-data',
        },
      ],
      evidence: selected.map((candidate) => ({
        id: `evidence-${candidate.id}`,
        sourceId,
        label: candidate.locator,
        excerpt: candidate.excerpt,
      })),
      claims: selected.map((candidate) => ({
        id: `claim-${candidate.id}`,
        statement: candidate.statement,
        level: 'declared',
        evidenceIds: [`evidence-${candidate.id}`],
        sensitivity: candidate.sensitivity,
        allowedUses: candidate.allowedUses,
      })),
    });
    if (!profileResult.success) {
      setImportError(
        'Certaines informations sont incomplètes. Corrigez les champs signalés avant de continuer.',
      );
      return;
    }
    await installProfile(profileResult.data);
  }

  async function acceptManualProfile() {
    const evidenceId = `evidence-${crypto.randomUUID()}`;
    const sourceId = `source-${crypto.randomUUID()}`;
    if (!manualConfirmed) {
      setImportError(
        'Confirmez que cette information peut être utilisée pour vos candidatures.',
      );
      return;
    }
    const result = profileSchema.safeParse({
      name: workspace.profile.name.trim(),
      headline: workspace.profile.headline.trim(),
      sources: [
        {
          id: sourceId,
          kind: 'manual',
          title: memoryDraft.source.trim(),
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: memoryDraft.evidence.trim()
        ? [
            {
              id: evidenceId,
              sourceId,
              label: 'Extrait saisi manuellement',
              excerpt: memoryDraft.evidence.trim(),
            },
          ]
        : [],
      claims: [
        {
          id: `claim-${crypto.randomUUID()}`,
          statement: memoryDraft.claim.trim(),
          level: 'declared',
          evidenceIds: memoryDraft.evidence.trim() ? [evidenceId] : [],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    });
    if (!result.success) {
      setImportError(
        'Renseignez votre nom, votre positionnement, une source et une première affirmation.',
      );
      return;
    }
    await installProfile(result.data);
  }

  async function installProfile(profile: Profile) {
    setWorkspace((current) =>
      invalidateDossiersAfterProfileChange(current, profile, 'user'),
    );
    sessionStorage.removeItem(onboardingStorageKey);
    setImportReview(undefined);
    setOnboardingMode('start');
    setPasteText('');
    setManualConfirmed(false);
    setPrimaryView('memory');
    setShowMemoryHandoff(true);
    window.scrollTo(0, 0);
    if (activeTenantId) await saveCareerMemory(profile);
    else
      setMemorySyncMessage(
        'Votre mémoire reste dans ce navigateur. Connectez-vous pour l’enregistrer.',
      );
  }

  function useDemo() {
    sessionStorage.removeItem(onboardingStorageKey);
    setImportReview(undefined);
    setImportError('');
    setShowMemoryHandoff(false);
    const dossier = createDemoDossier();
    setWorkspace({
      version: 2,
      profile: syntheticProfile,
      profileOrigin: 'demo',
      dossiers: [dossier],
      selectedDossierId: dossier.id,
    });
    setPrimaryView('home');
  }

  function addMemory() {
    if (
      !memoryDraft.source.trim() ||
      !memoryDraft.claim.trim() ||
      (memoryDraft.level === 'verified' && !memoryDraft.evidence.trim())
    ) {
      setMemoryError(
        'Ajoutez une source et une affirmation. Une affirmation vérifiée exige aussi un extrait de preuve.',
      );
      return;
    }
    const suffix = crypto.randomUUID();
    const evidenceId = `evidence-${suffix}`;
    const profile = profileSchema.parse({
      ...workspace.profile,
      sources: [
        ...workspace.profile.sources,
        {
          id: `source-${suffix}`,
          kind: 'manual',
          title: memoryDraft.source.trim(),
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: memoryDraft.evidence.trim()
        ? [
            ...workspace.profile.evidence,
            {
              id: evidenceId,
              sourceId: `source-${suffix}`,
              label: 'User-provided evidence',
              excerpt: memoryDraft.evidence.trim(),
            },
          ]
        : workspace.profile.evidence,
      claims: [
        ...workspace.profile.claims,
        {
          id: `claim-${suffix}`,
          statement: memoryDraft.claim.trim(),
          level: memoryDraft.level,
          evidenceIds: memoryDraft.evidence.trim() ? [evidenceId] : [],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    });
    setWorkspace((current) =>
      invalidateDossiersAfterProfileChange(current, profile, 'user'),
    );
    setMemoryDraft({ source: '', claim: '', evidence: '', level: 'declared' });
    setMemoryError('');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'career-os-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function openApplications(view: DossierView = 'board') {
    setDossierView(view);
    setPrimaryView('applications');
  }

  function openApplication(dossierId: string, view?: DossierView) {
    const dossier = workspace.dossiers.find(({ id }) => id === dossierId);
    if (!dossier) return;
    setWorkspace((current) => ({
      ...current,
      selectedDossierId: dossierId,
    }));
    setGenerateError('');
    setDecisionError('');
    setDecisionMessage('');
    setPublishError('');
    setShareLink(undefined);
    setShareMessage('');
    openApplications(view ?? dossierNextView(dossier));
  }

  function createApplication() {
    const dossier = createEmptyDossier();
    setWorkspace((current) => ({
      ...current,
      dossiers: [dossier, ...current.dossiers],
      selectedDossierId: dossier.id,
    }));
    setGenerateError('');
    openApplications('brief');
  }

  if (workspace.profileOrigin === 'empty')
    return (
      <OnboardingView
        error={importError}
        importing={importing}
        manualConfirmed={manualConfirmed}
        memoryDraft={memoryDraft}
        mode={onboardingMode}
        pasteText={pasteText}
        profile={workspace.profile}
        review={importReview}
        signedIn={Boolean(activeTenantId)}
        onAcceptImport={() => void acceptImport()}
        onAcceptManual={() => void acceptManualProfile()}
        onCancel={() => discardImportReview()}
        onFile={(file) => void importFile(file)}
        onManualConfirmed={setManualConfirmed}
        onMemoryDraftChange={setMemoryDraft}
        onModeChange={(mode) => {
          setImportError('');
          setOnboardingMode(mode);
        }}
        onPasteTextChange={setPasteText}
        onProfileChange={(profile) =>
          setWorkspace((current) => ({ ...current, profile }))
        }
        onReviewChange={updateImportReview}
        onSubmitPaste={() => void importPastedText()}
        onUseDemo={useDemo}
      />
    );

  return (
    <main
      className={`app-shell ${primaryView === 'applications' && dossierView !== 'board' ? 'dossier-mode' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar" aria-label="Career OS navigation">
        <div className="tool-rail">
          <button
            className="brand-mark"
            aria-label="Ouvrir les candidatures"
            onClick={() => openApplications()}
            type="button"
          >
            <span aria-hidden="true">C</span>
          </button>
          <nav className="primary-nav" aria-label="Primary">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                data-label={label}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
          <span className="rail-avatar" aria-hidden="true">
            {session.data?.user.name.charAt(0).toUpperCase() ?? 'K'}
          </span>
        </div>
        <div className="sidebar-panel">
          <div className="brand">
            <span className="brand-mark light" aria-hidden="true">
              C
            </span>
            <span>
              <strong>Career OS</strong>
              <small>
                {activeOrganization.data?.name ?? 'Espace personnel'}
              </small>
            </span>
          </div>
          <p className="sidebar-label">Espace</p>
          <nav className="workspace-nav" aria-label="Espace">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
              >
                <NavIcon name={id} />
                <span>{label}</span>
                {id === 'activity' && totalDecisionCount ? (
                  <small>{totalDecisionCount}</small>
                ) : null}
              </button>
            ))}
          </nav>
          <p className="sidebar-label">En cours</p>
          <div className="application-list">
            {[...workspace.dossiers]
              .sort((left, right) => right.updatedAt - left.updatedAt)
              .slice(0, 5)
              .map((dossier) => (
                <button
                  aria-current={
                    primaryView === 'applications' &&
                    workspace.selectedDossierId === dossier.id
                      ? 'page'
                      : undefined
                  }
                  className="application-row"
                  key={dossier.id}
                  onClick={() => openApplication(dossier.id)}
                >
                  <span className="company-mark compact" aria-hidden="true">
                    {dossier.opportunity.company.charAt(0) || '+'}
                  </span>
                  <span>
                    <strong>
                      {dossier.opportunity.company || 'Nouvelle offre'}
                    </strong>
                    <small>
                      {dossier.opportunity.role || 'Brief à compléter'}
                    </small>
                  </span>
                </button>
              ))}
            <button className="application-row new" onClick={createApplication}>
              <span className="company-mark compact" aria-hidden="true">
                +
              </span>
              <span>
                <strong>Nouvelle candidature</strong>
                <small>Coller une offre</small>
              </span>
            </button>
          </div>

          <p className="demo-label">
            {activeTenantId
              ? memoryRevision
                ? 'Espace synchronisé'
                : 'Données de départ non enregistrées'
              : workspace.profileOrigin === 'demo'
                ? 'Données de démonstration'
                : 'Stocké dans ce navigateur'}
          </p>
          <section className="hosting-card" aria-label="État de l’instance">
            <strong>Auto-hébergé</strong>
            <span>Vos preuves ne quittent pas votre instance.</span>
            <button onClick={() => setPrimaryView('settings')} type="button">
              Voir la config
            </button>
          </section>
          <div className="account-control">
            {session.isPending ? (
              <small>Vérification du compte…</small>
            ) : session.data ? (
              <>
                <span aria-hidden="true">
                  {session.data.user.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{session.data.user.name}</strong>
                  <small>
                    {activeOrganization.data?.name ?? 'Choisir un espace'}
                  </small>
                  <button onClick={() => void signOut()} type="button">
                    Se déconnecter
                  </button>
                </div>
              </>
            ) : (
              <Link href="/sign-in?next=/">Se connecter pour partager</Link>
            )}
          </div>
        </div>
      </aside>

      <section className="shell-content" id="main-content">
        {primaryView !== 'applications' || dossierView === 'board' ? (
          <nav className="mobile-primary-nav" aria-label="Espace sur mobile">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
        ) : null}
        {primaryView === 'home' ? (
          <HomeView
            dossiers={workspace.dossiers}
            profile={workspace.profile}
            onCreateApplication={createApplication}
            onOpenApplication={(dossierId, view) =>
              openApplication(dossierId, view)
            }
            onOpenMemory={() => setPrimaryView('memory')}
          />
        ) : null}
        {primaryView === 'applications' && dossierView === 'board' ? (
          <ApplicationsView
            dossiers={workspace.dossiers}
            profile={workspace.profile}
            onCreate={createApplication}
            onOpen={(dossierId, view) => openApplication(dossierId, view)}
          />
        ) : null}
        {primaryView === 'applications' &&
        dossierView !== 'board' &&
        workspace.selectedDossierId ? (
          <>
            <header className="application-topbar">
              <button
                aria-label="Retour aux candidatures"
                className="round-action quiet"
                onClick={() => openApplications('board')}
                type="button"
              >
                ←
              </button>
              <div className="object-identity">
                <span className="company-mark" aria-hidden="true">
                  {state.opportunity.company.charAt(0)}
                </span>
                <div>
                  <p>
                    {state.opportunity.company} · {state.opportunity.role}
                  </p>
                  <h1>Parcours de candidature</h1>
                </div>
              </div>
              <nav className="dossier-tabs" aria-label="Vues de la candidature">
                {dossierViews.map(([id, label]) => (
                  <button
                    aria-current={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'page'
                        : undefined
                    }
                    className={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'active'
                        : ''
                    }
                    disabled={
                      (id === 'draft' && !state.spec) ||
                      (id === 'share' && !state.approved && !state.capability)
                    }
                    key={id}
                    onClick={() => setDossierView(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="status-block">
                {state.spec ? (
                  <button
                    className="round-action inspector-toggle quiet"
                    aria-label="Voir les preuves"
                    aria-controls="evidence-inspector"
                    aria-expanded={inspectorOpen}
                    onClick={() => openEvidenceInspector()}
                  >
                    ⌕
                  </button>
                ) : null}
                {state.approved ? (
                  <button onClick={() => setDossierView('share')}>
                    Valider et publier
                  </button>
                ) : (
                  <span className="application-status" role="status">
                    {status}
                  </span>
                )}
              </div>
            </header>
            <div className="application-layout">
              <div className="document-area">
                {dossierView === 'brief' ? (
                  <BriefView
                    key={state.id}
                    canImportUrl={Boolean(activeTenantId)}
                    error={generateError}
                    generating={generating}
                    hasDraft={Boolean(state.spec)}
                    locked={
                      Boolean(state.runId) &&
                      !state.spec &&
                      state.runStatus === 'running'
                    }
                    opportunity={state.opportunity}
                    onChange={(opportunity) => {
                      const dossierId = state.id;
                      if (activeTenantId)
                        localStorage.removeItem(
                          `career-os-run-request:${activeTenantId}:${dossierId}`,
                        );
                      updateApplicationDossier(dossierId, (current) => ({
                        ...current,
                        opportunity,
                        approved: false,
                      }));
                    }}
                    onGenerate={generate}
                  />
                ) : null}
                {dossierView === 'company' ? (
                  <CompanyView opportunity={state.opportunity} />
                ) : null}
                {dossierView === 'journey' ? (
                  state.runId && !state.spec ? (
                    <RunProgressView
                      dossier={state}
                      pollingError={runPollingErrors[state.id]}
                      onBack={() => openApplications('board')}
                      onOpenBrief={() => setDossierView('brief')}
                      onRefresh={() =>
                        setRunRefreshVersion((current) => current + 1)
                      }
                      onRetry={() => void generate(true)}
                      selectionError={selectionError}
                      selectionPending={selectionPending}
                      onConfirmResearch={() => void confirmResearchSignals()}
                      onStartStrategy={() => void startRecruiterStrategy()}
                      onApproveStrategy={() => void approveRecruiterStrategy()}
                      onToggleSignal={(signalId) =>
                        updateApplicationDossier(state.id, (current) => {
                          const selected = new Set(
                            current.selectedResearchSignalIds ?? [],
                          );
                          if (selected.has(signalId)) selected.delete(signalId);
                          else selected.add(signalId);
                          return {
                            ...current,
                            selectedResearchSignalIds:
                              current.runResearch?.signals
                                .map((signal) => signal.signalId)
                                .filter((id) => selected.has(id)) ?? [],
                          };
                        })
                      }
                      onOpenEvidence={openEvidenceInspector}
                    />
                  ) : (
                    <JourneyView
                      approved={state.approved}
                      opportunity={state.opportunity}
                      profile={state.runProfile ?? workspace.profile}
                      pollingError={runPollingErrors[state.id] ?? ''}
                      workerAvailability={state.workerAvailability}
                      retryError={generateError}
                      retryPending={generating}
                      reviewState={currentReviewState}
                      reviews={state.reviews}
                      spec={state.spec}
                      onGenerate={generate}
                      onOpenBrief={() => setDossierView('brief')}
                      onOpenDraft={() => setDossierView('draft')}
                      onOpenEvidence={openEvidenceInspector}
                      onRefresh={() =>
                        setRunRefreshVersion((current) => current + 1)
                      }
                      onRetry={() => void generate(true)}
                      onReview={() => {
                        if (!state.runId) review();
                        setDossierView('review');
                      }}
                    />
                  )
                ) : null}
                {dossierView === 'draft' && state.spec ? (
                  <DraftView
                    profile={state.runProfile ?? workspace.profile}
                    reviewError={selectionError}
                    reviewPending={selectionPending}
                    retryError={generateError}
                    retryPending={generating}
                    reviewsAvailable={reviewsComplete(state.reviews)}
                    reviewState={currentReviewState}
                    spec={state.spec}
                    workerAvailability={state.workerAvailability}
                    onOpenEvidence={openEvidenceInspector}
                    onOpenReview={() => setDossierView('review')}
                    onRefresh={() =>
                      setRunRefreshVersion((current) => current + 1)
                    }
                    onRetry={() => void generate(true)}
                    onStartReviews={() => void startReviews()}
                  />
                ) : null}
                {dossierView === 'review' && state.spec ? (
                  <ReviewView
                    approved={state.approved}
                    paused={state.paused}
                    reviews={state.reviews}
                    decisions={state.reviewDecisions}
                    decisionError={decisionError}
                    decisionMessage={decisionMessage}
                    decisionPending={decisionPending}
                    publicationEligible={reviewGateReady(state)}
                    canRerun={!state.runId}
                    onApprove={(approved) =>
                      updateApplicationDossier(state.id, (current) => ({
                        ...current,
                        approved,
                      }))
                    }
                    onContinue={() => setDossierView('share')}
                    onReturnToBrief={() => setDossierView('brief')}
                    onDecide={(review, issueIndex, decision) =>
                      void decideReviewIssue(review, issueIndex, decision)
                    }
                    onReview={review}
                  />
                ) : null}
                {dossierView === 'share' && (state.spec || state.capability) ? (
                  <ShareView
                    canPublish={
                      memoryRevision > 0 &&
                      Boolean(state.runId) &&
                      state.approved &&
                      reviewGateReady(state)
                    }
                    error={publishError}
                    publishing={publishing}
                    shareMessage={shareMessage}
                    shareUrl={shareUrl}
                    publicationExists={Boolean(state.capability)}
                    hasPersistedRun={Boolean(state.runId)}
                    signedIn={Boolean(
                      session.data?.session.activeOrganizationId,
                    )}
                    onCopy={copyLink}
                    onPublish={publish}
                    onRevoke={revoke}
                  />
                ) : null}
              </div>
              {state.spec || inspectorOpen ? (
                <EvidenceInspector
                  open={inspectorOpen}
                  profile={state.runProfile ?? workspace.profile}
                  selectedClaimId={selectedClaimId}
                  spec={state.spec}
                  onClose={closeEvidenceInspector}
                />
              ) : dossierView === 'brief' ? (
                <aside className="brief-context" aria-label="Prochaine étape">
                  <p className="section-label">Prochaine action</p>
                  <h2>Générer la première page</h2>
                  <p>
                    Seules les affirmations appuyées par une preuve admissible
                    peuvent apparaître dans la page.
                  </p>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}

        {primaryView === 'memory' ? (
          <CareerMemoryView
            error={memoryError}
            memoryDraft={memoryDraft}
            dirty={JSON.stringify(workspace.profile) !== savedProfileJson}
            signedIn={Boolean(activeTenantId)}
            syncing={memorySyncing}
            syncMessage={memorySyncMessage}
            showHandoff={showMemoryHandoff}
            profile={workspace.profile}
            onAdd={addMemory}
            onDraftChange={setMemoryDraft}
            onSave={() => void saveCareerMemory()}
            onCreateApplication={() => {
              setShowMemoryHandoff(false);
              createApplication();
            }}
            onDismissHandoff={() => setShowMemoryHandoff(false)}
            onProfileChange={(profile) =>
              setWorkspace((current) =>
                invalidateDossiersAfterProfileChange(current, profile, 'user'),
              )
            }
          />
        ) : null}
        {primaryView === 'activity' ? (
          <ActivityView
            dossiers={workspace.dossiers}
            onOpenReview={(dossierId) => openApplication(dossierId, 'review')}
          />
        ) : null}
        {primaryView === 'settings' ? (
          <SettingsView
            onExport={exportData}
            onReset={() => {
              if (
                confirm(
                  'Réinitialiser cet espace local ? La mémoire et les candidatures de ce navigateur seront supprimées.',
                )
              ) {
                localStorage.removeItem('career-os-demo');
                location.reload();
              }
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function OnboardingView({
  error,
  importing,
  manualConfirmed,
  memoryDraft,
  mode,
  onAcceptImport,
  onAcceptManual,
  onCancel,
  onFile,
  onManualConfirmed,
  onMemoryDraftChange,
  onModeChange,
  onPasteTextChange,
  onProfileChange,
  onReviewChange,
  onSubmitPaste,
  onUseDemo,
  pasteText,
  profile,
  review,
  signedIn,
}: {
  error: string;
  importing: boolean;
  manualConfirmed: boolean;
  memoryDraft: {
    source: string;
    claim: string;
    evidence: string;
    level: 'verified' | 'declared' | 'inferred';
  };
  mode: OnboardingMode;
  onAcceptImport: () => void;
  onAcceptManual: () => void;
  onCancel: () => void;
  onFile: (file: File) => void;
  onManualConfirmed: (confirmed: boolean) => void;
  onMemoryDraftChange: (draft: typeof memoryDraft) => void;
  onModeChange: (mode: OnboardingMode) => void;
  onPasteTextChange: (text: string) => void;
  onProfileChange: (profile: Profile) => void;
  onReviewChange: (review: ImportReview) => void;
  onSubmitPaste: () => void;
  onUseDemo: () => void;
  pasteText: string;
  profile: Profile;
  review?: ImportReview;
  signedIn: boolean;
}) {
  const selectedCount =
    review?.candidates.filter((candidate) => candidate.selected).length ?? 0;
  const reviewReady = Boolean(
    review &&
    review.name.trim().length >= 2 &&
    review.headline.trim().length >= 2 &&
    review.permissionsConfirmed &&
    selectedCount > 0 &&
    review.candidates
      .filter((candidate) => candidate.selected)
      .every((candidate) => candidate.allowedUses.length > 0),
  );

  return (
    <main className="onboarding-shell" id="main-content">
      <a className="skip-link" href="#onboarding-workspace">
        Aller au contenu
      </a>
      <header className="onboarding-header">
        <div className="brand">
          <span className="brand-mark light" aria-hidden="true">
            C
          </span>
          <span>
            <strong>Career OS</strong>
            <small>Mémoire professionnelle</small>
          </span>
        </div>
        <span className="local-processing">Traitement local</span>
      </header>

      <section className="onboarding-workspace" id="onboarding-workspace">
        <aside className="onboarding-intro">
          <p className="section-label">Étape 1 sur 2</p>
          <h1>Construisons votre mémoire professionnelle.</h1>
          <p>
            Career OS part de votre travail réel. Vous choisissez les sources,
            relisez chaque affirmation et décidez de ce qui pourra être utilisé.
          </p>
          <ol>
            <li className="active">Importer et relire</li>
            <li>Créer votre première candidature</li>
          </ol>
          <div className="privacy-note">
            <strong>Votre CV reste dans ce navigateur.</strong>
            <span>
              Le fichier brut n’est ni envoyé au serveur ni conservé. Seules les
              informations que vous acceptez rejoignent votre mémoire.
            </span>
          </div>
        </aside>

        <div className="onboarding-panel">
          {mode === 'start' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Point de départ</p>
                <h2>Comment voulez-vous commencer ?</h2>
                <p>
                  Le CV est le chemin le plus rapide. Rien n’est ajouté sans
                  votre validation.
                </p>
              </div>
              <div className="onboarding-options">
                <label className="onboarding-option primary-option">
                  <input
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="file-input"
                    disabled={importing}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onFile(file);
                      event.currentTarget.value = '';
                    }}
                    type="file"
                  />
                  <span className="option-icon" aria-hidden="true">
                    ↥
                  </span>
                  <span>
                    <strong>
                      {importing ? 'Lecture du CV…' : 'Importer mon CV'}
                    </strong>
                    <small>PDF, DOCX ou TXT · 4 Mo maximum</small>
                  </span>
                  <b aria-hidden="true">→</b>
                </label>
                <button
                  className="onboarding-option quiet"
                  onClick={() => onModeChange('paste')}
                  type="button"
                >
                  <span className="option-icon" aria-hidden="true">
                    ≡
                  </span>
                  <span>
                    <strong>Coller le texte de mon CV</strong>
                    <small>Pratique si votre document est déjà ouvert</small>
                  </span>
                  <b aria-hidden="true">→</b>
                </button>
                <button
                  className="onboarding-option quiet"
                  onClick={() => onModeChange('manual')}
                  type="button"
                >
                  <span className="option-icon" aria-hidden="true">
                    ＋
                  </span>
                  <span>
                    <strong>Commencer manuellement</strong>
                    <small>
                      Ajoutez une première expérience à votre rythme
                    </small>
                  </span>
                  <b aria-hidden="true">→</b>
                </button>
              </div>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="demo-entry" onClick={onUseDemo} type="button">
                Explorer avec des données fictives
              </button>
            </>
          ) : null}

          {mode === 'paste' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Import texte</p>
                <h2>Collez votre CV</h2>
                <p>
                  Les titres, expériences et résultats seront proposés à la
                  revue.
                </p>
              </div>
              <label>
                Contenu du CV
                <textarea
                  autoFocus
                  maxLength={200_000}
                  onChange={(event) => onPasteTextChange(event.target.value)}
                  placeholder="Collez ici le texte complet de votre CV…"
                  rows={14}
                  value={pasteText}
                />
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Retour
                </button>
                <button
                  disabled={importing || pasteText.trim().length < 40}
                  onClick={onSubmitPaste}
                  type="button"
                >
                  {importing ? 'Analyse locale…' : 'Relire les informations'}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'manual' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Saisie manuelle</p>
                <h2>Posez une première base</h2>
                <p>
                  Vous pourrez enrichir et corriger cette mémoire à tout moment.
                </p>
              </div>
              <div className="field-grid">
                <label>
                  Nom
                  <input
                    autoComplete="name"
                    onChange={(event) =>
                      onProfileChange({ ...profile, name: event.target.value })
                    }
                    value={profile.name}
                  />
                </label>
                <label>
                  Positionnement
                  <input
                    onChange={(event) =>
                      onProfileChange({
                        ...profile,
                        headline: event.target.value,
                      })
                    }
                    placeholder="Product Engineer, Applied AI…"
                    value={profile.headline}
                  />
                </label>
              </div>
              <label>
                Source
                <input
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      source: event.target.value,
                    })
                  }
                  placeholder="CV, entretien, bilan de projet…"
                  value={memoryDraft.source}
                />
              </label>
              <label>
                Première affirmation
                <textarea
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      claim: event.target.value,
                    })
                  }
                  placeholder="Ce que vous avez réellement construit, amélioré ou opéré"
                  rows={3}
                  value={memoryDraft.claim}
                />
              </label>
              <label>
                Extrait associé <span>facultatif</span>
                <textarea
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      evidence: event.target.value,
                    })
                  }
                  placeholder="La phrase ou donnée qui permet de retrouver cette information"
                  rows={3}
                  value={memoryDraft.evidence}
                />
              </label>
              <label className="permission-confirmation">
                <input
                  checked={manualConfirmed}
                  onChange={(event) => onManualConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Privée · candidature uniquement</strong>
                  J’autorise Career OS à utiliser cette information pour
                  préparer mes candidatures.
                </span>
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Retour
                </button>
                <button onClick={onAcceptManual} type="button">
                  {signedIn
                    ? 'Enregistrer ma mémoire'
                    : 'Créer ma mémoire locale'}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'review' && review ? (
            <>
              <div className="onboarding-panel-heading review-heading">
                <div>
                  <p className="section-label">Revue humaine</p>
                  <h2>Gardez seulement ce qui vous ressemble.</h2>
                  <p>
                    {review.source.displayName} · {review.candidates.length}{' '}
                    propositions
                  </p>
                </div>
                <span className="source-digest" title={review.source.sha256}>
                  {review.source.type.toUpperCase()} ·{' '}
                  {review.source.sha256.slice(0, 8)}
                </span>
              </div>
              <div className="field-grid">
                <label>
                  Nom
                  <input
                    onChange={(event) =>
                      onReviewChange({ ...review, name: event.target.value })
                    }
                    value={review.name}
                  />
                </label>
                <label>
                  Positionnement
                  <input
                    onChange={(event) =>
                      onReviewChange({
                        ...review,
                        headline: event.target.value,
                      })
                    }
                    value={review.headline}
                  />
                </label>
              </div>
              <div className="import-candidate-groups">
                {Object.entries(importCandidateGroupLabels).map(
                  ([group, label]) => {
                    const candidates = review.candidates
                      .map((candidate, index) => ({ candidate, index }))
                      .filter(({ candidate }) => candidate.group === group);
                    if (!candidates.length) return null;
                    const groupSelected = candidates.filter(
                      ({ candidate }) => candidate.selected,
                    ).length;
                    return (
                      <details
                        className="import-candidate-group"
                        key={group}
                        open={review.candidates.length <= 8 ? true : undefined}
                      >
                        <summary>
                          <strong>{label}</strong>
                          <span>
                            {groupSelected} sur {candidates.length} retenues
                          </span>
                        </summary>
                        <div className="import-candidate-list">
                          {candidates.map(({ candidate, index }) => (
                            <article
                              className={candidate.selected ? 'selected' : ''}
                              key={candidate.id}
                            >
                              <label className="candidate-selection">
                                <input
                                  checked={candidate.selected}
                                  onChange={(event) =>
                                    onReviewChange({
                                      ...review,
                                      candidates: review.candidates.map(
                                        (item) =>
                                          item.id === candidate.id
                                            ? {
                                                ...item,
                                                selected: event.target.checked,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  type="checkbox"
                                />
                                <span>
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </label>
                              <div>
                                <textarea
                                  aria-label={`Affirmation ${index + 1}`}
                                  readOnly={!candidate.selected}
                                  onChange={(event) =>
                                    onReviewChange({
                                      ...review,
                                      candidates: review.candidates.map(
                                        (item) =>
                                          item.id === candidate.id
                                            ? {
                                                ...item,
                                                statement: event.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  rows={2}
                                  value={candidate.statement}
                                />
                                <div className="candidate-meta">
                                  <span>Déclarée</span>
                                  <span>{candidate.locator}</span>
                                </div>
                                <details>
                                  <summary>
                                    Voir la source et les autorisations
                                  </summary>
                                  <blockquote>{candidate.excerpt}</blockquote>
                                  <div className="candidate-permissions">
                                    <label>
                                      Confidentialité
                                      <select
                                        disabled={!candidate.selected}
                                        onChange={(event) =>
                                          onReviewChange({
                                            ...review,
                                            candidates: review.candidates.map(
                                              (item) =>
                                                item.id === candidate.id
                                                  ? {
                                                      ...item,
                                                      sensitivity: event.target
                                                        .value as typeof candidate.sensitivity,
                                                    }
                                                  : item,
                                            ),
                                          })
                                        }
                                        value={candidate.sensitivity}
                                      >
                                        <option value="private">Privée</option>
                                        <option value="public">Publique</option>
                                        <option value="restricted">
                                          Restreinte
                                        </option>
                                      </select>
                                    </label>
                                    <fieldset>
                                      <legend>Utilisations autorisées</legend>
                                      {(
                                        [
                                          'application',
                                          'resume',
                                          'linkedin',
                                          'interview',
                                        ] as const
                                      ).map((use) => (
                                        <label key={use}>
                                          <input
                                            checked={candidate.allowedUses.includes(
                                              use,
                                            )}
                                            disabled={!candidate.selected}
                                            onChange={(event) =>
                                              onReviewChange({
                                                ...review,
                                                candidates:
                                                  review.candidates.map(
                                                    (item) =>
                                                      item.id === candidate.id
                                                        ? {
                                                            ...item,
                                                            allowedUses: event
                                                              .target.checked
                                                              ? [
                                                                  ...item.allowedUses,
                                                                  use,
                                                                ]
                                                              : item.allowedUses.filter(
                                                                  (value) =>
                                                                    value !==
                                                                    use,
                                                                ),
                                                          }
                                                        : item,
                                                  ),
                                              })
                                            }
                                            type="checkbox"
                                          />
                                          {allowedUseLabel(use)}
                                        </label>
                                      ))}
                                    </fieldset>
                                  </div>
                                </details>
                              </div>
                            </article>
                          ))}
                        </div>
                      </details>
                    );
                  },
                )}
              </div>
              <label className="permission-confirmation">
                <input
                  checked={review.permissionsConfirmed}
                  onChange={(event) =>
                    onReviewChange({
                      ...review,
                      permissionsConfirmed: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>
                  <strong>
                    Je valide les {selectedCount} affirmations sélectionnées.
                  </strong>
                  Elles resteront déclarées, reliées à ce document et limitées
                  aux usages indiqués.
                </span>
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions sticky-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Recommencer
                </button>
                <span>
                  {selectedCount} sur {review.candidates.length} retenues
                </span>
                <button
                  disabled={!reviewReady}
                  onClick={onAcceptImport}
                  type="button"
                >
                  {signedIn
                    ? 'Enregistrer ma mémoire'
                    : 'Créer ma mémoire locale'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function HomeView({
  dossiers,
  onCreateApplication,
  onOpenApplication,
  onOpenMemory,
  profile,
}: {
  dossiers: ApplicationDossier[];
  onCreateApplication: () => void;
  onOpenApplication: (dossierId: string, view?: DossierView) => void;
  onOpenMemory: () => void;
  profile: Profile;
}) {
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const verified = profile.claims.filter(
    (claim) => claim.level === 'verified',
  ).length;
  const coverage = profile.claims.length
    ? Math.round((verified / profile.claims.length) * 100)
    : 0;
  const findings = dossiers.flatMap((dossier) =>
    unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions).map(
      (finding) => ({ ...finding, dossier }),
    ),
  );
  const priority =
    findings[0]?.dossier ??
    [...dossiers].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const priorityHasReviews = reviewsComplete(priority?.reviews ?? []);
  const priorityReviewState = priority ? reviewProcessState(priority) : 'idle';
  const recentEvents = dossiers
    .flatMap((dossier) =>
      dossier.events.map((event, index) => ({
        dossier,
        event,
        order: dossier.updatedAt + index,
      })),
    )
    .sort((left, right) => right.order - left.order)
    .slice(0, 3);
  const activeLinks = dossiers.filter((dossier) => dossier.capability).length;
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? [
        ...dossiers.map((dossier) => ({
          id: dossier.id,
          label: `${dossier.opportunity.company || 'Nouvelle offre'} · ${dossier.opportunity.role || 'Brief à compléter'}`,
          meta: 'Candidature',
          open: () => onOpenApplication(dossier.id),
        })),
        ...profile.claims.map((claim) => ({
          id: claim.id,
          label: claim.statement,
          meta: `Affirmation ${levelLabel(claim.level).toLowerCase()}`,
          open: onOpenMemory,
        })),
        ...profile.sources.map((source) => ({
          id: source.id,
          label: source.title,
          meta: `Source ${source.kind}`,
          open: onOpenMemory,
        })),
      ]
        .filter((item) =>
          `${item.label} ${item.meta}`.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  return (
    <div className="home-view">
      <header className="home-topbar">
        <div className="search-shell">
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Rechercher dans l’espace"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) {
                  searchResults[0].open();
                  setQuery('');
                }
              }}
              placeholder="Chercher une preuve, une entreprise, une affirmation…"
              ref={searchInput}
              type="search"
              value={query}
            />
            <kbd>⌘K</kbd>
          </label>
          {normalizedQuery ? (
            <div className="search-results" aria-label="Résultats de recherche">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      result.open();
                      setQuery('');
                    }}
                  >
                    <span>{result.label}</span>
                    <small>{result.meta}</small>
                  </button>
                ))
              ) : (
                <p>Aucune preuve, source ou candidature correspondante.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="home-account">
          <button onClick={onCreateApplication}>Coller une offre</button>
          <button
            className="header-icon"
            aria-label="Aide, bientôt disponible"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            ?
          </button>
          <button
            className="header-icon notification"
            aria-label="Notifications, bientôt disponibles"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            <span aria-hidden="true">♢</span>
          </button>
          <div className="header-person">
            <span className="rail-avatar" aria-hidden="true">
              {profile.name.charAt(0)}
            </span>
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.headline}</small>
            </span>
          </div>
        </div>
      </header>

      <div className="home-grid">
        <div className="home-main">
          <section className="decision-hero">
            <p>
              {findings.length ? 'Action requise' : 'Prochaine candidature'}
              {priority?.opportunity.company
                ? ` · ${priority.opportunity.company}`
                : ''}
            </p>
            <h1>
              {findings.length
                ? `${findings.length} décision${findings.length > 1 ? 's' : ''} à trancher avant d’envoyer vos pages privées.`
                : priority?.spec && priorityHasReviews
                  ? 'Votre prochaine candidature est prête pour validation.'
                  : priorityReviewState === 'running'
                    ? 'Les vérifications sont en cours.'
                    : priorityReviewState === 'failed'
                      ? 'Les vérifications se sont arrêtées.'
                      : priority?.spec
                        ? 'Votre brouillon est prêt à relire.'
                        : 'Construisez une candidature qui ne promet que ce que vos preuves démontrent.'}
            </h1>
            <span>
              {priority?.spec && priorityHasReviews
                ? `La passe d’agents est terminée. ${dossierStatus(priority)}.`
                : priorityReviewState === 'running'
                  ? `${priority.reviews.length} sur 3 vérifications terminées. Vous pouvez revenir plus tard.`
                  : priorityReviewState === 'failed'
                    ? 'Le brouillon reste intact. Relancez la candidature lorsque vous êtes prêt.'
                    : priority?.spec
                      ? 'Le brouillon reprend la stratégie approuvée. Relisez exactement ce que l’entreprise verra.'
                      : 'Partez du poste, confrontez-le à vos preuves, puis gardez la décision finale.'}
            </span>
            <div>
              <button
                onClick={() =>
                  priority
                    ? onOpenApplication(priority.id)
                    : onCreateApplication()
                }
              >
                {priority?.spec && priorityHasReviews
                  ? 'Ouvrir la revue'
                  : priorityReviewState === 'running'
                    ? 'Voir l’avancement'
                    : priorityReviewState === 'failed'
                      ? 'Ouvrir et relancer'
                      : priority?.spec
                        ? 'Relire la page privée'
                        : 'Commencer par l’offre'}{' '}
                <b>→</b>
              </button>
              {priority?.spec ? (
                <button
                  className="hero-secondary"
                  onClick={() => onOpenApplication(priority.id, 'journey')}
                >
                  Voir le run
                </button>
              ) : null}
            </div>
          </section>

          {findings.length ? (
            <section className="home-pipeline decision-queue">
              <header>
                <div>
                  <h2>À trancher maintenant</h2>
                  <span>
                    Chaque point doit être corrigé ou explicitement assumé.
                  </span>
                </div>
              </header>
              {findings
                .slice(0, 3)
                .map(({ dossier, issue, review, issueIndex }) => (
                  <article
                    key={`${dossier.id}:${review.reviewId ?? review.reviewer}:${issueIndex}`}
                  >
                    <span className="decision-icon" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <strong>{reviewerLabel(review.reviewer)}</strong>
                      <p>{issue.message}</p>
                      <small>
                        {dossier.opportunity.company} ·{' '}
                        {sectionLabel(issue.section)}
                      </small>
                    </div>
                    <button
                      onClick={() => onOpenApplication(dossier.id, 'review')}
                    >
                      Trancher
                    </button>
                  </article>
                ))}
            </section>
          ) : null}

          <section className="home-stats" aria-label="Résumé de l’espace">
            <article>
              <span className="metric-icon">▣</span>
              <div>
                <small>Candidatures</small>
                <strong>
                  {dossiers.length} active{dossiers.length > 1 ? 's' : ''}
                </strong>
              </div>
            </article>
            <article>
              <span className="metric-icon green">✓</span>
              <div>
                <small>Affirmations</small>
                <strong>
                  {verified} / {profile.claims.length} sourcées
                </strong>
              </div>
            </article>
            <article>
              <span className="metric-icon amber">↗</span>
              <div>
                <small>Liens privés</small>
                <strong>
                  {activeLinks
                    ? `${activeLinks} actif${activeLinks > 1 ? 's' : ''}`
                    : 'Aucun actif'}
                </strong>
              </div>
            </article>
          </section>

          <section className="home-pipeline">
            <header>
              <div>
                <h2>Pipeline</h2>
                <span>Chaque candidature et sa prochaine action concrète.</span>
              </div>
              <button
                className="round-action quiet"
                onClick={onCreateApplication}
                aria-label="Créer une candidature"
              >
                +
              </button>
            </header>
            <div className="pipeline-head" aria-hidden="true">
              <span>Poste</span>
              <span>Étape</span>
              <span>Preuves</span>
              <span>Prochaine action</span>
            </div>
            {dossiers.length ? (
              [...dossiers]
                .sort((left, right) => right.updatedAt - left.updatedAt)
                .slice(0, 5)
                .map((dossier) => {
                  const dossierFindings = unresolvedReviewIssues(
                    dossier.reviews,
                    dossier.reviewDecisions,
                  ).length;
                  const evidenceCount = dossier.spec
                    ? new Set(
                        dossier.spec.blocks.flatMap((block) =>
                          'claimIds' in block ? block.claimIds : [],
                        ),
                      ).size
                    : 0;
                  return (
                    <button
                      className="pipeline-row"
                      key={dossier.id}
                      onClick={() => onOpenApplication(dossier.id)}
                    >
                      <span className="company-mark compact" aria-hidden="true">
                        {dossier.opportunity.company.charAt(0) || '+'}
                      </span>
                      <span>
                        <strong>
                          {dossier.opportunity.role || 'Brief à compléter'}
                        </strong>
                        <small>
                          {dossier.opportunity.company || 'Nouvelle offre'}
                        </small>
                      </span>
                      <span className="status-label">
                        {dossierStatus(dossier)}
                      </span>
                      <span>
                        {evidenceCount
                          ? `${evidenceCount} retenue${evidenceCount > 1 ? 's' : ''}`
                          : 'À sélectionner'}
                      </span>
                      <b>
                        {dossier.spec
                          ? dossierFindings
                            ? 'Trancher'
                            : reviewProcessState(dossier) === 'running'
                              ? 'Suivre'
                              : reviewProcessState(dossier) === 'failed'
                                ? 'Relancer'
                                : reviewsComplete(dossier.reviews)
                                  ? 'Valider'
                                  : 'Relire'
                          : 'Lancer'}{' '}
                        →
                      </b>
                    </button>
                  );
                })
            ) : (
              <div className="home-empty-state">
                <strong>Aucune candidature</strong>
                <span>Collez une offre pour créer votre premier dossier.</span>
              </div>
            )}
          </section>
        </div>

        <aside className="home-insights">
          <section className="interview-card">
            <header>
              <h2>Entretiens à venir</h2>
            </header>
            <div className="home-empty-state">
              <strong>Aucun entretien planifié</strong>
              <span>
                La préparation apparaîtra ici dès qu’un entretien sera ajouté.
              </span>
            </div>
          </section>
          <section>
            <header>
              <h2>Mémoire pro</h2>
              <button onClick={onOpenMemory} aria-label="Ouvrir la mémoire pro">
                ···
              </button>
            </header>
            <div
              className="coverage-ring"
              style={{ '--coverage': `${coverage}%` } as React.CSSProperties}
            >
              <strong>{coverage}%</strong>
              <span>sourcé</span>
            </div>
            <dl>
              <div>
                <dt>Sources importées</dt>
                <dd>{profile.sources.length}</dd>
              </div>
              <div>
                <dt>Affirmations vérifiées</dt>
                <dd>{verified}</dd>
              </div>
              <div>
                <dt>Sans source</dt>
                <dd>{profile.claims.length - verified}</dd>
              </div>
            </dl>
          </section>
          <section className="home-activity-card">
            <header>
              <h2>Activité</h2>
            </header>
            {recentEvents.length ? (
              recentEvents.map(({ dossier, event }, index) => (
                <article key={`${dossier.id}:${event.actor}:${index}`}>
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>{deliverableLabel(event)}</strong>
                    <small>
                      {dossier.opportunity.company} ·{' '}
                      {event.actor.replaceAll('-', ' ')}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <div className="home-empty-state">
                <strong>Aucun run pour le moment</strong>
                <span>Les dernières actions vérifiées apparaîtront ici.</span>
              </div>
            )}
            {activeLinks ? (
              <small>
                {activeLinks} lien{activeLinks > 1 ? 's' : ''} privé
                {activeLinks > 1 ? 's' : ''} actif{activeLinks > 1 ? 's' : ''}.
              </small>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ApplicationsView({
  dossiers,
  onCreate,
  onOpen,
  profile,
}: {
  dossiers: ApplicationDossier[];
  onCreate: () => void;
  onOpen: (dossierId: string, view?: DossierView) => void;
  profile: Profile;
}) {
  const [layout, setLayout] = useState<'list' | 'kanban'>('kanban');
  const columns = ['Brouillon', 'À valider', 'Envoyée', 'Entretien'] as const;
  const renderCard = (dossier: ApplicationDossier) => {
    const findings = unresolvedReviewIssues(
      dossier.reviews,
      dossier.reviewDecisions,
    ).length;
    const evidenceCount = dossier.spec
      ? new Set(
          dossier.spec.blocks.flatMap((block) =>
            'claimIds' in block ? block.claimIds : [],
          ),
        ).size
      : 0;
    const company = dossier.opportunity.company || 'Nouvelle offre';
    const role = dossier.opportunity.role || 'Brief à compléter';
    return (
      <button
        className="application-card"
        key={dossier.id}
        onClick={() => onOpen(dossier.id)}
        aria-label={`Ouvrir la candidature ${company}`}
      >
        <span className="company-mark" aria-hidden="true">
          {dossier.opportunity.company.charAt(0) || '+'}
        </span>
        <span className="application-card-copy">
          <strong>{role}</strong>
          <small>{company}</small>
        </span>
        <span className="status-label">{dossierStatus(dossier)}</span>
        <span className="application-card-meta">
          {evidenceCount
            ? `${evidenceCount} sur ${profile.claims.length} affirmations retenues`
            : `${profile.claims.length} affirmations disponibles`}
        </span>
        <b>
          {findings
            ? `${findings} décision${findings > 1 ? 's' : ''} à trancher`
            : dossier.runId && !dossier.spec
              ? dossier.runStatus === 'running' || !dossier.runStatus
                ? 'Voir l’avancement'
                : dossier.runStatus === 'paused'
                  ? 'Ouvrir l’analyse'
                  : 'Reprendre la génération'
              : dossier.spec
                ? 'Ouvrir la candidature'
                : 'Compléter l’offre'}{' '}
          →
        </b>
      </button>
    );
  };

  return (
    <div className="standalone-view applications-view">
      <header className="applications-header">
        <div>
          <p className="section-label">Espace</p>
          <h1>Candidatures</h1>
          <p>Une prochaine action claire pour chaque poste.</p>
        </div>
        <div className="applications-actions">
          <div
            className="layout-switch"
            aria-label="Disposition des candidatures"
          >
            <button
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              Liste
            </button>
            <button
              aria-pressed={layout === 'kanban'}
              onClick={() => setLayout('kanban')}
            >
              Kanban
            </button>
            <button
              disabled
              title="La vue calendrier n’est pas encore disponible"
            >
              Calendrier
            </button>
          </div>
          <button onClick={onCreate}>Coller une offre</button>
        </div>
      </header>

      <section className="applications-toolbar" aria-label="Vues enregistrées">
        <strong className="active">
          Toutes les candidatures <span>{dossiers.length}</span>
        </strong>
        <span>Synchronisé avec l’espace actif</span>
      </section>

      {layout === 'kanban' ? (
        <div className="applications-board">
          {columns.map((column) => (
            <section className="application-column" key={column}>
              <header>
                <h2>{column}</h2>
                <span>
                  {
                    dossiers.filter(
                      (dossier) => dossierStage(dossier) === column,
                    ).length
                  }
                </span>
              </header>
              {dossiers.some((dossier) => dossierStage(dossier) === column) ? (
                [...dossiers]
                  .filter((dossier) => dossierStage(dossier) === column)
                  .sort((left, right) => right.updatedAt - left.updatedAt)
                  .map(renderCard)
              ) : (
                <div className="empty-column">
                  Aucune candidature à cette étape
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <section
          className="applications-list"
          aria-label="Liste des candidatures"
        >
          <div className="applications-list-head" aria-hidden="true">
            <span>Poste</span>
            <span>Étape</span>
            <span>Preuves</span>
            <span>Prochaine action</span>
          </div>
          {[...dossiers]
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .map(renderCard)}
        </section>
      )}
    </div>
  );
}

function JourneyView({
  approved,
  onGenerate,
  onOpenBrief,
  onOpenDraft,
  onOpenEvidence,
  onRefresh,
  onRetry,
  onReview,
  opportunity,
  pollingError,
  workerAvailability,
  profile,
  retryError,
  retryPending,
  reviewState,
  reviews,
  spec,
}: {
  approved: boolean;
  onGenerate: () => void;
  onOpenBrief: () => void;
  onOpenDraft: () => void;
  onOpenEvidence: (claimId: string) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onReview: () => void;
  opportunity: Opportunity;
  pollingError: string;
  workerAvailability?: PersistedRun['workerAvailability'];
  profile: Profile;
  retryError: string;
  retryPending: boolean;
  reviewState: ReturnType<typeof reviewProcessState>;
  reviews: Review[];
  spec?: PageSpec;
}) {
  const usedClaimIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ) ?? [],
  );
  const usedClaims = profile.claims.filter((claim) =>
    usedClaimIds.has(claim.id),
  );
  const sourced = usedClaims.filter((claim) => claim.evidenceIds.length);
  const reviewed = reviewsComplete(reviews);
  const reviewing = reviewState === 'running';
  const reviewFailed = reviewState === 'failed';
  const reviewStatusHeading = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reviewing) reviewStatusHeading.current?.focus();
  }, [reviewing]);

  return (
    <div className="journey-view">
      <section className="journey-summary" aria-label="État du parcours">
        <span
          className={`summary-state ${reviewing || reviewFailed ? 'attention' : ''}`}
        >
          <b>{reviewFailed ? '!' : reviewing ? '…' : spec ? '✓' : '○'}</b>
          {reviewed
            ? 'Vérifications terminées'
            : reviewFailed
              ? 'Vérifications arrêtées'
              : reviewing
                ? 'Vérifications en cours'
                : spec
                  ? 'Brouillon prêt'
                  : 'Prêt à démarrer'}
        </span>
        <span>
          Preuves retenues <strong>{usedClaims.length}</strong>
        </span>
        <span>
          Affirmations sourcées{' '}
          <strong>
            {sourced.length} / {usedClaims.length || 0}
          </strong>
        </span>
        <span className="journey-people">
          {reviewed
            ? 'Brouillon composé · vérifications terminées'
            : reviewing
              ? `${reviews.length} / 3 vérifications terminées`
              : spec
                ? 'Brouillon composé · prêt à vérifier'
                : 'Composition non démarrée'}
        </span>
      </section>
      {pollingError ? (
        <div className="inline-error" role="status">
          <p>{pollingError}</p>
          <button className="quiet" onClick={onRefresh}>
            Actualiser
          </button>
        </div>
      ) : null}
      {!pollingError ? (
        <WorkerAvailabilityNotice
          availability={workerAvailability}
          onRefresh={onRefresh}
        />
      ) : null}

      <section className="journey-board" aria-label="Parcours de candidature">
        <JourneyColumn number="1" state="complete" title="Lecture de l’offre">
          <JourneyCard icon="↗" status={spec ? 'Terminé' : 'Prêt'}>
            <strong>Offre importée</strong>
            <p>{opportunity.role}</p>
            <small>{opportunity.description.length} caractères analysés</small>
            <button className="text-action" onClick={onOpenBrief}>
              Ouvrir l’offre
            </button>
          </JourneyCard>
          <JourneyCard icon="⌕" status={spec ? 'Terminé' : 'En attente'}>
            <strong>Entreprise analysée</strong>
            <p>{opportunity.company}</p>
            <small>Chaque information reste rattachée à sa source.</small>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="2"
          state={spec ? 'complete' : 'idle'}
          title="Appariement"
        >
          <JourneyCard icon="⌁" status={spec ? 'Terminé' : 'Non démarré'}>
            <strong>{usedClaims.length} expériences retenues</strong>
            {usedClaims.slice(0, 3).map((claim) => (
              <button
                className="matched-claim"
                key={claim.id}
                onClick={() => onOpenEvidence(claim.id)}
              >
                <span>{claim.statement}</span>
                <small>{claim.level}</small>
              </button>
            ))}
            {!spec ? (
              <button
                disabled={!opportunityReady(opportunity)}
                onClick={onGenerate}
              >
                Générer la candidature
              </button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="3"
          state={
            approved
              ? 'complete'
              : reviewed || reviewing || reviewFailed
                ? 'attention'
                : 'idle'
          }
          title="Vérification"
        >
          <JourneyCard
            dark={Boolean(reviewed && !approved)}
            icon="!"
            status={
              approved
                ? 'Validé'
                : reviewed
                  ? 'Décision humaine'
                  : reviewFailed
                    ? 'Arrêté'
                    : reviewing
                      ? 'En cours'
                      : spec
                        ? 'À lancer'
                        : 'En attente'
            }
          >
            <strong aria-live="polite" ref={reviewStatusHeading} tabIndex={-1}>
              {reviewed
                ? 'Trois vérifications terminées'
                : reviewFailed
                  ? 'Vérifications arrêtées'
                  : reviewing
                    ? `${reviews.length} / 3 vérifications terminées`
                    : spec
                      ? 'Brouillon prêt'
                      : 'Rien à vérifier pour le moment'}
            </strong>
            <p>
              {reviewed
                ? `${reviews.filter((item) => item.passed).length} / 3 vérifications validées.`
                : reviewFailed
                  ? 'Le brouillon reste disponible. Relancez la candidature pour reprendre sur une base propre.'
                  : reviewing
                    ? 'Les agents relisent la pertinence, le fond et chaque preuve.'
                    : spec
                      ? 'Relisez le brouillon, puis lancez les trois vérifications.'
                      : 'Les contrôles démarreront après la composition.'}
            </p>
            {reviewed ? (
              <button onClick={onReview}>Ouvrir la revue</button>
            ) : reviewFailed ? (
              <button disabled={retryPending} onClick={onRetry}>
                {retryPending ? 'Relance en cours…' : 'Relancer la candidature'}
              </button>
            ) : null}
            {reviewFailed && retryError ? (
              <p className="inline-error" role="alert">
                {retryError}
              </p>
            ) : null}
          </JourneyCard>
          <JourneyCard icon="✓" status={sourced.length ? 'Prêt' : 'En attente'}>
            <strong>{sourced.length} affirmations sourcées</strong>
            <p>Chaque affirmation garde un chemin vers sa preuve.</p>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="4"
          state={approved ? 'complete' : spec ? 'attention' : 'idle'}
          title="Page privée"
        >
          <JourneyCard
            icon="□"
            status={approved ? 'Validée' : spec ? 'Brouillon' : 'En attente'}
          >
            <strong>{spec?.blocks.length ?? 0} sections prêtes</strong>
            {spec?.blocks.map((block, index) => (
              <button
                className="page-section-row"
                key={`${block.type}-${index}`}
                onClick={onOpenDraft}
              >
                <span>{block.title}</span>
                <small>{approved ? '✓' : 'À relire'}</small>
              </button>
            ))}
            {spec ? (
              <button className="text-action" onClick={onOpenDraft}>
                Prévisualiser la page
              </button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>
      </section>

      <section className="journey-evidence">
        <header>
          <div>
            <h2>Preuves mobilisées</h2>
            <span>
              {usedClaims.length} dans cette candidature ·{' '}
              {profile.claims.length} disponibles dans la mémoire pro
            </span>
          </div>
        </header>
        {usedClaims.length ? (
          <div
            className="evidence-table"
            role="table"
            aria-label="Preuves mobilisées dans cette candidature"
          >
            <div className="evidence-table-head" role="row">
              <span role="columnheader">Preuve</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Rattachée à</span>
              <span role="columnheader">Statut</span>
              <span role="columnheader">Action</span>
            </div>
            {usedClaims.map((claim) => {
              const evidence = profile.evidence.find((item) =>
                claim.evidenceIds.includes(item.id),
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return (
                <div className="evidence-table-row" role="row" key={claim.id}>
                  <strong role="cell">{claim.statement}</strong>
                  <code role="cell">
                    {source?.title ?? 'Aucune source rattachée'}
                  </code>
                  <span role="cell">Page privée</span>
                  <span
                    className={evidence ? 'verified-pill' : 'missing-pill'}
                    role="cell"
                  >
                    {evidence ? 'Vérifiée' : 'Non sourcée'}
                  </span>
                  <span role="cell">
                    <button onClick={() => onOpenEvidence(claim.id)}>
                      Ouvrir
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="journey-empty">
            Générez la candidature pour voir les preuves retenues pour ce poste.
          </p>
        )}
      </section>
    </div>
  );
}

type RunProgressGroup = {
  title: string;
  description: string;
  stages: string[];
};

const runProgressGroups: RunProgressGroup[] = [
  {
    title: 'Analyse de l’offre',
    description: 'Comprendre le poste et son contexte.',
    stages: ['company-researcher'],
  },
  {
    title: 'Sélection des preuves',
    description: 'Retenir uniquement les expériences pertinentes.',
    stages: ['evidence-archivist'],
  },
  {
    title: 'Stratégie de candidature',
    description: 'Hiérarchiser l’angle, les preuves et les limites.',
    stages: ['recruiter-strategist'],
  },
  {
    title: 'Composition de la page',
    description: 'Assembler une page adaptée au poste.',
    stages: ['page-composer'],
  },
  {
    title: 'Vérifications',
    description: 'Contrôler la clarté, la pertinence et les faits.',
    stages: [
      'recruiter-reviewer',
      'hiring-manager-reviewer',
      'factuality-reviewer',
    ],
  },
];

function RunProgressView({
  dossier,
  onBack,
  onOpenBrief,
  onRefresh,
  onRetry,
  onConfirmResearch,
  onStartStrategy,
  onApproveStrategy,
  onToggleSignal,
  onOpenEvidence,
  pollingError,
  selectionError,
  selectionPending,
}: {
  dossier: ApplicationDossier;
  onBack: () => void;
  onOpenBrief: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onConfirmResearch: () => void;
  onStartStrategy: () => void;
  onApproveStrategy: () => void;
  onToggleSignal: (signalId: string) => void;
  onOpenEvidence: (claimId: string) => void;
  pollingError?: string;
  selectionError?: string;
  selectionPending: boolean;
}) {
  const status = dossier.runStatus ?? 'running';
  const running = status === 'running';
  const terminalCopy = runTerminalCopy(status);
  const reviewingResearch = Boolean(
    status === 'paused' &&
    dossier.runStage === 'evidence_archive' &&
    dossier.runResearch &&
    !dossier.runEvidenceArchive,
  );
  const archiveReady = Boolean(
    status === 'paused' &&
    dossier.runStage === 'strategy' &&
    dossier.runEvidenceArchive,
  );
  const strategyReady = Boolean(
    status === 'paused' &&
    dossier.runStage === 'strategy_review' &&
    dossier.runStrategy,
  );
  const strategyApproved = Boolean(
    status === 'paused' &&
    dossier.runStage === 'page_spec' &&
    dossier.runStrategy,
  );
  const selectedSignals = new Set(dossier.selectedResearchSignalIds ?? []);
  const selectedCount = selectedSignals.size;
  const currentGroup = runProgressGroups.find((group) => {
    const groupStatus = runProgressGroupStatus(
      dossier.runSteps ?? [],
      group.stages,
    );
    return groupStatus === 'active' || groupStatus === 'pending';
  });
  const matchedSignalCount =
    dossier.runEvidenceArchive?.signals.filter(
      (signal) => signal.matches.length,
    ).length ?? 0;
  const workerUnavailable =
    !pollingError &&
    running &&
    dossier.workerAvailability?.state === 'unavailable';
  const workerWaiting =
    !pollingError && running && dossier.workerAvailability?.state === 'waiting';
  const title = pollingError
    ? 'État de l’analyse non actualisé'
    : reviewingResearch
      ? 'Analyse de l’offre à vérifier'
      : archiveReady
        ? 'Preuves candidates sélectionnées'
        : strategyReady
          ? 'Angle de candidature à valider'
          : strategyApproved
            ? 'Stratégie validée'
            : workerUnavailable
              ? `${currentGroup?.title ?? 'Traitement'} indisponible`
              : workerWaiting
                ? `${currentGroup?.title ?? 'Traitement'} en attente`
                : running
                  ? `${currentGroup?.title ?? 'Analyse de la candidature'} en cours`
                  : terminalCopy.title;
  const description = pollingError
    ? 'La dernière progression enregistrée reste visible ci-dessous.'
    : reviewingResearch
      ? 'Vérifiez ce que nous avons compris du poste. Vous gardez la main avant que votre parcours soit analysé.'
      : archiveReady
        ? 'Les correspondances ci-dessous respectent les permissions de votre mémoire. Vérifiez-les avant de demander au stratège de choisir l’angle de candidature.'
        : strategyReady
          ? 'Le stratège a hiérarchisé les preuves sans modifier les faits. Vérifiez ce choix avant la composition de la page.'
          : strategyApproved
            ? 'Votre décision est enregistrée. Le compositeur de page sera la prochaine étape durable du workflow.'
            : workerUnavailable
              ? 'Le service requis n’est pas actif sur cette instance. La progression enregistrée reste intacte.'
              : workerWaiting
                ? 'Le service est disponible et prendra en charge cette étape dès que possible.'
                : running
                  ? `${currentGroup?.description ?? 'Le traitement continue.'} Vous pouvez quitter ce dossier : son état restera disponible ici.`
                  : terminalCopy.description;

  return (
    <section className="run-progress" aria-labelledby="run-progress-title">
      <header>
        <p className="section-label">Analyse de la candidature</p>
        <h2 id="run-progress-title">{title}</h2>
        <p className="run-progress-status" role="status" aria-live="polite">
          {description}
        </p>
      </header>

      <div className="run-snapshot-note">
        <strong>Contenu utilisé pour ce run</strong>
        <span>
          L’offre et la mémoire professionnelle enregistrées au lancement. Les
          changements ultérieurs ne modifient pas cette génération.
        </span>
      </div>

      <ol className="run-progress-steps" aria-label="Progression enregistrée">
        {runProgressGroups.map((group) => {
          const groupStatus = runProgressGroupStatus(
            dossier.runSteps ?? [],
            group.stages,
          );
          return (
            <li className={groupStatus} key={group.title}>
              <span className="run-step-marker" aria-hidden="true">
                {groupStatus === 'complete'
                  ? '✓'
                  : groupStatus === 'failed'
                    ? '!'
                    : '·'}
              </span>
              <div>
                <strong>{group.title}</strong>
                <p>{group.description}</p>
              </div>
              <small>{runProgressStatusLabel(groupStatus)}</small>
            </li>
          );
        })}
      </ol>

      {reviewingResearch && dossier.runResearch ? (
        <form
          aria-busy={selectionPending}
          className="research-checkpoint"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirmResearch();
          }}
        >
          <header>
            <div>
              <p className="section-label">Votre décision</p>
              <h3>Quels critères doivent guider la candidature&nbsp;?</h3>
            </div>
            <strong aria-live="polite">
              {selectedCount}/{dossier.runResearch.signals.length} retenus
            </strong>
          </header>
          <fieldset
            className="research-signal-list"
            disabled={selectionPending}
          >
            <legend className="sr-only">
              Critères retenus pour guider la candidature
            </legend>
            {dossier.runResearch.signals.map((signal) => (
              <label className="research-signal" key={signal.signalId}>
                <input
                  checked={selectedSignals.has(signal.signalId)}
                  onChange={() => onToggleSignal(signal.signalId)}
                  type="checkbox"
                />
                <span className="research-signal-copy">
                  <span className="research-signal-meta">
                    <span>{researchCategoryLabel(signal.category)}</span>
                    <span>{researchPriorityLabel(signal.priority)}</span>
                  </span>
                  <strong>{signal.statement}</strong>
                  <q>{signal.excerpt}</q>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="research-source">
            Source analysée&nbsp;:{' '}
            {dossier.runResearch.source.url ? (
              <a
                href={dossier.runResearch.source.url}
                rel="noreferrer"
                target="_blank"
              >
                ouvrir l’offre
              </a>
            ) : (
              'texte importé'
            )}
          </p>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer>
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Corriger l’offre
            </button>
            <button disabled={!selectedCount || selectionPending} type="submit">
              {selectionPending
                ? 'Sélection en cours…'
                : `Confirmer ${selectedCount} critère${selectedCount > 1 ? 's' : ''}`}
            </button>
          </footer>
          <p className="research-edit-note">
            Modifier l’offre conservera cette analyse jusqu’au lancement de la
            suivante.
          </p>
        </form>
      ) : null}

      {archiveReady && dossier.runEvidenceArchive ? (
        <section className="evidence-selection-result">
          <header>
            <p className="section-label">Correspondances auditées</p>
            <h3>
              {matchedSignalCount} critère{matchedSignalCount === 1 ? '' : 's'}{' '}
              sur {dossier.runEvidenceArchive.signals.length} relié
              {matchedSignalCount === 1 ? '' : 's'} à votre parcours
            </h3>
          </header>
          <ul>
            {dossier.runEvidenceArchive.signals.map((result) => {
              const signal = dossier.runResearch?.signals.find(
                ({ signalId }) => signalId === result.signalId,
              );
              return (
                <li key={result.signalId}>
                  <div>
                    <strong>{signal?.statement ?? result.signalId}</strong>
                    <span>
                      {result.matches.length
                        ? `${result.matches.length} preuve${result.matches.length > 1 ? 's' : ''} candidate${result.matches.length > 1 ? 's' : ''}`
                        : 'Aucune preuve suffisamment proche'}
                    </span>
                  </div>
                  {result.matches.map((match) => {
                    const claim = dossier.runProfile?.claims.find(
                      ({ id }) => id === match.claimId,
                    );
                    return (
                      <button
                        className="quiet"
                        key={match.claimId}
                        onClick={() => onOpenEvidence(match.claimId)}
                        type="button"
                      >
                        {claim?.statement ?? 'Voir la preuve'}
                        <small>
                          Correspondance lexicale&nbsp;: {match.relevanceScore}%
                        </small>
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer className="run-progress-actions">
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Modifier le brief
            </button>
            <button
              disabled={selectionPending || matchedSignalCount === 0}
              onClick={onStartStrategy}
              type="button"
            >
              {selectionPending
                ? 'Stratégie en préparation…'
                : 'Construire la stratégie'}
            </button>
          </footer>
        </section>
      ) : null}

      {strategyReady && dossier.runStrategy ? (
        <section className="strategy-review">
          <header>
            <p className="section-label">Direction éditoriale interne</p>
            <h3>{dossier.runStrategy.positioning.message}</h3>
            <p>
              Cette formulation guide la future page. Les faits affichés
              resteront ceux de votre mémoire professionnelle.
            </p>
          </header>
          <div className="strategy-proof-list">
            {[dossier.runStrategy.lead, ...dossier.runStrategy.supports].map(
              (selection, index) => {
                const claim = dossier.runProfile?.claims.find(
                  ({ id }) => id === selection.claimId,
                );
                const signal = dossier.runResearch?.signals.find(
                  ({ signalId }) => signalId === selection.signalId,
                );
                return (
                  <article key={`${selection.signalId}:${selection.claimId}`}>
                    <small>{index === 0 ? 'Preuve principale' : 'Appui'}</small>
                    <strong>{claim?.statement ?? 'Preuve enregistrée'}</strong>
                    <span>{signal?.statement ?? selection.signalId}</span>
                    <button
                      className="text-action"
                      onClick={() => onOpenEvidence(selection.claimId)}
                      type="button"
                    >
                      Vérifier la source
                    </button>
                  </article>
                );
              },
            )}
          </div>
          {dossier.runStrategy.gaps.length ? (
            <div className="strategy-gaps">
              <strong>Sujets à traiter honnêtement</strong>
              <ul>
                {dossier.runStrategy.gaps.map((gap) => {
                  const signal = dossier.runResearch?.signals.find(
                    ({ signalId }) => signalId === gap.signalId,
                  );
                  return (
                    <li key={gap.signalId}>
                      {signal?.statement ?? gap.signalId}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className="strategy-omissions">
            {dossier.runStrategy.omittedSignalIds.length} critère
            {dossier.runStrategy.omittedSignalIds.length === 1 ? '' : 's'}{' '}
            volontairement écarté
            {dossier.runStrategy.omittedSignalIds.length === 1 ? '' : 's'} de la
            page courte.
          </p>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer className="run-progress-actions">
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Modifier le brief
            </button>
            <button
              disabled={selectionPending}
              onClick={onApproveStrategy}
              type="button"
            >
              {selectionPending ? 'Validation…' : 'Valider la stratégie'}
            </button>
          </footer>
        </section>
      ) : null}

      {pollingError ? (
        <div className="run-polling-warning" role="status" aria-live="polite">
          <p>{pollingError}</p>
          <button className="quiet" onClick={onRefresh} type="button">
            Actualiser
          </button>
        </div>
      ) : null}
      {!pollingError ? (
        <WorkerAvailabilityNotice
          availability={dossier.workerAvailability}
          onRefresh={onRefresh}
        />
      ) : null}

      {!reviewingResearch && !archiveReady && !strategyReady ? (
        <div className="run-progress-actions">
          {running ? (
            <button className="quiet" onClick={onBack} type="button">
              Retour aux candidatures
            </button>
          ) : status === 'paused' ? (
            <button onClick={onOpenBrief} type="button">
              Modifier le brief
            </button>
          ) : (
            <>
              <button onClick={onRetry} type="button">
                Relancer la génération
              </button>
              <button className="quiet" onClick={onOpenBrief} type="button">
                Modifier le brief
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function researchCategoryLabel(
  category: NonNullable<
    ApplicationDossier['runResearch']
  >['signals'][number]['category'],
) {
  if (category === 'responsibility') return 'Responsabilité';
  if (category === 'requirement') return 'Attendu';
  if (category === 'culture') return 'Culture';
  return 'Contrainte';
}

function researchPriorityLabel(
  priority: NonNullable<
    ApplicationDossier['runResearch']
  >['signals'][number]['priority'],
) {
  if (priority === 'high') return 'Prioritaire';
  if (priority === 'medium') return 'Important';
  return 'Secondaire';
}

function runProgressGroupStatus(
  steps: NonNullable<ApplicationDossier['runSteps']>,
  stages: string[],
) {
  const relevant = steps.filter((step) => stages.includes(step.stage));
  if (!relevant.length) return 'future';
  if (relevant.some((step) => step.status === 'failed')) return 'failed';
  if (relevant.some((step) => step.status === 'cancelled')) return 'cancelled';
  if (
    relevant.length &&
    relevant.some((step) =>
      ['leased', 'in_flight', 'completed'].includes(step.status),
    ) &&
    !stages.every((stage) =>
      relevant.some(
        (step) => step.stage === stage && step.status === 'completed',
      ),
    )
  )
    return 'active';
  if (
    stages.every((stage) =>
      relevant.some(
        (step) => step.stage === stage && step.status === 'completed',
      ),
    )
  )
    return 'complete';
  return 'pending';
}

function runProgressStatusLabel(
  status: ReturnType<typeof runProgressGroupStatus>,
) {
  if (status === 'complete') return 'Terminé';
  if (status === 'active') return 'En cours';
  if (status === 'failed') return 'Échec';
  if (status === 'cancelled') return 'Annulé';
  if (status === 'future') return 'À venir';
  return 'En attente';
}

function WorkerAvailabilityNotice({
  availability,
  onRefresh,
}: {
  availability?: PersistedRun['workerAvailability'];
  onRefresh: () => void;
}) {
  if (!availability || availability.state === 'ready') return null;
  const unavailable = availability.state === 'unavailable';
  return (
    <div
      className={`worker-availability-notice ${availability.state}`}
      role={unavailable ? 'alert' : 'status'}
      aria-live={unavailable ? 'assertive' : 'polite'}
    >
      <div>
        <strong>
          {unavailable
            ? 'Traitement indisponible'
            : 'En attente de prise en charge'}
        </strong>
        <p>
          {unavailable
            ? 'Le service requis n’est pas actif sur cette instance. Démarrez les workers ou contactez l’administrateur, puis vérifiez à nouveau.'
            : 'Le service est disponible. Cette étape démarrera dès qu’elle pourra être prise en charge.'}
        </p>
      </div>
      {unavailable ? (
        <button className="quiet" onClick={onRefresh} type="button">
          Vérifier à nouveau
        </button>
      ) : null}
    </div>
  );
}

function runTerminalCopy(status: ApplicationDossier['runStatus']) {
  if (status === 'paused')
    return {
      title: 'Analyse de l’offre terminée',
      description:
        'Le premier agent a enregistré ses résultats. La sélection des preuves n’est pas encore activée dans cette version.',
    };
  if (status === 'budget_exhausted')
    return {
      title: 'La limite de ce run a été atteinte.',
      description:
        'Aucune page partielle ne sera publiée. Vous pouvez relancer la génération.',
    };
  if (status === 'cancelled')
    return {
      title: 'La génération a été annulée.',
      description: 'Aucune page partielle ne sera publiée.',
    };
  if (status === 'failed')
    return {
      title: 'La génération s’est arrêtée.',
      description:
        'Le brief est intact et aucune page partielle ne sera publiée.',
    };
  return {
    title: 'Le résultat n’est pas encore disponible.',
    description: 'Actualisez le suivi avant de relancer la génération.',
  };
}

function JourneyColumn({
  children,
  number,
  state,
  title,
}: {
  children: React.ReactNode;
  number: string;
  state: 'complete' | 'attention' | 'idle';
  title: string;
}) {
  return (
    <section className="journey-column">
      <header>
        <span className={state}>{number}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function JourneyCard({
  children,
  dark = false,
  icon,
  status,
}: {
  children: React.ReactNode;
  dark?: boolean;
  icon: string;
  status: string;
}) {
  return (
    <article className={`journey-card ${dark ? 'dark' : ''}`}>
      <header>
        <span aria-hidden="true">{icon}</span>
        <small>{status}</small>
      </header>
      {children}
    </article>
  );
}

function CompanyView({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section className="document company-document">
      <header className="document-heading">
        <p className="section-label">Entreprise</p>
        <h2>{opportunity.company}</h2>
        <p>
          Le contexte utilisé par les agents reste séparé des preuves sur votre
          parcours.
        </p>
      </header>
      <dl className="company-facts">
        <div>
          <dt>Poste ciblé</dt>
          <dd>{opportunity.role}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {opportunity.url ? 'URL de l’offre' : 'Brief saisi manuellement'}
          </dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>À confronter aux preuves</dd>
        </div>
      </dl>
      <section className="company-context">
        <span>Contexte reçu</span>
        <p>{opportunity.description}</p>
      </section>
      {opportunity.url ? (
        <a
          className="company-source"
          href={opportunity.url}
          rel="noreferrer"
          target="_blank"
        >
          Consulter l’offre source ↗
        </a>
      ) : null}
      <p className="document-note">
        Le contenu de l’offre est traité comme une donnée non fiable. Aucune
        affirmation sur votre profil n’en est déduite sans preuve.
      </p>
    </section>
  );
}

function BriefView({
  canImportUrl,
  error,
  generating,
  hasDraft,
  locked,
  opportunity,
  onChange,
  onGenerate,
}: {
  canImportUrl: boolean;
  error: string;
  generating: boolean;
  hasDraft: boolean;
  locked: boolean;
  opportunity: Opportunity;
  onChange: (opportunity: Opportunity) => void;
  onGenerate: () => void;
}) {
  const importController = useRef<AbortController | undefined>(undefined);
  const importButton = useRef<HTMLButtonElement>(null);
  const opportunityRef = useRef(opportunity);
  opportunityRef.current = opportunity;
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [missingFields, setMissingFields] = useState<
    Array<'company' | 'role' | 'description'>
  >([]);
  const [pendingImport, setPendingImport] =
    useState<JobPostingImportResponse>();

  useEffect(
    () => () => {
      importController.current?.abort();
    },
    [],
  );

  async function importJob(event: React.FormEvent) {
    event.preventDefault();
    setImportError('');
    setImportMessage('');
    let url: URL;
    try {
      url = new URL(opportunity.url ?? '');
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      setImportError(
        'Saisissez une URL publique complète, par exemple https://entreprise.com/jobs/…',
      );
      return;
    }

    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    setImporting(true);
    try {
      const response = await fetch('/api/applications/import-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.href }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const preview = jobPostingImportResponseSchema.parse(
        await response.json(),
      );
      const current = opportunityRef.current;
      if (current.url !== url.href) {
        setImportError(
          'Le lien a changé pendant l’import. Relancez l’import avec la nouvelle URL.',
        );
        return;
      }
      const conflicts = ['company', 'role', 'description'].some((field) => {
        const currentValue = current[field as keyof Opportunity];
        const imported = preview[field as keyof JobPostingImportResponse];
        return Boolean(currentValue && imported && currentValue !== imported);
      });
      if (conflicts) setPendingImport(preview);
      else applyImport(preview, false);
    } catch (importFailure) {
      if (controller.signal.aborted) return;
      const status =
        importFailure instanceof Error ? importFailure.message : '';
      setImportError(
        status === '401'
          ? 'Connectez-vous pour importer une annonce. La saisie manuelle reste disponible.'
          : status === '429'
            ? 'Trop d’imports rapprochés. Réessayez dans une minute.'
            : 'Import impossible. Cette page ne permet pas la lecture automatique. Vos saisies ont été conservées ; complétez le brief manuellement.',
      );
    } finally {
      if (importController.current === controller) {
        importController.current = undefined;
        setImporting(false);
      }
    }
  }

  function applyImport(preview: JobPostingImportResponse, overwrite: boolean) {
    const current = opportunityRef.current;
    const next = {
      ...current,
      company:
        overwrite || !current.company
          ? (preview.company ?? current.company)
          : current.company,
      role:
        overwrite || !current.role
          ? (preview.role ?? current.role)
          : current.role,
      description:
        overwrite || !current.description
          ? (preview.description ?? current.description)
          : current.description,
      url: preview.sourceUrl,
    };
    opportunityRef.current = next;
    setPendingImport(undefined);
    onChange(next);
    const complete = opportunityReady(next);
    const missing = (['company', 'role', 'description'] as const).filter(
      (field) => !next[field],
    );
    setMissingFields(missing);
    setImportMessage(
      complete
        ? 'Offre importée. Entreprise, poste et description ont été préremplis. Vérifiez-les avant de continuer.'
        : 'Import partiel. Certaines informations n’ont pas été trouvées. Complétez les champs indiqués pour continuer.',
    );
    if (!complete)
      requestAnimationFrame(() =>
        document
          .getElementById(
            !next.company
              ? 'job-company'
              : !next.role
                ? 'job-role'
                : 'job-description',
          )
          ?.focus(),
      );
  }

  function changeOpportunity(update: Partial<Opportunity>) {
    const next = { ...opportunityRef.current, ...update };
    opportunityRef.current = next;
    onChange(next);
  }

  function changeRequiredField(
    field: 'company' | 'role' | 'description',
    value: string,
  ) {
    setMissingFields((current) =>
      current.filter((candidate) => candidate !== field),
    );
    changeOpportunity({ [field]: value });
  }

  function cancelPendingImport() {
    setPendingImport(undefined);
    requestAnimationFrame(() => importButton.current?.focus());
  }

  return (
    <section className="document brief-document" aria-labelledby="brief-title">
      <header className="document-heading">
        <p className="section-label">Offre</p>
        <h2 id="brief-title">Que doit démontrer cette candidature ?</h2>
        <p>
          Ajoutez le contexte du poste. La page ne retiendra que les preuves qui
          le soutiennent réellement.
        </p>
      </header>
      {locked ? (
        <div className="run-brief-lock" role="status">
          <strong>Analyse en cours</strong>
          <p>
            Ce brief reste consultable, mais l’instantané utilisé par le run ne
            peut plus être modifié.
          </p>
        </div>
      ) : null}
      <div className="job-import-panel">
        <div>
          <strong>Importer l’offre</strong>
          <p>
            Collez le lien pour préremplir le brief, puis vérifiez le résultat.
          </p>
        </div>
        <form
          aria-busy={importing}
          className="job-import-form"
          onSubmit={importJob}
        >
          <label htmlFor="job-url">URL publique de l’offre</label>
          <div>
            <input
              autoComplete="url"
              disabled={locked}
              id="job-url"
              name="job-url"
              placeholder="https://entreprise.com/jobs/role…"
              type="url"
              value={opportunity.url ?? ''}
              onChange={(event) =>
                changeOpportunity({ url: event.target.value })
              }
            />
            <button
              disabled={
                locked || !canImportUrl || importing || !opportunity.url
              }
              ref={importButton}
              type="submit"
            >
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
          {!canImportUrl ? (
            <small>
              Connexion requise pour lire une URL externe.{' '}
              <Link href="/sign-in?next=/">Se connecter</Link>
            </small>
          ) : null}
        </form>
        {importing ? (
          <p className="import-feedback" role="status">
            Lecture de l’annonce et extraction des informations…
          </p>
        ) : null}
        {importMessage ? (
          <p className="import-feedback success" role="status">
            {importMessage}
          </p>
        ) : null}
        {importError ? (
          <p className="import-feedback error" role="alert">
            {importError}
          </p>
        ) : null}
      </div>
      <p className="manual-separator">ou remplir manuellement</p>
      <div className="field-grid">
        <label>
          Entreprise
          <input
            aria-label="Entreprise"
            aria-describedby={
              missingFields.includes('company')
                ? 'job-company-missing'
                : undefined
            }
            aria-invalid={missingFields.includes('company') || undefined}
            autoComplete="organization"
            disabled={locked}
            id="job-company"
            name="company"
            value={opportunity.company}
            onChange={(event) =>
              changeRequiredField('company', event.target.value)
            }
          />
          {missingFields.includes('company') ? (
            <span className="missing-field" id="job-company-missing">
              Entreprise non trouvée dans l’annonce. À compléter.
            </span>
          ) : null}
        </label>
        <label>
          Poste
          <input
            aria-label="Poste"
            aria-describedby={
              missingFields.includes('role') ? 'job-role-missing' : undefined
            }
            aria-invalid={missingFields.includes('role') || undefined}
            autoComplete="organization-title"
            disabled={locked}
            id="job-role"
            name="role"
            value={opportunity.role}
            onChange={(event) =>
              changeRequiredField('role', event.target.value)
            }
          />
          {missingFields.includes('role') ? (
            <span className="missing-field" id="job-role-missing">
              Intitulé non trouvé dans l’annonce. À compléter.
            </span>
          ) : null}
        </label>
      </div>
      <label>
        Description du poste
        <textarea
          aria-label="Description du poste"
          aria-describedby={
            missingFields.includes('description')
              ? 'job-description-missing'
              : undefined
          }
          aria-invalid={missingFields.includes('description') || undefined}
          autoComplete="off"
          disabled={locked}
          id="job-description"
          name="job-description"
          rows={8}
          value={opportunity.description}
          onChange={(event) =>
            changeRequiredField('description', event.target.value)
          }
        />
        {missingFields.includes('description') ? (
          <span className="missing-field" id="job-description-missing">
            Description non trouvée dans l’annonce. À compléter.
          </span>
        ) : null}
      </label>
      <div className="field-grid compact accent-field">
        <p>
          L’annonce importée reste une donnée non fiable. Aucun élément de votre
          profil n’en est déduit sans preuve.
        </p>
        <label>
          Couleur <span>Décorative uniquement</span>
          <input
            aria-label="Couleur de l’entreprise"
            disabled={locked}
            name="company-accent"
            type="color"
            value={opportunity.accent}
            onChange={(event) =>
              changeOpportunity({ accent: event.target.value })
            }
          />
        </label>
      </div>
      {pendingImport ? (
        <ImportConflictDialog
          onCancel={cancelPendingImport}
          onComplete={() => applyImport(pendingImport, false)}
          onReplace={() => applyImport(pendingImport, true)}
        />
      ) : null}
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Page non générée</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="document-actions">
        <p>
          {locked
            ? 'Revenez dans Parcours pour suivre cette génération.'
            : 'Le brief est enregistré localement pendant la saisie.'}
        </p>
        <button
          disabled={locked || generating || !opportunityReady(opportunity)}
          onClick={onGenerate}
        >
          {generating
            ? 'Génération de la page…'
            : error
              ? 'Réessayer'
              : hasDraft
                ? 'Régénérer la page'
                : 'Générer la page'}
        </button>
      </div>
    </section>
  );
}

function ImportConflictDialog({
  onCancel,
  onComplete,
  onReplace,
}: {
  onCancel: () => void;
  onComplete: () => void;
  onReplace: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      className="import-conflict-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialog}
    >
      <h3>L’offre contient des informations différentes</h3>
      <p>Choisissez comment appliquer l’import à votre brief actuel.</p>
      <div>
        <button onClick={onComplete} type="button">
          Compléter sans remplacer
        </button>
        <button onClick={onReplace} type="button">
          Remplacer avec l’import
        </button>
        <button className="quiet" onClick={onCancel} type="button">
          Annuler
        </button>
      </div>
    </dialog>
  );
}

function DraftView({
  onOpenEvidence,
  onOpenReview,
  onRefresh,
  onRetry,
  onStartReviews,
  profile,
  reviewError,
  retryError,
  retryPending,
  reviewsAvailable,
  reviewPending,
  reviewState,
  spec,
  workerAvailability,
}: {
  onOpenEvidence: (claimId: string) => void;
  onOpenReview: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onStartReviews: () => void;
  profile: Profile;
  reviewError: string;
  retryError: string;
  retryPending: boolean;
  reviewsAvailable: boolean;
  reviewPending: boolean;
  reviewState: ReturnType<typeof reviewProcessState>;
  spec: PageSpec;
  workerAvailability?: PersistedRun['workerAvailability'];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const usedClaimIds = new Set(
    spec.blocks.flatMap((block) => ('claimIds' in block ? block.claimIds : [])),
  );
  const sourcedCount = profile.claims.filter(
    (claim) => usedClaimIds.has(claim.id) && claim.evidenceIds.length,
  ).length;
  const reviewStarted = reviewState === 'running';
  const reviewFailed = reviewState === 'failed';
  useEffect(() => heading.current?.focus(), []);
  return (
    <article
      className="document draft-document"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <div className="draft-accent" aria-hidden="true" />
      <header className="draft-heading">
        <p>{spec.company.role}</p>
        <span>Brouillon généré</span>
      </header>
      <section
        className="draft-review-note"
        aria-label="Relecture du brouillon"
      >
        <div>
          <h2 ref={heading} tabIndex={-1}>
            Relisez exactement ce que l’entreprise verra.
          </h2>
          <p>Rien ne sera partagé sans votre validation.</p>
          {!reviewsAvailable ? (
            <p className="draft-review-state">
              {reviewStarted
                ? 'Les trois vérifications sont en cours.'
                : reviewFailed
                  ? 'Les vérifications se sont arrêtées. Le brouillon reste intact.'
                  : 'Brouillon prêt. Lancez les vérifications après votre relecture.'}
            </p>
          ) : null}
        </div>
        <span>
          {spec.blocks.length} section{spec.blocks.length > 1 ? 's' : ''} ·{' '}
          {usedClaimIds.size} affirmation{usedClaimIds.size > 1 ? 's' : ''} ·{' '}
          {sourcedCount}/{usedClaimIds.size} sourcées
        </span>
      </section>
      <WorkerAvailabilityNotice
        availability={workerAvailability}
        onRefresh={onRefresh}
      />
      <p className="section-label">{spec.hero.eyebrow}</p>
      <h2>{spec.hero.title}</h2>
      <p className="draft-thesis">{spec.hero.thesis}</p>
      {spec.blocks.map((block, index) => (
        <section className="proof-section" key={`${block.type}-${index}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>{block.title}</h3>
            {'claimIds' in block ? (
              block.claimIds.map((id) => {
                const claim = claims.get(id);
                return claim ? (
                  <button
                    className="statement"
                    key={id}
                    onClick={() => onOpenEvidence(id)}
                    type="button"
                  >
                    <span>{claim.statement}</span>
                    <small>{levelLabel(claim.level)} · Voir la preuve</small>
                  </button>
                ) : null;
              })
            ) : (
              <p>{block.text}</p>
            )}
          </div>
        </section>
      ))}
      {reviewError ? <p role="alert">{reviewError}</p> : null}
      <div className="document-actions">
        <p>
          {reviewsAvailable
            ? 'Les trois vérifications sont terminées.'
            : reviewFailed
              ? 'Relancez la candidature pour créer un nouveau run vérifiable.'
              : reviewStarted
                ? 'Le traitement continue en arrière-plan. Vous pouvez quitter cette page.'
                : 'Trois agents vérifieront la pertinence, la lisibilité et les preuves.'}
        </p>
        {reviewsAvailable ? (
          <button onClick={onOpenReview}>Ouvrir la revue</button>
        ) : reviewFailed ? (
          <button disabled={retryPending} onClick={onRetry}>
            {retryPending ? 'Relance en cours…' : 'Relancer la candidature'}
          </button>
        ) : (
          <button
            disabled={reviewPending || reviewStarted}
            onClick={onStartReviews}
          >
            {reviewPending
              ? 'Lancement…'
              : reviewStarted
                ? 'Vérifications en cours'
                : 'Lancer les 3 vérifications'}
          </button>
        )}
        {reviewFailed && retryError ? (
          <p className="inline-error" role="alert">
            {retryError}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function EvidenceInspector({
  onClose,
  open,
  profile,
  selectedClaimId,
  spec,
}: {
  onClose: () => void;
  open: boolean;
  profile: Profile;
  selectedClaimId: string;
  spec?: PageSpec;
}) {
  const inspector = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ) ?? [],
  );

  useEffect(() => {
    if (!open || !inspector.current) return;
    const node = inspector.current;
    const mobile = matchMedia('(max-width: 1023px)');
    let inerted: HTMLElement[] = [];

    function resetModalState() {
      inerted.forEach((element) => (element.inert = false));
      inerted = [];
      node.removeAttribute('role');
      node.removeAttribute('aria-modal');
    }

    function syncModalState() {
      resetModalState();
      if (mobile.matches) {
        node.setAttribute('role', 'dialog');
        node.setAttribute('aria-modal', 'true');
        let current: HTMLElement = node;
        while (current.parentElement) {
          const parent = current.parentElement;
          for (const sibling of parent.children)
            if (sibling !== current && sibling instanceof HTMLElement) {
              sibling.inert = true;
              inerted.push(sibling);
            }
          current = parent;
          if (parent.matches('main.app-shell')) break;
        }
      }
      closeButton.current?.focus();
    }

    syncModalState();
    mobile.addEventListener('change', syncModalState);
    return () => {
      mobile.removeEventListener('change', syncModalState);
      resetModalState();
    };
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !inspector.current?.hasAttribute('aria-modal'))
      return;
    const focusable = [
      ...inspector.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <aside
      className={`evidence-inspector ${open ? 'open' : ''}`}
      id="evidence-inspector"
      aria-labelledby="evidence-inspector-title"
      onKeyDown={handleKeyDown}
      ref={inspector}
    >
      <header>
        <div>
          <p className="section-label">Preuves</p>
          <h2 id="evidence-inspector-title">Pourquoi ces affirmations ?</h2>
        </div>
        <button
          className="inspector-close quiet"
          onClick={onClose}
          aria-label="Fermer l’inspecteur de preuves"
          ref={closeButton}
        >
          Fermer
        </button>
      </header>
      {profile.claims
        .filter((claim) =>
          selectedClaimId
            ? claim.id === selectedClaimId
            : selectedIds.has(claim.id),
        )
        .map((claim) => (
          <section className="evidence-item" key={claim.id}>
            <div className="evidence-status">
              <span>{levelLabel(claim.level)}</span>
              <code translate="no">{claim.id}</code>
            </div>
            <h3>{claim.statement}</h3>
            {claim.evidenceIds.map((evidenceId) => {
              const evidence = profile.evidence.find(
                (item) => item.id === evidenceId,
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return evidence ? (
                <blockquote key={evidence.id}>
                  <strong>{source?.title}</strong>
                  <p>“{evidence.excerpt}”</p>
                </blockquote>
              ) : null;
            })}
          </section>
        ))}
    </aside>
  );
}

function ReviewView({
  approved,
  canRerun,
  decisionError,
  decisionMessage,
  decisionPending,
  decisions,
  onApprove,
  onContinue,
  onDecide,
  onReturnToBrief,
  onReview,
  paused,
  publicationEligible,
  reviews,
}: {
  approved: boolean;
  canRerun: boolean;
  decisionError: string;
  decisionMessage: string;
  decisionPending: string;
  decisions?: ReviewDecision[];
  onApprove: (approved: boolean) => void;
  onContinue: () => void;
  onReturnToBrief: () => void;
  onDecide: (
    review: WorkspaceReview,
    issueIndex: number,
    decision: ReviewDecision['decision'],
  ) => void;
  onReview: () => void;
  paused: boolean;
  publicationEligible: boolean;
  reviews: WorkspaceReview[];
}) {
  const ready = reviewsComplete(reviews) && publicationEligible;
  return (
    <section className="document review-document">
      <header className="document-heading">
        <p className="section-label">Revue</p>
        <h2>Confirmer la pertinence et les preuves</h2>
        <p>
          Assumez explicitement une objection non factuelle, ou revenez au brief
          pour produire une nouvelle version. Un point factuel ne peut jamais
          être ignoré.
        </p>
      </header>
      {decisionError ? <p role="alert">{decisionError}</p> : null}
      {decisionMessage ? <p role="status">{decisionMessage}</p> : null}
      <div className="review-list">
        {reviews.map((item) => {
          const issues = item.issues ?? [];
          const unresolved = issues.some(
            (_, issueIndex) =>
              !decisions?.some(
                (decision) =>
                  decision.reviewId === item.reviewId &&
                  decision.issueIndex === issueIndex,
              ),
          );
          const kept = !item.passed && issues.length > 0 && !unresolved;
          return (
            <article className="review-card" key={item.reviewer}>
              <header>
                <div>
                  <strong>{reviewerLabel(item.reviewer)}</strong>
                  <small>
                    {item.passed
                      ? 'Aucun blocage détecté.'
                      : `${item.findings.length} point${item.findings.length > 1 ? 's' : ''} à examiner.`}
                  </small>
                </div>
                <span className={item.passed || kept ? 'passed' : 'blocked'}>
                  {item.passed ? 'Validé' : kept ? 'Assumé' : 'À trancher'}
                </span>
              </header>
              {issues.map((issue, issueIndex) => {
                const choice = decisions?.find(
                  (decision) =>
                    decision.reviewId === item.reviewId &&
                    decision.issueIndex === issueIndex,
                );
                const issueKey = `${item.reviewId}:${issueIndex}`;
                return (
                  <section className="review-issue" key={issueKey}>
                    <p>{issue.message}</p>
                    <small>{sectionLabel(issue.section)}</small>
                    {choice ? (
                      <span className="decision-recorded">
                        Version gardée · décision enregistrée
                      </span>
                    ) : (
                      <div className="review-actions">
                        <button onClick={onReturnToBrief}>
                          Revenir au brief
                        </button>
                        {item.reviewer !== 'factuality' ? (
                          <button
                            className="quiet"
                            disabled={Boolean(decisionPending)}
                            onClick={() => onDecide(item, issueIndex, 'keep')}
                          >
                            Garder cette version
                          </button>
                        ) : (
                          <small className="decision-policy">
                            Une affirmation factuelle ne peut pas être conservée
                            sans correction.
                          </small>
                        )}
                        {decisionPending === issueKey ? (
                          <small className="decision-saving" role="status">
                            Enregistrement de votre décision…
                          </small>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })}
              {!item.passed && !issues.length ? (
                <p className="review-legacy-note">
                  {item.findings.join(' ')} Cette ancienne revue doit être
                  régénérée pour devenir actionnable.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {canRerun ? (
        <button className="quiet" disabled={paused} onClick={onReview}>
          Relancer la revue
        </button>
      ) : null}
      <label className="approval">
        <input
          checked={approved}
          disabled={!ready}
          onChange={(event) => onApprove(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Valider cette candidature</strong>
          J’ai vérifié les preuves et je valide cette candidature.
        </span>
      </label>
      <div className="document-actions">
        <p>
          {ready
            ? 'Les contrôles et vos décisions autorisent la validation.'
            : 'Résolvez d’abord les blocages de la revue.'}
        </p>
        <button disabled={!approved} onClick={onContinue}>
          Continuer vers le partage
        </button>
      </div>
    </section>
  );
}

function ShareView({
  canPublish,
  error,
  onCopy,
  onPublish,
  onRevoke,
  publishing,
  shareMessage,
  shareUrl,
  publicationExists,
  hasPersistedRun,
  signedIn,
}: {
  canPublish: boolean;
  error: string;
  onCopy: () => void;
  onPublish: () => void;
  onRevoke: () => void;
  publishing: boolean;
  shareMessage: string;
  shareUrl: string;
  publicationExists: boolean;
  hasPersistedRun: boolean;
  signedIn: boolean;
}) {
  return (
    <section className="document share-document">
      <header className="document-heading">
        <p className="section-label">Partage</p>
        <h2>Un lien privé, sous votre contrôle</h2>
        <p>
          Le lien expire après 7 jours. Il ouvre uniquement cette candidature et
          peut être révoqué à tout moment.
        </p>
      </header>
      {shareUrl ? (
        <div className="share-result" role="status" aria-live="polite">
          <span className="passed">Actif · Expire dans 7 jours</span>
          <code translate="no">{shareUrl}</code>
          <div className="share-actions">
            <button onClick={onCopy}>Copier le lien privé</button>
            <a href={shareUrl}>Ouvrir la page privée</a>
            <button className="danger-link" onClick={onRevoke}>
              Révoquer le lien privé
            </button>
          </div>
        </div>
      ) : (
        <div className="share-empty">
          <strong>Non partagée</strong>
          <p>Créez le lien uniquement lorsque la page relue est prête.</p>
        </div>
      )}
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Lien privé non créé</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <p className="sr-status" aria-live="polite">
        {shareMessage}
      </p>
      {!shareUrl ? (
        <div className="document-actions">
          <p>
            {publicationExists
              ? 'Le lien existant est masqué sur cet appareil. Le remplacer invalidera tous les anciens liens.'
              : !hasPersistedRun
                ? 'Connectez-vous, puis relancez la génération pour enregistrer cette candidature avant de la partager.'
                : 'La mémoire enregistrée, votre validation et trois contrôles réussis sont requis.'}
          </p>
          {!signedIn ? (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour{' '}
              {publicationExists ? 'gérer le lien' : 'créer le lien'}
            </Link>
          ) : publicationExists ? (
            <div className="share-actions">
              {hasPersistedRun ? (
                <button
                  disabled={!canPublish || publishing}
                  onClick={onPublish}
                >
                  {publishing
                    ? 'Remplacement du lien…'
                    : 'Remplacer le lien privé'}
                </button>
              ) : null}
              <button className="danger-link" onClick={onRevoke}>
                Révoquer tous les liens
              </button>
            </div>
          ) : (
            <button disabled={!canPublish || publishing} onClick={onPublish}>
              {publishing ? 'Création du lien privé…' : 'Créer le lien privé'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CareerMemoryView({
  dirty,
  error,
  memoryDraft,
  onAdd,
  onCreateApplication,
  onDismissHandoff,
  onDraftChange,
  onProfileChange,
  onSave,
  profile,
  signedIn,
  showHandoff,
  syncing,
  syncMessage,
}: {
  dirty: boolean;
  error: string;
  memoryDraft: {
    source: string;
    claim: string;
    evidence: string;
    level: 'verified' | 'declared' | 'inferred';
  };
  onAdd: () => void;
  onCreateApplication: () => void;
  onDismissHandoff: () => void;
  onDraftChange: (draft: typeof memoryDraft) => void;
  onProfileChange: (profile: Profile) => void;
  onSave: () => void;
  profile: Profile;
  signedIn: boolean;
  showHandoff: boolean;
  syncing: boolean;
  syncMessage: string;
}) {
  return (
    <div className="standalone-view">
      <header className="view-header">
        <div>
          <p className="section-label">Mémoire pro</p>
          <h1>Mémoire professionnelle</h1>
          <p>Chaque affirmation reste reliée à sa source et à sa preuve.</p>
        </div>
        <div className="memory-header-actions">
          <div
            className="memory-counts"
            aria-label="Totaux de la mémoire professionnelle"
          >
            <span>{profile.sources.length} sources</span>
            <span>{profile.claims.length} affirmations</span>
            <span>{profile.evidence.length} preuves</span>
          </div>
          {signedIn ? (
            <button disabled={!dirty || syncing} onClick={onSave}>
              {syncing
                ? 'Enregistrement…'
                : dirty
                  ? 'Enregistrer'
                  : 'Enregistré'}
            </button>
          ) : (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour enregistrer
            </Link>
          )}
        </div>
      </header>
      {syncMessage ? (
        <p className="memory-sync-message" role="status">
          {syncMessage}
        </p>
      ) : null}
      {showHandoff ? (
        <section
          className="memory-handoff"
          aria-labelledby="memory-ready-title"
        >
          <div>
            <p className="section-label">Étape 2 sur 2</p>
            <h2 id="memory-ready-title">Votre mémoire est prête.</h2>
            <p>
              {profile.sources.length} source
              {profile.sources.length > 1 ? 's' : ''}, {profile.claims.length}{' '}
              affirmation
              {profile.claims.length > 1 ? 's' : ''} retenue
              {profile.claims.length > 1 ? 's' : ''}, dont{' '}
              {
                profile.claims.filter((claim) => claim.level !== 'verified')
                  .length
              }{' '}
              à étayer.
            </p>
          </div>
          <div>
            <button className="quiet" onClick={onDismissHandoff} type="button">
              Relire ma mémoire
            </button>
            <button onClick={onCreateApplication} type="button">
              Créer ma première candidature
            </button>
          </div>
        </section>
      ) : null}
      <div className="memory-layout" id="career-memory-content">
        <section className="document memory-profile">
          <div className="memory-sources-list">
            <div className="list-heading">
              <h2>Sources</h2>
              <span>{profile.sources.length}</span>
            </div>
            {profile.sources.map((source) => (
              <article key={source.id}>
                <span aria-hidden="true">▤</span>
                <div>
                  <strong>{source.title}</strong>
                  <small>{source.kind}</small>
                </div>
              </article>
            ))}
          </div>
          <h2>Profil</h2>
          <label>
            Nom
            <input
              autoComplete="name"
              name="candidate-name"
              value={profile.name}
              onChange={(event) =>
                onProfileChange({ ...profile, name: event.target.value })
              }
            />
          </label>
          <label>
            Positionnement
            <input
              autoComplete="off"
              name="candidate-headline"
              value={profile.headline}
              onChange={(event) =>
                onProfileChange({ ...profile, headline: event.target.value })
              }
            />
          </label>
          <details>
            <summary>Ajouter une affirmation</summary>
            <label>
              Titre de la source
              <input
                autoComplete="off"
                name="source-title"
                value={memoryDraft.source}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, source: event.target.value })
                }
              />
            </label>
            <label>
              Affirmation
              <textarea
                autoComplete="off"
                name="statement"
                rows={3}
                value={memoryDraft.claim}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, claim: event.target.value })
                }
              />
            </label>
            <label>
              Niveau de preuve
              <select
                name="evidence-status"
                value={memoryDraft.level}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    level: event.target.value as typeof memoryDraft.level,
                  })
                }
              >
                <option value="declared">Déclarée</option>
                <option value="inferred">Inférée</option>
                <option value="verified">Vérifiée</option>
              </select>
            </label>
            <label>
              Extrait de preuve
              <textarea
                autoComplete="off"
                name="evidence-excerpt"
                rows={3}
                value={memoryDraft.evidence}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    evidence: event.target.value,
                  })
                }
              />
            </label>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <button onClick={onAdd}>Ajouter</button>
          </details>
        </section>
        <section className="statement-list" aria-labelledby="statements-title">
          <div className="list-heading">
            <h2 id="statements-title">Affirmations</h2>
            <span>{profile.claims.length}</span>
          </div>
          {profile.claims.map((claim) => (
            <article key={claim.id}>
              <div>
                <span>{levelLabel(claim.level)}</span>
                <small>
                  {claim.evidenceIds.length
                    ? `${claim.evidenceIds.length} preuve`
                    : 'Aucune preuve rattachée'}
                </small>
              </div>
              <label>
                Affirmation
                <textarea
                  rows={3}
                  value={claim.statement}
                  onChange={(event) =>
                    onProfileChange({
                      ...profile,
                      claims: profile.claims.map((item) =>
                        item.id === claim.id
                          ? { ...item, statement: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </article>
          ))}
        </section>
        <aside className="memory-audit">
          <section>
            <p className="section-label">Complétude</p>
            <strong>
              {profile.claims.length
                ? Math.round(
                    (profile.claims.filter(
                      (claim) => claim.level === 'verified',
                    ).length /
                      profile.claims.length) *
                      100,
                  )
                : 0}
              %
            </strong>
            <span>des affirmations sont vérifiées</span>
          </section>
          <section>
            <p className="section-label">À corriger</p>
            <strong>
              {
                profile.claims.filter((claim) => !claim.evidenceIds.length)
                  .length
              }
            </strong>
            <span>affirmations sans preuve</span>
          </section>
          <section>
            <p className="section-label">Confidentialité</p>
            <dl>
              <div>
                <dt>Sensibilité par défaut</dt>
                <dd>Privé</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>Validation explicite</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ActivityView({
  dossiers,
  onOpenReview,
}: {
  dossiers: ApplicationDossier[];
  onOpenReview: (dossierId: string) => void;
}) {
  const findings = dossiers.flatMap((dossier) =>
    unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions).map(
      (finding) => ({ ...finding, dossier }),
    ),
  );
  const active =
    findings[0]?.dossier ??
    [...dossiers]
      .filter((dossier) => dossier.events.length)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const events = active?.events ?? [];
  const deliverables = events.filter((event) => event.artifact);
  return (
    <div className="standalone-view run-review-view">
      <header className="view-header">
        <div>
          <p className="section-label">Run d’agents · revue humaine</p>
          <h1>Revue avant publication</h1>
          <p>
            Étapes, entrées, sorties et décisions. Jamais de chaîne de pensée.
          </p>
        </div>
      </header>
      {active ? (
        <div className="run-review-layout">
          <section
            className="run-timeline"
            aria-label="Étapes terminées du run"
          >
            <header>
              <div>
                <span className="status-label">
                  {active.paused ? 'Mis en pause' : dossierStatus(active)}
                </span>
                <strong>
                  {active.opportunity.company || 'Nouvelle offre'} ·{' '}
                  {events.length} événements enregistrés
                </strong>
              </div>
            </header>
            {deliverables.map((event, index) => (
              <article key={`${event.actor}-${index}`}>
                <span className="timeline-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>{deliverableLabel(event)}</strong>
                  <p>{event.action}</p>
                  <small>{event.actor.replaceAll('-', ' ')}</small>
                </div>
                <code>{event.artifact}</code>
              </article>
            ))}
            <details>
              <summary>Métadonnées techniques</summary>
              <small>
                Événements du run et identifiants d’artefacts uniquement.
              </small>
              {events.map((event, index) => (
                <code key={`${event.actor}-${index}`} translate="no">
                  {String(index + 1).padStart(2, '0')} · {event.actor} ·{' '}
                  {event.action} · {event.artifact ?? 'no-artifact'} · €
                  {(event.costMicros / 1_000_000).toFixed(2)}
                </code>
              ))}
            </details>
          </section>
          <aside className="human-review-panel">
            <header>
              <div>
                <p className="section-label">Avant publication</p>
                <h2>Revue humaine</h2>
              </div>
              <span>{findings.length} points à trancher</span>
            </header>
            {findings.map(({ dossier, issue, issueIndex, review }) => (
              <article
                key={`${dossier.id}:${review.reviewId ?? review.reviewer}:${issueIndex}`}
              >
                <span className="blocked">Décision requise</span>
                <strong>
                  {dossier.opportunity.company || 'Nouvelle offre'} ·{' '}
                  {reviewerLabel(review.reviewer)}
                </strong>
                <p>{issue.message}</p>
                <button onClick={() => onOpenReview(dossier.id)}>
                  Trancher ce point
                </button>
              </article>
            ))}
            {!findings.length ? (
              <div className="review-placeholder">
                <strong>Aucune décision en attente</strong>
                <p>Les nouvelles objections des agents apparaîtront ici.</p>
              </div>
            ) : null}
            {reviewsComplete(active.reviews) ? (
              <button onClick={() => onOpenReview(active.id)}>
                Ouvrir la revue de {active.opportunity.company}
              </button>
            ) : null}
            <details>
              <summary>Contrats techniques des agents</summary>
              <div className="role-grid">
                {agentRoles.map((role) => (
                  <article key={role.name}>
                    <strong>{role.name}</strong>
                    <p>
                      {role.input} → {role.output}
                    </p>
                    <small>{role.authority}</small>
                  </article>
                ))}
              </div>
            </details>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <h2>Aucun run</h2>
          <p>Générez une candidature pour créer le premier journal.</p>
        </div>
      )}
    </div>
  );
}

function SettingsView({
  onExport,
  onReset,
}: {
  onExport: () => void;
  onReset: () => void;
}) {
  return (
    <div className="standalone-view settings-view">
      <header className="view-header">
        <div>
          <p className="section-label">Réglages</p>
          <h1>Espace local</h1>
          <p>Exportez ou réinitialisez les données locales de ce navigateur.</p>
        </div>
      </header>
      <section className="settings-row">
        <div>
          <h2>Exporter toutes les données</h2>
          <p>
            Téléchargez le profil, la candidature, les revues et l’activité.
          </p>
        </div>
        <button onClick={onExport}>Export JSON</button>
      </section>
      <section className="settings-row danger-zone">
        <div>
          <h2>Réinitialiser l’espace local</h2>
          <p>
            Supprimez la mémoire, les candidatures et leurs pages de ce
            navigateur.
          </p>
        </div>
        <button className="danger-link" onClick={onReset}>
          Réinitialiser
        </button>
      </section>
      <p className="demo-footer">Les fichiers CV bruts ne sont pas exportés.</p>
    </div>
  );
}

function NavIcon({ name }: { name: PrimaryView }) {
  const paths: Record<PrimaryView, React.ReactNode> = {
    home: (
      <>
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    applications: (
      <>
        <rect height="14" rx="2" width="16" x="4" y="6" />
        <path d="M9 6V4h6v2M4 11h16" />
      </>
    ),
    memory: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
        <path d="M8 8h7M8 12h7M8 16h4" />
      </>
    ),
    activity: (
      <>
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="m8 11 8-4M8 13l8 4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}

function levelLabel(level: Profile['claims'][number]['level']) {
  if (level === 'verified') return 'Vérifiée';
  if (level === 'declared') return 'Déclarée';
  return 'Inférée';
}

function allowedUseLabel(use: AllowedUse) {
  if (use === 'application') return 'Candidatures';
  if (use === 'resume') return 'CV';
  if (use === 'linkedin') return 'LinkedIn';
  return 'Entretiens';
}

function isStrongImportCandidate(candidate: ProfileImportCandidate) {
  return /^(?:(?:as|en tant que)\b.{0,60}[,:]\s*)?(?:independently\s+)?(?:built|created|design(?:ed)?|developed|implemented|improved|increased|launched|led|managed|operated|own(?:ed|s|ership)?|reduced|shipped|automated|construit|créé|conçu|développé|déployé|dirigé|géré|lancé|livré|mis en place|opéré|piloté|réduit|amélioré|augmenté|automatisé|ownership|produit\s+shippé|monitoring\s+automatisé|serveur\b.{0,80}\bexposant|first engineer\b.{0,100}\b(?:shippées?|posée))(?![\p{L}\p{N}_])/iu.test(
    candidate.statement.slice(0, 240),
  );
}

function importErrorMessage(error: unknown) {
  if (error instanceof ProfileImportError) {
    if (error.code === 'file_too_large')
      return 'Ce fichier dépasse la limite de 4 Mo.';
    if (error.code === 'unsupported_type' || error.code === 'type_mismatch')
      return 'Choisissez un fichier PDF, DOCX ou TXT valide.';
    if (error.code === 'pdf_encrypted')
      return 'Ce PDF est protégé. Exportez une copie sans mot de passe puis réessayez.';
    if (error.code === 'pdf_attachments')
      return 'Ce PDF contient une pièce jointe. Exportez une copie simple puis réessayez.';
    if (error.code === 'pdf_too_many_pages')
      return 'Ce PDF dépasse la limite de 100 pages.';
    if (
      error.code === 'docx_external_relationship' ||
      error.code === 'docx_unsafe_archive'
    )
      return 'Ce document Word contient des éléments externes ou actifs. Exportez-le en PDF puis réessayez.';
    if (error.code === 'timeout')
      return 'La lecture locale a pris trop de temps. Essayez une version plus légère du document.';
    if (error.code === 'aborted') return 'Lecture annulée.';
  }
  return 'Ce document n’a pas pu être lu localement. Essayez un PDF, DOCX ou TXT plus simple.';
}

function restoreImportReview(raw: string | null): ImportReview | undefined {
  if (!raw) return;
  try {
    const stored = JSON.parse(raw) as Partial<ImportReview>;
    if (
      typeof stored.expiresAt !== 'number' ||
      stored.expiresAt <= Date.now() ||
      typeof stored.name !== 'string' ||
      typeof stored.headline !== 'string' ||
      typeof stored.permissionsConfirmed !== 'boolean' ||
      !Array.isArray(stored.candidates)
    )
      return;
    const parsed = profileImportResultSchema.safeParse({
      version: stored.version,
      source: stored.source,
      suggestedName: stored.suggestedName,
      suggestedHeadline: stored.suggestedHeadline,
      candidates: stored.candidates.map((candidate) => ({
        statement: candidate.statement,
        excerpt: candidate.excerpt,
        locator: candidate.locator,
        group: candidate.group,
        provenance: candidate.provenance,
        trust: candidate.trust,
      })),
    });
    if (!parsed.success) return;
    const candidates = stored.candidates.flatMap((candidate, index) => {
      const allowedUses = Array.isArray(candidate.allowedUses)
        ? candidate.allowedUses.filter(
            (use): use is AllowedUse =>
              use === 'application' ||
              use === 'resume' ||
              use === 'linkedin' ||
              use === 'interview',
          )
        : [];
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.selected !== 'boolean' ||
        !candidate.sensitivity ||
        !['public', 'private', 'restricted'].includes(candidate.sensitivity)
      )
        return [];
      return [
        {
          ...parsed.data.candidates[index],
          id: candidate.id,
          selected: candidate.selected,
          sensitivity: candidate.sensitivity,
          allowedUses,
        } satisfies ImportReviewCandidate,
      ];
    });
    if (candidates.length !== parsed.data.candidates.length) return;
    return {
      ...parsed.data,
      name: stored.name,
      headline: stored.headline,
      candidates,
      permissionsConfirmed: stored.permissionsConfirmed,
      expiresAt: stored.expiresAt,
    };
  } catch {
    return;
  }
}

function importReviewExpired(raw: string | null) {
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw) as { expiresAt?: unknown };
    return (
      typeof stored.expiresAt === 'number' && stored.expiresAt <= Date.now()
    );
  } catch {
    return false;
  }
}

function reviewerLabel(reviewer: Review['reviewer']) {
  if (reviewer === 'hiring-manager') return 'Pertinence pour le poste';
  if (reviewer === 'factuality') return 'Vérification des preuves';
  return 'Clarté de la candidature';
}

function persistedEvents(run: PersistedRun): WorkflowEvent[] {
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

function applyPersistedRun(
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

function hasCurrentRunProjection(
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

async function isWorkerUnavailable(response: Response) {
  try {
    const body: unknown = await response.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      body.code === 'WORKER_UNAVAILABLE'
    );
  } catch {
    return false;
  }
}

function reviewGateReady(
  state: Pick<ApplicationDossier, 'publicationEligible' | 'reviews'>,
) {
  return reviewsComplete(state.reviews) && state.publicationEligible === true;
}

function unresolvedReviewIssues(
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

function sectionLabel(section: string) {
  if (section === 'hero.thesis') return 'Ouverture de la page';
  if (section.startsWith('blocks.evidence')) return 'Preuves détaillées';
  return section ? `Section ${section}` : 'Ancienne revue';
}

function deliverableLabel(event: WorkflowEvent) {
  if (event.artifact?.includes('research'))
    return 'Analyse de l’offre terminée';
  if (event.artifact?.includes('strategy'))
    return 'Appariement des preuves terminé';
  if (
    event.artifact?.includes('page-spec') ||
    event.artifact?.includes('page_spec')
  )
    return 'Brouillon terminé';
  if (event.artifact?.includes('review')) return 'Revue terminée';
  return 'Run mis à jour';
}
