'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { demoMessages } from '@/lib/i18n/dictionaries/demo';

import { AppShell } from '@/components/layout/app-shell';
import Link from 'next/link';
import { Icon, PageHeader } from '@/components/ui/primitives';
import { CareerMemoryOverview } from '@/components/memory/career-memory-overview';
import { memoryOverviewMessages } from '@/lib/i18n/dictionaries/memory-overview';

export function MemoryScreen() {
  const t = useTranslations([
    memoryMessages,
    activeRoutesMessages,
    demoMessages,
    memoryOverviewMessages,
  ]);

  return (
    <AppShell
      path="/memory"
      sidebarContext={
        <>
          <p className="co-nav-label">{t('memory.career.memory')}</p>
          <div className="co-sidebar-sources">
            <Link href="/memory/import">
              <Icon>upload_file</Icon>
              <span>{t('memory.import.a.source')}</span>
            </Link>
            <Link href="/memory/interview">
              <Icon>record_voice_over</Icon>
              <span>{t('active-routes.guided.interview')}</span>
            </Link>
            <Link href="/memory/audit">
              <Icon>fact_check</Icon>
              <span>{t('memory.positioning.audit')}</span>
            </Link>
          </div>
        </>
      }
      sidebarFooter={
        <div className="co-sidebar-card">
          <strong>{t('memory.your.data.your.rules')}</strong>
          <span>
            {t(
              'memory.every.claim.keeps.its.source.sensitivity.and.allowed.uses',
            )}{' '}
          </span>
          <Link className="co-button" href="/memory/import">
            {t('active-routes.add.source')}{' '}
          </Link>
        </div>
      }
    >
      <PageHeader
        title={t('demo.career.memory')}
        copy={t('memory.overview.copy')}
        actions={
          <Link className="co-button" href="/memory/import">
            <Icon>upload_file</Icon>
            {t('memory.overview.import')}
          </Link>
        }
      />
      <CareerMemoryOverview />
    </AppShell>
  );
}
