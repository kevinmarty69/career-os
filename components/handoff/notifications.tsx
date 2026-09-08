'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { dashboardActions } from '@/lib/dashboard-priority';
import {
  Drawer,
  SkeletonBlock,
  useDelayedPending,
} from '@/components/feedback';
import { Button, Icon, Overline } from '@/components/ui';
import { Card } from '@/components/shell';

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="icon"
        aria-label="Notifications"
        icon="notifications"
        onClick={() => setOpen(true)}
      />
      {open && <Notifications onClose={() => setOpen(false)} />}
    </>
  );
}

function Notifications({ onClose }: { onClose: () => void }) {
  const fr = useI18n().locale === 'fr';
  const { dashboard, error, refresh } = useWorkflowDashboard();
  const showSkeleton = useDelayedPending(!dashboard && !error);
  const decisions = dashboardActions(dashboard?.items ?? []).filter((item) =>
    ['review', 'decision', 'recover'].includes(item.kind),
  );
  const publications = (dashboard?.publications ?? [])
    .filter((item) => item.lastOpenedAt)
    .sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!))
    .slice(0, 8);
  return (
    <Drawer
      open
      width={420}
      title="Notifications"
      onClose={onClose}
      subtitle={
        fr
          ? 'Décisions et activité de vos candidatures récentes'
          : 'Decisions and activity from recent applications'
      }
      footer={
        <Link
          className="text-label font-semibold text-ink-900 underline"
          href="/inbox"
        >
          {fr ? 'Tous les arbitrages' : 'All decisions'}
        </Link>
      }
    >
      <div className="flex flex-col gap-[18px]">
        {error ? (
          <>
            <p role="alert" className="text-body-sm text-ink-700">
              {fr
                ? 'Notifications indisponibles. Vos décisions restent inchangées.'
                : 'Notifications unavailable. Your decisions are unchanged.'}
            </p>
            <Button onClick={refresh}>{fr ? 'Réessayer' : 'Retry'}</Button>
          </>
        ) : !dashboard ? (
          showSkeleton ? (
            <SkeletonBlock />
          ) : null
        ) : (
          <>
            <Overline>
              {fr ? 'ATTEND VOTRE DÉCISION' : 'WAITING FOR YOUR DECISION'}
            </Overline>
            {decisions.length ? (
              decisions.map((item, index) => (
                <Card
                  key={item.application.applicationId}
                  radius={16}
                  padding={16}
                  selected={index === 0}
                  bordered
                >
                  <div className="flex gap-3">
                    <Icon name="gpp_maybe" className="text-amber-strong" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <strong className="text-ui">
                        {item.application.company}
                      </strong>
                      <span className="text-caption text-ink-600">
                        {item.kind === 'review'
                          ? fr
                            ? `${item.pendingDecisions} affirmation(s) à trancher`
                            : `${item.pendingDecisions} claim(s) to review`
                          : item.kind === 'recover'
                            ? fr
                              ? 'Le traitement nécessite votre attention'
                              : 'The run needs your attention'
                            : fr
                              ? 'Décision humaine requise'
                              : 'Human decision required'}
                      </span>
                    </div>
                  </div>
                  <Link
                    className="text-label font-semibold text-ink-900 underline"
                    href={`/applications/${item.application.applicationId}`}
                  >
                    {fr ? 'Ouvrir le dossier' : 'Open application'}
                  </Link>
                </Card>
              ))
            ) : (
              <p className="m-0 text-body-sm text-ink-600">
                {fr
                  ? 'Aucune décision en attente dans les candidatures récentes.'
                  : 'No pending decisions in recent applications.'}
              </p>
            )}
            <Overline>{fr ? 'ACTIVITÉ DES LIENS' : 'LINK ACTIVITY'}</Overline>
            {publications.length ? (
              publications.map((item) => (
                <Link
                  href="/links"
                  key={item.publicationId}
                  className="flex gap-3 border-b border-panel py-[13px] text-ink-800 no-underline"
                >
                  <Icon name="visibility" className="text-green-strong" />
                  <span className="flex flex-col gap-1 text-label">
                    {item.company} · {item.opens}{' '}
                    {fr ? 'ouverture(s)' : 'open(s)'}
                    <time
                      className="text-caption text-ink-600"
                      dateTime={item.lastOpenedAt!}
                    >
                      {item.lastOpenedAt!.slice(0, 10)}
                    </time>
                  </span>
                </Link>
              ))
            ) : (
              <p className="m-0 text-body-sm text-ink-600">
                {fr
                  ? 'Aucune ouverture de lien enregistrée.'
                  : 'No link openings recorded.'}
              </p>
            )}
            <p className="m-0 text-caption text-ink-600">
              {fr
                ? 'Vue des huit candidatures récentes. Les ouvertures sont anonymes ; elles n’identifient pas le lecteur. Aucun email n’est envoyé.'
                : 'View of eight recent applications. Openings are anonymous and do not identify the reader. No email is sent.'}
            </p>
          </>
        )}
      </div>
    </Drawer>
  );
}
