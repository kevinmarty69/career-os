'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import Link from 'next/link';
import { useState } from 'react';
import type { CandidateGroup } from './use-memory-import';
import {
  Icon,
  importLabels,
  type MemoryImportController as Controller,
} from './memory-import-presentation';

export function SavedStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  const [jobSource, setJobSource] = useState('');
  const review = controller.review;
  const selected =
    review?.candidates.filter((candidate) => candidate.selected) ?? [];
  const groupCounts = selected.reduce<Map<CandidateGroup, number>>(
    (counts, candidate) => {
      counts.set(candidate.group, (counts.get(candidate.group) ?? 0) + 1);
      return counts;
    },
    new Map(),
  );
  const topGroups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const labels = importLabels(t).importCandidateGroupLabels;
  const sourceMode = /^https?:\/\//i.test(jobSource.trim()) ? 'url' : 'text';
  return (
    <div className={styles.flowStep} data-motion="enter">
      <div className={styles.readyGrid}>
        <section className={styles.savedPanel}>
          <header>
            <span className={styles.savedIcon}>
              <Icon>check</Icon>
            </span>
            <div>
              <p>{t('memory.career.memory.complete')}</p>
              <h1 aria-label={t('memory.your.selection.is.saved')}>
                {t('memory.memory.created')}
              </h1>
            </div>
            <Link className={styles.inlineButton} href="/memory">
              {t('memory.open.my.career.memory')}
            </Link>
          </header>
          <dl className={styles.memoryStats}>
            <div>
              <dt>{t('memory.claims')}</dt>
              <dd>{selected.length}</dd>
            </div>
            <div>
              <dt>{t('memory.skill.groups')}</dt>
              <dd>{groupCounts.size}</dd>
            </div>
            <div>
              <dt>{t('memory.sources')}</dt>
              <dd>{review ? 1 : 0}</dd>
            </div>
          </dl>
          <div className={styles.nextStep}>
            <p>{t('memory.next.step')}</p>
            <h2>{t('memory.paste.a.job.you.are.interested.in')}</h2>
            <span>{t('memory.saved.job.intro')}</span>
            <form action="/applications/new" method="get">
              <Icon>link</Icon>
              <input
                autoFocus
                aria-label={t('memory.public.job.url.or.text')}
                name="source"
                onChange={(event) => setJobSource(event.target.value)}
                placeholder={t('memory.url.placeholder')}
                value={jobSource}
              />
              <input name="mode" type="hidden" value={sourceMode} />
              <button
                aria-label={t('memory.continue.with.this.job')}
                className={styles.primaryIconButton}
                disabled={!jobSource.trim()}
                type="submit"
              >
                <Icon>arrow_forward</Icon>
              </button>
            </form>
            <small>{t('memory.or.paste.job.text.or.import.pdf')}</small>
          </div>
        </section>
        <aside className={styles.missingPanel}>
          <header>
            <Icon>priority_high</Icon>
            <div>
              <p>{t('memory.what.is.missing')}</p>
              <h2>{t('memory.a.resume.covers.facts.rarely.evidence')}</h2>
            </div>
          </header>
          <span>
            {t('memory.adding.sources.will.expand.what.career.os.can.claim')}
          </span>
          <ul>
            <SourceSuggestion
              icon="badge"
              label={t('memory.linkedin.profile')}
              action={t('memory.connect')}
              href="/memory/import?source=linkedin"
              onActivate={() => controller.discard()}
            />
            <SourceSuggestion
              icon="code"
              label={t('memory.public.repositories')}
              action={t('memory.connect')}
              href="/settings/integrations"
            />
            <SourceSuggestion
              icon="description"
              label={t('memory.postmortems.specs.recommendations')}
              action={t('memory.import')}
              href="/memory/import?source=document"
              onActivate={() => controller.discard()}
            />
          </ul>
        </aside>
      </div>
      <div className={styles.readyLowerGrid}>
        <section className={styles.evidenceMap}>
          <header>
            <div>
              <p>{t('memory.your.evidence.map')}</p>
              <h2>{t('memory.derived.from.your.claims')}</h2>
            </div>
            <span className={styles.countBadge}>{selected.length}</span>
          </header>
          {topGroups.length ? (
            <ul>
              {topGroups.map(([group, count]) => (
                <li key={group}>
                  <span>{labels[group]}</span>
                  <strong>
                    {count}{' '}
                    {count === 1
                      ? t('memory.claim.singular')
                      : t('memory.claims')}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('memory.your.saved.claims.will.appear.here')}</p>
          )}
          <Link
            className={styles.secondaryButton}
            href="/memory/import"
            onClick={() => controller.discard()}
          >
            {t('memory.add.another.source')}
          </Link>
        </section>
        <section className={styles.howPanel}>
          <header>
            <p>{t('memory.how.it.will.work')}</p>
            <h2>{t('memory.for.every.job')}</h2>
          </header>
          <ol>
            <HowStep
              number="1"
              title={t('memory.agents.match')}
              body={t('memory.agents.match.body')}
            />
            <HowStep
              number="2"
              title={t('memory.you.decide')}
              body={t('memory.you.decide.body')}
            />
            <HowStep
              number="3"
              title={t('memory.you.send')}
              body={t('memory.you.send.body')}
            />
          </ol>
          <div className={styles.safetyLine}>
            <Icon>shield</Icon>
            <p>{t('memory.no.automatic.publication.or.email')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SourceSuggestion({
  icon,
  label,
  action,
  href,
  onActivate,
}: {
  icon: string;
  label: string;
  action: string;
  href: string;
  onActivate?: () => void;
}) {
  return (
    <li>
      <span>
        <Icon>{icon}</Icon>
        {label}
      </span>
      <Link href={href} onClick={onActivate}>
        {action}
      </Link>
    </li>
  );
}

function HowStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <b>{number}</b>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
    </li>
  );
}
