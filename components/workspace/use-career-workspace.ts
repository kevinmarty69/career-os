'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useWorkspaceProfile,
  importReviewExpired,
  restoreImportReview,
} from './use-workspace-profile';
import { useWorkspaceRun } from './use-workspace-run';
import { authClient } from '@/lib/auth-client';
import {
  readApplications,
  readInstanceStatus,
  readProfile,
} from '@/lib/career-api';
import { applicationSchema } from '@/lib/application-contract';
import type { Profile } from '@/lib/schemas';
import {
  instanceStatusSchema,
  type InstanceStatus,
  type WorkerService,
} from '@/lib/run-contract';
import type {
  ProfileImportCandidate,
  ProfileImportResult,
} from '@/lib/profile-import';
import {
  createEmptyDossier,
  createEmptyWorkspace,
  dossierNextView,
  mergePersistedApplications,
  reviewsComplete,
  restoreWorkspace,
  type SavedWorkspaceV2,
} from '@/lib/workspace-state';

export type AllowedUse = Profile['claims'][number]['allowedUses'][number];
export type ImportReviewCandidate = ProfileImportCandidate & {
  id: string;
  selected: boolean;
  sensitivity: Profile['claims'][number]['sensitivity'];
  allowedUses: AllowedUse[];
};
export type ImportReview = Omit<ProfileImportResult, 'candidates'> & {
  name: string;
  headline: string;
  candidates: ImportReviewCandidate[];
  permissionsConfirmed: boolean;
  expiresAt: number;
};
export type OnboardingMode = 'start' | 'paste' | 'review' | 'manual';
export type PrimaryView =
  'home' | 'applications' | 'memory' | 'activity' | 'settings';
export type DossierView =
  'board' | 'brief' | 'company' | 'journey' | 'draft' | 'review' | 'share';

export const workerServiceDetails: Record<
  WorkerService,
  {
    label: string;
    stage: 'Analyse' | 'Vérification';
    command: string;
    databaseVariable: string;
    requiresModel?: boolean;
  }
