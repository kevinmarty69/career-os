import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Geist_Mono, Instrument_Sans, Space_Grotesk } from 'next/font/google';
import { I18nProvider } from '@/components/i18n/i18n-provider';
import { localeCookieName, resolveLocale } from '@/lib/i18n/locale';
import './globals.css';
import './styles/layout.css';
import './styles/workspace.css';
import './styles/publication.css';
import './styles/auth.css';
import './design-system.css';

const sans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-mono',
  display: 'swap',
});

const wordmark = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-wordmark',
  display: 'swap',
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
    <html
      className={`${sans.variable} ${mono.variable} ${wordmark.variable}`}
      lang={locale}
    >
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
