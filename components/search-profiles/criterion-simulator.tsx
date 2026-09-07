'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { SectionHeading } from '@/components/search-profiles/profile-fields';
import styles from '@/components/search-profiles/search-profiles.module.css';
import { Icon } from '@/components/ui/primitives';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import {
  type PreviewCriterion,
  type SearchProfileFields,
  evaluateSearchCriterion,
} from '@/lib/search-profile';
import { useMemo, useState } from 'react';

export function CriterionSimulator({
  hard,
}: {
  hard: SearchProfileFields['hardConstraints'];
}) {
  const t = useTranslations([searchProfilesMessages]);
  const criterionOptions: Array<[PreviewCriterion, string]> = [
    ['role', t('search-profiles.role')],
    ['seniority', t('search-profiles.seniority')],
    ['location', t('search-profiles.location')],
    ['remoteMode', t('search-profiles.work.mode')],
    ['timezone', t('search-profiles.time.zone')],
    ['language', t('search-profiles.language')],
    ['contractType', t('search-profiles.contract')],
    ['salary', t('search-profiles.salary')],
    ['company', t('search-profiles.excluded.company')],
    ['network', t('search-profiles.excluded.network')],
  ];
  const [criterion, setCriterion] = useState<PreviewCriterion>('role');
  const [value, setValue] = useState('');
  const result = useMemo(
    () => evaluateSearchCriterion(hard, criterion, value),
    [hard, criterion, value],
  );
  const stateCopy = {
    compatible: t('search-profiles.compatible'),
    blocked: t('search-profiles.blocked'),
    unknown: t('search-profiles.unknown'),
  }[result.state];
  return (
    <section className={styles.simulator}>
      <SectionHeading
        icon="rule"
        label={t('search-profiles.test.a.job')}
        copy={t(
          'search-profiles.check.the.exact.effect.of.a.value.before.saving',
        )}
        badge={t('search-profiles.preview')}
      />
      <div className={styles.simulatorFields}>
        <label>
          <span>{t('search-profiles.criterion')}</span>
          <select
            aria-label={t('search-profiles.criterion.to.test')}
            value={criterion}
            onChange={(event) => {
              setCriterion(event.target.value as PreviewCriterion);
              setValue('');
            }}
          >
            {criterionOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('search-profiles.value.found.in.the.job')}</span>
          <input
            aria-label={t('search-profiles.job.value')}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              criterion === 'salary'
                ? 'Ex. 85000 EUR'
                : t('search-profiles.leave.blank.if.it.is.missing')
            }
            value={value}
          />
        </label>
        <output
          className={`${styles.preview} ${styles[result.state]}`}
          aria-live="polite"
        >
          <strong>
            <Icon>
              {result.state === 'compatible'
                ? 'check_circle'
                : result.state === 'blocked'
                  ? 'block'
                  : 'help'}
            </Icon>
            {stateCopy}
          </strong>
          <span>{result.explanation}</span>
          {result.state === 'unknown' ? (
            <small>{t('search-profiles.unknown.never.means.rejected')}</small>
          ) : null}
        </output>
      </div>
    </section>
  );
}
