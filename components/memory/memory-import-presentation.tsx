'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import type { ReactNode } from 'react';
import type { Translator } from '@/lib/i18n/messages';
import type { useMemoryImport } from './use-memory-import';

export type MemoryImportController = ReturnType<typeof useMemoryImport>;

export function Icon({
  children,
  className = '',
}: {
  children: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`${styles.icon} ${className}`}>
      {children}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  accessibleTitle,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  accessibleTitle?: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeading}>
      <div>
        <p>{eyebrow}</p>
        <h1 aria-label={accessibleTitle}>{title}</h1>
        <span>{copy}</span>
      </div>
      {action ? <div className={styles.headingAction}>{action}</div> : null}
    </header>
  );
}

export function ErrorBanner({
  message,
}: {
  message: keyof typeof memoryMessages | '';
}) {
  const t = useTranslations([memoryMessages]);
  if (!message) return null;
  return (
    <div className={styles.error} role="alert">
      <Icon>error</Icon>
      <span>{t(message)}</span>
    </div>
  );
}

export function importLabels(t: Translator<typeof memoryMessages>) {
  const importCandidateGroupLabels = {
    summary: t('memory.profile.and.summary'),
    experience: t('memory.experience'),
    project: t('memory.project'),
    skill: t('memory.skill'),
    education: t('memory.education'),
    result: t('memory.result'),
    other: t('memory.other.information'),
  } as const;
  const allowedUseLabels = {
    application: t('memory.applications'),
    resume: t('memory.resume'),
    linkedin: t('memory.linkedin'),
    interview: t('memory.interviews'),
  } as const;
  const sensitivityLabels = {
    public: t('memory.public.2'),
    private: t('memory.private'),
    restricted: t('memory.restricted'),
  } as const;
  const provenanceLabels = {
    declared: t('memory.declared.by.you'),
    inferred: t('memory.inferred.needs.confirmation'),
    unsupported: t('memory.unsupported.2'),
  } as const;
  return {
    importCandidateGroupLabels,
    allowedUseLabels,
    sensitivityLabels,
    provenanceLabels,
  };
}