> = {
  'company-researcher': {
    label: 'Lecture de l’entreprise',
    stage: 'Analyse',
    command: 'pnpm worker:company-researcher',
    databaseVariable: 'CAREER_OS_WORKER_DATABASE_URL',
    requiresModel: true,
  },
  'evidence-archivist': {
    label: 'Sélection des preuves',
    stage: 'Analyse',
    command: 'pnpm worker:evidence-archivist',
    databaseVariable: 'CAREER_OS_EVIDENCE_WORKER_DATABASE_URL',
  },
  'recruiter-strategist': {
    label: 'Stratégie de candidature',
    stage: 'Analyse',
    command: 'pnpm worker:recruiter-strategist',
    databaseVariable: 'CAREER_OS_STRATEGY_WORKER_DATABASE_URL',
    requiresModel: true,
  },
  'page-composer': {
    label: 'Composition de la page',
    stage: 'Analyse',
    command: 'pnpm worker:page-composer',
    databaseVariable: 'CAREER_OS_PAGE_COMPOSER_DATABASE_URL',
  },
  'recruiter-reviewer': {
    label: 'Revue recrutement',
    stage: 'Vérification',
    command: 'pnpm worker:recruiter-reviewer',
    databaseVariable: 'CAREER_OS_RECRUITER_REVIEWER_DATABASE_URL',
    requiresModel: true,
  },
  'hiring-manager-reviewer': {
    label: 'Revue hiring manager',
    stage: 'Vérification',
    command: 'pnpm worker:hiring-manager-reviewer',
    databaseVariable: 'CAREER_OS_HIRING_MANAGER_REVIEWER_DATABASE_URL',
    requiresModel: true,
  },
  'factuality-reviewer': {
    label: 'Contrôle factuel',
    stage: 'Vérification',
    command: 'pnpm worker:factuality-reviewer',
    databaseVariable: 'CAREER_OS_FACTUALITY_REVIEWER_DATABASE_URL',
  },
  'job-discovery': {
    label: 'Découverte des offres',
    stage: 'Analyse',
    command: 'pnpm worker:job-discovery',
    databaseVariable: 'CAREER_OS_DISCOVERY_DATABASE_URL',
  },
};

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
export const primaryViews: Array<[PrimaryView, string]> = [
  ['home', 'Accueil'],
  ['activity', 'À trancher'],
  ['applications', 'Candidatures'],
  ['memory', 'Mémoire pro'],
  ['settings', 'Réglages'],
];
export const dossierViews: Array<[Exclude<DossierView, 'board'>, string]> = [
  ['brief', 'Offre'],
  ['company', 'Entreprise'],
  ['journey', 'Parcours'],
  ['draft', 'Page privée'],
  ['share', 'Partager'],
];
export const importCandidateGroupLabels = {
  summary: 'Profil et synthèse',
  experience: 'Expériences',
  project: 'Projets',
  skill: 'Compétences',
  education: 'Formation',
  result: 'Résultats',
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

export function useCareerWorkspace() {
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
  const [resolvedScope, setResolvedScope] = useState('anonymous');
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>();
  const [instanceStatusError, setInstanceStatusError] = useState(false);
  const [instanceStatusLoading, setInstanceStatusLoading] = useState(false);
  const [instanceStatusVersion, setInstanceStatusVersion] = useState(0);
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
  useEffect(() => {
    selectedDossierIdRef.current = workspace.selectedDossierId;
  }, [workspace.selectedDossierId]);
  const profile = useWorkspaceProfile({
    activeTenantId,
    loaded,
    onboardingStorageKey,
    resolvedScope,
    setPrimaryView,
    setWorkspace,
    workspace,
  });
  const { sync: profileSync, ...profileController } = profile;
  const run = useWorkspaceRun({
    activeTenantId,
    dossierView,
    memoryRevision: profile.memoryRevision,
    primaryView,
    requestedScope,
    resolvedScope,
    savedProfileJson: profile.savedProfileJson,
    selectedDossierIdRef,
    setDossierView,
    setPrimaryView,
    setWorkspace,
    state,
    workspace,
    workspaceReady,
  });
  const { sync: runSync, ...runController } = run;
  const {
    setImportReview,
    setMemoryRevision,
    setMemorySyncMessage,
    setSavedProfileJson,
  } = profileSync;
  const {
    setDecisionError,
    setDecisionMessage,
    setGenerateError,
    setInstanceCheckSuggested,
    setPublishError,
    setShareLink,
    setShareMessage,
  } = runSync;
  const { setImportError, setOnboardingMode, setShowMemoryHandoff } = profile;

  useEffect(() => {
    if (!activeTenantId || primaryView !== 'settings') return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setInstanceStatusLoading(true);
      setInstanceStatusError(false);
      try {
        const response = await readInstanceStatus(controller.signal);
        if (!response.ok) throw new Error('INSTANCE_STATUS_UNAVAILABLE');
        setInstanceStatus(instanceStatusSchema.parse(await response.json()));
      } catch {
        if (!controller.signal.aborted) setInstanceStatusError(true);
      } finally {
        if (!controller.signal.aborted) setInstanceStatusLoading(false);
      }
    });
    return () => controller.abort();
  }, [activeTenantId, instanceStatusVersion, primaryView]);

  function refreshInstanceStatus() {
    setInstanceStatusVersion((version) => version + 1);
  }

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
          readProfile(controller.signal),
          readApplications(controller.signal),
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
      if (navigation.primaryView === 'settings')
        setInstanceStatusLoading(Boolean(activeTenantId));
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
    setImportError,
    setImportReview,
    setMemoryRevision,
    setMemorySyncMessage,
    setOnboardingMode,
    setSavedProfileJson,
    setShareLink,
    setShowMemoryHandoff,
    storageKey,
  ]);

  useEffect(() => {
    if (workspaceReady)
      localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [storageKey, workspace, workspaceReady]);

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

  function resetLocalCache() {
    if (
      !confirm(
        'Effacer le cache de ce navigateur ? Les données enregistrées sur le serveur ne seront pas supprimées.',
      )
    )
      return;
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem(onboardingStorageKey);
    location.reload();
  }

  function openApplications(view: DossierView = 'board') {
    setDossierView(view);
    setPrimaryView('applications');
  }

  function openInstanceSettings() {
    setInstanceStatusLoading(Boolean(activeTenantId));
    setInstanceStatusError(false);
    setPrimaryView('settings');
    requestAnimationFrame(() =>
      document.getElementById('instance-settings-title')?.focus(),
    );
  }

  function returnToInstanceError() {
    openApplications('brief');
    requestAnimationFrame(() =>
      document.getElementById('run-generation-error')?.focus(),
    );
  }

  function openApplication(dossierId: string, view?: DossierView) {
    const dossier = workspace.dossiers.find(({ id }) => id === dossierId);
    if (!dossier) return;
    setWorkspace((current) => ({
      ...current,
      selectedDossierId: dossierId,
    }));
    setGenerateError('');
    setInstanceCheckSuggested(false);
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
    setInstanceCheckSuggested(false);
    openApplications('brief');
  }

  return {
    activeOrganization,
    activeTenantId,
    closeEvidenceInspector,
    createApplication,
    dossierView,
    exportData,
    inspectorOpen,
    instanceStatus,
    instanceStatusError,
    instanceStatusLoading,
    openApplication,
    openApplications,
    openEvidenceInspector,
    openInstanceSettings,
    primaryView,
    refreshInstanceStatus,
    resetLocalCache,
    returnToInstanceError,
    selectedClaimId,
    session,
    setDossierView,
    setPrimaryView,
    setWorkspace,
    state,
    workspace,
    workspaceReady,
    ...profileController,
    ...runController,
  };
}
