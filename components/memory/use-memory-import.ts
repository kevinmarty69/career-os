'use client';
import type { memoryMessages } from '@/lib/i18n/dictionaries/memory';
type ImportMessageKey = keyof typeof memoryMessages;

import { useEffect, useRef, useState } from 'react';
import { readProfile, saveProfile } from '@/lib/career-api';
import { mergeDuplicateClaims } from '@/lib/career-memory';
import {
  importProfileFile,
  importProfileText,
  ProfileImportError,
  profileImportResultSchema,
  type ProfileImportCandidate,
  type ProfileImportResult,
} from '@/lib/profile-import';
import { profileSchema, type Profile } from '@/lib/schemas';

export const importCandidateGroupLabels = {
  summary: 'Profil et synthèse',
  experience: 'Expérience',
  project: 'Projet',
  skill: 'Compétence',
  education: 'Formation',
  result: 'Résultat',
  other: 'Autre information',
} as const;

export const allowedUseLabels = {
  application: 'Candidatures',
  resume: 'CV',
  linkedin: 'LinkedIn',
  interview: 'Entretiens',
} as const;

export const sensitivityLabels = {
  public: 'Public',
  private: 'Privé',
  restricted: 'Restreint',
} as const;

export const provenanceLabels = {
  declared: 'Déclaré par vous',
  inferred: 'Inféré, à confirmer',
  unsupported: 'Non soutenu',
} as const;

export type AllowedUse = keyof typeof allowedUseLabels;
export type Sensitivity = keyof typeof sensitivityLabels;
export type CandidateGroup = keyof typeof importCandidateGroupLabels;
export type ProvenanceLevel = keyof typeof provenanceLabels;
export type ReviewSourceKind = 'document' | 'linkedin' | 'manual';

export type ReviewCandidate = ProfileImportCandidate & {
  id: string;
  selected: boolean;
  sensitivity: Sensitivity;
  allowedUses: AllowedUse[];
  level: ProvenanceLevel;
};

export type ImportReview = Omit<ProfileImportResult, 'candidates'> & {
  name: string;
  headline: string;
  candidates: ReviewCandidate[];
  permissionsConfirmed: boolean;
  sourceKind: ReviewSourceKind;
  expiresAt: number;
};

type ImportStage = 'source' | 'reading' | 'review' | 'saving' | 'saved';

const REVIEW_STORAGE_KEY = 'career-os-memory-import:v1';
const REVIEW_TTL_MS = 30 * 60 * 1000;

