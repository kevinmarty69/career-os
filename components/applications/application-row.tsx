'use client';

import styles from '@/components/applications/applications-page.module.css';
import { formatDate } from '@/components/applications/opportunity-labels';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import { type Application } from '@/lib/application-contract';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { initials } from '@/lib/initials';
import Link from 'next/link';

export function ApplicationRow({ application }: { application: Application }) {
  const { locale } = useI18n();
  const t = useTranslations([applicationsMessages]);
  const stage = {
    draft: t('applications.draft'),
    applied: t('applications.sent'),
    interview: t('applications.interview'),
    offer: t('applications.offer.received'),
    closed: t('applications.closed.2'),
  }[application.stage];
  return (
    <Link
      className={styles.applicationRow}
      href={`/applications/${application.applicationId}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(application.company)}
      </div>
      <div>
        <small>{application.company}</small>
        <strong>{application.role}</strong>
      </div>
      <span className={styles.stage}>{stage}</span>
      <time dateTime={application.updatedAt}>
        {formatDate(application.updatedAt, locale)}
      </time>
      <Icon>chevron_right</Icon>
    </Link>
  );
}
