'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import styles from '@/components/search-profiles/search-profiles.module.css';
import { Icon } from '@/components/ui/primitives';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';

export function SectionHeading({
  icon,
  label,
  copy,
  badge,
}: {
  icon: string;
  label: string;
  copy: string;
  badge: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <span>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <h2>{label}</h2>
        <p>{copy}</p>
      </div>
      <b>{badge}</b>
    </header>
  );
}

export function ListField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const t = useTranslations([searchProfilesMessages]);
  return (
    <label className={styles.listField}>
      <span>{label}</span>
      <input
        aria-label={label}
        onChange={(event) => onChange(parseList(event.target.value))}
        placeholder={placeholder}
        value={value.join(', ')}
      />
      <small>{t('search-profiles.separate.values.with.commas')}</small>
    </label>
  );
}

export function CheckGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<[string, string]>;
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className={styles.checkGroup}>
      <legend>{label}</legend>
      <div>
        {options.map(([key, copy]) => (
          <label key={key}>
            <input
              checked={value.includes(key)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, key]
                    : value.filter((item) => item !== key),
                )
              }
              type="checkbox"
            />
            <span>{copy}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function parseList(value: string) {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase('fr');
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
