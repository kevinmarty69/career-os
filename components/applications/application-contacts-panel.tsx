'use client';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Icon } from '@/components/ui/primitives';
import {
  applicationContactListSchema,
  applicationContactSchema,
  type ApplicationContact,
} from '@/lib/application-contact';
import {
  readApplicationContacts,
  updateApplicationContact,
} from '@/lib/career-api';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import type { Translator } from '@/lib/i18n/messages';
import styles from './application-flow.module.css';

export function ApplicationContactsPanel({
  applicationId,
  company,
}: {
  applicationId: string;
  company: string;
}) {
  const t = useTranslations([dossierMessages]);
  const { locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useRef<HTMLDialogElement>(null);
  const [contacts, setContacts] = useState<ApplicationContact[]>();
  const [error, setError] = useState(false);
  const open = searchParams.get('contacts') === '1';

  useEffect(() => {
    const controller = new AbortController();
    void readApplicationContacts(applicationId, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setContacts(
          applicationContactListSchema.parse(await response.json()).contacts,
        );
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== 'AbortError'
        )
          setError(true);
      });
    return () => controller.abort();
  }, [applicationId]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  function setOpen(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('contacts', '1');
    else params.delete('contacts');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <>
      <section className={styles.contactsEntry}>
        <span>
          <Icon>group_search</Icon>
        </span>
        <div>
          <h2>{t('dossier.people.to.contact')}</h2>
          <p>
            {contacts?.length
              ? locale === 'en'
                ? `${contacts.length} sourced public profile${contacts.length === 1 ? '' : 's'}, ranked for this application.`
                : `${contacts.length} profil${contacts.length === 1 ? '' : 's'} public${contacts.length === 1 ? '' : 's'} sourcé${contacts.length === 1 ? '' : 's'}, classé${contacts.length === 1 ? '' : 's'} pour cette candidature.`
              : t(
                  'dossier.up.to.three.ranked.sourced.public.profiles.you.control',
                )}
          </p>
        </div>
        <button
          className="co-button"
          disabled={error || !contacts}
          onClick={() => setOpen(true)}
          type="button"
        >
          {locale === 'en' ? 'Open contacts' : 'Qui contacter'}
          <Icon>arrow_forward</Icon>
        </button>
      </section>

      <dialog
        aria-labelledby="contacts-drawer-title"
        className={styles.contactsDrawer}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        ref={dialog}
      >
        <header>
          <div>
            <Icon>group_search</Icon>
            <span>
              <h2 id="contacts-drawer-title">
                {locale === 'en'
                  ? `People to contact at ${company}`
                  : `Qui contacter chez ${company}`}
              </h2>
              <p>
                {contacts?.length ?? 0}{' '}
                {locale === 'en'
                  ? 'public profiles · ranked for this application'
                  : 'profils publics · classés pour cette candidature'}
              </p>
            </span>
          </div>
          <button
            aria-label={
              locale === 'en' ? 'Close contacts' : 'Fermer les contacts'
            }
            onClick={() => setOpen(false)}
            type="button"
          >
            <Icon>close</Icon>
          </button>
          <aside>
            <Icon>shield</Icon>
            <span>
              {locale === 'en'
                ? 'Career OS finds public profiles; you decide. No connection request or message is ever sent automatically.'
                : 'Career OS trouve les profils publics ; vous décidez. Aucune demande de connexion ni aucun message ne sont envoyés automatiquement.'}
            </span>
          </aside>
        </header>

        <div className={styles.contactsDrawerBody}>
          {error ? (
            <p role="alert">{t('dossier.contacts.could.not.be.loaded')}</p>
          ) : !contacts ? (
            <p>{t('dossier.loading.contacts')}</p>
          ) : contacts.length ? (
            contacts.map((contact) => (
              <ContactCard initial={contact} key={contact.contactId} />
            ))
          ) : (
            <div className="co-contact-empty">
              <Icon>person_search</Icon>
              <h3>{t('dossier.no.suggestions.yet')}</h3>
              <p>
                {t(
                  'dossier.public.contact.research.will.appear.here.no.private.profile',
                )}
              </p>
            </div>
          )}
        </div>
        <footer>
          <Icon>info</Icon>
          <span>
            {locale === 'en'
              ? 'These profiles belong to this application, not to your career memory.'
              : 'Ces profils appartiennent à cette candidature, pas à votre mémoire professionnelle.'}
          </span>
        </footer>
      </dialog>
    </>
  );
}

