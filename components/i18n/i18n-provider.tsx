'use client';

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  localeCookieName,
  type Locale,
} from '@/lib/i18n/locale';
import { translateMessage, type MessageDictionary } from '@/lib/i18n/messages';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: ReactNode;
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

const translatedProps = new Set([
  'aria-label',
  'placeholder',
  'title',
  'alt',
  'action',
  'badge',
  'copy',
  'description',
  'eyebrow',
  'label',
  'message',
  'source',
  'sub',
  'text',
  'value',
]);

const translatedNodeProps = new Set(['action', 'actions', 'headers', 'rows']);

export function Localized({
  children,
  dictionaries,
}: {
  children: ReactNode;
  dictionaries: readonly MessageDictionary[];
}) {
  const { locale } = useI18n();
  return locale === 'fr' ? children : translateNode(children, dictionaries);
}

export function useLocalizer(dictionaries: readonly MessageDictionary[]) {
  const { locale } = useI18n();
  return (children: ReactNode) =>
    locale === 'fr' ? children : translateNode(children, dictionaries);
}

function translateNode(
  node: ReactNode,
  dictionaries: readonly MessageDictionary[],
): ReactNode {
  if (typeof node === 'string') return translateText(node, dictionaries);
  if (Array.isArray(node))
    return node.map((child) => translateNode(child, dictionaries));
  if (!isValidElement<Record<string, unknown>>(node)) return node;

  const props = { ...node.props };
  for (const prop of translatedProps) {
    if (typeof props[prop] === 'string')
      props[prop] = translateText(props[prop], dictionaries);
  }
  for (const prop of translatedNodeProps) {
    if (prop in props)
      props[prop] = translateNode(props[prop] as ReactNode, dictionaries);
  }
  if ('children' in props)
    props.children = Children.map(props.children as ReactNode, (child) =>
      translateNode(child, dictionaries),
    );
  return cloneElement(node as ReactElement<Record<string, unknown>>, props);
}

function translateText(
  source: string,
  dictionaries: readonly MessageDictionary[],
) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  const message = source.trim().replace(/\s+/g, ' ');
  if (!message) return source;
  const translated = translateMessage(dictionaries, message);
  return translated === message ? source : `${leading}${translated}${trailing}`;
}
