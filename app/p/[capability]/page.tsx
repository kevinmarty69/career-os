import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PrivatePublication } from '@/components/private-publication';
import { localeCookieName, resolveLocale } from '@/lib/i18n/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(localeCookieName)?.value);
  return {
    title:
      locale === 'fr'
        ? 'Candidature privée · Career OS'
        : 'Private application · Career OS',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export default function PrivatePage() {
  return <PrivatePublication />;
}
