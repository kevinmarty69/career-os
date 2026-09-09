'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

import { useI18n } from '@/components/i18n/i18n-provider';
import { SettingsShell } from '@/components/layout/settings-shell';
import { SessionManager } from '@/components/settings/session-manager';
import { PageHeader } from '@/components/ui/primitives';
import { Card, Panel } from '@/components/ui/surfaces';
import { Button, Icon, Mono } from '@/components/ui/controls';
import { SkeletonBlock, useDelayedPending } from '@/components/ui/feedback';
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
  const showSkeleton = useDelayedPending(!status && !error);
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
      <Panel className="co-kit">
        <h2 className="m-0 text-section">
          {fr ? 'Un modèle par étape' : 'A model for each step'}
        </h2>
        <p className="m-0 text-body-sm text-ink-700">
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
          showSkeleton ? (
            <SkeletonBlock />
          ) : null
        ) : (
          <div className="overflow-x-auto rounded-card bg-card">
            <table className="w-full text-left text-label">
              <thead className="bg-panel text-ink-600">
                <tr>
                  <th className="p-4">{fr ? 'Étape' : 'Stage'}</th>
                  <th className="p-4">{fr ? 'Worker' : 'Worker'}</th>
                  <th className="p-4">
                    {fr ? 'Modèle / coût' : 'Model / cost'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {status.services.map((service) => (
                  <tr key={service.service} className="border-b border-panel">
                    <th className="p-4 font-semibold break-words">
                      {service.service}
                    </th>
                    <td className="p-4">
                      <span
                        className={
                          service.status === 'fresh'
                            ? 'text-green-strong'
                            : 'text-amber-strong'
                        }
                      >
                        {service.status === 'fresh'
                          ? fr
                            ? 'Disponible'
                            : 'Available'
                          : service.status === 'stale'
                            ? fr
                              ? 'Signal ancien'
                              : 'Stale heartbeat'
                            : fr
                              ? 'Sans signal'
                              : 'No heartbeat'}
                      </span>
                    </td>
                    <td className="p-4 text-ink-600">
                      {fr
                        ? 'Voir la configuration administrateur'
                        : 'See administrator configuration'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Card padding={18}>
          <div className="flex gap-3 text-body-sm text-ink-700">
            <Icon name="lock" />
            {fr
              ? 'Les permissions des sources restent obligatoires. Cet écran ne modifie ni les modèles, ni les limites de dépenses, ni les autorisations d’envoi.'
              : 'Source permissions remain mandatory. This screen does not change models, spending limits or data-sharing permissions.'}
          </div>
        </Card>
        <Link
          className="text-label font-semibold text-ink-900 underline"
          href="/runs"
        >
          {fr ? 'Consulter le journal des agents' : 'View agent run journal'}
        </Link>
      </Panel>
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
      <div className="co-kit grid gap-4 lg:grid-cols-2">
        <Card padding={24}>
          <div className="flex items-center gap-3">
            <Icon name="dns" size={23} />
            <h2 className="m-0 text-section">
              {fr ? 'Votre instance' : 'Your instance'}
            </h2>
            <Mono className="ml-auto">AGPL-3.0</Mono>
          </div>
          <p className="m-0 text-body-sm text-ink-700">
            {fr
              ? 'Cette instance ne propose pas de gestion d’abonnement ou de paiement.'
              : 'This instance does not provide subscription or payment management.'}
          </p>
          <Link
            className="text-label text-ink-900 underline"
            href="/settings/models"
          >
            {fr ? 'Voir l’instance' : 'View instance'}
          </Link>
          <Link
            className="text-label text-ink-900 underline"
            href="/settings/data"
          >
            {fr ? 'Exporter mes données' : 'Export my data'}
          </Link>
        </Card>
        <Card padding={24} className="!bg-ink-900 text-white">
          <div className="flex items-center gap-3">
            <Icon name="cloud" size={23} />
            <h2 className="m-0 text-section text-white">
              {fr ? 'SaaS hébergé' : 'Managed cloud'}
            </h2>
          </div>
          <p className="m-0 text-body-sm text-white/80">
            {fr
              ? 'L’offre cloud n’est pas activée. Aucun essai payant, abonnement ou prélèvement ne peut être démarré ici.'
              : 'The cloud offer is not enabled. No paid trial, subscription or charge can be started here.'}
          </p>
          <Button disabled>
            {fr ? 'Facturation indisponible' : 'Billing unavailable'}
          </Button>
        </Card>
      </div>
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
      <div className="co-kit grid gap-4 lg:grid-cols-2">
        {[
          [
            'code',
            'GitHub',
            fr
              ? 'Import d’un README public par URL, sans clé. Aucun code privé, issue ou accès organisation ; vous relisez votre contribution avant de l’enregistrer.'
              : 'Import a public README by URL, without a key. No private code, issues or organization access; review your own contribution before saving.',
          ],
          [
            'badge',
            'LinkedIn',
            fr
              ? 'Import local de votre archive ZIP ou de Positions.csv : postes, dates et descriptions uniquement. Ni messages ni contacts. Revue humaine avant enregistrement ; aucune synchronisation de compte.'
              : 'Import your ZIP archive or Positions.csv locally: positions, dates and descriptions only. No messages or contacts. Human review before saving; no account synchronization.',
          ],
          [
            'cloud_upload',
            'Google Drive',
            fr
              ? 'Aucun accès à votre Drive. Téléchargez les documents choisis puis importez-les dans votre mémoire.'
              : 'No access to your Drive. Download the documents you choose, then import them into career memory.',
          ],
          [
            'terminal',
            fr ? 'Clé API personnelle' : 'Personal API key',
            fr
              ? 'La génération de clés personnelles n’est pas disponible. Aucune clé fictive n’est créée et aucune publication automatique n’est autorisée.'
              : 'Personal key generation is unavailable. No sample key is created and automated publication is not permitted.',
          ],
        ].map(([icon, title, description]) => (
          <Card key={title} padding={24}>
            <div className="flex items-center gap-[14px]">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-tile bg-panel">
                <Icon name={icon} size={23} />
              </span>
              <h2 className="m-0 text-section">{title}</h2>
            </div>
            <p className="m-0 text-body-sm text-ink-700">{description}</p>
            <div className="rounded-control bg-panel p-4 text-label text-ink-600">
              {title === 'GitHub'
                ? fr
                  ? 'Public uniquement · revue humaine obligatoire'
                  : 'Public only · human review required'
                : title === 'LinkedIn'
                  ? fr
                    ? 'Local · ZIP, Positions.csv, PDF ou texte'
                    : 'Local · ZIP, Positions.csv, PDF or text'
                  : fr
                    ? 'Non configuré · aucun accès accordé'
                    : 'Not configured · no access granted'}
            </div>
            {icon === 'terminal' ? (
              <Button disabled>{fr ? 'Indisponible' : 'Unavailable'}</Button>
            ) : (
              <Link
                className="text-label text-ink-900 font-semibold underline"
                href="/memory/import"
              >
                {title === 'GitHub'
                  ? fr
                    ? 'Importer un README public'
                    : 'Import a public README'
                  : fr
                    ? 'Importer un document'
                    : 'Import a document'}
              </Link>
            )}
          </Card>
        ))}
      </div>
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
