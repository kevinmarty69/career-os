'use client';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { useSearchProfileEditor } from './use-search-profile-editor';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { CriterionSimulator } from '@/components/search-profiles/criterion-simulator';
import {
  Exclusions,
  HardConstraints,
  SoftPreferences,
} from '@/components/search-profiles/profile-criteria';
import { ScheduledDiscovery } from '@/components/search-profiles/scheduled-discovery';
import styles from '@/components/search-profiles/search-profiles.module.css';
import { Icon } from '@/components/ui/primitives';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';

export function SearchProfilesPage() {
  const t = useTranslations([searchProfilesMessages, applicationsMessages]);
  const {
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
  } = useSearchProfileEditor();
  return (
    <AppShell
      path="/search-profiles"
      sidebarContext={
        <div className={styles.sidebarNote}>
          <Icon>filter_alt</Icon>
          <strong>{t('search-profiles.filter.without.guessing')}</strong>
          <span>
            {t('search-profiles.missing.information.remains.unknown')}
          </span>
        </div>
      }
      sidebarFooter={<></>}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>{t('search-profiles.job.search')}</p>
            <h1>{t('search-profiles.search.profiles')}</h1>
            <span>
              {t(
                'search-profiles.define.what.rules.out.a.job.and.what.only',
              )}{' '}
            </span>
          </div>
          <button
            className="co-button quiet"
            onClick={startNewProfile}
            type="button"
          >
            <Icon>add</Icon>
            {t('search-profiles.new.profile')}{' '}
          </button>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{t(error)}</span>
            {loading ? null : (
              <button onClick={() => location.reload()} type="button">
                {t('search-profiles.try.again')}{' '}
              </button>
            )}
          </div>
        ) : null}

        <div className={styles.layout}>
          <aside
            className={styles.profileList}
            aria-label={t('search-profiles.saved.profiles')}
          >
            <div>
              <h2>{t('search-profiles.profiles')}</h2>
              <span>
                {loading
                  ? t('search-profiles.loading')
                  : t('search-profiles.your.saved.searches')}
              </span>
            </div>
            {profiles.map((profile) => (
              <button
                aria-pressed={selectedId === profile.searchProfileId}
                className={
                  selectedId === profile.searchProfileId ? styles.selected : ''
                }
                key={profile.searchProfileId}
                onClick={() => selectProfile(profile)}
                type="button"
              >
                <span>{profile.name}</span>
                <small>
                  {profile.active
                    ? t('search-profiles.active')
                    : t('search-profiles.paused')}
                </small>
              </button>
            ))}
            {!loading && profiles.length === 0 ? (
              <p>{t('search-profiles.no.saved.profile.start.with.this.one')}</p>
            ) : null}
          </aside>

          <section
            className={styles.editor}
            aria-label={t('search-profiles.profile.editor')}
          >
            <div className={styles.identity}>
              <label>
                <span>{t('search-profiles.profile.name')}</span>
                <input
                  autoComplete="off"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex. Product Engineering · Europe"
                  value={draft.name}
                />
              </label>
              <label className={styles.alertThreshold}>
                <span>{t('search-profiles.alert.threshold')}</span>
                <input
                  aria-describedby="alert-threshold-help"
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      alertThreshold:
                        event.target.value === ''
                          ? null
                          : Number(event.target.value),
                    }))
                  }
                  placeholder={t('search-profiles.disabled')}
                  type="number"
                  value={draft.alertThreshold ?? ''}
                />
                <small id="alert-threshold-help">
                  {t('search-profiles.human.feedback.signal')}
                </small>
              </label>
              <label className={styles.switch}>
                <input
                  checked={draft.active}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>{t('search-profiles.active.profile')}</span>
              </label>
            </div>

            <ScheduledDiscovery draft={draft} onChange={setDraft} />
            <HardConstraints draft={draft} onChange={setDraft} />
            <SoftPreferences draft={draft} onChange={setDraft} />
            <Exclusions draft={draft} onChange={setDraft} />
            <CriterionSimulator hard={draft.hardConstraints} />

            <footer className={styles.actions}>
              <div aria-live="polite">
                {saved
                  ? t('search-profiles.profile.saved')
                  : t('search-profiles.changes.are.not.applied.automatically')}
              </div>
              {selectedId ? (
                <button
                  className="co-button danger"
                  disabled={saving}
                  onClick={remove}
                  type="button"
                >
                  {confirmDelete
                    ? t('search-profiles.confirm.deletion')
                    : t('search-profiles.delete')}
                </button>
              ) : null}
              <button
                className="co-button"
                disabled={saving}
                onClick={save}
                type="button"
              >
                {saving
                  ? t('applications.saving')
                  : t('search-profiles.save.profile')}
              </button>
            </footer>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
