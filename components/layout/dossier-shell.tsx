'use client';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import { LocaleSwitch, useTranslations } from '@/components/i18n/i18n-provider';
import { Badge, Icon } from '@/components/ui/primitives';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { initials } from '@/lib/initials';
import Link from 'next/link';
import { type ReactNode } from 'react';
import flowStyles from '@/components/applications/application-flow.module.css';

export function DossierNav({
  active,
  applicationId,
  company,
}: {
  active: string;
  applicationId: string;
  company: string;
}) {
  const t = useTranslations([dossierMessages]);
  const items = [
    ['assignment', t('dossier.brief'), ''],
    ['business', t('dossier.company'), 'company'],
    ['folder', t('dossier.deliverables'), 'page'],
    ['groups', t('dossier.contacts'), 'timeline'],
    ['history', t('dossier.versions'), 'versions'],
  ];
  return (
    <aside className="co-dossier-nav">
      <Link href="/applications">
        <Icon>arrow_back</Icon>
        {t('dossier.all.applications')}{' '}
      </Link>
      <p>{company}</p>
      {items.map(([icon, label, path]) => (
        <Link
          aria-current={active === path ? 'page' : undefined}
          className={active === path ? 'active' : ''}
          href={
            path
              ? `/applications/${applicationId}/${path}`
              : `/applications/${applicationId}`
          }
          key={label}
        >
          <Icon>{icon}</Icon>
          {label}
        </Link>
      ))}
    </aside>
  );
}

export function DossierShell({
  active,
  children,
  state,
  actions,
  identity,
  fullscreen = false,
}: {
  active: string;
  children: ReactNode;
  state?: ReactNode;
  actions?: ReactNode;
  identity: { applicationId: string; company: string; role: string };
  fullscreen?: boolean;
}) {
  const t = useTranslations([
    applicationsMessages,
    dossierMessages,
    memoryMessages,
    shellMessages,
  ]);
  if (fullscreen) {
    return (
      <main className={flowStyles.fullscreenShell}>
        <a className="skip-link" href="#main-content">
          {t('shell.skip.to.main.content')}
        </a>
        <header className={flowStyles.fullscreenHeader}>
          <Link
            aria-label={t('dossier.application.workspace')}
            href={`/applications/${identity.applicationId}`}
          >
            <Icon>close</Icon>
          </Link>
          <span>
            <strong>{identity.company}</strong>
            <small>{identity.role}</small>
          </span>
          <LocaleSwitch compact />
          {state}
          {actions}
        </header>
        <section id="main-content" tabIndex={-1}>
          {children}
        </section>
      </main>
    );
  }

  return (
    <main className="co-dossier-shell">
      <a className="skip-link" href="#main-content">
        {t('shell.skip.to.main.content')}{' '}
      </a>
      <DossierNav
        active={active}
        applicationId={identity.applicationId}
        company={identity.company}
      />
      <section id="main-content" tabIndex={-1}>
        <header className="co-dossier-top">
          <div>
            <i>{initials(identity.company)}</i>
            <span>
              <small>
                {identity.company} · {identity.role}
              </small>
              <strong>
                {active === 'versions'
                  ? t('dossier.version.and.decision.history')
                  : t('dossier.application.workspace')}
              </strong>
            </span>
          </div>
          <LocaleSwitch compact />
          {state ?? <Badge tone="warn">{t('dossier.needs.review')}</Badge>}
          {actions}
        </header>
        {children}
      </section>
      <nav
        aria-label={t('memory.mobile.navigation')}
        className="co-mobile-nav co-dossier-mobile-nav"
      >
        {[
          ['/applications', 'arrow_back', t('shell.applications')],
          [
            `/applications/${identity.applicationId}`,
            'description',
            t('dossier.brief'),
          ],
          [
            `/applications/${identity.applicationId}/company`,
            'domain',
            t('applications.company'),
          ],
          [
            `/applications/${identity.applicationId}/page`,
            'web',
            t('dossier.deliverables'),
          ],
          [
            `/applications/${identity.applicationId}/timeline`,
            'groups',
            t('dossier.contacts'),
          ],
        ].map(([href, icon, label]) => (
          <Link
            aria-current={
              href ===
              `/applications/${identity.applicationId}${active ? `/${active}` : ''}`
                ? 'page'
                : undefined
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
