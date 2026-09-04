import type { Metadata } from 'next';
import { MemoryImportFlow } from '@/components/memory/memory-import-flow';

export const metadata: Metadata = {
  title: 'Importer une source | Career OS',
  description:
    'Importez et relisez localement les informations qui alimentent votre mémoire professionnelle.',
  icons: {
    icon: '/brand/favicon/favicon.svg',
    apple: '/brand/favicon/apple-touch-icon.svg',
  },
};

export default function MemoryImportPage() {
  return <MemoryImportFlow />;
}
