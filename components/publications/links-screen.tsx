'use client';

import { AppShell } from '@/components/layout/app-shell';
import { OnboardingEmptyState } from '@/components/onboarding/empty-states';
import {
  Badge,
  Button,
  Icon,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { readPublications, revokePublication } from '@/lib/career-api';
import { operationalMessages } from '@/lib/i18n/dictionaries/operational';
import {
  publicationSummarySchema,
  type PublicationSummary,
} from '@/lib/server/publication-input';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';

const publicationsResponseSchema = z.object({
  publications: z.array(publicationSummarySchema),
  nextCursor: z.string().nullable(),
});

export function LinksScreen() {
  const { locale } = useI18n();
  const t = useTranslations([operationalMessages]);
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<PublicationSummary>();
  const [confirmation, setConfirmation] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(false);
  const revokeConfirmation = locale === 'fr' ? 'RÉVOQUER' : 'REVOKE';

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await readPublications(controller.signal);
        if (!response.ok) throw new Error('Publications unavailable.');
        const parsed = publicationsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) throw new Error('Invalid publications response.');
        setPublications(parsed.data.publications);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const active = useMemo(
    () => publications.filter(({ status }) => status === 'active'),
    [publications],
  );
  const totals = useMemo(
    () =>
      active.reduce(
        (result, publication) => ({
          opens: result.opens + publication.opens,
          actions: result.actions + publication.actions,
          downloads: result.downloads + publication.downloads,
        }),
        { opens: 0, actions: 0, downloads: 0 },
      ),
    [active],
  );

  function openRevokeDialog(publication: PublicationSummary) {
    setPendingRevoke(publication);
    setConfirmation('');
    setRevokeError(false);
  }

  function closeRevokeDialog() {
    if (revoking) return;
    setPendingRevoke(undefined);
    setConfirmation('');
    setRevokeError(false);
  }

  async function confirmRevoke() {
    if (!pendingRevoke || confirmation !== revokeConfirmation || revoking)
      return;
    setRevoking(true);
    setRevokeError(false);
    try {
      const response = await revokePublication(pendingRevoke.publicationId);
      if (!response.ok) throw new Error('Revocation failed.');
      setPublications((current) =>
        current.map((publication) =>
          publication.publicationId === pendingRevoke.publicationId
            ? {
                ...publication,
                status: 'revoked',
                revokedAt: new Date().toISOString(),
              }
            : publication,
        ),
      );
      setPendingRevoke(undefined);
      setConfirmation('');
    } catch {
      setRevokeError(true);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <AppShell
      path="/links"
      aside={
        publications.length ? (
          <section className="co-links-privacy">
            <Icon>privacy_tip</Icon>
            <h2>{t('operations.links.privacy.title')}</h2>
            <p>{t('operations.links.privacy')}</p>
          </section>
        ) : undefined
      }
    >
      <div className="co-links-screen">
        <PageHeader
          title={t('operations.links.title')}
          copy={t('operations.links.description')}
          actions={
            publications.length ? (
              <Link className="co-button" href="/applications">
                <Icon>add_link</Icon>
                {t('operations.links.create')}
              </Link>
            ) : null
          }
        />

        {!loading && !loadError && publications.length ? (
          <section
            className="co-links-stats"
            aria-label={t('operations.links.activity')}
          >
            <Stat
              icon="link"
              value={String(active.length)}
              label={t('operations.links.active')}
            />
            <Stat
              icon="visibility"
              value={String(totals.opens)}
              label={t('operations.home.openings')}
            />
            <Stat
              icon="touch_app"
              value={String(totals.actions)}
              label={t('operations.home.actions')}
            />
            <Stat
              icon="download"
              value={String(totals.downloads)}
              label={t('operations.home.downloads')}
            />
          </section>
        ) : null}

        {loading ? (
          <div className="co-note" role="status">
            <Icon>hourglass_top</Icon>
            {t('operations.links.loading')}
          </div>
        ) : loadError ? (
          <div className="co-note crit" role="alert">
            <Icon>cloud_off</Icon>
            {t('operations.links.unavailable')}
          </div>
        ) : !publications.length ? (
          <OnboardingEmptyState kind="links" />
        ) : (
          <section className="co-links-list">
            {publications.map((publication) => (
              <article className="co-link-row" key={publication.publicationId}>
                <header>
                  <div className="co-link-company-mark" aria-hidden="true">
                    {publication.company.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p>{publication.company}</p>
                    <h2>{publication.role}</h2>
                    <span>
                      {t('operations.links.version', {
                        version: publication.version,
                      })}
                    </span>
                  </div>
                  <Badge
                    tone={
                      publication.status === 'active'
                        ? 'ok'
                        : publication.status === 'expired'
                          ? 'warn'
                          : 'muted'
                    }
                  >
                    {t(`operations.links.status.${publication.status}`)}
                  </Badge>
                </header>
                <dl>
                  <div>
                    <dt>{t('operations.home.openings')}</dt>
                    <dd>{publication.opens}</dd>
                  </div>
                  <div>
                    <dt>{t('operations.home.sections')}</dt>
                    <dd>{publication.sections}</dd>
                  </div>
                  <div>
                    <dt>{t('operations.home.actions')}</dt>
                    <dd>{publication.actions}</dd>
                  </div>
                  <div>
                    <dt>{t('operations.home.downloads')}</dt>
                    <dd>{publication.downloads}</dd>
                  </div>
                </dl>
                <div className="co-link-dates">
                  <span>
                    {t('operations.links.first.open')}:{' '}
                    <strong>
                      {formatAccessDate(
                        publication.firstOpenedAt,
                        locale,
                        t('operations.links.never.opened'),
                      )}
                    </strong>
                  </span>
                  <span>
                    {t('operations.links.last.open')}:{' '}
                    <strong>
                      {formatAccessDate(
                        publication.lastOpenedAt,
                        locale,
                        t('operations.links.never.opened'),
                      )}
                    </strong>
                  </span>
                </div>
                <footer>
                  <Link
                    className="co-button quiet"
                    href={`/applications/${publication.applicationId}`}
                  >
                    {t('operations.links.open.application')}
                  </Link>
                  {publication.status === 'active' ? (
                    <Button
                      danger
                      onClick={() => openRevokeDialog(publication)}
                    >
                      {t('operations.links.revoke')}
                    </Button>
                  ) : null}
                </footer>
              </article>
            ))}
          </section>
        )}
      </div>

      {pendingRevoke ? (
        <div
          className="co-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRevokeDialog();
          }}
        >
          <section
            aria-labelledby="revoke-link-title"
            aria-modal="true"
            className="co-revoke-dialog"
            role="dialog"
          >
            <span className="co-dialog-danger-icon">
              <Icon>link_off</Icon>
            </span>
            <h2 id="revoke-link-title">
              {t('operations.links.dialog.title', {
                company: pendingRevoke.company,
              })}
            </h2>
            <p>{t('operations.links.dialog.intro')}</p>
            <ul>
              <li>
                {t('operations.links.dialog.opens', {
                  count: pendingRevoke.opens,
                })}
              </li>
              <li>{t('operations.links.dialog.kept')}</li>
              <li>{t('operations.links.dialog.new')}</li>
            </ul>
            <label>
              {t('operations.links.dialog.confirm.label', {
                confirmation: revokeConfirmation,
              })}
              <input
                autoFocus
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </label>
            {revokeError ? (
              <p className="co-dialog-error" role="alert">
                {t('operations.links.revocation.failed')}
              </p>
            ) : null}
            <footer>
              <Button quiet disabled={revoking} onClick={closeRevokeDialog}>
                {t('operations.links.dialog.cancel')}
              </Button>
              <Button
                danger
                disabled={confirmation !== revokeConfirmation || revoking}
                onClick={() => void confirmRevoke()}
              >
                {revoking
                  ? t('operations.links.revoking')
                  : t('operations.links.revoke')}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function formatAccessDate(
  value: string | null,
  locale: string,
  fallback: string,
) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