export function useMemoryImport() {
  const [stage, setStage] = useState<ImportStage>('source');
  const [review, setReview] = useState<ImportReview>();
  const [pasteText, setPasteText] = useState('');
  const [pasteSourceKind, setPasteSourceKind] =
    useState<ReviewSourceKind>('linkedin');
  const [sourceName, setSourceName] = useState('');
  const [error, setError] = useState<ImportMessageKey | ''>('');
  const [revision, setRevision] = useState(0);
  const [existingProfile, setExistingProfile] = useState<Profile | null>(null);
  const pendingImport = useRef<AbortController | undefined>(undefined);
  const pendingSave = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const raw = sessionStorage.getItem(REVIEW_STORAGE_KEY);
      const restored = restoreReview(raw);
      if (restored) {
        setReview(restored);
        setStage('review');
      } else if (raw) {
        sessionStorage.removeItem(REVIEW_STORAGE_KEY);
        setError(
          'memory.this.review.expired.read.the.source.again.to.continue',
        );
      }

      try {
        const response = await readProfile(controller.signal);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          profile: unknown;
          revision: number;
        };
        const parsed = profileSchema.nullable().safeParse(payload.profile);
        if (
          controller.signal.aborted ||
          !parsed.success ||
          !Number.isInteger(payload.revision)
        )
          return;
        setExistingProfile(parsed.data);
        setRevision(payload.revision);
      } catch {
        return;
      }
    });

    return () => {
      controller.abort();
      pendingImport.current?.abort();
    };
  }, []);

  const reviewExpiresAt = review?.expiresAt;
  useEffect(() => {
    if (!reviewExpiresAt) return;
    const delay = reviewExpiresAt - Date.now();
    if (delay <= 0) {
      discard('memory.this.review.expired.read.the.source.again.to.continue');
      return;
    }
    const timer = window.setTimeout(
      () =>
        discard('memory.this.review.expired.read.the.source.again.to.continue'),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [reviewExpiresAt]);

  function persistReview(next: ImportReview) {
    setReview(next);
    sessionStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next));
  }

  function prepareReview(
    result: ProfileImportResult,
    sourceKind: ReviewSourceKind,
  ) {
    const next: ImportReview = {
      ...result,
      name: result.suggestedName?.value ?? existingProfile?.name ?? '',
      headline:
        result.suggestedHeadline?.value ?? existingProfile?.headline ?? '',
      candidates: result.candidates.map((candidate) => ({
        ...candidate,
        id: crypto.randomUUID(),
        selected: true,
        sensitivity: 'private',
        allowedUses: ['application'],
        level: 'declared',
      })),
      permissionsConfirmed: false,
      sourceKind,
      expiresAt: Date.now() + REVIEW_TTL_MS,
    };
    persistReview(next);
    setStage('review');
    setError('');
  }

  async function importFile(file: File) {
    pendingImport.current?.abort();
    const controller = new AbortController();
    pendingImport.current = controller;
    setSourceName(file.name);
    setStage('reading');
    setError('');
    try {
      prepareReview(
        await importProfileFile(file, controller.signal),
        'document',
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      setStage('source');
      setError(importErrorMessage(caught));
    } finally {
      if (pendingImport.current === controller)
        pendingImport.current = undefined;
    }
  }

  async function importPastedText() {
    setSourceName('Texte collé');
    setStage('reading');
    setError('');
    try {
      const displayName =
        pasteSourceKind === 'linkedin'
          ? 'Profil LinkedIn collé'
          : pasteSourceKind === 'manual'
            ? 'Notes de parcours collées'
            : 'CV collé';
      prepareReview(
        await importProfileText(pasteText, displayName),
        pasteSourceKind,
      );
    } catch (caught) {
      setStage('source');
      setError(importErrorMessage(caught));
    }
  }

  function cancelReading() {
    pendingImport.current?.abort();
    pendingImport.current = undefined;
    setStage('source');
    setSourceName('');
    setError('memory.reading.cancelled.you.can.choose.another.source');
  }

  function updateReview(updater: (current: ImportReview) => ImportReview) {
    if (!review || pendingSave.current) return;
    persistReview(updater(review));
    setError('');
  }

  function updateCandidate(
    id: string,
    patch: Partial<
      Pick<
        ReviewCandidate,
        | 'statement'
        | 'group'
        | 'sensitivity'
        | 'allowedUses'
        | 'selected'
        | 'level'
      >
    >,
  ) {
    updateReview((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    }));
  }

  function discard(message: ImportMessageKey | '' = '') {
    if (pendingSave.current) return;
    pendingImport.current?.abort();
    pendingImport.current = undefined;
    sessionStorage.removeItem(REVIEW_STORAGE_KEY);
    setReview(undefined);
    setStage('source');
    setSourceName('');
    setError(message);
  }

  async function validate() {
    if (!review || pendingSave.current) return;
    if (review.expiresAt <= Date.now()) {
      discard('memory.this.review.expired.read.the.source.again.to.continue');
      return;
    }
    const selected = review.candidates.filter(
      (candidate) => candidate.selected,
    );
    if (
      review.name.trim().length < 2 ||
      review.headline.trim().length < 2 ||
      selected.length === 0 ||
      selected.some(
        (candidate) =>
          candidate.statement.trim().length === 0 ||
          candidate.allowedUses.length === 0,
      ) ||
      !review.permissionsConfirmed
    ) {
      setError('memory.complete.your.identity.keep.at.least.one.claim.with');
      return;
    }

    const { profile } = mergeDuplicateClaims(
      buildProfile(review, existingProfile),
    );
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      setError(
        'memory.some.information.is.incomplete.fix.the.highlighted.fields',
      );
      return;
    }

    pendingSave.current = true;
    setStage('saving');
    setError('');
    try {
      const response = await saveProfile(parsed.data, revision);
      if (response.status === 401) {
        setError('memory.sign.in.to.save.this.career.memory.to.your');
        setStage('review');
        return;
      }
      if (response.status === 409) {
        setError(
          'memory.your.career.memory.changed.in.another.session.reload.the',
        );
        setStage('review');
        return;
      }
      if (!response.ok) throw new Error('PROFILE_SAVE_FAILED');
      const payload = (await response.json()) as {
        profile: unknown;
        revision: number;
      };
      const saved = profileSchema.safeParse(payload.profile);
      if (!saved.success || !Number.isInteger(payload.revision))
        throw new Error('INVALID_PROFILE_RESPONSE');
      setExistingProfile(saved.data);
      setRevision(payload.revision);
      sessionStorage.removeItem(REVIEW_STORAGE_KEY);
      setStage('saved');
    } catch {
      setError('memory.career.memory.could.not.be.saved.your.review.remains');
      setStage('review');
    } finally {
      pendingSave.current = false;
    }
  }

  return {
    cancelReading,
    discard,
    error,
    importFile,
    importPastedText,
    pasteText,
    pasteSourceKind,
    review,
    setPasteText,
    setPasteSourceKind,
    sourceName,
    stage,
    updateCandidate,
    updateReview,
    validate,
  };
}

