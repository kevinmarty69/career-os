import type { Metadata } from 'next';
import { PrivatePublication } from '@/components/private-publication';

export const metadata: Metadata = {
  title: 'Private application · Career OS',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function PrivatePage() {
  return <PrivatePublication />;
}
