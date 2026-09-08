'use client';

import { SystemState } from '@/components/handoff/system-state';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="p-6">
      <SystemState kind="error" retry={retry} digest={error.digest} />
    </main>
  );
}
