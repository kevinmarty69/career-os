'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { OnboardingEmptyState } from '@/components/onboarding/empty-states';
import { Badge, Icon } from '@/components/ui/primitives';
import { memoryOverviewMessages } from '@/lib/i18n/dictionaries/memory-overview';
import { type Profile } from '@/lib/schemas';
import { listInterviews } from '@/lib/guided-interview';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCareerMemory } from './use-career-memory';
import styles from './career-memory-overview.module.css';

type View = 'claims' | 'skills';

export function CareerMemoryOverview() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations([memoryOverviewMessages]);
  const memory = useCareerMemory();
  const interviews = listInterviews(memory.profile);
  const [view, setView] = useState<View>('claims');
  const visibleClaims = useMemo(
    () =>
      memory.profile.claims.filter((claim) =>
        view === 'skills' ? claim.kind === 'skill' : true,
      ),
    [memory.profile.claims, view],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const selected =
    visibleClaims.find(({ id }) => id === selectedId) ?? visibleClaims[0];
  const evidence = selected
    ? memory.profile.evidence.filter(({ id }) =>
        selected.evidenceIds.includes(id),
      )
    : [];
  const filters: Array<[View, string]> = [
    ['claims', t('memory.overview.claims')],
    ['skills', t('memory.overview.skills')],
  ];

  if (memory.state === 'loading')
    return (
      <p className="co-note" role="status">
        {locale === 'fr'
          ? 'Chargement de votre mémoire…'
          : 'Loading your memory…'}
      </p>
    );
  if (memory.loadError)
    return (
      <div className="co-note" role="alert">
        <Icon>cloud_off</Icon>
        {memory.message}
        {memory.loadError === 'auth' ? (
          <Link href="/sign-in">
            {locale === 'fr' ? 'Se connecter' : 'Sign in'}
          </Link>
        ) : (
          <button
            className="co-button quiet"
            type="button"
            onClick={() => window.location.reload()}
          >
            {locale === 'fr' ? 'Réessayer' : 'Try again'}
          </button>
        )}
      </div>
    );
  if (!memory.profile.sources.length && !memory.profile.claims.length)
    return <OnboardingEmptyState kind="memory" />;

  return (
    <section className={styles.workspace}>
      {memory.message ? (
        <p className={styles.status} role="status">
          {memory.message}
        </p>
      ) : null}
      <div
        className={styles.tabs}
        role="group"
        aria-label={t('memory.overview.claims')}
      >
        {filters.map(([id, label]) => (
          <button
            aria-pressed={view === id}
            key={id}
            onClick={() => setView(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.graph}>
        <section className={styles.sources}>
          <header>
            <span>{t('memory.overview.sources')}</span>
            <b>{memory.profile.sources.length}</b>
          </header>
          <div>
            {memory.profile.sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
            {memory.state === 'ready' && !memory.profile.sources.length ? (
              <p>{t('memory.overview.no.source')}</p>
            ) : null}
          </div>
        </section>

        <section className={styles.claims}>
          <header>
            <span>
              {view === 'skills'
                ? t('memory.overview.skills')
                : t('memory.overview.claims')}
            </span>
            <b>{visibleClaims.length}</b>
          </header>
          <div>
            {visibleClaims.map((claim) => (
              <button
                aria-pressed={selected?.id === claim.id}
                key={claim.id}
                onClick={() => setSelectedId(claim.id)}
                type="button"
              >
                <span className={styles.dot} data-level={claim.level} />
                <strong>{claim.statement}</strong>
                <Badge tone={toneFor(claim.level)}>
                  {t(`memory.overview.${claim.level}`)}
                </Badge>
              </button>
            ))}
            {memory.state === 'ready' && !visibleClaims.length ? (
              <p>{t('memory.overview.no.claim')}</p>
            ) : null}
          </div>
        </section>

        <section className={styles.evidence}>
          <header>
            <span>{t('memory.overview.evidence')}</span>
            <b>{evidence.length}</b>
          </header>
          <div>
            {evidence.map((item) => (
              <article key={item.id}>
                <span>
                  <Icon>description</Icon>
                  {item.label}
                </span>
                <blockquote>
                  “
                  {interviews.some(({ source }) => source.id === item.sourceId)
                    ? (() => {
                        const interview = interviews.find(
                          ({ source }) => source.id === item.sourceId,
                        )!.draft;
                        return (
                          interview.statement ||
                          interview.answers.filter(Boolean).join('\n\n')
                        );
                      })()
                    : item.excerpt}
                  ”
                </blockquote>
              </article>
            ))}
            {!evidence.length ? (
              <p>{t('memory.overview.no.evidence')}</p>
            ) : null}
            {selected && selected.level !== 'verified' && (
              <button
                type="button"
                className="co-button quiet"
                onClick={() =>
                  router.push(
                    `/memory/interview?session=${crypto.randomUUID()}&claim=${encodeURIComponent(selected.id)}`,
                  )
                }
              >
                {locale === 'fr'
                  ? 'La sourcer par un entretien'
                  : 'Support this claim with an interview'}
              </button>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: Profile['sources'][number] }) {
  const t = useTranslations([memoryOverviewMessages]);
  return (
    <article>
      <Icon>{source.kind === 'document' ? 'description' : 'language'}</Icon>
      <span>
        <strong>{source.title}</strong>
        <small>{source.kind}</small>
      </span>
      <Badge tone="muted">{t(`memory.overview.${source.sensitivity}`)}</Badge>
    </article>
  );
}

function toneFor(level: Profile['claims'][number]['level']) {
  if (level === 'verified') return 'ok' as const;
  if (level === 'unsupported') return 'crit' as const;
  return 'warn' as const;
}
