'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuthUser } from '@/lib/auth-client';
import { initials } from '@/lib/initials';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import styles from './profile-menu.module.css';

export function ProfileMenu({
  placement = 'above',
}: {
  placement?: 'above' | 'below';
}) {
  const { locale } = useI18n();
  const user = useAuthUser();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  const label = locale === 'fr' ? 'Mon compte' : 'My account';
  const name = user?.name.trim().split(/\s+/)[0] || label;

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        root.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!result.ok) throw new Error('Sign out failed');
      try {
        // The CV import review is tab-local and must not survive an account change.
        sessionStorage.removeItem('career-os-memory-import:v1');
      } catch {
        // Storage can be disabled; this must not prevent leaving a revoked session.
      }
      // Full navigation discards the authenticated client cache as well as the session.
      window.location.replace('/sign-in');
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <details
      className={styles.account}
      data-placement={placement}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && root.current?.open) {
          event.preventDefault();
          root.current.open = false;
          root.current.querySelector('summary')?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget as Node)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary aria-label={`${label} · ${name}`}>
        <i>{user?.name ? initials(user.name) : <Icon>person</Icon>}</i>
        <span>{name}</span>
        <Icon>unfold_more</Icon>
      </summary>
      <div className={styles.menu}>
        <Link
          href="/settings/profile"
          onClick={() => {
            if (root.current) root.current.open = false;
          }}
        >
          <Icon>manage_accounts</Icon>
          {locale === 'fr' ? 'Paramètres du profil' : 'Profile settings'}
        </Link>
        <button type="button" disabled={pending} onClick={() => void signOut()}>
          <Icon>logout</Icon>
          {pending
            ? locale === 'fr'
              ? 'Déconnexion…'
              : 'Signing out…'
            : locale === 'fr'
              ? 'Se déconnecter'
              : 'Sign out'}
        </button>
        {failed ? (
          <p role="alert">
            {locale === 'fr'
              ? 'La déconnexion a échoué. Réessayez.'
              : 'Sign out failed. Please try again.'}
          </p>
        ) : null}
      </div>
    </details>
  );
}
