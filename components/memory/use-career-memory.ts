'use client';

import { useEffect, useMemo, useState } from 'react';
import { readProfile, readProfileHistory, saveProfile } from '@/lib/career-api';
import { memoryCoverage, mergeDuplicateClaims } from '@/lib/career-memory';
import { profileSchema, type Profile } from '@/lib/schemas';
import type { ProfileRevisionSummary } from '@/lib/server/profile';
import { useI18n } from '@/components/i18n/i18n-provider';

const emptyProfile: Profile = {
  name: '',
  headline: '',
  sources: [],
  evidence: [],
  claims: [],
};

export function useCareerMemory() {
  const { locale } = useI18n();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [revision, setRevision] = useState(0);
  const [history, setHistory] = useState<ProfileRevisionSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'saving'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readProfile(controller.signal),
      readProfileHistory(controller.signal),
    ])
      .then(async ([profileResponse, historyResponse]) => {
        if (profileResponse.status === 401) {
          setMessage(
            'Connectez-vous pour consulter votre mémoire professionnelle.',
          );
          return;
        }
        if (!profileResponse.ok) throw new Error();
        const payload = (await profileResponse.json()) as {
          profile: unknown;
          revision: number;
        };
        const parsed = profileSchema.nullable().safeParse(payload.profile);
        if (!parsed.success || !Number.isInteger(payload.revision))
          throw new Error();
        setProfile(parsed.data ?? emptyProfile);
        setRevision(payload.revision);
        if (historyResponse.ok)
          setHistory(
            (await historyResponse.json()) as ProfileRevisionSummary[],
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            'La mémoire professionnelle est momentanément indisponible.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setState('ready');
      });
    return () => controller.abort();
  }, []);

  const coverage = useMemo(() => memoryCoverage(profile), [profile]);

  async function save() {
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      setMessage('Complétez le nom, le positionnement et les champs signalés.');
      return false;
    }
    setState('saving');
    setMessage('');
    try {
      const response = await saveProfile(parsed.data, revision);
      if (response.status === 409) {
        setMessage(
          'Cette mémoire a changé dans une autre session. Rechargez la page.',
        );
        return false;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as {
        profile: unknown;
        revision: number;
      };
      const stored = profileSchema.parse(payload.profile);
      setProfile(stored);
      setRevision(payload.revision);
      setHistory((current) => [
        {
          revision: payload.revision,
          createdAt: new Date().toISOString(),
          sourceCount: stored.sources.length,
          claimCount: stored.claims.length,
        },
        ...current.filter(({ revision: item }) => item !== payload.revision),
      ]);
      setMessage(
        'Mémoire enregistrée. La correction reste disponible dans l’historique.',
      );
      return true;
    } catch {
      setMessage(
        'Échec de l’enregistrement. Vos corrections restent dans cette page.',
      );
      return false;
    } finally {
      setState('ready');
    }
  }

  function mergeDuplicates() {
    const merged = mergeDuplicateClaims(profile);
    setProfile(merged.profile);
    setMessage(
      merged.mergedCount
        ? locale === 'fr'
          ? `${merged.mergedCount} doublon${merged.mergedCount > 1 ? 's' : ''} fusionné${merged.mergedCount > 1 ? 's' : ''}. Enregistrez pour confirmer.`
          : `${merged.mergedCount} duplicate${merged.mergedCount > 1 ? 's' : ''} merged. Save to confirm.`
        : locale === 'fr'
          ? 'Aucun doublon sûr à fusionner.'
          : 'No safe duplicate to merge.',
    );
  }

  return {
    coverage,
    history,
    message,
    profile,
    revision,
    save,
    setMessage,
    setProfile,
    state,
    mergeDuplicates,
  };
}
