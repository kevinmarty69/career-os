'use client';

import {
  LocaleSwitch,
  useI18n,
  useTranslations,
} from '@/components/i18n/i18n-provider';
import { CommandPalette } from '@/components/search/command-palette';
import { Icon } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import { readApplications, readInstanceStatus } from '@/lib/career-api';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';
import { initials } from '@/lib/initials';
import { instanceStatusSchema } from '@/lib/run-contract';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';

export function AppShell({
  path,
  children,
  aside,
  sidebarContext,
  sidebarFooter,
}: {
  path: string;
  children: ReactNode;
  aside?: ReactNode;
  sidebarContext?: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const t = useTranslations([shellMessages]);

  const nav = [
    ['/', 'space_dashboard', t('shell.home')],
    ['/applications', 'account_tree', t('shell.applications')],
    ['/memory', 'database', t('shell.career.memory')],
    ['/links', 'send', t('shell.private.links')],
    ['/settings/models', 'settings', t('shell.settings')],
  ] as const;
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === 'Escape') setPalette(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <main className={`co-shell${aside ? ' has-aside' : ''}`}>
      <a className="skip-link" href="#main-content">
        {t('shell.skip.to.main.content')}{' '}
      </a>
      <aside className="co-sidebar" aria-label={t('shell.main.navigation')}>
        <Link className="co-brand" href="/">
          <span>
            <Icon>layers</Icon>
          </span>
          <strong>careeros</strong>
          <Icon>unfold_more</Icon>
        </Link>
        <LocaleSwitch />
        <nav aria-label={t('shell.main.navigation')}>
          {nav.map(([href, icon, label]) => (
            <Link
              aria-current={
                path === href || (href !== '/' && path.startsWith(href))
                  ? 'page'
                  : undefined
              }
              className={
                path === href || (href !== '/' && path.startsWith(href))
                  ? 'active'
                  : ''
              }
              href={href}
              key={href}
            >
              <Icon>{icon}</Icon>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        {sidebarContext ?? <CurrentApplications />}
        {sidebarFooter === undefined ? <InstanceCard /> : sidebarFooter}
      </aside>
      <section className="co-surface">
        {path === '/' ? (
          <header className="co-home-topbar">
            <button
              aria-label={t('shell.search.evidence.a.company.or.a.claim')}
              className="co-home-search"
              onClick={() => setPalette(true)}
              type="button"
            >
              <Icon>search</Icon>
              <span>{t('shell.search.evidence.a.company.or.a.claim')}</span>
              <kbd>⌘K</kbd>
            </button>
          </header>
        ) : null}
        <div className="co-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </section>
      {aside ? <aside className="co-sidepanel">{aside}</aside> : null}
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      <nav aria-label={t('shell.main.navigation')} className="co-mobile-nav">
        {nav.slice(0, 4).map(([href, icon, label]) => (
          <Link
            aria-current={
              path === href || (href !== '/' && path.startsWith(href))
                ? 'page'
                : undefined
            }
            className={
              path === href || (href !== '/' && path.startsWith(href))
                ? 'active'
                : ''
            }
            href={href}
            key={href}
          >
            <Icon>{icon}</Icon>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="co-mobile-locale">
        <LocaleSwitch compact />
      </div>
    </main>
  );
}

export function CurrentApplications() {
  const t = useTranslations([shellMessages]);
  const { locale } = useI18n();
  const [applications, setApplications] = useState<Application[]>();

  useEffect(() => {
    const controller = new AbortController();
    void readApplications(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as { applications?: unknown };
        setApplications(
          applicationSchema
            .array()
            .parse(payload.applications ?? [])
            .slice(0, 3),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setApplications([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <p className="co-nav-label">{t('shell.in.progress')}</p>
      <div className="co-current-list">
        {applications?.map((application) => (
          <Link
            href={`/applications/${application.applicationId}`}
            key={application.applicationId}
          >
            <i>{initials(application.company)}</i>
            <span>{application.company}</span>
            <b className={application.stage === 'closed' ? '' : 'ok'} />
          </Link>
        ))}
        {applications && !applications.length ? (
          <Link href="/applications/new">
            <i>+</i>
            <span>
              {locale === 'fr' ? 'Nouvelle candidature' : 'New application'}
            </span>
          </Link>
        ) : null}
      </div>
    </>
  );
}

export function InstanceCard() {
  const t = useTranslations([shellMessages]);
  const { locale } = useI18n();
  const [status, setStatus] =
    useState<ReturnType<typeof instanceStatusSchema.parse>>();

  useEffect(() => {
    const controller = new AbortController();
    void readInstanceStatus(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setStatus(instanceStatusSchema.parse(await response.json()));
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus(undefined);
      });
    return () => controller.abort();
  }, []);

  const fresh = status?.services.filter(
    ({ status }) => status === 'fresh',
  ).length;
  const healthy = status && fresh === status.services.length;
  return (
    <div className="co-instance">
      <Icon>{healthy ? 'cloud_done' : 'cloud_off'}</Icon>
      <strong>
        {healthy
          ? locale === 'fr'
            ? t('shell.instance.healthy')
            : 'Healthy instance'
          : locale === 'fr'
            ? 'Workers à vérifier'
            : 'Workers need attention'}
      </strong>
      <small>
        {status
          ? `${status.mode === 'self-hosted' ? (locale === 'fr' ? 'Auto-hébergé' : 'Self-hosted') : 'Cloud'} · ${fresh}/${status.services.length} ${locale === 'fr' ? 'workers actifs' : 'active workers'}`
          : locale === 'fr'
            ? 'État des workers indisponible'
            : 'Worker status unavailable'}
      </small>
      {!healthy ? (
        <Link href="/settings/models">
          {locale === 'fr' ? 'Voir la config' : 'Open settings'}
        </Link>
      ) : null}
    </div>
  );
}