function ContactCard({ initial }: { initial: ApplicationContact }) {
  const t = useTranslations([dossierMessages, applicationsMessages]);
  const { locale } = useI18n();
  const [contact, setContact] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'copied' | 'error'>();

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(undefined);
    try {
      const response = await updateApplicationContact(
        contact.applicationId,
        contact.contactId,
        {
          connectionNote: contact.connectionNote,
          acceptedMessage: contact.acceptedMessage,
          followUpMessage: contact.followUpMessage ?? null,
          status: contact.status,
          followUpAt: contact.followUpAt,
          expectedRevision: contact.revision,
        },
      );
      if (!response.ok) throw new Error();
      setContact(applicationContactSchema.parse(await response.json()));
      setFeedback('saved');
    } catch {
      setFeedback('error');
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('copied');
    } catch {
      setFeedback('error');
    }
  }

  return (
    <article className="co-contact-card">
      <header>
        <span className="co-contact-rank">{contact.rank}</span>
        <div>
          <h3>{contact.name}</h3>
          <p>{contact.role}</p>
        </div>
        <span className={`co-badge ${confidenceTone(contact.confidence)}`}>
          {confidenceLabel(t, contact.confidence)}
        </span>
      </header>
      <div className="co-contact-meta">
        <span>{relationshipLabel(t, contact.relationship)}</span>
        <a href={contact.profileUrl} rel="noreferrer" target="_blank">
          {t('dossier.open.profile')}{' '}
          <span className="material-symbols-rounded" aria-hidden="true">
            open_in_new
          </span>
        </a>
      </div>
      <p className="co-contact-rationale">{contact.rationale}</p>
      <details>
        <summary>
          {t('dossier.dated.sources')} {contact.sources.length}
        </summary>
        <ul>
          {contact.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer" target="_blank">
                {source.title}
              </a>
              <time dateTime={source.collectedAt}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                }).format(new Date(source.collectedAt))}
              </time>
            </li>
          ))}
        </ul>
      </details>
      <form onSubmit={save}>
        <MessageField
          label={t('dossier.connection.note')}
          maxLength={500}
          onChange={(connectionNote) =>
            setContact((current) => ({ ...current, connectionNote }))
          }
          onCopy={() => copy(contact.connectionNote)}
          value={contact.connectionNote}
        />
        <MessageField
          label={t('dossier.message.after.acceptance')}
          onChange={(acceptedMessage) =>
            setContact((current) => ({ ...current, acceptedMessage }))
          }
          onCopy={() => copy(contact.acceptedMessage)}
          value={contact.acceptedMessage}
        />
        <MessageField
          label={t('dossier.optional.follow.up')}
          onChange={(followUpMessage) =>
            setContact((current) => ({
              ...current,
              followUpMessage: followUpMessage || undefined,
            }))
          }
          onCopy={() => copy(contact.followUpMessage ?? '')}
          optional
          value={contact.followUpMessage ?? ''}
        />
        <div className="co-contact-tracking">
          <label>
            {t('dossier.manual.status')}{' '}
            <select
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  status: event.target.value as ApplicationContact['status'],
                }))
              }
              value={contact.status}
            >
              <option value="suggested">{t('dossier.suggested')}</option>
              <option value="contacted">{t('dossier.contacted')}</option>
              <option value="accepted">
                {t('dossier.connection.accepted')}
              </option>
              <option value="follow_up">{t('dossier.follow.up')}</option>
              <option value="replied">{t('dossier.reply.received')}</option>
              <option value="closed">{t('dossier.closed')}</option>
            </select>
          </label>
          <label>
            {t('dossier.follow.up.date')}{' '}
            <input
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  followUpAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                }))
              }
              required={contact.status === 'follow_up'}
              type="datetime-local"
              value={localDateTime(contact.followUpAt)}
            />
          </label>
        </div>
        <footer>
          <p aria-live="polite">
            {feedback === 'saved'
              ? t('dossier.tracking.saved')
              : feedback === 'copied'
                ? t('dossier.message.copied')
                : feedback === 'error'
                  ? t('dossier.the.change.could.not.be.saved')
                  : t('dossier.no.automatic.sending')}
          </p>
          <button className="co-button" disabled={saving} type="submit">
            {saving ? t('applications.saving') : t('dossier.save.tracking')}
          </button>
        </footer>
      </form>
    </article>
  );
}

function MessageField({
  label,
  maxLength = 2_000,
  onChange,
  onCopy,
  optional = false,
  value,
}: {
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onCopy: () => void;
  optional?: boolean;
  value: string;
}) {
  const t = useTranslations([dossierMessages]);
  const inputId = useId();

  return (
    <div className="co-contact-message">
      <span>
        <label htmlFor={inputId}>{label}</label>
        <button
          aria-label={t('dossier.copy')}
          disabled={!value}
          onClick={onCopy}
          type="button"
        >
          {t('dossier.copy')}{' '}
        </button>
      </span>
      <textarea
        id={inputId}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required={!optional}
        rows={3}
        value={value}
      />
    </div>
  );
}

function confidenceTone(confidence: ApplicationContact['confidence']) {
  return confidence === 'verified'
    ? 'ok'
    : confidence === 'likely'
      ? 'warn'
      : 'muted';
}

function confidenceLabel(
  t: Translator<typeof dossierMessages>,
  confidence: ApplicationContact['confidence'],
) {
  return confidence === 'verified'
    ? t('dossier.contact.verified')
    : confidence === 'likely'
      ? t('dossier.contact.likely')
      : t('dossier.contact.uncertain');
}

function relationshipLabel(
  t: Translator<typeof dossierMessages>,
  relationship: ApplicationContact['relationship'],
) {
  return {
    hiring_manager: t('dossier.contact.hiring.manager'),
    founder_or_technical_leader: t('dossier.contact.founder'),
    internal_recruiter: t('dossier.contact.recruiter'),
    job_author: t('dossier.contact.job.author'),
    team_leader: t('dossier.contact.team.leader'),
  }[relationship];
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
