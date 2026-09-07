import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Geist_Mono, Instrument_Sans } from 'next/font/google';
import { I18nProvider } from '@/components/i18n/i18n-provider';
import { localeCookieName, resolveLocale } from '@/lib/i18n/locale';
import './globals.css';

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Career OS',
  description: 'Turn your real work into evidence-backed applications.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(localeCookieName)?.value);
  return (
    <html className={`${sans.variable} ${mono.variable}`} lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
