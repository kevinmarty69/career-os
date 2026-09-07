'use client';
import type { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import {
  createSearchProfile,
  deleteSearchProfile,
  readSearchProfiles,
  updateSearchProfile,
} from '@/lib/career-api';
import {
  searchProfileFieldsSchema,
  searchProfileSchema,
  type SearchProfile,
  type SearchProfileFields,
} from '@/lib/search-profile';
import { useEffect, useState } from 'react';
import { fieldsFrom, freshProfile } from './profile-draft';
export function useSearchProfileEditor() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<SearchProfileFields>(() => freshProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<keyof typeof searchProfilesMessages>();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await readSearchProfiles(controller.signal);
        if (!response.ok) throw new Error(await response.text());
        const body: unknown = await response.json();
        const parsed = searchProfileSchema
          .array()
          .parse(
            typeof body === 'object' &&
              body !== null &&
              'searchProfiles' in body
              ? body.searchProfiles
              : [],
          );
        setProfiles(parsed);
        if (parsed[0]) selectProfile(parsed[0]);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error && caught.message === 'Unauthorized'
              ? 'search-profiles.sign.in.to.access.your.search.profiles'
              : 'search-profiles.unable.to.load.your.profiles.try.again',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  function selectProfile(profile: SearchProfile) {
    setSelectedId(profile.searchProfileId);
    setDraft(fieldsFrom(profile));
    setError(undefined);
    setSaved(false);
    setConfirmDelete(false);
  }

  function startNewProfile() {
    setSelectedId(undefined);
    setDraft(freshProfile());
    setError(undefined);
    setSaved(false);
    setConfirmDelete(false);
  }

  async function save() {
    const parsed = searchProfileFieldsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        'search-profiles.name.the.profile.and.review.the.entered.criteria',
      );
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      const current = profiles.find(
        (profile) => profile.searchProfileId === selectedId,
      );
      const response = current
        ? await updateSearchProfile(
            current.searchProfileId,
            parsed.data,
            current.revision,
          )
        : await createSearchProfile(parsed.data);
      if (!response.ok) {
        if (response.status === 409) {
          setError(
            'search-profiles.this.profile.changed.elsewhere.or.this.name.already.exists',
          );
          return;
        }
        throw new Error('PROFILE_SAVE_FAILED');
      }
      const persisted = searchProfileSchema.parse(await response.json());
      setProfiles((currentProfiles) => {
        const exists = currentProfiles.some(
          (profile) => profile.searchProfileId === persisted.searchProfileId,
        );
        return exists
          ? currentProfiles.map((profile) =>
              profile.searchProfileId === persisted.searchProfileId
                ? persisted
                : profile,
            )
          : [persisted, ...currentProfiles];
      });
      setSelectedId(persisted.searchProfileId);
      setDraft(fieldsFrom(persisted));
      setSaved(true);
    } catch {
      setError('search-profiles.unable.to.save.this.profile');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const current = profiles.find(
      (profile) => profile.searchProfileId === selectedId,
    );
    if (!current) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await deleteSearchProfile(
        current.searchProfileId,
        current.revision,
      );
      if (!response.ok) throw new Error('Impossible de supprimer ce profil.');
      const remaining = profiles.filter(
        (profile) => profile.searchProfileId !== current.searchProfileId,
      );
      setProfiles(remaining);
      if (remaining[0]) selectProfile(remaining[0]);
      else startNewProfile();
    } catch {
      setError('search-profiles.unable.to.delete.this.profile');
    } finally {
      setSaving(false);
    }
  }

  return {
    profiles,
    selectedId,
    draft,
    setDraft,
    loading,
    saving,
    error,
    saved,
    confirmDelete,
    selectProfile,
    startNewProfile,
    save,
    remove,
  };
}
