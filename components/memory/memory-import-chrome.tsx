'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProfileMenu } from '@/components/layout/profile-menu';
import {
  Icon,
  type MemoryImportController as Controller,
} from './memory-import-presentation';

function Brand() {
  const t = useTranslations([memoryMessages]);
  return (
    <Link
      aria-label={t('memory.career.os.home')}
      className={styles.brand}
      href="/"
    >
      <Image
        alt=""
        height={30}
        priority
        src="/brand/symbol/careeros-symbol-ink.svg"
        width={30}
      />
      <span>careeros</span>
    </Link>
  );
}

export function MemoryImportChrome({
  children,
  stage,
}: {
  children: ReactNode;
  stage: Controller['stage'];
}) {
  const t = useTranslations([memoryMessages]);
  const navigation = [
    ['grid_view', t('memory.home'), '/'],
    ['account_tree', t('memory.applications'), '/applications'],
    ['database', t('memory.career.memory'), '/memory'],
    ['send', t('memory.private.links'), '/links'],
    ['settings', t('memory.settings'), '/settings/models'],
  ] as const;
  const mobileNavigation = navigation.slice(0, 4);
  const memoryComplete = stage === 'saved';

  return (
    <main className={styles.canvas}>
      <a className={styles.skipLink} href="#memory-import-content">
        {t('memory.skip.to.import')}
      </a>
      <section
        aria-label={t('memory.career.memory.import')}
        className={styles.screen}
      >
        <aside
          aria-label={t('memory.career.os.navigation')}
          className={styles.sidebar}
        >
          <Brand />
          <nav
            aria-label={t('memory.main.navigation')}
            className={styles.navigation}
          >
            {navigation.map(([icon, label, href]) => (
              <Link
                aria-current={href === '/memory' ? 'page' : undefined}
                className={href === '/memory' ? styles.active : undefined}
                href={href}
                key={label}
              >
                <Icon>{icon}</Icon>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <section aria-labelledby="setup-title" className={styles.setup}>
            <h2 id="setup-title">{t('memory.setup')}</h2>
            <ol>
              <SetupItem label={t('memory.account.created')} state="done" />
              <SetupItem
                label={t('memory.import.a.resume')}
                state={memoryComplete ? 'done' : 'current'}
              />
              <SetupItem
                label={t('memory.paste.a.job')}
                state={memoryComplete ? 'current' : 'upcoming'}
              />
              <SetupItem label={t('memory.publish.a.page')} state="upcoming" />
            </ol>
          </section>
          <div className={styles.sidebarFooter}>
            <ProfileMenu />
            <div className={styles.localNote}>
              <Icon>shield</Icon>
              <span>
                <strong>{t('memory.local.processing')}</strong>
                <small>{t('memory.the.file.stays.in.this.browser')}</small>
              </span>
            </div>
          </div>
        </aside>
        <header className={styles.mobileHeader}>
          <Brand />
          <div>
            <ProfileMenu placement="below" />
            <Link href="/memory" aria-label={t('memory.close.import')}>
              <Icon>close</Icon>
            </Link>
          </div>
        </header>
        <section className={styles.content} id="memory-import-content">
          {children}
        </section>
        <nav
          aria-label={t('memory.mobile.navigation')}
          className={styles.mobileNavigation}
        >
          {mobileNavigation.map(([icon, label, href]) => (
            <Link
              aria-current={href === '/memory' ? 'page' : undefined}
              href={href}
              key={label}
            >
              <Icon>{icon}</Icon>
              <small>{label}</small>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

function SetupItem({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'current' | 'upcoming';
}) {
  return (
    <li className={styles[state]}>
      <Icon>
        {state === 'done'
          ? 'check_circle'
          : state === 'current'
            ? 'autorenew'
            : 'radio_button_unchecked'}
      </Icon>
      <span>{label}</span>
    </li>
  );
}
