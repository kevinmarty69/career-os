'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { Badge, Icon } from '@/components/ui/primitives';
import { memoryOverviewMessages } from '@/lib/i18n/dictionaries/memory-overview';
import { type Profile } from '@/lib/schemas';
import { useMemo, useState } from 'react';
import { useCareerMemory } from './use-career-memory';
import styles from './career-memory-overview.module.css';

type View = 'graph' | 'claims' | 'documents' | 'skills' | 'privacy';

export function CareerMemoryOverview() {
  const t = useTranslations([memoryOverviewMessages]);
  const memory = useCareerMemory();
  const [view, setView] = useState<View>('graph');
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
  const tabs: Array<[View, string]> = [
    ['graph', t('memory.overview.graph')],
    ['claims', t('memory.overview.claims')],
    ['documents', t('memory.overview.documents')],
    ['skills', t('memory.overview.skills')],
    ['privacy', t('memory.overview.privacy')],
  ];

  return (
    <section className={styles.workspace}>
      {memory.message ? (
        <p className={styles.status} role="status">
          {memory.message}
        </p>
      ) : null}
      <div className={styles.tabs} role="tablist">
        {tabs.map(([id, label]) => (
          <button
            aria-selected={view === id}
            key={id}
            onClick={() => setView(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.graph} data-view={view}>
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
                <blockquote>“{item.excerpt}”</blockquote>
              </article>
            ))}
            {!evidence.length ? (
              <p>{t('memory.overview.no.evidence')}</p>
            ) : null}
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
