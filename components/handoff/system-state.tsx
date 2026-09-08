'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Button, Icon, Mono } from '@/components/ui';

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
  if (!offline) return null;
  return (
    <div
      role="status"
      className="co-kit mb-4 flex items-start gap-3 rounded-card bg-panel p-[18px] text-body-sm text-ink-700"
    >
      <Icon name="cloud_off" />
      <div>
        <strong>{fr ? 'Vous êtes hors connexion.' : 'You are offline.'}</strong>
        <p className="m-0">
          {fr
            ? 'Gardez cette page ouverte. Les nouvelles saisies ne sont pas sauvegardées automatiquement ; réessayez à la reconnexion.'
            : 'Keep this page open. New input is not saved automatically; retry once reconnected.'}
        </p>
      </div>
    </div>
  );
}
