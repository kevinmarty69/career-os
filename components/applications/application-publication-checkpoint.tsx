'use client';

import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { CreatedPublication } from '@/lib/schemas';

export function ApplicationPublicationCheckpoint({
  error,
  onCopy,
  onNewVersion,
  onPublish,
  onRevoke,
  pending,
  publication,
  revoked,
}: {
  error: boolean;
  onCopy: () => void;
  onNewVersion: () => void;
  onPublish: () => void;
  onRevoke: () => void;
  pending: 'publish' | 'revoke' | undefined;
  publication?: CreatedPublication;
  revoked: boolean;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([dossierMessages]);
  const href = publication
    ? `/p/${publication.publicationId}#${publication.rawToken}`
    : undefined;

  return localize(
    <section className="co-panel co-research-checkpoint co-publication-checkpoint">
      <header>
        <div>
          <p>Validation humaine finale</p>
          <h2>
            {publication
              ? 'Le lien privé est prêt'
              : revoked
                ? 'Le lien privé a été révoqué'
                : 'Publiez uniquement ce que vous avez validé'}
          </h2>
        </div>
        <span>
          {publication ? 'Publié' : revoked ? 'Révoqué' : 'Non publié'}
        </span>
      </header>

      {publication ? (
        <>
          <p>
            Le snapshot est immuable, non indexable et accessible pendant sept
            jours. Vous pouvez couper l’accès immédiatement.
          </p>
          <div className="co-private-link">
            <span>
              <small>Lien privé</small>
              <strong>/p/{publication.publicationId}</strong>
            </span>
            <div>
              <button onClick={onCopy} type="button">
                Copier
              </button>
              <a
                className="co-button"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                Ouvrir
              </a>
            </div>
          </div>
          <footer>
            <span>
              Version {publication.version} ·{' '}
              {locale === 'en' ? 'Expires' : 'Expire le'}{' '}
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                new Date(publication.expiresAt),
              )}
            </span>
            <div>
              <button
                disabled={Boolean(pending)}
                onClick={onNewVersion}
                type="button"
              >
                Préparer une nouvelle version
              </button>
              <button
                disabled={Boolean(pending)}
                onClick={() => {
                  if (
                    window.confirm(
                      locale === 'en'
                        ? 'Revoke this private link? Anyone using it will lose access immediately.'
                        : 'Révoquer ce lien privé ? Toute personne qui l’utilise perdra immédiatement l’accès.',
                    )
                  )
                    onRevoke();
                }}
                type="button"
              >
                {pending === 'revoke' ? 'Révocation…' : 'Révoquer le lien'}
              </button>
            </div>
          </footer>
        </>
      ) : revoked ? (
        <p>
          L’accès est coupé immédiatement, y compris pour un onglet déjà ouvert.
        </p>
      ) : (
        <>
          <p>
            Les trois reviews sont résolues. Cette action fige la page actuelle
            dans un snapshot privé ; aucune modification ultérieure de votre
            mémoire ne changera ce qui est partagé.
          </p>
          <ul>
            <li>Snapshot immuable</li>
            <li>Expiration automatique sous sept jours</li>
            <li>Révocation immédiate</li>
          </ul>
          <footer>
            <span>Aucun lien n’est créé sans cette action.</span>
            <button
              className="co-button"
              disabled={Boolean(pending)}
              onClick={onPublish}
              type="button"
            >
              {pending === 'publish'
                ? 'Création du lien…'
                : 'Valider et créer le lien privé'}
            </button>
          </footer>
        </>
      )}
      {error ? (
        <p role="alert">
          L’action n’a pas abouti. Vérifiez votre session puis réessayez.
        </p>
      ) : null}
    </section>,
  );
}
