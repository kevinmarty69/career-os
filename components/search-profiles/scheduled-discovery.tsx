'use client';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { SectionHeading } from '@/components/search-profiles/profile-fields';
import styles from '@/components/search-profiles/search-profiles.module.css';
import { Icon } from '@/components/ui/primitives';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { type SearchProfileFields } from '@/lib/search-profile';

export function ScheduledDiscovery({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const t = useTranslations([searchProfilesMessages, applicationsMessages]);
  const sources = draft.discoverySources;
  return (
    <section className={`${styles.criteria} ${styles.discovery}`}>
      <SectionHeading
        icon="schedule"
        label={t('search-profiles.scheduled.discovery')}
        copy={t(
          'search-profiles.monitor.public.greenhouse.or.ashby.boards.no.paid.service',
        )}
        badge={t('search-profiles.automatic')}
      />
      <div className={styles.discoveryControls}>
        <label>
          <span>{t('search-profiles.frequency')}</span>
          <select
            aria-label={t('search-profiles.discovery.frequency')}
            onChange={(event) =>
              onChange({
                ...draft,
                discoveryIntervalHours: Number(
                  event.target.value,
                ) as SearchProfileFields['discoveryIntervalHours'],
              })
            }
            value={draft.discoveryIntervalHours}
          >
            <option value={6}>{t('search-profiles.every.6.hours')}</option>
            <option value={12}>{t('search-profiles.every.12.hours')}</option>
            <option value={24}>{t('search-profiles.daily')}</option>
            <option value={72}>{t('search-profiles.every.3.days')}</option>
          </select>
        </label>
        <button
          className="co-button quiet"
          onClick={() =>
            onChange({
              ...draft,
              discoverySources: [...sources, { company: '', url: '' }],
            })
          }
          type="button"
        >
          <Icon>add</Icon>
          {t('search-profiles.add.board')}{' '}
        </button>
      </div>
      {sources.length ? (
        <div className={styles.sourceList}>
          {sources.map((source, index) => (
            <div key={index}>
              <label>
                <span>{t('applications.company')}</span>
                <input
                  aria-label={t('search-profiles.source.company', {
                    index: index + 1,
                  })}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      discoverySources: sources.map((item, sourceIndex) =>
                        sourceIndex === index
                          ? { ...item, company: event.target.value }
                          : item,
                      ),
                    })
                  }
                  placeholder="Acme"
                  value={source.company}
                />
              </label>
              <label>
                <span>{t('search-profiles.public.board.url')}</span>
                <input
                  aria-label={t('search-profiles.source.board.url', {
                    index: index + 1,
                  })}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      discoverySources: sources.map((item, sourceIndex) =>
                        sourceIndex === index
                          ? { ...item, url: event.target.value }
                          : item,
                      ),
                    })
                  }
                  placeholder="https://jobs.ashbyhq.com/acme"
                  type="url"
                  value={source.url}
                />
              </label>
              <button
                aria-label={t('search-profiles.source.remove', {
                  index: index + 1,
                })}
                onClick={() =>
                  onChange({
                    ...draft,
                    discoverySources: sources.filter(
                      (_, sourceIndex) => sourceIndex !== index,
                    ),
                  })
                }
                type="button"
              >
                <Icon>delete</Icon>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.noSources}>
          {t('search-profiles.no.board.is.monitored.add.the.root.url.of')}{' '}
        </p>
      )}
    </section>
  );
}
