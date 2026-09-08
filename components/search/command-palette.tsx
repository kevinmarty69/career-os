'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { useDialogFocus } from '@/components/use-dialog-focus';
import { applicationSchema } from '@/lib/application-contract';
import {
  readApplications,
  readOpportunities,
  readProfile,
} from '@/lib/career-api';
import { opportunityListResponseSchema } from '@/lib/discovered-job-contract';
import {
  buildGlobalSearchIndex,
  type GlobalSearchItem,
  searchGlobalIndex,
} from '@/lib/global-search';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';
import { profileSchema } from '@/lib/schemas';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations([shellMessages]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<GlobalSearchItem[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const dialog = useDialogFocus<HTMLElement>(onClose);
  const results = searchGlobalIndex(index, query);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplications(controller.signal),
      readOpportunities(controller.signal),
      readProfile(controller.signal),
    ])
      .then(
        async ([applicationResponse, opportunityResponse, profileResponse]) => {
          if (
            !applicationResponse.ok ||
            !opportunityResponse.ok ||
            !profileResponse.ok
          )
            throw new Error('Workspace search unavailable.');
          const applicationPayload: unknown = await applicationResponse.json();
          const applications = applicationSchema
            .array()
            .parse(
              typeof applicationPayload === 'object' &&
                applicationPayload !== null &&
                'applications' in applicationPayload
                ? applicationPayload.applications
                : [],
            );
          const opportunities = opportunityListResponseSchema.parse(
            await opportunityResponse.json(),
          ).opportunities;
          const profilePayload: unknown = await profileResponse.json();
          const profile = profileSchema
            .nullable()
            .parse(
              typeof profilePayload === 'object' &&
                profilePayload !== null &&
                'profile' in profilePayload
                ? profilePayload.profile
                : null,
            );
          setIndex(
            buildGlobalSearchIndex({
              applications,
              opportunities,
              profile: profile ?? undefined,
            }),
          );
          setState('ready');
        },
      )
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const href = results[0]?.href;
    if (!href) return;
    onClose();
    router.push(href);
  }

  const kindLabel = {
    application: t('shell.application'),
    opportunity: t('shell.opportunity'),
    claim: t('shell.claim'),
    evidence: t('shell.evidence'),
  } as const;
  return (
    <div className="co-scrim" role="presentation" onMouseDown={onClose}>
      <section
        className="co-command"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.command.palette')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form onSubmit={submit}>
          <label>
            <Icon>search</Icon>
            <input
              aria-label={t('shell.global.search')}
              data-dialog-initial-focus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('shell.search.evidence.a.company.or.an.action')}
              type="search"
              value={query}
            />
            <kbd>esc</kbd>
          </label>
        </form>
        <p>
          {state === 'ready'
            ? `${results.length} ${locale === 'en' ? (results.length === 1 ? 'result' : 'results') : 'résultat' + (results.length === 1 ? '' : 's')}`
            : state === 'loading'
              ? t('shell.searching')
              : t('shell.search.unavailable')}
        </p>
        {results.map((result, position) => (
          <Link
            href={result.href}
            key={`${result.kind}:${result.id}`}
            onClick={onClose}
          >
            <Icon>{searchIcon(result.kind)}</Icon>
            <span>
              <strong>{result.title}</strong>
              <small>
                {kindLabel[result.kind]} · {searchResultDetail(result, locale)}
              </small>
            </span>
            {position === 0 ? <kbd>↵</kbd> : null}
          </Link>
        ))}
        {state === 'ready' && !results.length ? (
          <div className="co-command-empty">
            {t('shell.no.results.for.this.search')}{' '}
          </div>
        ) : null}
        <p>Actions</p>
        <Link href="/applications/new" onClick={onClose}>
          <Icon>add_link</Icon>
          <span>
            <strong>{t('shell.new.application.from.a.url')}</strong>
          </span>
        </Link>
        <Link href="/memory/import" onClick={onClose}>
          <Icon>upload_file</Icon>
          <span>
            <strong>{t('shell.import.a.document.into.career.memory')}</strong>
          </span>
        </Link>
        <footer>
          <span>{t('shell.open.first.result')}</span>
          <b>
            {locale === 'en'
              ? `${index.length} indexed items`
              : `${index.length} éléments indexés`}
          </b>
        </footer>
      </section>
    </div>
  );
}

export function searchIcon(kind: GlobalSearchItem['kind']) {
  return {
    application: 'work_history',
    opportunity: 'travel_explore',
    claim: 'fact_check',
    evidence: 'verified',
  }[kind];
}

export function searchResultDetail(
  result: GlobalSearchItem,
  locale: 'en' | 'fr',
) {
  if (result.kind !== 'claim') return result.detail;
  return (
    {
      verified: locale === 'en' ? 'verified' : 'vérifiée',
      declared: locale === 'en' ? 'declared' : 'déclarée',
      inferred: locale === 'en' ? 'inferred' : 'inférée',
      unsupported: locale === 'en' ? 'unsupported' : 'non soutenue',
    }[result.detail] ?? result.detail
  );
}