function buildProfile(review: ImportReview, existing: Profile | null): Profile {
  const selected = review.candidates.filter((candidate) => candidate.selected);
  const sourceId = `source-${crypto.randomUUID()}`;
  const existingSources = existing?.sources ?? [];
  const existingEvidence = existing?.evidence ?? [];
  const existingClaims = existing?.claims ?? [];
  const allowedUses = [
    ...new Set(selected.flatMap((item) => item.allowedUses)),
  ];
  const sourceSensitivity = selected.reduce<Sensitivity>(
    (current, candidate) =>
      sensitivityRank[candidate.sensitivity] > sensitivityRank[current]
        ? candidate.sensitivity
        : current,
    'public',
  );

  return {
    name: review.name.trim(),
    headline: review.headline.trim(),
    sources: [
      ...existingSources,
      {
        id: sourceId,
        kind: review.sourceKind,
        title: review.source.displayName,
        locator: `sha256:${review.source.sha256}`,
        sensitivity: sourceSensitivity,
        allowedUses,
        trust: 'untrusted-data',
      },
    ],
    evidence: [
      ...existingEvidence,
      ...selected.map((candidate) => ({
        id: `evidence-${candidate.id}`,
        sourceId,
        label: `${importCandidateGroupLabels[candidate.group]} · ${candidate.locator}`,
        excerpt: candidate.excerpt,
      })),
    ],
    claims: [
      ...existingClaims,
      ...selected.map((candidate) => ({
        id: `claim-${candidate.id}`,
        statement: candidate.statement.trim(),
        kind: candidate.group,
        level: candidate.level,
        evidenceIds: [`evidence-${candidate.id}`],
        sensitivity: candidate.sensitivity,
        allowedUses: candidate.allowedUses,
      })),
    ],
  };
}

const sensitivityRank: Record<Sensitivity, number> = {
  public: 0,
  private: 1,
  restricted: 2,
};

function importErrorMessage(error: unknown): ImportMessageKey {
  if (error instanceof ProfileImportError) {
    if (error.code === 'file_too_large')
      return 'memory.this.file.exceeds.the.4.mb.limit';
    if (error.code === 'unsupported_type' || error.code === 'type_mismatch')
      return 'memory.choose.a.valid.pdf.docx.or.txt.file';
    if (error.code === 'pdf_encrypted')
      return 'memory.this.pdf.is.password.protected.export.an.unprotected.copy';
    if (error.code === 'pdf_attachments')
      return 'memory.this.pdf.contains.an.attachment.export.a.plain.copy';
    if (error.code === 'pdf_too_many_pages')
      return 'memory.this.pdf.exceeds.the.100.page.limit';
    if (
      error.code === 'docx_external_relationship' ||
      error.code === 'docx_unsafe_archive'
    )
      return 'memory.this.word.document.contains.external.or.active.content.export';
    if (error.code === 'timeout')
      return 'memory.local.reading.took.too.long.try.a.smaller.version';
    if (error.code === 'empty_document')
      return 'memory.no.usable.text.was.found.in.this.source';
    if (error.code === 'aborted') return 'memory.reading.cancelled';
  }
  return 'memory.this.source.could.not.be.read.locally.try.a';
}

function restoreReview(raw: string | null): ImportReview | undefined {
  if (!raw) return;
  try {
    const stored = JSON.parse(raw) as Partial<ImportReview>;
    if (
      typeof stored.expiresAt !== 'number' ||
      stored.expiresAt <= Date.now() ||
      typeof stored.name !== 'string' ||
      typeof stored.headline !== 'string' ||
      !Array.isArray(stored.candidates) ||
      typeof stored.permissionsConfirmed !== 'boolean' ||
      !stored.sourceKind ||
      !['document', 'linkedin', 'manual'].includes(stored.sourceKind)
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
    if (
      stored.candidates.some(
        (candidate) =>
          typeof candidate.id !== 'string' ||
          typeof candidate.selected !== 'boolean' ||
          !Object.hasOwn(importCandidateGroupLabels, candidate.group) ||
          !Object.hasOwn(sensitivityLabels, candidate.sensitivity) ||
          !Object.hasOwn(provenanceLabels, candidate.level) ||
          !Array.isArray(candidate.allowedUses) ||
          candidate.allowedUses.some(
            (use) => !Object.hasOwn(allowedUseLabels, use),
          ),
      )
    )
      return;
    return {
      ...parsed.data,
      name: stored.name,
      headline: stored.headline,
      candidates: parsed.data.candidates.map((candidate, index) => ({
        ...candidate,
        id: stored.candidates![index].id,
        selected: stored.candidates![index].selected,
        sensitivity: stored.candidates![index].sensitivity,
        allowedUses: stored.candidates![index].allowedUses,
        level: stored.candidates![index].level,
      })),
      permissionsConfirmed: stored.permissionsConfirmed,
      sourceKind: stored.sourceKind,
      expiresAt: stored.expiresAt,
    };
  } catch {
    return;
  }
}
