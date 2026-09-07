'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  localeCookieName,
  type Locale,
} from '@/lib/i18n/locale';
import { createTranslator, type MessageDictionary } from '@/lib/i18n/messages';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children?: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((nextLocale: Locale) => {
    updateLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider.');
  return context;
}

export function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  return (
    <div
      aria-label={locale === 'en' ? 'Language' : 'Langue'}
      className={`co-locale-switch${compact ? ' compact' : ''}`}
      role="group"
    >
      {(['en', 'fr'] as const).map((candidate) => (
        <button
          aria-pressed={locale === candidate}
          className={locale === candidate ? 'active' : ''}
          key={candidate}
          onClick={() => setLocale(candidate)}
          type="button"
        >
          {candidate.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function useTranslations<const D extends readonly MessageDictionary[]>(
  dictionaries: D,
) {
  const { locale } = useI18n();
  return createTranslator(locale, dictionaries);
}
