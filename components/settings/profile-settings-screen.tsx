'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useI18n } from '@/components/i18n/i18n-provider';
import { PageHeader } from '@/components/ui/primitives';
import { authClient } from '@/lib/auth-client';
import styles from './profile-settings-screen.module.css';

export function ProfileSettingsScreen() {
  const { locale, setLocale } = useI18n();
  const { data: session } = authClient.useSession();
  const [saved, setSaved] = useState(false);
  const fr = locale === 'fr';
  return (
    <AppShell path="/settings/profile">
      <PageHeader
        title={fr ? 'Paramètres du profil' : 'Profile settings'}
        copy={
          fr
            ? 'Vos préférences personnelles, indépendantes des réglages de l’instance.'
            : 'Your personal preferences, separate from instance settings.'
        }
      />
      <section className={styles.preferences}>
        {session?.user ? (
          <header>
            <h2>{session.user.name}</h2>
            <p>{session.user.email}</p>
          </header>
        ) : null}
        <h2>{fr ? 'Préférences' : 'Preferences'}</h2>
        <label htmlFor="interface-language">
          {fr ? 'Langue de l’interface' : 'Interface language'}
        </label>
        <select
          id="interface-language"
          aria-describedby="language-description"
          value={locale}
          onChange={(event) => {
            if (event.target.value === 'en' || event.target.value === 'fr') {
              setLocale(event.target.value);
              setSaved(true);
            }
          }}
        >
          <option lang="fr" value="fr">
            Français
          </option>
          <option lang="en" value="en">
            English
          </option>
        </select>
        <p id="language-description">
          {fr
            ? 'Appliquée immédiatement et mémorisée dans ce navigateur. Vos documents et contenus de candidature ne sont pas traduits.'
            : 'Applied immediately and remembered in this browser. Your documents and application content are not translated.'}
        </p>
        {saved ? (
          <p role="status">
            {fr ? 'Préférence enregistrée.' : 'Preference saved.'}
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
