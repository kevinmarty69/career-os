/* eslint-disable @next/next/no-page-custom-font -- the root App Router layout applies this kit font globally */
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { I18nProvider } from '@/components/i18n/i18n-provider';
import { localeCookieName, resolveLocale } from '@/lib/i18n/locale';
import './globals.css';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
