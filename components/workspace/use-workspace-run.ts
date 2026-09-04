'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { authClient } from '@/lib/auth-client';
import {
  approveRunStrategy,
  confirmRunResearch,
  createPublication,
  createRun,
  decideRunReviewIssue,
  importJobPosting,
  isWorkerUnavailableResponse,
  readRun,
  revokePublication,
  saveApplication,
  startRunReviews,
  startRunStrategy,
} from '@/lib/career-api';
import { applicationSchema } from '@/lib/application-contract';
import { latestPageSpec, runAgentTeam } from '@/lib/agent-runtime';
import {
  jobPostingImportResponseSchema,
  type JobPostingImportResponse,
} from '@/lib/job-posting-extractor';
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
} from '@/lib/run-contract';
import { persistedRunOperation } from '@/lib/run-operation';
import { type PageSpec } from '@/lib/schemas';
import {
  buildStrategy,
  runReviews,
  type Strategy,
  type WorkflowEvent,
} from '@/lib/workflow';
import {
  applyPersistedRun,
  dossierStatus,
  hasCurrentRunProjection,
  opportunityReady,
  reviewGateReady,
  reviewProcessState,
  unresolvedReviewIssues,
  updateDossier,
  visibleShareUrl,
  type ApplicationDossier,
  type ReviewDecision,
  type SavedWorkspaceV2,
  type ScopedShareLink,
  type WorkspaceReview,
} from '@/lib/workspace-state';
import type { DossierView, PrimaryView } from './use-career-workspace';

type Options = {
  activeTenantId?: string | null;
  dossierView: DossierView;
  memoryRevision: number;
  primaryView: PrimaryView;
  requestedScope: MutableRefObject<string>;
  resolvedScope: string;
  savedProfileJson: string;
  selectedDossierIdRef: MutableRefObject<string | undefined>;
  setDossierView: Dispatch<SetStateAction<DossierView>>;
  setPrimaryView: Dispatch<SetStateAction<PrimaryView>>;
  setWorkspace: Dispatch<SetStateAction<SavedWorkspaceV2>>;
  state: ApplicationDossier;
  workspace: SavedWorkspaceV2;
  workspaceReady: boolean;
};

