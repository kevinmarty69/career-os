'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { useWorkflowDashboard } from '@/components/dashboard/use-workflow-dashboard';
import { dashboardActions } from '@/lib/dashboard-priority';
import {
  Drawer,
  SkeletonBlock,
  useDelayedPending,
} from '@/components/ui/feedback';
import { Button, Icon, Overline } from '@/components/ui/controls';
import { Card } from '@/components/ui/surfaces';
import { useNotificationPreferences } from '@/components/settings/use-notification-preferences';
import { markEventsRead } from '@/lib/notification-preferences';
import { NotificationHistory } from './notification-history';
import {
  notificationContextSchema,
  type NotificationContext,
} from '@/lib/notification-context';

export function NotificationsButton({
  initiallyOpen = false,
}: {
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
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
  const receipt = useNotificationPreferences();
  const { dashboard, error, refresh } = useWorkflowDashboard();
  const [context, setContext] = useState<NotificationContext>();
  const [contextError, setContextError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/notifications', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = notificationContextSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setContext(data);
          setContextError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setContextError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const showSkeleton = useDelayedPending(!dashboard && !error);
  const decisions = dashboardActions(dashboard?.items ?? []).filter((item) =>
    ['review', 'decision', 'recover'].includes(item.kind),
  );
  const publications = (dashboard?.publications ?? [])
    .filter((item) => item.lastOpenedAt)
    .sort((a, b) => b.lastOpenedAt!.localeCompare(a.lastOpenedAt!))
    .slice(0, 8);
  const decisionKey = (item: (typeof decisions)[number]) =>
    `${item.application.applicationId}:${item.run?.runId ?? 'none'}:${item.kind}:${item.pendingDecisions}:${item.application.updatedAt}`;
  const publicationKey = (item: (typeof publications)[number]) =>
    `${item.publicationId}:${item.lastOpenedAt}`;
  const expiring = (dashboard?.publications ?? []).filter(
    (item) =>
      item.status === 'active' &&
      item.isCurrent &&
      item.expiresAt &&
      Date.parse(item.expiresAt) > now &&
      Date.parse(item.expiresAt) <= now + 2 * 86400000,
  );
  const completed = (dashboard?.items ?? []).filter(
    (item) => item.run?.status === 'completed',
  );
  const taskKey = (task: NonNullable<typeof context>['tasks'][number]) =>
    `task:${task.id}:${task.dueAt}`;
  const expiryKey = (item: (typeof expiring)[number]) =>
    `expiry:${item.publicationId}:${item.expiresAt}`;
  const completeKey = (item: (typeof completed)[number]) =>
    `complete:${item.run!.runId}`;
  const eventIds = [
    ...decisions.map(decisionKey),
    ...publications.map(publicationKey),
    ...expiring.map(expiryKey),
    ...completed.map(completeKey),
    ...(context?.tasks.map(taskKey) ?? []),
    ...(context?.conflict ? [context.conflict.id] : []),
  ];
  const isRead = (id: string) =>
    receipt.preferences?.readEvents.includes(id) ?? false;
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
        <div className="flex flex-wrap gap-4">
          <Button
            disabled={
              !receipt.preferences ||
              receipt.saving ||
              !eventIds.length ||
              eventIds.every(isRead)
            }
            onClick={() =>
              receipt.preferences &&
              void receipt.save(markEventsRead(receipt.preferences, eventIds))
            }
          >
            {fr ? 'Tout marquer comme lu' : 'Mark all as read'}
          </Button>
          <Link
            className="text-label font-semibold text-ink-900 underline"
            href="/inbox"
          >
            {fr ? 'Tous les arbitrages' : 'All decisions'}
          </Link>
          <Link
            className="text-label text-ink-900 underline"
            href="/settings/notifications"
          >
            {fr ? 'Réglages' : 'Settings'}
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-[18px]">
        {receipt.error && (
          <p role="alert" className="text-caption text-ink-600">
            {fr
              ? 'État de lecture indisponible. Les événements restent consultables.'
              : 'Read status unavailable. Events remain available.'}
          </p>
        )}
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
            {contextError && (
              <>
                <p role="alert" className="m-0 text-caption text-ink-600">
                  {fr
                    ? 'Conflits et rappels indisponibles. Les autres événements restent consultables.'
                    : 'Conflicts and reminders unavailable. Other events remain available.'}
                </p>
                <Button onClick={() => setAttempt((value) => value + 1)}>
                  {fr ? 'Réessayer les rappels' : 'Retry reminders'}
                </Button>
              </>
            )}
            {context?.conflict && (
              <Card radius={16} padding={16} bordered>
                <Icon name="rule" className="text-amber-strong" />
                <strong className="text-ui">
                  {context.conflict.count}{' '}
                  {fr ? 'conflit(s) entre sources' : 'source conflict(s)'}
                </strong>
                {isRead(context.conflict.id) && (
                  <span className="text-caption text-ink-600">
                    {fr ? 'Lu' : 'Read'}
                  </span>
                )}
                <Link
                  href="/memory/conflicts"
                  className="text-label font-semibold text-ink-900 underline"
                >
                  {fr ? 'Voir les sources' : 'View sources'}
                </Link>
              </Card>
            )}
            {decisions.length ? (
              decisions.map((item, index) => (
                <Card
                  key={item.application.applicationId}
                  radius={16}
                  padding={16}
                  selected={!isRead(decisionKey(item)) && index === 0}
                  bordered
                >
                  <div className="flex gap-3">
                    <Icon name="gpp_maybe" className="text-amber-strong" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <strong className="text-ui">
                        {item.application.company}
                      </strong>
                      {isRead(decisionKey(item)) && (
                        <span className="text-caption text-ink-600">
                          {fr ? 'Lu' : 'Read'}
                        </span>
                      )}
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
            <Overline>
              {fr ? 'ÉVÉNEMENTS ET RAPPELS' : 'EVENTS AND REMINDERS'}
            </Overline>
            {context?.tasks.map((task) => (
              <Link
                key={task.id}
                href={`/applications/${task.applicationId}/timeline`}
                className="flex gap-3 border-b border-panel py-[13px] text-ink-800 no-underline"
              >
                <Icon name="schedule" />
                <span className="flex flex-col gap-1 text-label">
                  <strong>
                    {task.company} ·{' '}
                    {task.kind === 'follow_up'
                      ? fr
                        ? 'Relance à faire'
                        : 'Follow-up due'
                      : fr
                        ? 'Tâche à faire'
                        : 'Task due'}
                  </strong>
                  {task.title}
                  <time
                    className="text-caption text-ink-600"
                    dateTime={task.dueAt}
                  >
                    {task.dueAt.slice(0, 10)}
                  </time>
                  {isRead(taskKey(task)) && (
                    <span className="text-caption text-ink-600">
                      {fr ? 'Lu' : 'Read'}
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {context?.moreTasks && (
              <p className="m-0 text-caption text-ink-600">
                {fr
                  ? '50 premiers rappels. Les autres restent dans vos dossiers.'
                  : 'First 50 reminders. Others remain in your application dossiers.'}
              </p>
            )}
            {expiring.map((item) => (
              <Link
                key={expiryKey(item)}
                href="/links"
                className="flex gap-3 border-b border-panel py-[13px] text-ink-800 no-underline"
              >
                <Icon name="schedule" />
                <span className="flex flex-col gap-1 text-label">
                  {item.company} ·{' '}
                  {fr
                    ? 'Lien expirant sous 48 h'
                    : 'Link expires within 48 hours'}
                  <time
                    dateTime={item.expiresAt!}
                    className="text-caption text-ink-600"
                  >
                    {item.expiresAt!.slice(0, 10)}
                  </time>
                  {isRead(expiryKey(item)) && (
                    <span className="text-caption text-ink-600">
                      {fr ? 'Lu' : 'Read'}
                    </span>
                  )}
                </span>
              </Link>
            ))}
            {completed.map((item) => (
              <Link
                key={completeKey(item)}
                href={`/applications/${item.application.applicationId}`}
                className="flex gap-3 border-b border-panel py-[13px] text-ink-800 no-underline"
              >
                <Icon name="bolt" />
                <span className="flex flex-col gap-1 text-label">
                  {item.application.company} ·{' '}
                  {fr ? 'Run terminé' : 'Run completed'}
                  <span className="text-caption text-ink-600">
                    {fr
                      ? 'La publication reste une décision distincte.'
                      : 'Publication remains a separate decision.'}
                  </span>
                  {isRead(completeKey(item)) && (
                    <span className="text-caption text-ink-600">
                      {fr ? 'Lu' : 'Read'}
                    </span>
                  )}
                </span>
              </Link>
            ))}
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
                    {isRead(publicationKey(item)) && (
                      <span className="text-caption text-ink-600">
                        {fr ? 'Lu' : 'Read'}
                      </span>
                    )}
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
            <NotificationHistory />
          </>
        )}
      </div>
    </Drawer>
  );
}
