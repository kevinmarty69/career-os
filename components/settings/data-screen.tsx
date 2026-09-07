'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { SettingsShell } from '@/components/layout/settings-shell';
import { Button, Icon, PageHeader } from '@/components/ui/primitives';
import { deleteWorkspace, exportWorkspace } from '@/lib/career-api';
import { operationalMessages } from '@/lib/i18n/dictionaries/operational';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DataScreen() {
  const t = useTranslations([operationalMessages]);
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
      if (!response.ok) throw new Error('Export failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers
          .get('content-disposition')
          ?.match(/filename="([^"]+)"/)?.[1] ?? 'career-os-export.ndjson';
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
      if (!response.ok) throw new Error('Deletion failed.');
      router.replace('/sign-in');
      router.refresh();
    } catch {
      setDeleteState('error');
    }
  }

  const exportRows = [
    ['fact_check', t('operations.data.export.claims')],
    ['folder_open', t('operations.data.export.sources')],
    ['work', t('operations.data.export.applications')],
    ['history', t('operations.data.export.runs')],
  ] as const;

  return (
    <SettingsShell active="/settings/data">
      <div className="co-data-screen">
        <PageHeader
          title={t('operations.data.title')}
          copy={t('operations.data.description')}
        />
        <section className="co-data-layout">
          <div className="co-data-main">
            <section className="co-export-card">
              <header>
                <span>
                  <Icon>archive</Icon>
                </span>
                <div>
                  <p>{t('operations.data.export.format')}</p>
                  <h2>{t('operations.data.export.title')}</h2>
                  <span>{t('operations.data.export.description')}</span>
                </div>
              </header>
              <div
                className="co-export-tree"
                aria-label={t('operations.data.inventory.title')}
              >
                {exportRows.map(([icon, label]) => (
                  <div key={label}>
                    <Icon>{icon}</Icon>
                    <span>{label}</span>
                    <Icon>check_circle</Icon>
                  </div>
                ))}
              </div>
              <div className="co-export-integrity">
                <Icon>verified_user</Icon>
                <div>
                  <strong>{t('operations.data.inventory.title')}</strong>
                  <p>{t('operations.data.inventory.note')}</p>
                </div>
              </div>
              <footer>
                <Button
                  disabled={exportState === 'pending'}
                  onClick={() => void downloadExport()}
                >
                  <Icon>download</Icon>
                  {exportState === 'pending'
                    ? t('operations.data.export.preparing')
                    : t('operations.data.export.download')}
                </Button>
                {exportState === 'done' ? (
                  <span className="is-success" role="status">
                    <Icon>check_circle</Icon>
                    {t('operations.data.export.done')}
                  </span>
                ) : null}
                {exportState === 'error' ? (
                  <span className="is-error" role="alert">
                    <Icon>error</Icon>
                    {t('operations.data.export.error')}
                  </span>
                ) : null}
              </footer>
            </section>
          </div>
          <aside className="co-data-side">
            <section className="co-delete-card">
              <header>
                <span>
                  <Icon>delete_forever</Icon>
                </span>
                <div>
                  <p>{t('operations.data.delete.warning.label')}</p>
                  <h2>{t('operations.data.delete.title')}</h2>
                </div>
              </header>
              <p>{t('operations.data.delete.description')}</p>
              <ul>
                {[
                  t('operations.data.delete.list.memory'),
                  t('operations.data.delete.list.applications'),
                  t('operations.data.delete.list.links'),
                  t('operations.data.delete.list.runs'),
                ].map((label) => (
                  <li key={label}>
                    <Icon>close</Icon>
                    {label}
                  </li>
                ))}
              </ul>
              <div className="co-delete-warning">
                <Icon>warning</Icon>
                <p>{t('operations.data.delete.warning')}</p>
              </div>
              <label>
                {t('operations.data.delete.confirm', {
                  confirmation: deletionConfirmation,
                })}
                <input
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                  value={confirmation}
                />
              </label>
              <Button
                danger
                disabled={
                  confirmation !== deletionConfirmation ||
                  deleteState === 'pending'
                }
                onClick={() => void removeWorkspace()}
              >
                {deleteState === 'pending'
                  ? t('operations.data.delete.pending')
                  : t('operations.data.delete.action')}
              </Button>
              {deleteState === 'error' ? (
                <p className="co-data-error" role="alert">
                  {t('operations.data.delete.error')}
                </p>
              ) : null}
            </section>
          </aside>
        </section>
      </div>
    </SettingsShell>
  );
}
