'use client';

import { useEffect, useState } from 'react';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { authClient } from '@/lib/auth-client';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';

type DeviceSession = {
  token: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function SessionManager() {
  const t = useTranslations([activeRoutesMessages]);
  const { locale } = useI18n();
  const [sessions, setSessions] = useState<DeviceSession[]>();
  const [currentToken, setCurrentToken] = useState<string>();
  const [revoking, setRevoking] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([authClient.listSessions(), authClient.getSession()])
      .then(([listed, current]) => {
        if (!active) return;
        if (listed.error) {
          setSessions([]);
          setError(true);
          return;
        }
        setSessions(listed.data ?? []);
        setCurrentToken(current.data?.session.token);
      })
      .catch(() => {
        if (active) {
          setSessions([]);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function revoke(token: string) {
    setRevoking(token);
    setError(false);
    try {
      const result = await authClient.revokeSession({ token });
      if (result.error) setError(true);
      else
        setSessions((current) =>
          current?.filter((item) => item.token !== token),
        );
    } catch {
      setError(true);
    } finally {
      setRevoking(undefined);
    }
  }

  return (
    <section className="co-panel co-session-manager">
      <header>
        <div>
          <h2>{t('active-routes.active.sessions')}</h2>
          <p>{t('active-routes.revoke.any.device.you.no.longer.recognize')}</p>
        </div>
        <span className="co-badge muted">
          {sessions
            ? `${sessions.length} ${locale === 'fr' ? 'actives' : 'active'}`
            : t('active-routes.loading')}
        </span>
      </header>
      {error ? (
        <p className="co-session-error" role="alert">
          {t(
            'active-routes.sessions.are.unavailable.sign.in.again.then.retry',
          )}{' '}
        </p>
      ) : null}
      {sessions?.map((session) => {
        const current = session.token === currentToken;
        return (
          <article key={session.token}>
            <span className="co-session-device" aria-hidden="true">
              <span className="material-symbols-rounded co-icon">devices</span>
            </span>
            <div>
              <strong>
                {current
                  ? t('active-routes.this.device')
                  : t('active-routes.other.device')}
              </strong>
              <small>{sessionLabel(session, locale)}</small>
              <small>
                {t('active-routes.last.active')}{' '}
                {new Date(session.updatedAt).toLocaleString(
                  locale === 'fr' ? 'fr-FR' : 'en-GB',
                  { dateStyle: 'medium', timeStyle: 'short' },
                )}
              </small>
            </div>
            {current ? (
              <span className="co-badge ok">
                {t('active-routes.current.session')}
              </span>
            ) : (
              <button
                className="co-button quiet danger"
                disabled={Boolean(revoking)}
                onClick={() => void revoke(session.token)}
                type="button"
              >
                {revoking === session.token
                  ? t('active-routes.revoking')
                  : t('active-routes.revoke')}
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

function sessionLabel(session: DeviceSession, locale: 'en' | 'fr') {
  const agent = session.userAgent ?? '';
  const browser = /Firefox/i.test(agent)
    ? 'Firefox'
    : /Chrome/i.test(agent)
      ? 'Chrome'
      : /Safari/i.test(agent)
        ? 'Safari'
        : locale === 'fr'
          ? 'Navigateur inconnu'
          : 'Unknown browser';
  const device = /Mobile|Android|iPhone|iPad/i.test(agent)
    ? 'mobile'
    : locale === 'fr'
      ? 'ordinateur'
      : 'computer';
  return `${browser} · ${device}`;
}
