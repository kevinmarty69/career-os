'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

import { useI18n } from '@/components/i18n/i18n-provider';
import { SettingsShell } from '@/components/layout/settings-shell';
import { SessionManager } from '@/components/settings/session-manager';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { readInstanceStatus } from '@/lib/career-api';
import { instanceStatusSchema } from '@/lib/run-contract';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function ModelsScreen() {
  const t = useTranslations([activeRoutesMessages]);

  const { locale } = useI18n();
  const fr = locale === 'fr';
  const [status, setStatus] =
    useState<ReturnType<typeof instanceStatusSchema.parse>>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readInstanceStatus(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const parsed = instanceStatusSchema.parse(await response.json());
        if (!controller.signal.aborted) setStatus(parsed);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <SettingsShell active="/settings/models">
      <PageHeader
        title={fr ? t('active-routes.models.agents') : 'Models & agents'}
        copy={
          fr
            ? 'État des workers de cette instance.'
            : 'Worker status for this instance.'
        }
      />
      <section className="co-panel">
        <h2>{fr ? 'Configuration de l’instance' : 'Instance configuration'}</h2>
        <p>
          {fr
            ? 'Les modèles sont configurés par l’administrateur de l’instance. Leur configuration ne peut pas être modifiée depuis cet écran.'
            : 'Models are configured by the instance administrator. Their configuration cannot be changed from this screen.'}
        </p>
        {error ? (
          <p role="alert">
            {fr
              ? 'État des workers indisponible.'
              : 'Worker status unavailable.'}
          </p>
        ) : !status ? (
          <p role="status">{fr ? t('active-routes.loading') : 'Loading…'}</p>
        ) : (
          status.services.map((service) => (
            <div className="co-model-row" key={service.service}>
              <strong>{service.service}</strong>
              <Badge tone={service.status === 'fresh' ? 'ok' : 'warn'}>
                {service.status}
              </Badge>
            </div>
          ))
        )}
        <Link className="co-button quiet" href="/runs">
          {fr ? 'Consulter le journal des agents' : 'View agent run journal'}
        </Link>
      </section>
    </SettingsShell>
  );
}

export function BillingScreen() {
  const t = useTranslations([activeRoutesMessages]);

  const { locale } = useI18n();
  const fr = locale === 'fr';
  return (
    <SettingsShell active="/settings/billing">
      <PageHeader
        title={fr ? t('active-routes.subscription') : 'Subscription'}
      />
      <section className="co-panel">
        <h2>{fr ? 'Facturation indisponible' : 'Billing unavailable'}</h2>
        <p>
          {fr
            ? 'Cette instance ne propose pas de gestion d’abonnement ou de paiement.'
            : 'This instance does not provide subscription or payment management.'}
        </p>
        <Link className="co-button quiet" href="/settings/models">
          {fr ? 'Voir l’instance' : 'View instance'}
        </Link>
      </section>
    </SettingsShell>
  );
}

export function IntegrationsScreen() {
  const t = useTranslations([activeRoutesMessages]);

  const { locale } = useI18n();
  const fr = locale === 'fr';
  return (
    <SettingsShell active="/settings/integrations">
      <PageHeader
        title={fr ? t('active-routes.integrations') : 'Integrations'}
      />
      <section className="co-panel">
        <h2>{fr ? 'Connecteurs non disponibles' : 'Connectors unavailable'}</h2>
        <p>
          {fr
            ? 'Aucun connecteur de compte externe ne peut être configuré ici. Vous pouvez importer vos documents et ajouter des offres depuis leur URL.'
            : 'External account connectors cannot be configured here. You can import documents and add jobs using their URL.'}
        </p>
        <Link className="co-button quiet" href="/memory/import">
          {fr ? 'Importer un document' : 'Import a document'}
        </Link>
        <Link className="co-button quiet" href="/applications">
          {fr ? 'Ajouter une offre' : 'Add a job'}
        </Link>
      </section>
    </SettingsShell>
  );
}

export function PrivacyScreen() {
  const t = useTranslations([activeRoutesMessages]);

  const { locale } = useI18n();
  const fr = locale === 'fr';
  return (
    <SettingsShell active="/settings/privacy">
      <PageHeader
        title={fr ? t('active-routes.evidence.privacy') : 'Evidence privacy'}
        copy={
          fr
            ? 'Contrôlez les preuves dans votre mémoire et les accès à vos pages privées.'
            : 'Control evidence in your memory and access to your private pages.'
        }
      />
      <section className="co-panel">
        <Link className="co-button quiet" href="/memory">
          {fr ? 'Gérer les preuves' : 'Manage evidence'}
        </Link>
        <Link className="co-button quiet" href="/links">
          {fr ? 'Gérer les liens privés' : 'Manage private links'}
        </Link>
      </section>
      <SessionManager />
    </SettingsShell>
  );
}
