'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Button, Overline } from '@/components/ui/controls';
import {
  notificationHistorySchema,
  type NotificationHistory as History,
} from '@/lib/notification-history';

export function NotificationHistory() {
  const fr = useI18n().locale === 'fr';
  const [history, setHistory] = useState<History>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function load() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const query = history?.nextCursor
        ? `?cursor=${encodeURIComponent(JSON.stringify(history.nextCursor))}`
        : '';
      const response = await fetch(`/api/notifications/history${query}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      const page = notificationHistorySchema.parse(await response.json());
      setHistory((previous) => ({
        ...page,
        events: [
          ...new Map(
            [...(previous?.events ?? []), ...page.events].map((event) => [
              event.id,
              event,
            ]),
          ).values(),
        ],
      }));
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="flex flex-col gap-3">
      <Overline>{fr ? 'HISTORIQUE' : 'HISTORY'}</Overline>
      {history?.events.map((event) => (
        <Link
          key={event.id}
          href={
            event.kind === 'link'
              ? '/links'
              : `/applications/${event.applicationId}/versions`
          }
          className="flex flex-col gap-1 border-b border-panel py-[13px] text-label text-ink-800 no-underline"
        >
          <strong>{event.company}</strong>
          <span>
            {event.kind === 'run'
              ? event.summary
              : fr
                ? ({
                    open: 'Ouverture anonyme',
                    section: 'Section consultée',
                    action: 'Action sur la page',
                    download: 'Lien de téléchargement ouvert',
                  }[event.summary] ?? 'Activité du lien')
                : ({
                    open: 'Anonymous opening',
                    section: 'Section viewed',
                    action: 'Page action',
                    download: 'Download link opened',
                  }[event.summary] ?? 'Link activity')}
          </span>
          <time className="text-caption text-ink-600" dateTime={event.at}>
            {event.at.slice(0, 10)} · {event.at.slice(11, 16)} UTC
          </time>
        </Link>
      ))}
      {history && !history.events.length && (
        <p className="text-caption text-ink-600">
          {fr ? 'Aucun événement enregistré.' : 'No recorded events.'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-clay-strong">
          {fr
            ? 'Chargement impossible. L’historique déjà chargé est conservé.'
            : 'Could not load history. Previously loaded events are preserved.'}
        </p>
      )}
      {(!history || history.nextCursor) && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => void load()}
        >
          {pending
            ? fr
              ? 'Chargement…'
              : 'Loading…'
            : error
              ? fr
                ? 'Réessayer'
                : 'Retry history'
              : history
                ? fr
                  ? 'Charger les événements précédents'
                  : 'Load older events'
                : fr
                  ? 'Afficher l’historique'
                  : 'Show history'}
        </Button>
      )}
    </section>
  );
}
