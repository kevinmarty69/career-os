import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { MemoryImportFlow } from '@/components/memory/memory-import-flow';
import { localeCookieName, resolveLocale } from '@/lib/i18n/locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(localeCookieName)?.value);
  return {
    title:
      locale === 'fr'
        ? 'Importer une source | Career OS'
        : 'Import a source | Career OS',
    description:
      locale === 'fr'
        ? 'Importez et relisez localement les informations qui alimentent votre mémoire professionnelle.'
        : 'Import and review locally the information that powers your career memory.',
    icons: {
      icon: '/brand/favicon/favicon.svg',
      apple: '/brand/favicon/apple-touch-icon.svg',
    },
  };
}

export default function MemoryImportPage() {
  return <MemoryImportFlow />;
}
