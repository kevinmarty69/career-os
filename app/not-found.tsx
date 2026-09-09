import { AppShell } from '@/components/layout/app-shell';
import { SystemState } from '@/components/layout/system-state';

export default function NotFound() {
  return (
    <AppShell path="">
      <SystemState kind="not-found" />
    </AppShell>
  );
}
