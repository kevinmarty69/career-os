'use client';

import { useEffect, useRef, useState } from 'react';
import { readProfile, saveProfile } from '@/lib/career-api';
import { profileSchema, type Profile } from '@/lib/schemas';
import { useI18n } from '@/components/i18n/i18n-provider';

const emptyProfile: Profile = {
  name: '',
  headline: '',
  publicLinks: {},
  sources: [],
  evidence: [],
  claims: [],
};

export function useCareerMemory() {
  const { locale } = useI18n();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'saving'>('loading');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState<'auth' | 'unavailable'>();
  const saving = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void readProfile(controller.signal)
      .then(async (profileResponse) => {
        if (controller.signal.aborted) return;
        if (profileResponse.status === 401) {
          setLoadError('auth');
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
        if (controller.signal.aborted) return;
        setProfile(parsed.data ?? emptyProfile);
        setLoadError(undefined);
        setRevision(payload.revision);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError('unavailable');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setState('ready');
      });
    return () => controller.abort();
  }, []);

  async function save(nextProfile: Profile = profile) {
    if (saving.current || state === 'loading' || loadError) return false;
    const parsed = profileSchema.safeParse(nextProfile);
    if (!parsed.success) {
      setMessage(
        locale === 'fr'
          ? 'Complétez le nom, le positionnement et les champs signalés.'
          : 'Complete your name, positioning and the highlighted fields.',
      );
      return false;
    }
    saving.current = true;
    setState('saving');
    setMessage('');
    try {
      const response = await saveProfile(parsed.data, revision);
      if (response.status === 409) {
        setMessage(
          locale === 'fr'
            ? 'Cette mémoire a changé dans une autre session. Rechargez la page.'
            : 'This memory changed in another session. Reload the page.',
        );
        return false;
      }
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as {
        profile: unknown;
        revision: number;
      };
      const stored = profileSchema.parse(payload.profile);
      if (!Number.isInteger(payload.revision)) throw new Error();
      setProfile(stored);
      setRevision(payload.revision);
      setMessage(
        locale === 'fr'
          ? 'Mémoire enregistrée. La correction reste disponible dans l’historique.'
          : 'Memory saved. The previous version remains available in history.',
      );
      return true;
    } catch {
      setMessage(
        locale === 'fr'
          ? 'Échec de l’enregistrement. Vos corrections restent dans cette page.'
          : 'Save failed. Your changes remain on this page.',
      );
      return false;
    } finally {
      saving.current = false;
      setState('ready');
    }
  }

  return {
    loadError,
    message: loadError
      ? loadError === 'auth'
        ? locale === 'fr'
          ? 'Connectez-vous pour consulter votre mémoire professionnelle.'
          : 'Sign in to view your career memory.'
        : locale === 'fr'
          ? 'La mémoire professionnelle est momentanément indisponible.'
          : 'Career memory is temporarily unavailable.'
      : message,
    profile,
    revision,
    save,
    state,
  };
}
