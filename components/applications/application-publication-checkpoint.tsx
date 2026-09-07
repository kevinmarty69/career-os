'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { CreatedPublication } from '@/lib/schemas';
import type { Application } from '@/lib/application-contract';
import type { PersistedRun } from '@/lib/run-contract';
import type { PublicationActionError } from './use-application-workflow';

export function ApplicationPublicationCheckpoint({
  application,
  busy = false,
  error,
  onCopy,
  onNewVersion,
  onPublish,
  onRevoke,
  pending,
  publication,
  profile,
  revoked,
  spec,
}: {
  application?: Application;
  busy?: boolean;
  error?: PublicationActionError;
  onCopy: () => void;
  onNewVersion: () => void;
  onPublish: () => void;
  onRevoke: () => void;
  pending: 'publish' | 'revoke' | undefined;
  publication?: CreatedPublication;
  profile?: PersistedRun['profile'];
  revoked: boolean;
  spec?: PersistedRun['spec'];
}) {
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages]);
  const href = publication
    ? `/p/${publication.publicationId}#${publication.rawToken}`
    : undefined;
  const absoluteHref = href;
  const emailSubject = application
    ? locale === 'en'
      ? `Application — ${application.role}`
      : `Candidature — ${application.role}`
    : '';
  const emailBody =
    application && profile && absoluteHref
      ? locale === 'en'
        ? `Hello,\n\nI prepared a concise, evidence-backed view of my fit for the ${application.role} role at ${application.company}:\n${absoluteHref}\n\nBest,\n${profile.name}`
        : `Bonjour,\n\nJ’ai préparé une présentation concise et sourcée de mon adéquation au poste de ${application.role} chez ${application.company} :\n${absoluteHref}\n\nBien à vous,\n${profile.name}`
      : '';

  return (
    <section className="co-panel co-research-checkpoint co-publication-checkpoint">
      <header>
        <div>
          <p>{t('dossier.final.human.approval')}</p>
          <h2>
            {publication
              ? t('dossier.the.private.link.is.ready')
              : revoked
                ? t('dossier.the.private.link.has.been.revoked')
                : t('dossier.publish.only.what.you.approved')}
          </h2>
        </div>
        <span>
          {publication
            ? t('dossier.published')
            : revoked
              ? t('dossier.revoked')
              : t('dossier.unpublished')}
        </span>
      </header>

      {publication ? (
        <>
          <p>
            {t(
              'dossier.the.snapshot.is.immutable.non.indexable.and.available.for',
            )}{' '}
          </p>
          <div className="co-private-link">
            <span>
              <small>{t('dossier.private.link')}</small>
              <strong>/p/{publication.publicationId}</strong>
            </span>
            <div>
              <button onClick={onCopy} type="button">
                {t('dossier.copy')}{' '}
              </button>
              <a
                className="co-button"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                {t('dossier.open')}{' '}
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
                disabled={Boolean(pending) || busy}
                onClick={onNewVersion}
                type="button"
              >
                {t('dossier.prepare.a.new.version')}{' '}
              </button>
              <button
                disabled={Boolean(pending) || busy}
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
                {pending === 'revoke'
                  ? t('dossier.revoking')
                  : t('dossier.revoke.link')}
              </button>
            </div>
          </footer>
          {application && profile && spec ? (
            <section>
              <h3>
                {locale === 'en' ? 'Application email' : 'Email de candidature'}
              </h3>
              <p>{emailBody}</p>
              <a
                className="co-button quiet"
                href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
              >
                {locale === 'en'
                  ? 'Open in email app'
                  : 'Ouvrir dans la messagerie'}
              </a>
            </section>
          ) : null}
        </>
      ) : revoked ? (
        <p>
          {t(
            'dossier.access.is.revoked.immediately.including.in.a.tab.that',
          )}{' '}
        </p>
      ) : (
        <>
          <p>
            {t(
              'dossier.all.three.reviews.are.resolved.this.action.freezes.the',
            )}{' '}
          </p>
          <ul>
            <li>{t('dossier.immutable.snapshot')}</li>
            <li>{t('dossier.automatic.expiration.after.seven.days')}</li>
            <li>{t('dossier.immediate.revocation')}</li>
          </ul>
          <footer>
            <span>{t('dossier.no.link.is.created.without.this.action')}</span>
            <button
              className="co-button"
              disabled={Boolean(pending) || busy}
              onClick={onPublish}
              type="button"
            >
              {pending === 'publish'
                ? t('dossier.creating.link')
                : t('dossier.approve.and.create.private.link')}
            </button>
          </footer>
        </>
      )}
      {error ? <p role="alert">{publicationErrorMessage(t, error)}</p> : null}
    </section>
  );
}

function publicationErrorMessage(
  t: Translator<typeof dossierMessages>,
  error: PublicationActionError,
) {
  switch (error) {
    case 'clipboard-unavailable':
      return t('dossier.clipboard.unavailable');
    case 'auth':
      return t('dossier.your.session.has.expired.sign.in.again.then.retry');
    case 'review-rejected':
      return t(
        'dossier.the.page.no.longer.passes.the.publication.checks.reopen',
      );
    case 'conflict':
      return t(
        'dossier.the.application.changed.while.publishing.reload.it.before.retrying',
      );
    case 'rate-limited':
      return t(
        'dossier.too.many.publication.attempts.wait.one.minute.before.retrying',
      );
    case 'revocation-rejected':
      return t(
        'dossier.this.link.cannot.be.revoked.from.this.workspace.reload',
      );
    case 'unavailable':
      return t(
        'dossier.the.publication.service.is.temporarily.unavailable.the.approved.page',
      );
  }
}

import type { Translator } from '@/lib/i18n/messages';