export function useWorkspaceRun({
  activeTenantId,
  dossierView,
  memoryRevision,
  primaryView,
  requestedScope,
  resolvedScope,
  savedProfileJson,
  selectedDossierIdRef,
  setDossierView,
  setPrimaryView,
  setWorkspace,
  state,
  workspace,
  workspaceReady,
}: Options) {
  const generationPending = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [instanceCheckSuggested, setInstanceCheckSuggested] = useState(false);
  const [runPollingErrors, setRunPollingErrors] = useState<
    Record<string, string>
  >({});
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
  const pendingDecisions = useRef(new Map<string, string>());
  const jobImportController = useRef<AbortController | undefined>(undefined);
  const opportunityRef = useRef(state.opportunity);
  const [jobImporting, setJobImporting] = useState(false);
  const [jobImportError, setJobImportError] = useState('');
  const [jobImportMessage, setJobImportMessage] = useState('');
  const [jobImportMissingFields, setJobImportMissingFields] = useState<
    Array<'company' | 'role' | 'description'>
  >([]);
  const [pendingJobImport, setPendingJobImport] =
    useState<JobPostingImportResponse>();

  const shareUrl = visibleShareUrl(shareLink, resolvedScope, state.id);

  useEffect(() => {
    opportunityRef.current = state.opportunity;
  }, [state.opportunity]);

  useEffect(
    () => () => {
      jobImportController.current?.abort();
    },
    [],
  );

  const selectedRunId = state.runId;
  const selectedRunStatus = state.runStatus;
  const selectedRunHasDraft = Boolean(state.spec);
  const selectedRunDossierId = state.id;
  useEffect(() => {
    if (!workspaceReady || !activeTenantId || !selectedRunId) return;

    const controller = new AbortController();
    let timer: number | undefined;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await readRun(selectedRunId, controller.signal);
        if (!response.ok) throw new Error('RUN_POLL_FAILED');
        const run = persistedRunSchema.parse(await response.json());
        if (stopped) return;
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
    setDossierView,
    setWorkspace,
    workspaceReady,
  ]);

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

  function toggleResearchSignal(signalId: string) {
    updateApplicationDossier(state.id, (current) => {
      const selected = new Set(current.selectedResearchSignalIds ?? []);
      if (selected.has(signalId)) selected.delete(signalId);
      else selected.add(signalId);
      return {
        ...current,
        selectedResearchSignalIds:
          current.runResearch?.signals
            .map((signal) => signal.signalId)
            .filter((id) => selected.has(id)) ?? [],
      };
    });
  }

  function changeOpportunity(
    update: Partial<ApplicationDossier['opportunity']>,
  ) {
    const next = { ...opportunityRef.current, ...update };
    opportunityRef.current = next;
    if (activeTenantId)
      localStorage.removeItem(
        `career-os-run-request:${activeTenantId}:${state.id}`,
      );
    updateApplicationDossier(state.id, (dossier) => ({
      ...dossier,
      opportunity: next,
      approved: false,
    }));
  }

  function changeRequiredOpportunityField(
    field: 'company' | 'role' | 'description',
    value: string,
  ) {
    setJobImportMissingFields((current) =>
      current.filter((candidate) => candidate !== field),
    );
    changeOpportunity({ [field]: value });
  }

  function applyJobImport(
    preview: JobPostingImportResponse,
    overwrite: boolean,
  ) {
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
    setPendingJobImport(undefined);
    updateApplicationDossier(state.id, (dossier) => ({
      ...dossier,
      opportunity: next,
    }));
    const complete = opportunityReady(next);
    const missing = (['company', 'role', 'description'] as const).filter(
      (field) => !next[field],
    );
    setJobImportMissingFields(missing);
    setJobImportMessage(
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

  async function importBriefJobPosting() {
    setJobImportError('');
    setJobImportMessage('');
    let url: URL;
    try {
      url = new URL(opportunityRef.current.url ?? '');
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      setJobImportError(
        'Saisissez une URL publique complète, par exemple https://entreprise.com/jobs/…',
      );
      return;
    }

    jobImportController.current?.abort();
    const controller = new AbortController();
    jobImportController.current = controller;
    setJobImporting(true);
    try {
      const response = await importJobPosting(url.href, controller.signal);
      if (!response.ok) throw new Error(String(response.status));
      const preview = jobPostingImportResponseSchema.parse(
        await response.json(),
      );
      const current = opportunityRef.current;
      if (current.url !== url.href) {
        setJobImportError(
          'Le lien a changé pendant l’import. Relancez l’import avec la nouvelle URL.',
        );
        return;
      }
      const conflicts = ['company', 'role', 'description'].some((field) => {
        const currentValue = current[field as keyof typeof current];
        const imported = preview[field as keyof JobPostingImportResponse];
        return Boolean(currentValue && imported && currentValue !== imported);
      });
      if (conflicts) setPendingJobImport(preview);
      else applyJobImport(preview, false);
    } catch (importFailure) {
      if (controller.signal.aborted) return;
      const importStatus =
        importFailure instanceof Error ? importFailure.message : '';
      setJobImportError(
        importStatus === '401'
          ? 'Connectez-vous pour importer une annonce. La saisie manuelle reste disponible.'
          : importStatus === '429'
            ? 'Trop d’imports rapprochés. Réessayez dans une minute.'
            : 'Import impossible. Cette page ne permet pas la lecture automatique. Vos saisies ont été conservées ; complétez le brief manuellement.',
      );
    } finally {
      if (jobImportController.current === controller) {
        jobImportController.current = undefined;
        setJobImporting(false);
      }
    }
  }

  function cancelPendingJobImport() {
    setPendingJobImport(undefined);
  }

  const closeBriefImport = useCallback(() => {
    jobImportController.current?.abort();
    jobImportController.current = undefined;
    setJobImporting(false);
    setJobImportError('');
    setJobImportMessage('');
    setJobImportMissingFields([]);
    setPendingJobImport(undefined);
  }, []);

  async function persistApplication(dossier: ApplicationDossier) {
    const response = await saveApplication(dossier);
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
    setInstanceCheckSuggested(false);
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
        const response = await createRun(persistedInput, operation.key);
        const workerUnavailable =
          response.status === 503 &&
          (await isWorkerUnavailableResponse(response));
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
      const workerUnavailable =
        error instanceof Error && error.message === 'RUN_WORKER_UNAVAILABLE';
      setInstanceCheckSuggested(workerUnavailable);
      setGenerateError(
        workerUnavailable
          ? 'Cette instance ne peut pas encore lancer l’analyse. Votre brief est enregistré.'
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
      const response = await decideRunReviewIssue(
        runId,
        JSON.stringify({
          reviewId: review.reviewId,
          issueIndex,
          decision,
        }),
        idempotencyKey,
      );
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
        const correctedRun = result.correctedRun;
        updateApplicationDossier(dossierId, (current) =>
          applyPersistedRun(current, correctedRun),
        );
        setShareLink(undefined);
        setShareMessage('');
        setDecisionMessage(
          'Nouvelle version lancée. Les trois contrôles vont la vérifier.',
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
      const response = await confirmRunResearch(runId, payload, operation.key);
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
      const response = await startRunStrategy(runId, payload, operation.key);
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
      const response = await approveRunStrategy(runId, payload, operation.key);
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
      const response = await startRunReviews(runId, payload, operation.key);
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
      const response = await createPublication(runId);
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
    const response = await revokePublication(capability);
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

  return {
    applyJobImport,
    approveRecruiterStrategy,
    cancelPendingJobImport,
    changeOpportunity,
    changeRequiredOpportunityField,
    closeBriefImport,
    confirmResearchSignals,
    copyLink,
    currentReviewState,
    decideReviewIssue,
    decisionError,
    decisionMessage,
    decisionPending,
    generate,
    generateError,
    generating,
    importBriefJobPosting,
    instanceCheckSuggested,
    jobImportError,
    jobImportMessage,
    jobImportMissingFields,
    jobImporting,
    pendingJobImport,
    publish,
    publishError,
    publishing,
    review,
    revoke,
    runPollingErrors,
    selectionError,
    selectionPending,
    setRunRefreshVersion,
    shareMessage,
    shareUrl,
    signOut,
    startRecruiterStrategy,
    startReviews,
    status,
    totalDecisionCount,
    toggleResearchSignal,
    updateApplicationDossier,
    sync: {
      setDecisionError,
      setDecisionMessage,
      setGenerateError,
      setInstanceCheckSuggested,
      setPublishError,
      setShareLink,
      setShareMessage,
    },
  };
}
