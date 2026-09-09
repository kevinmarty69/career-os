'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Button, Icon, Mono } from '@/components/ui/controls';
import { useDecisionOutbox } from '@/components/decision-outbox-provider';

export function SystemState({
  kind,
  retry,
  digest,
}: {
  kind: 'not-found' | 'error';
  retry?: () => void;
  digest?: string;
}) {
  const fr = useI18n().locale === 'fr';
  const error = kind === 'error';
  return (
    <section
      className={`co-kit mx-auto flex w-full max-w-[680px] min-h-[400px] flex-col gap-5 rounded-panel p-[34px] ${error ? 'bg-ink-900 text-white' : 'bg-canvas text-ink-900'}`}
    >
      <Mono className={error ? 'text-white/70' : 'text-ink-600'}>
        {error ? '500' : '404'}
      </Mono>
      <h1 className={`m-0 text-hero ${error ? 'text-white' : ''}`}>
        {error
          ? fr
            ? 'Quelque chose a cassé de notre côté.'
            : 'Something broke on our side.'
          : fr
            ? 'Cette page n’existe pas.'
            : 'This page does not exist.'}
      </h1>
      <p
        className={`m-0 text-body-sm ${error ? 'text-white/80' : 'text-ink-700'}`}
      >
        {error
          ? fr
            ? 'Réessayez pour retrouver vos données enregistrées. Une saisie non sauvegardée n’est pas garantie après rechargement.'
            : 'Retry to recover your saved data. Unsaved input may not survive a reload.'
          : fr
            ? 'L’adresse a peut-être changé. Cette navigation ne modifie ni votre mémoire ni vos liens privés.'
            : 'The address may have changed. This navigation does not modify your memory or private links.'}
      </p>
      {digest && (
        <Mono className="rounded-control bg-white/10 p-4 text-white">
          {digest}
        </Mono>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-[11px]">
        {retry ? (
          <Button onClick={retry}>{fr ? 'Réessayer' : 'Retry'}</Button>
        ) : (
          <Link
            href="/"
            className="rounded-pill bg-ink-900 px-5 py-[13px] text-btn text-white no-underline"
          >
            {fr ? 'Retour à l’accueil' : 'Back to home'}
          </Link>
        )}
        <Link
          className={`text-label underline ${error ? 'text-white/80' : 'text-ink-700'}`}
          href={error ? '/settings/models' : '/memory'}
        >
          {error
            ? fr
              ? 'Voir l’état du service'
              : 'View service status'
            : fr
              ? 'Chercher dans mes preuves'
              : 'Find my evidence'}
        </Link>
      </div>
    </section>
  );
}

export function OfflineNotice() {
  const outbox = useDecisionOutbox();
  const [offline, setOffline] = useState(false);
  const fr = useI18n().locale === 'fr';
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline && !outbox.items.length) return null;
  return (
    <div
      role="status"
      className="co-kit mb-4 flex items-start gap-3 rounded-card bg-panel p-[18px] text-body-sm text-ink-700"
    >
      <Icon name="cloud_off" />
      <div>
        <strong>
          {offline
            ? fr
              ? 'Vous êtes hors connexion.'
              : 'You are offline.'
            : fr
              ? 'Décisions en attente d’envoi'
              : 'Decisions waiting to sync'}
        </strong>
        <p className="m-0">
          {fr
            ? 'Les décisions d’arbitrage mises en file restent dans ce navigateur et partiront à la reconnexion avec le même compte et espace. Les autres saisies ne sont pas mises en file. Nouveaux runs impossibles hors ligne.'
            : 'Queued review decisions stay in this browser and sync on reconnection with the same account and workspace. Other edits are not queued. New runs cannot start offline.'}
        </p>
        {outbox.items.map((item) => (
          <div key={item.key} className="flex flex-wrap items-center gap-3">
            <span>
              {item.blocked
                ? fr
                  ? 'Décision périmée ou refusée — à revoir'
                  : 'Stale or rejected decision — review required'
                : fr
                  ? 'Décision gardée localement'
                  : 'Decision saved locally'}
            </span>
            <Link href={`/applications/${item.applicationId}`}>
              {fr ? 'Ouvrir le dossier' : 'Open dossier'}
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    fr
                      ? 'Retirer cette décision locale ? Elle ne sera pas envoyée.'
                      : 'Discard this local decision? It will not be sent.',
                  )
                )
                  outbox.discard(item.key);
              }}
            >
              {fr ? 'Retirer' : 'Discard'}
            </Button>
          </div>
        ))}
        {outbox.items.length > 0 && !offline && (
          <Button onClick={outbox.retry}>
            {fr ? 'Réessayer la synchronisation' : 'Retry sync'}
          </Button>
        )}
        {outbox.unavailable && (
          <p role="alert">
            {fr
              ? 'La synchronisation est indisponible. Aucune décision locale n’a été effacée.'
              : 'Sync is unavailable. No local decision has been erased.'}
          </p>
        )}
      </div>
    </div>
  );
}
