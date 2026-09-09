'use client';

import { useI18n } from '@/components/i18n/i18n-provider';
import { SettingsShell } from '@/components/layout/settings-shell';
import { PageHeader } from '@/components/ui/primitives';
import { Button, Icon } from '@/components/ui/controls';
import { Checkbox } from '@/components/ui/form';
import { Card, Panel } from '@/components/ui/surfaces';
import { SkeletonBlock, useDelayedPending } from '@/components/ui/feedback';
import { useNotificationPreferences } from './use-notification-preferences';

export function NotificationSettingsScreen() {
  const fr = useI18n().locale === 'fr';
  const state = useNotificationPreferences();
  const pending = useDelayedPending(!state.preferences && !state.error);
  const options = [
    [
      'reviewReady',
      'Une revue est prête à être tranchée',
      'A review is ready for your decision',
    ],
    ['runFailed', 'Un run a échoué', 'A run failed'],
    [
      'followUp',
      'Rappel de relance programmé',
      'A scheduled follow-up reminder',
    ],
    [
      'pageOpened',
      'Chaque ouverture de page privée',
      'Each private page opening',
    ],
    ['weeklyDigest', 'Résumé hebdomadaire', 'Weekly summary'],
  ] as const;
  return (
    <SettingsShell active="/settings/notifications">
      <PageHeader title="Notifications" />
      <div className="co-kit flex flex-col gap-[22px]">
        <Panel>
          <h2 className="m-0 text-section">
            {fr ? 'Ce qui mérite un email' : 'What deserves an email'}
          </h2>
          <p className="m-0 text-body-sm text-ink-600">
            {fr
              ? 'Préférences enregistrées dans votre compte Supabase. L’envoi d’emails produit n’est pas activé sur cette instance : ces choix ne déclenchent aucun envoi.'
              : 'Preferences are saved to your Supabase account. Product email delivery is not enabled on this instance: these choices do not send emails.'}
          </p>
          {state.error && (
            <div role="alert">
              <p>
                {fr
                  ? 'Enregistrement ou chargement impossible. Votre dernier choix enregistré est conservé.'
                  : 'Could not load or save preferences. Your last saved choice is unchanged.'}
              </p>
              <Button onClick={state.retry}>
                {fr ? 'Réessayer' : 'Retry'}
              </Button>
            </div>
          )}
          {!state.preferences ? (
            pending && <SkeletonBlock />
          ) : (
            <Card>
              {options.map(([key, french, english]) => (
                <div key={key} className="border-b border-panel py-[13px]">
                  <Checkbox
                    checked={state.preferences![key]}
                    disabled={state.saving}
                    label={fr ? french : english}
                    onChange={(checked) =>
                      void state.save({ ...state.preferences!, [key]: checked })
                    }
                  />
                </div>
              ))}
            </Card>
          )}
          <span role="status" className="text-caption text-ink-600">
            {state.saving
              ? fr
                ? 'Enregistrement…'
                : 'Saving…'
              : state.preferences && !state.error
                ? fr
                  ? 'Préférences enregistrées'
                  : 'Preferences saved'
                : ''}
          </span>
        </Panel>
        <Card>
          <Icon name="block" />
          <p className="m-0 text-body-sm">
            {fr
              ? 'Aucun email promotionnel, aucune relance marketing. Un rappel est pour vous : le produit ne contacte jamais un recruteur à votre place.'
              : 'No promotional emails or marketing nudges. A reminder is for you: the product never contacts a recruiter on your behalf.'}
          </p>
        </Card>
      </div>
    </SettingsShell>
  );
}
