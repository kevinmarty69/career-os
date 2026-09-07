'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import {
  CheckGroup,
  ListField,
  SectionHeading,
} from '@/components/search-profiles/profile-fields';
import styles from '@/components/search-profiles/search-profiles.module.css';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { type SearchProfileFields } from '@/lib/search-profile';

export function HardConstraints({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const t = useTranslations([searchProfilesMessages, applicationsMessages]);
  const setHard = <Key extends keyof SearchProfileFields['hardConstraints']>(
    key: Key,
    value: SearchProfileFields['hardConstraints'][Key],
  ) =>
    onChange({
      ...draft,
      hardConstraints: { ...draft.hardConstraints, [key]: value },
    });
  return (
    <section className={`${styles.criteria} ${styles.hard}`}>
      <SectionHeading
        icon="block"
        label={t('search-profiles.required.constraints')}
        copy={t(
          'search-profiles.a.confirmed.mismatch.blocks.a.priority.recommendation.missing.information',
        )}
        badge={t('search-profiles.blocking')}
      />
      <div className={styles.fieldGrid}>
        <ListField
          label={t('search-profiles.roles')}
          value={draft.hardConstraints.roles}
          onChange={(value) => setHard('roles', value)}
          placeholder="Product Engineer, Software Engineer"
        />
        <ListField
          label={t('search-profiles.seniority.levels')}
          value={draft.hardConstraints.seniorities}
          onChange={(value) => setHard('seniorities', value)}
          placeholder="Senior, Staff"
        />
        <ListField
          label={t('search-profiles.locations')}
          value={draft.hardConstraints.locations}
          onChange={(value) => setHard('locations', value)}
          placeholder="France, Paris, Europe"
        />
        <ListField
          label={t('search-profiles.time.zones')}
          value={draft.hardConstraints.timezones}
          onChange={(value) => setHard('timezones', value)}
          placeholder="Europe/Paris, UTC+1"
        />
        <ListField
          label={t('search-profiles.working.languages')}
          value={draft.hardConstraints.languages}
          onChange={(value) => setHard('languages', value)}
          placeholder={t('search-profiles.french.english')}
        />
        <CheckGroup
          label={t('search-profiles.work.mode')}
          options={[
            ['remote', t('applications.remote')],
            ['hybrid', t('applications.hybrid')],
            ['onsite', t('applications.on.site')],
          ]}
          value={draft.hardConstraints.remoteModes}
          onChange={(value) =>
            setHard(
              'remoteModes',
              value as SearchProfileFields['hardConstraints']['remoteModes'],
            )
          }
        />
        <CheckGroup
          label={t('search-profiles.contracts')}
          options={[
            ['permanent', t('search-profiles.contract.permanent')],
            ['fixed-term', t('search-profiles.contract.fixed.term')],
            ['freelance', t('search-profiles.contract.freelance')],
            ['internship', t('applications.internship')],
          ]}
          value={draft.hardConstraints.contractTypes}
          onChange={(value) =>
            setHard(
              'contractTypes',
              value as SearchProfileFields['hardConstraints']['contractTypes'],
            )
          }
        />
        <div className={styles.salary}>
          <span>{t('search-profiles.minimum.annual.salary')}</span>
          <div>
            <input
              aria-label={t('search-profiles.minimum.salary')}
              inputMode="numeric"
              min="1"
              onChange={(event) => {
                const amount = Number(event.target.value);
                setHard(
                  'minimumSalary',
                  event.target.value && Number.isFinite(amount) && amount > 0
                    ? {
                        amount,
                        currency:
                          draft.hardConstraints.minimumSalary?.currency ??
                          'EUR',
                      }
                    : undefined,
                );
              }}
              placeholder="80000"
              type="number"
              value={draft.hardConstraints.minimumSalary?.amount ?? ''}
            />
            <select
              aria-label={t('search-profiles.minimum.salary.currency')}
              onChange={(event) => {
                const current = draft.hardConstraints.minimumSalary;
                if (current)
                  setHard('minimumSalary', {
                    ...current,
                    currency: event.target.value as 'EUR' | 'USD' | 'GBP',
                  });
              }}
              value={draft.hardConstraints.minimumSalary?.currency ?? 'EUR'}
            >
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SoftPreferences({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const t = useTranslations([searchProfilesMessages, applicationsMessages]);
  const setSoft = <Key extends keyof SearchProfileFields['softPreferences']>(
    key: Key,
    value: string[],
  ) =>
    onChange({
      ...draft,
      softPreferences: { ...draft.softPreferences, [key]: value },
    });
  return (
    <section className={`${styles.criteria} ${styles.soft}`}>
      <SectionHeading
        icon="sort"
        label={t('search-profiles.preferences')}
        copy={t(
          'search-profiles.they.improve.ranking.but.never.rule.out.a.job',
        )}
        badge={t('search-profiles.ranking')}
      />
      <div className={styles.fieldGrid}>
        <ListField
          label="Stack"
          value={draft.softPreferences.stacks}
          onChange={(value) => setSoft('stacks', value)}
          placeholder="TypeScript, Python, PostgreSQL"
        />
        <ListField
          label={t('search-profiles.industries')}
          value={draft.softPreferences.sectors}
          onChange={(value) => setSoft('sectors', value)}
          placeholder={t('search-profiles.b2b.saas.productivity')}
        />
        <ListField
          label={t('search-profiles.product.types')}
          value={draft.softPreferences.productTypes}
          onChange={(value) => setSoft('productTypes', value)}
          placeholder="Developer tools, Applied AI"
        />
        <ListField
          label={t('search-profiles.company.size')}
          value={draft.softPreferences.companySizes}
          onChange={(value) => setSoft('companySizes', value)}
          placeholder="Startup, scale-up"
        />
        <ListField
          label={t('search-profiles.culture.and.autonomy')}
          value={draft.softPreferences.cultures}
          onChange={(value) => setSoft('cultures', value)}
          placeholder={t('search-profiles.ownership.product.team')}
        />
      </div>
    </section>
  );
}

export function Exclusions({
  draft,
  onChange,
}: {
  draft: SearchProfileFields;
  onChange: (next: SearchProfileFields) => void;
}) {
  const t = useTranslations([searchProfilesMessages, applicationsMessages]);
  const setHard = (
    key: 'excludedCompanies' | 'excludedNetworks',
    value: string[],
  ) =>
    onChange({
      ...draft,
      hardConstraints: { ...draft.hardConstraints, [key]: value },
    });
  return (
    <section className={`${styles.criteria} ${styles.exclusions}`}>
      <SectionHeading
        icon="visibility_off"
        label={t('search-profiles.confidential.exclusions')}
        copy={t(
          'search-profiles.these.rules.stay.in.your.workspace.and.prevent.a',
        )}
        badge={t('search-profiles.private')}
      />
      <div className={styles.fieldGrid}>
        <ListField
          label={t('search-profiles.companies.to.avoid')}
          value={draft.hardConstraints.excludedCompanies}
          onChange={(value) => setHard('excludedCompanies', value)}
          placeholder={t('search-profiles.company.a.company.b')}
        />
        <ListField
          label={t('search-profiles.networks.to.avoid')}
          value={draft.hardConstraints.excludedNetworks}
          onChange={(value) => setHard('excludedNetworks', value)}
          placeholder={t('search-profiles.founder.network.former.employer')}
        />
      </div>
    </section>
  );
}
