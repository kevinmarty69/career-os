'use client';

import { DynamicDossierScreen } from '@/components/applications/application-dossier-screen';
import { ApplicationTimelineScreen } from '@/components/applications/application-timeline-screen';
import { VersionsScreen } from '@/components/applications/application-versions-screen';
import { ApplicationsPage } from '@/components/applications/applications-page';
import { CompanyScreen } from '@/components/applications/company-screen';
import { HomeScreen } from '@/components/dashboard/home-screen';
import { InboxScreen } from '@/components/dashboard/inbox-screen';
import { InsightsScreen } from '@/components/dashboard/insights-screen';
import { RunsScreen } from '@/components/dashboard/runs-screen';
import { useI18n } from '@/components/i18n/i18n-provider';
import { MemoryScreen } from '@/components/memory/memory-screen';
import { LinksScreen } from '@/components/publications/links-screen';
import { DataScreen } from '@/components/settings/data-screen';
import {
  BillingScreen,
  IntegrationsScreen,
  ModelsScreen,
  PrivacyScreen,
} from '@/components/settings/service-settings-screen';
import { UnavailableScreen } from '@/components/layout/unavailable-screen';

const unavailableRoutes: Record<string, [string, string, string]> = {
  '/memory/interview': ['Entretien guidé', 'Guided interview', '/memory'],
  '/memory/conflicts': [
    'Conflits entre sources',
    'Source conflicts',
    '/memory',
  ],
  '/memory/skills': ['Compétences', 'Skills', '/memory'],
  '/assets': ['Assets', 'Assets', '/applications'],
  '/messages': ['Messages', 'Messages', '/applications'],
  '/onboarding/hosting': ['Hébergement', 'Hosting', '/settings/models'],
  '/settings/profile': ['Profil', 'Profile', '/memory'],
};

export function KitRoutePage({
  path,
  query,
}: {
  path: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const { locale } = useI18n();
  if (path === '/') return <HomeScreen />;
  if (path === '/memory') return <MemoryScreen />;
  if (path === '/applications') return <ApplicationsPage />;
  if (path === '/applications/new')
    return (
      <ApplicationsPage
        initialImportUrl={typeof query.source === 'string' ? query.source : ''}
      />
    );
  const application = path.match(
    /^\/applications\/([^/]+)(?:\/(run|review|preview|publish|page|published|versions|company|timeline))?$/,
  );
  if (application) {
    const applicationId = application[1];
    if (application[2] === 'versions')
      return (
        <VersionsScreen key={applicationId} applicationId={applicationId} />
      );
    if (application[2] === 'company')
      return (
        <CompanyScreen key={applicationId} applicationId={applicationId} />
      );
    if (application[2] === 'timeline')
      return (
        <ApplicationTimelineScreen
          key={applicationId}
          applicationId={applicationId}
        />
      );
    return (
      <DynamicDossierScreen key={applicationId} applicationId={applicationId} />
    );
  }
  if (path === '/links') return <LinksScreen />;
  if (path === '/insights') return <InsightsScreen />;
  if (path === '/runs') return <RunsScreen />;
  if (path === '/inbox') return <InboxScreen />;
  if (path === '/settings/models') return <ModelsScreen />;
  if (path === '/settings/privacy') return <PrivacyScreen />;
  if (path === '/settings/billing') return <BillingScreen />;
  if (path === '/settings/integrations') return <IntegrationsScreen />;
  if (path === '/settings/data') return <DataScreen />;
  const unavailable = unavailableRoutes[path];
  if (unavailable)
    return (
      <UnavailableScreen
        path={path}
        title={unavailable[locale === 'fr' ? 0 : 1]}
        href={unavailable[2]}
      />
    );
  if (/^\/interviews\/[^/]+(?:\/debrief)?$/.test(path))
    return (
      <UnavailableScreen
        path={path}
        title={locale === 'fr' ? 'Entretiens' : 'Interviews'}
        href="/applications"
      />
    );
  return (
    <UnavailableScreen
      path={path}
      title={locale === 'fr' ? 'Page introuvable' : 'Page not found'}
      href="/"
    />
  );
}
