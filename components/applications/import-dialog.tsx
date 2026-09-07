'use client';

import styles from '@/components/applications/applications-page.module.css';
import { importError } from '@/components/applications/opportunity-labels';
import { useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { useDialogFocus } from '@/components/use-dialog-focus';
import { importOpportunity } from '@/lib/career-api';
import {
  type DiscoveredJob,
  opportunityImportResponseSchema,
} from '@/lib/discovered-job-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { useState } from 'react';

export function ImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (opportunity: DiscoveredJob) => void;
}) {
  const t = useTranslations([applicationsMessages]);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const dialog = useDialogFocus<HTMLElement>(onClose, submitting);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const controller = new AbortController();
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await importOpportunity(url, controller.signal);
      if (!response.ok) throw new Error(importError(t, response.status));
      const imported = opportunityImportResponseSchema.parse(
        await response.json(),
      );
      onImported(imported.opportunity);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('applications.import.failed'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialog}
        role="dialog"
      >
        <header>
          <span>
            <Icon>add_link</Icon>
          </span>
          <div>
            <p>{t('applications.new.opportunity')}</p>
            <h2 id="import-title">{t('applications.paste.a.job.url')}</h2>
          </div>
          <button
            aria-label={t('applications.close')}
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <Icon>close</Icon>
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>{t('applications.job.url')}</span>
            <input
              data-dialog-initial-focus
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
              type="url"
              value={url}
            />
          </label>
          <p>{t('applications.the.job.will.be.fetched.and.saved.with.its')} </p>
          {error ? (
            <div className={styles.dialogError} role="alert">
              <Icon>error</Icon>
              {error}
            </div>
          ) : null}
          <footer>
            <button
              className="co-button quiet"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              {t('applications.cancel')}{' '}
            </button>
            <button
              className="co-button"
              disabled={submitting || !url.trim()}
              type="submit"
            >
              {submitting
                ? t('applications.reading.job')
                : t('applications.import.job')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
