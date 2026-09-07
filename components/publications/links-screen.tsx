'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';

import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import {
  Badge,
  Button,
  Company,
  DataTable,
  Icon,
  PageHeader,
  Stat,
} from '@/components/ui/primitives';
import { readPublications, revokePublication } from '@/lib/career-api';
import { initials } from '@/lib/initials';
import { type PublicationSummary } from '@/lib/server/publication-input';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function LinksScreen() {
  const t = useTranslations([activeRoutesMessages, memoryMessages]);

  const { locale } = useI18n();
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string>();
  const [revokeError, setRevokeError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readPublications(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as {
          publications?: PublicationSummary[];
        };
        setPublications(body.publications ?? []);
      })
      .catch(() => setPublications([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const selected =
    publications.find((item) => item.isCurrent) ?? publications[0];
  const active = publications.filter((item) => item.status === 'active');
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value))
      : '—';

  async function revoke(publicationId: string) {
    if (
      !window.confirm(
        locale === 'fr'
          ? 'Révoquer ce lien maintenant ? Son accès sera coupé immédiatement.'
          : 'Revoke this link now? Access will be cut off immediately.',
      )
    )
      return;
    setRevoking(publicationId);
    setRevokeError(false);
    try {
      const response = await revokePublication(publicationId);
      if (!response.ok) throw new Error();
      setPublications((current) =>
        current.map((item) =>
          item.publicationId === publicationId
            ? {
                ...item,
                isCurrent: false,
                revokedAt: new Date().toISOString(),
                status: 'revoked',
              }
            : item,
        ),
      );
    } catch {
      setRevokeError(true);
    } finally {
      setRevoking(undefined);
    }
  }

  return (
    <AppShell
      path="/links"
      aside={
        <section className="co-stack">
          <h2>{t('active-routes.page.metrics')}</h2>
          {selected ? (
            <>
              <Company
                name={selected.company}
                initials={initials(selected.company)}
                sub={`Version ${selected.version}`}
              />
              <div className="co-activity">
                <Icon>first_page</Icon>
                <span>
                  <strong>{t('active-routes.first.opened')}</strong>
                  <small>{date(selected.firstOpenedAt)}</small>
                </span>
              </div>
              <div className="co-activity">
                <Icon>schedule</Icon>
                <span>
                  <strong>{t('active-routes.last.opened')}</strong>
                  <small>{date(selected.lastOpenedAt)}</small>
                </span>
              </div>
              <div className="co-note">
                <Icon>privacy_tip</Icon>
                {t(
                  'active-routes.these.counters.do.not.identify.the.reader.or.prove',
                )}{' '}
              </div>
            </>
          ) : (
            <p>
              {loading
                ? t('active-routes.loading')
                : t('active-routes.no.published.page')}
            </p>
          )}
        </section>
      }
    >
      <PageHeader
        title={t('memory.private.links')}
        copy={t(
          'active-routes.one.revocable.link.per.company.with.an.access.log',
        )}
        actions={
          <Link className="co-button" href="/applications">
            <Icon>add_link</Icon>
            {t('active-routes.new.link')}{' '}
          </Link>
        }
      />
      <div className="co-stats">
        <Stat
          icon="link"
          value={String(active.length)}
          label={t('active-routes.active.links')}
        />
        <Stat
          icon="visibility"
          value={String(
            publications.reduce((sum, item) => sum + item.opens, 0),
          )}
          label={t('active-routes.total.opens')}
        />
        <Stat
          icon="description"
          value={String(
            publications.reduce((sum, item) => sum + item.sections, 0),
          )}
          label={t('active-routes.sections.viewed')}
        />
        <Stat
          icon="visibility_off"
          value={String(publications.filter((item) => item.opens === 0).length)}
          label={t('active-routes.never.opened')}
          tone="muted"
        />
      </div>
      <div className="co-publication-table">
        <DataTable
          headers={[
            t('active-routes.recipient'),
            t('active-routes.opens'),
            'Sections',
            t('active-routes.actions'),
            t('memory.resume'),
            t('active-routes.access'),
          ]}
          rows={publications.map((item) => [
            <Company
              key={item.publicationId}
              name={item.company}
              initials={initials(item.company)}
              sub={`${item.role} · v${item.version} · ${item.status}`}
            />,
            String(item.opens),
            String(item.sections),
            String(item.actions),
            String(item.downloads),
            item.status === 'active' ? (
              <Button
                danger
                disabled={revoking === item.publicationId}
                onClick={() => void revoke(item.publicationId)}
              >
                {revoking === item.publicationId
                  ? t('active-routes.revoking')
                  : t('active-routes.revoke')}
              </Button>
            ) : (
              <Badge>
                {item.status === 'revoked'
                  ? t('active-routes.revoked')
                  : t('active-routes.expired')}
              </Badge>
            ),
          ])}
        />
      </div>
      {revokeError ? (
        <p className="co-error" role="alert">
          {t('active-routes.revocation.failed.try.again')}{' '}
        </p>
      ) : null}
      <div className="co-note">
        <Icon>policy</Icon>
        {t(
          'active-routes.no.fingerprint.ip.address.or.user.agent.is.recorded',
        )}{' '}
      </div>
    </AppShell>
  );
}
