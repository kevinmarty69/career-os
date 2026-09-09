'use client';
import { shellMessages } from '@/lib/i18n/dictionaries/shell';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { ProfileMenu } from './profile-menu';
import Link from 'next/link';
import Image from 'next/image';
import { type ReactNode } from 'react';

export function SettingsNav({ active }: { active: string }) {
  const t = useTranslations([
    activeRoutesMessages,
    searchProfilesMessages,
    shellMessages,
  ]);
  return (
    <aside className="co-settings-nav">
      <Link href="/">
        <Icon>arrow_back</Icon>
        {t('active-routes.back.to.the.app')}{' '}
      </Link>
      <p>{t('shell.settings')}</p>
      {[
        ['notifications', 'Notifications', '/settings/notifications'],
        ['memory', t('active-routes.models.agents'), '/settings/models'],
        ['shield', t('search-profiles.privacy'), '/settings/privacy'],
        ['hub', t('active-routes.integrations'), '/settings/integrations'],
        ['payments', t('active-routes.subscription'), '/settings/billing'],
        ['import_export', t('active-routes.export.deletion'), '/settings/data'],
      ].map(([i, l, h]) => (
        <Link
          aria-current={active === h ? 'page' : undefined}
          className={active === h ? 'active' : ''}
          href={h}
          key={h}
        >
          <Icon>{i}</Icon>
          {l}
        </Link>
      ))}
    </aside>
  );
}

export function SettingsShell({
  active,
  children,
  side,
}: {
  active: string;
  children: ReactNode;
  side?: ReactNode;
}) {
  const t = useTranslations([
    activeRoutesMessages,
    searchProfilesMessages,
    shellMessages,
  ]);
  return (
    <main className="co-settings-shell">
      <a className="skip-link" href="#main-content">
        {t('shell.skip.to.main.content')}{' '}
      </a>
      <SettingsNav active={active} />
      <section id="main-content" tabIndex={-1}>
        <header>
          <Link className="co-brand" href="/">
            <span>
              <Image
                src="/brand/symbol/careeros-symbol-inverse.svg"
                width={18}
                height={18}
                alt=""
              />
            </span>
            <strong>Career OS</strong>
          </Link>
          <ProfileMenu placement="below" />
        </header>
        <div className="co-settings-content">{children}</div>
      </section>
      {side ? <aside className="co-settings-side">{side}</aside> : null}
    </main>
  );
}
