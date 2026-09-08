'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { CommandPalette } from '@/components/search/command-palette';
import { Button, Icon } from '@/components/ui/primitives';
import { ProfileMenu } from './profile-menu';
import profileMenuStyles from './profile-menu.module.css';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import {
  readApplications,
  readProfile,
  readPublications,
} from '@/lib/career-api';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';
import { profileSchema, type Profile } from '@/lib/schemas';
import {
  publicationSummarySchema,
  type PublicationSummary,
} from '@/lib/server/publication-input';
import Link from 'next/link';
import Image from 'next/image';
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
  const { locale } = useI18n();
  const sidebar = useSidebarState();

  const nav = [
    ['/', 'grid_view', t('shell.home'), undefined],
    [
      '/applications',
      'account_tree',
      t('shell.applications'),
      sidebar?.applications.length,
    ],
    [
      '/memory',
      'database',
      t('shell.career.memory'),
      sidebar?.profile.claims.length,
    ],
    [
      '/links',
      'send',
      t('shell.private.links'),
      sidebar?.publications.filter(({ status }) => status === 'active').length,
    ],
    ['/settings/models', 'settings', t('shell.settings'), undefined],
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
        <Link aria-label="Career OS" className="co-brand" href="/">
          <span>
            <Image
              alt=""
              height={18}
              src="/brand/symbol/careeros-symbol-inverse.svg"
              width={18}
            />
          </span>
          <strong>Career OS</strong>
        </Link>
        <nav aria-label={t('shell.main.navigation')}>
          {nav.map(([href, icon, label, count]) => (
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
              {count ? <b>{count}</b> : null}
            </Link>
          ))}
        </nav>
        <Button quiet onClick={() => setPalette(true)}>
          <Icon>search</Icon>
          {t('shell.global.search')}
        </Button>
        {sidebarContext ?? (
          <CurrentApplications
            applications={sidebar?.applications ?? []}
            locale={locale}
          />
        )}
        {sidebarFooter === undefined ? (
          <SidebarProfile profile={sidebar?.profile} />
        ) : (
          sidebarFooter
        )}
        <ProfileMenu />
      </aside>
      <section className="co-surface">
        <div className={profileMenuStyles.mobile}>
          <Button quiet onClick={() => setPalette(true)}>
            <Icon>search</Icon>
            {t('shell.global.search')}
          </Button>
          <ProfileMenu placement="below" />
        </div>
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
    </main>
  );
}

function useSidebarState() {
  const [state, setState] = useState<{
    applications: Application[];
    profile: Profile;
    publications: PublicationSummary[];
  }>();

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplications(controller.signal),
      readProfile(controller.signal),
      readPublications(controller.signal),
    ])
      .then(
        async ([
          applicationsResponse,
          profileResponse,
          publicationsResponse,
        ]) => {
          if (
            !applicationsResponse.ok ||
            !profileResponse.ok ||
            !publicationsResponse.ok
          )
            return;
          const applicationsPayload = (await applicationsResponse.json()) as {
            applications?: unknown;
          };
          const profilePayload = (await profileResponse.json()) as {
            profile?: unknown;
          };
          const publicationsPayload = (await publicationsResponse.json()) as {
            publications?: unknown;
          };
          const profile = profileSchema
            .nullable()
            .parse(profilePayload.profile);
          if (!profile) return;
          setState({
            applications: applicationSchema
              .array()
              .parse(applicationsPayload.applications ?? []),
            profile,
            publications: publicationSummarySchema
              .array()
              .parse(publicationsPayload.publications ?? []),
          });
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return state;
}

export function CurrentApplications({
  applications,
  locale,
}: {
  applications: Application[];
  locale: 'en' | 'fr';
}) {
  const t = useTranslations([shellMessages]);

  return (
    <>
      <p className="co-nav-label">{t('shell.in.progress')}</p>
      <div className="co-current-list">
        {applications.slice(0, 1).map((application) => (
          <Link
            href={`/applications/${application.applicationId}`}
            key={application.applicationId}
          >
            <b className={application.stage === 'closed' ? '' : 'ok'} />
            <span>{application.company}</span>
            <small>{stageLabel(application.stage, locale)}</small>
          </Link>
        ))}
        {!applications.length ? (
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

function SidebarProfile({ profile }: { profile?: Profile }) {
  const { locale } = useI18n();
  const sourced = profile?.claims.filter(
    ({ evidenceIds }) => evidenceIds.length,
  ).length;
  const total = profile?.claims.length ?? 0;
  const coverage = total ? Math.round(((sourced ?? 0) / total) * 100) : 0;
  const missing = total - (sourced ?? 0);
  return (
    <div className="co-sidebar-profile">
      <Link className="co-sidebar-memory" href="/memory">
        <span>
          <Icon>{total ? 'verified' : 'description'}</Icon>
          <strong>
            {total
              ? `${coverage}% ${locale === 'fr' ? 'sourcé' : 'sourced'}`
              : locale === 'fr'
                ? 'Votre mémoire pro'
                : 'Your career memory'}
          </strong>
        </span>
        {total ? (
          <i aria-hidden="true">
            <b style={{ width: `${coverage}%` }} />
          </i>
        ) : null}
        <small>
          {!total
            ? locale === 'fr'
              ? 'Ajoutez vos expériences et leurs sources'
              : 'Add your experience and sources'
            : missing
              ? locale === 'fr'
                ? `${missing} affirmation${missing > 1 ? 's' : ''} à documenter`
                : `${missing} claim${missing > 1 ? 's' : ''} to document`
              : locale === 'fr'
                ? 'Mémoire entièrement sourcée'
                : 'Career memory fully sourced'}
        </small>
      </Link>
    </div>
  );
}

function stageLabel(stage: Application['stage'], locale: 'en' | 'fr') {
  const labels = {
    draft: locale === 'fr' ? 'brouillon' : 'draft',
    applied: locale === 'fr' ? 'envoyée' : 'sent',
    interview: locale === 'fr' ? 'entretien' : 'interview',
    offer: locale === 'fr' ? 'offre' : 'offer',
    closed: locale === 'fr' ? 'fermée' : 'closed',
  } as const;
  return labels[stage];
}
