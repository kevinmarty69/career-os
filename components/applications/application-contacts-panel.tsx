'use client';

import { useEffect, useState } from 'react';
import { useLocalizer } from '@/components/i18n/i18n-provider';
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

export function ApplicationContactsPanel({
  applicationId,
}: {
  applicationId: string;
}) {
  const localize = useLocalizer([dossierMessages]);
  const [contacts, setContacts] = useState<ApplicationContact[]>();
  const [error, setError] = useState(false);

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

  return localize(
    <section className="co-panel co-application-contacts">
      <header>
        <div>
          <p>Approche humaine</p>
          <h2>Personnes à contacter</h2>
          <span>
            Trois profils publics maximum, classés et sourcés. Vous gardez la
            main sur chaque message et chaque envoi.
          </span>
        </div>
        <span className="co-badge muted">{contacts?.length ?? 0} / 3</span>
      </header>
      {error ? (
        <p role="alert">Les contacts n’ont pas pu être chargés.</p>
      ) : !contacts ? (
        <p>Chargement des contacts…</p>
      ) : contacts.length ? (
        <div className="co-contact-grid">
          {contacts.map((contact) => (
            <ContactCard initial={contact} key={contact.contactId} />
          ))}
        </div>
      ) : (
        <div className="co-contact-empty">
          <span className="material-symbols-rounded" aria-hidden="true">
            person_search
          </span>
          <h3>Aucune suggestion pour le moment</h3>
          <p>
            La recherche de contacts publics apparaîtra ici. Aucun profil privé
            n’est collecté et rien n’est envoyé automatiquement.
          </p>
        </div>
      )}
    </section>,
  );
}

function ContactCard({ initial }: { initial: ApplicationContact }) {
  const localize = useLocalizer([dossierMessages]);
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

  return localize(
    <article className="co-contact-card">
      <header>
        <span className="co-contact-rank">{contact.rank}</span>
        <div>
          <h3>{contact.name}</h3>
          <p>{contact.role}</p>
        </div>
        <span className={`co-badge ${confidenceTone(contact.confidence)}`}>
          {confidenceLabel(contact.confidence)}
        </span>
      </header>
      <div className="co-contact-meta">
        <span>{relationshipLabel(contact.relationship)}</span>
        <a href={contact.profileUrl} rel="noreferrer" target="_blank">
          Ouvrir le profil
          <span className="material-symbols-rounded" aria-hidden="true">
            open_in_new
          </span>
        </a>
      </div>
      <p className="co-contact-rationale">{contact.rationale}</p>
      <details>
        <summary>Sources datées · {contact.sources.length}</summary>
        <ul>
          {contact.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer" target="_blank">
                {source.title}
              </a>
              <time dateTime={source.collectedAt}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                }).format(new Date(source.collectedAt))}
              </time>
            </li>
          ))}
        </ul>
      </details>
      <form onSubmit={save}>
        <MessageField
          label="Note de connexion"
          onChange={(connectionNote) =>
            setContact((current) => ({ ...current, connectionNote }))
          }
          onCopy={() => copy(contact.connectionNote)}
          value={contact.connectionNote}
        />
        <MessageField
          label="Message après acceptation"
          onChange={(acceptedMessage) =>
            setContact((current) => ({ ...current, acceptedMessage }))
          }
          onCopy={() => copy(contact.acceptedMessage)}
          value={contact.acceptedMessage}
        />
        <MessageField
          label="Relance optionnelle"
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
            Statut manuel
            <select
              onChange={(event) =>
                setContact((current) => ({
                  ...current,
                  status: event.target.value as ApplicationContact['status'],
                }))
              }
              value={contact.status}
            >
              <option value="suggested">Suggéré</option>
              <option value="contacted">Contacté</option>
              <option value="accepted">Connexion acceptée</option>
              <option value="follow_up">À relancer</option>
              <option value="replied">Réponse reçue</option>
              <option value="closed">Clôturé</option>
            </select>
          </label>
          <label>
            Date de relance
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
              ? 'Suivi enregistré.'
              : feedback === 'copied'
                ? 'Message copié.'
                : feedback === 'error'
                  ? 'La modification n’a pas été enregistrée.'
                  : 'Aucun envoi automatique.'}
          </p>
          <button className="co-button" disabled={saving} type="submit">
            {saving ? 'Enregistrement…' : 'Enregistrer le suivi'}
          </button>
        </footer>
      </form>
    </article>,
  );
}

function MessageField({
  label,
  onChange,
  onCopy,
  optional = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  optional?: boolean;
  value: string;
}) {
  return (
    <label className="co-contact-message">
      <span>
        {label}
        <button disabled={!value} onClick={onCopy} type="button">
          Copier
        </button>
      </span>
      <textarea
        maxLength={label === 'Note de connexion' ? 500 : 2_000}
        onChange={(event) => onChange(event.target.value)}
        required={!optional}
        rows={3}
        value={value}
      />
    </label>
  );
}

function confidenceTone(confidence: ApplicationContact['confidence']) {
  return confidence === 'verified'
    ? 'ok'
    : confidence === 'likely'
      ? 'warn'
      : 'muted';
}

function confidenceLabel(confidence: ApplicationContact['confidence']) {
  return confidence === 'verified'
    ? 'Vérifié'
    : confidence === 'likely'
      ? 'Probable'
      : 'Incertain';
}

function relationshipLabel(relationship: ApplicationContact['relationship']) {
  return {
    hiring_manager: 'Hiring manager',
    founder_or_technical_leader: 'Fondateur ou direction technique',
    internal_recruiter: 'Recrutement interne',
    job_author: 'Auteur de l’offre',
    team_leader: 'Responsable d’équipe',
  }[relationship];
}

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
