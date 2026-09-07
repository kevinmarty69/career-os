'use client';

import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/ui/primitives';
import Link from 'next/link';

export function UnavailableScreen({
  path,
  title,
  href,
}: {
  path: string;
  title: string;
  href: string;
}) {
  const { locale } = useI18n();
  return (
    <AppShell path={path}>
      <PageHeader title={title} />
      <section className="co-panel">
        <h2>
          {locale === 'fr'
            ? 'Fonctionnalité indisponible'
            : 'Feature unavailable'}
        </h2>
        <p>
          {locale === 'fr'
            ? 'Ce parcours n’est pas encore disponible dans cette instance.'
            : 'This workflow is not yet available in this instance.'}
        </p>
        <Link className="co-button" href={href}>
          {locale === 'fr'
            ? 'Ouvrir l’espace associé'
            : 'Open related workspace'}
        </Link>
      </section>
    </AppShell>
  );
}
