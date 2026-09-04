export const supportedLocales = ['en', 'fr'] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'en';
export const localeCookieName = 'career-os-locale';

export function resolveLocale(value: string | null | undefined): Locale {
  if (!value) return defaultLocale;
  const normalized = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return normalized === 'fr' ? 'fr' : defaultLocale;
}
