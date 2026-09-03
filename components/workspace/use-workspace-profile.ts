'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { saveProfile } from '@/lib/career-api';
import { syntheticProfile } from '@/lib/fixture';
import {
  importProfileFile,
  importProfileText,
  ProfileImportError,
  profileImportResultSchema,
  type ProfileImportCandidate,
  type ProfileImportResult,
} from '@/lib/profile-import';
import { profileSchema, type Profile } from '@/lib/schemas';
import {
  createDemoDossier,
  invalidateDossiersAfterProfileChange,
  type SavedWorkspaceV2,
} from '@/lib/workspace-state';
import type {
  AllowedUse,
  ImportReview,
  ImportReviewCandidate,
  PrimaryView,
} from './use-career-workspace';

type Options = {
  activeTenantId?: string | null;
  loaded: boolean;
  onboardingStorageKey: string;
  resolvedScope: string;
  setPrimaryView: Dispatch<SetStateAction<PrimaryView>>;
  setWorkspace: Dispatch<SetStateAction<SavedWorkspaceV2>>;
  workspace: SavedWorkspaceV2;
};

export function useWorkspaceProfile({
  activeTenantId,
  loaded,
  onboardingStorageKey,
  resolvedScope,
  setPrimaryView,
  setWorkspace,
  workspace,
}: Options) {
  const [memoryError, setMemoryError] = useState('');
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [savedProfileJson, setSavedProfileJson] = useState('');
  const [memorySyncing, setMemorySyncing] = useState(false);
  const [memorySyncMessage, setMemorySyncMessage] = useState('');
  const [showMemoryHandoff, setShowMemoryHandoff] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<
    'start' | 'paste' | 'review' | 'manual'
  >('start');
  const [importReview, setImportReview] = useState<ImportReview>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState({
    source: '',
    claim: '',
    evidence: '',
    level: 'declared' as 'verified' | 'declared' | 'inferred',
  });
  const pendingImport = useRef<AbortController | undefined>(undefined);

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
      const response = await saveProfile(profile, memoryRevision);
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

  function loadDemo() {
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

  function changeProfile(profile: Profile) {
    setWorkspace((current) =>
      invalidateDossiersAfterProfileChange(current, profile, 'user'),
    );
  }

  const profileDirty = JSON.stringify(workspace.profile) !== savedProfileJson;

  return {
    acceptImport,
    acceptManualProfile,
    addMemory,
    changeProfile,
    discardImportReview,
    importError,
    importFile,
    importPastedText,
    importReview,
    importing,
    manualConfirmed,
    memoryDraft,
    memoryError,
    memoryRevision,
    memorySyncing,
    memorySyncMessage,
    onboardingMode,
    pasteText,
    profileDirty,
    saveCareerMemory,
    savedProfileJson,
    setImportError,
    setManualConfirmed,
    setMemoryDraft,
    setOnboardingMode,
    setPasteText,
    setShowMemoryHandoff,
    showMemoryHandoff,
    updateImportReview,
    useDemo: loadDemo,
    sync: {
      setImportReview,
      setImporting,
      setMemoryRevision,
      setMemorySyncMessage,
      setSavedProfileJson,
    },
  };
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

export function restoreImportReview(
  raw: string | null,
): ImportReview | undefined {
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

export function importReviewExpired(raw: string | null) {
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
