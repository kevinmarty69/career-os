'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

import { useI18n } from '@/components/i18n/i18n-provider';
import { SettingsShell } from '@/components/layout/settings-shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { deleteWorkspace, exportWorkspace } from '@/lib/career-api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DataScreen() {
  const t = useTranslations([activeRoutesMessages]);

  const router = useRouter();
  const { locale } = useI18n();
  const [exportState, setExportState] = useState<
    'ready' | 'pending' | 'done' | 'error'
  >('ready');
  const [deleteState, setDeleteState] = useState<'ready' | 'pending' | 'error'>(
    'ready',
  );
  const [confirmation, setConfirmation] = useState('');
  const deletionConfirmation = locale === 'fr' ? 'SUPPRIMER' : 'DELETE';

  async function downloadExport() {
    if (exportState === 'pending') return;
    setExportState('pending');
    try {
      const response = await exportWorkspace();
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers
          .get('content-disposition')
          ?.match(/filename="([^"]+)"/)?.[1] ?? 'careeros-export.ndjson';
      link.click();
      URL.revokeObjectURL(url);
      setExportState('done');
    } catch {
      setExportState('error');
    }
  }

  async function removeWorkspace() {
    if (confirmation !== deletionConfirmation || deleteState === 'pending')
      return;
    setDeleteState('pending');
    try {
      const response = await deleteWorkspace(deletionConfirmation);
      if (!response.ok) throw new Error();
      router.replace('/sign-in');
      router.refresh();
    } catch {
      setDeleteState('error');
    }
  }

  return (
    <SettingsShell active="/settings/data">
      <PageHeader
        title={t('active-routes.export.deletion')}
        copy={t('active-routes.your.data.belongs.to.you.in.a.format.readable')}
      />
      <div className="co-data-layout">
        <section className="co-data-main">
          <section className="co-export-card">
            <div>
              <Icon>download</Icon>
              <h2>{t('active-routes.export.everything')}</h2>
              <code>NDJSON</code>
            </div>
            <div className="co-export-checks">
              {[
                t('active-routes.career.memory.and.evidence'),
                t('active-routes.source.documents'),
                t('active-routes.applications.and.publications'),
                t('active-routes.agent.runs.and.logs'),
              ].map((item) => (
                <label key={item}>
                  <Icon>check_circle</Icon>
                  {item}
                </label>
              ))}
            </div>
            <footer>
              <span>
                {locale === 'fr'
                  ? 'Export versionné et réimportable'
                  : 'Versioned, re-importable export'}
              </span>
              <Button
                disabled={exportState === 'pending'}
                onClick={() => void downloadExport()}
              >
                {exportState === 'pending'
                  ? locale === 'fr'
                    ? 'Préparation…'
                    : 'Preparing…'
                  : t('active-routes.generate.archive')}
              </Button>
            </footer>
          </section>
          {exportState === 'done' ? (
            <div className="co-note ok" role="status">
              <Icon>download_done</Icon>
              {t('active-routes.export.downloaded')}{' '}
            </div>
          ) : exportState === 'error' ? (
            <div className="co-note crit" role="alert">
              <Icon>error</Icon>
              {t('active-routes.export.failed.sign.in.again.then.retry')}{' '}
            </div>
          ) : null}
          <div className="co-note">
            <Icon>verified</Icon>
            {t(
              'active-routes.every.exported.claim.keeps.its.evidence.links.and.original',
            )}{' '}
          </div>
        </section>
        <aside className="co-data-side">
          <section className="co-delete-card">
            <header>
              <Icon>delete_forever</Icon>
              <h2>{t('active-routes.delete.my.account')}</h2>
            </header>
            <p>
              {t(
                'active-routes.deletes.career.memory.applications.runs.and.private.links.links',
              )}{' '}
            </p>
            <div>
              <strong>{t('active-routes.what.will.be.deleted')}</strong>
              <ul>
                <li>
                  {t('active-routes.career.memory.evidence.and.documents')}
                </li>
                <li>{t('active-routes.applications.and.versions')}</li>
                <li>{t('active-routes.private.links.and.their.sessions')}</li>
                <li>{t('active-routes.agent.runs.and.logs')}</li>
              </ul>
            </div>
            <input
              aria-label={`${locale === 'fr' ? 'Tapez' : 'Type'} ${deletionConfirmation} ${locale === 'fr' ? 'pour confirmer' : 'to confirm'}`}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`${locale === 'fr' ? 'tapez' : 'type'} ${deletionConfirmation} ${locale === 'fr' ? 'pour confirmer' : 'to confirm'}`}
              value={confirmation}
            />
            <Button
              danger
              disabled={
                confirmation !== deletionConfirmation ||
                deleteState === 'pending'
              }
              onClick={() => void removeWorkspace()}
            >
              {deleteState === 'pending'
                ? locale === 'fr'
                  ? 'Suppression…'
                  : 'Deleting…'
                : t('active-routes.delete.permanently')}
            </Button>
            {deleteState === 'error' ? (
              <p role="alert">
                {t(
                  'active-routes.deletion.failed.sign.in.again.then.retry',
                )}{' '}
              </p>
            ) : null}
            <p>
              {t(
                'active-routes.there.is.no.grace.period.or.trash.deletion.is',
              )}{' '}
            </p>
          </section>
        </aside>
      </div>
    </SettingsShell>
  );
}
