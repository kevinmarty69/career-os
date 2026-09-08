'use client';

import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Card } from '@/components/shell';
import { Icon, Mono } from '@/components/ui';

export function HostingOptions() {
  const fr = useI18n().locale === 'fr';
  return (
    <aside
      className="co-kit flex w-full min-w-0 flex-col gap-4"
      aria-label={fr ? 'Hébergement' : 'Hosting'}
    >
      <Card padding={24} className="!bg-ink-900 text-white">
        <div className="flex items-center gap-3">
          <Icon name="cloud" className="text-cyan" size={23} />
          <h2 className="m-0 text-section text-white">
            {fr ? 'Cette instance' : 'This instance'}
          </h2>
        </div>
        <p className="m-0 text-body-sm text-white/80">
          {fr
            ? 'Votre compte donne accès à un espace privé. Importez vos preuves, préparez une candidature et gardez la décision finale.'
            : 'Your account opens a private workspace. Import evidence, prepare an application and keep the final decision.'}
        </p>
        <p className="m-0 text-label text-white/70">
          {fr
            ? 'La facturation cloud n’est pas activée. Aucun paiement n’est demandé ici.'
            : 'Cloud billing is not enabled. No payment is requested here.'}
        </p>
      </Card>
      <Card padding={24}>
        <div className="flex items-center gap-3">
          <Icon name="dns" size={23} />
          <h2 className="m-0 text-section">
            {fr ? 'Auto-hébergé' : 'Self-hosted'}
          </h2>
          <Mono className="ml-auto">AGPL-3.0</Mono>
        </div>
        <p className="m-0 text-body-sm text-ink-700">
          {fr
            ? 'Le code est ouvert. Vous choisissez votre hébergement et vos modèles, et gérez vos clés et sauvegardes.'
            : 'The code is open. Choose your hosting and models, and manage your keys and backups.'}
        </p>
        <Link
          href="https://github.com/kevinmarty69/career-os#readme"
          className="text-label font-semibold text-ink-900 underline"
        >
          {fr ? 'Guide d’installation' : 'Installation guide'}
        </Link>
      </Card>
      <p className="m-0 flex gap-3 rounded-card bg-panel p-[18px] text-caption text-ink-600">
        <Icon name="swap_horiz" />
        {fr
          ? 'Vos données peuvent être exportées depuis les réglages de votre espace.'
          : 'Export your data from workspace settings.'}
      </p>
    </aside>
  );
}
