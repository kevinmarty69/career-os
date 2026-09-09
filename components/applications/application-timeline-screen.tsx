'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import { ApplicationContactsPanel } from '@/components/applications/application-contacts-panel';
import { ApplicationTasksPanel } from '@/components/applications/application-tasks-panel';
import { useI18n } from '@/components/i18n/i18n-provider';
import { DossierShell } from '@/components/layout/dossier-shell';
import { Badge, Icon } from '@/components/ui/primitives';
import {
  type Application,
  applicationSchema,
} from '@/lib/application-contract';
import {
  type ApplicationTimelineEvent,
  applicationTimelineEventSchema,
  applicationTimelineListSchema,
} from '@/lib/application-timeline';
import {
  createApplicationTimelineEvent,
  readApplication,
  readApplicationTimeline,
} from '@/lib/career-api';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readDebrief } from '@/lib/interview-debrief';

export function ApplicationTimelineScreen({
  applicationId,
}: {
  applicationId: string;
}) {
  const t = useTranslations([dossierMessages, applicationsMessages]);

  const { locale } = useI18n();
  const [result, setResult] = useState<{
    applicationId: string;
    application?: Application;
    events?: ApplicationTimelineEvent[];
    error?: 'auth' | 'missing' | 'unavailable';
  }>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const current = result?.applicationId === applicationId ? result : undefined;
  const application = current?.application;
  const events = current?.events ?? [];

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readApplication(applicationId, controller.signal),
      readApplicationTimeline(applicationId, controller.signal),
    ])
      .then(async ([applicationResponse, timelineResponse]) => {
        if (
          applicationResponse.status === 401 ||
          timelineResponse.status === 401
        )
          return setResult({ applicationId, error: 'auth' });
        if (
          applicationResponse.status === 404 ||
          timelineResponse.status === 404
        )
          return setResult({ applicationId, error: 'missing' });
        if (!applicationResponse.ok || !timelineResponse.ok)
          return setResult({ applicationId, error: 'unavailable' });
        const parsedApplication = applicationSchema.safeParse(
          await applicationResponse.json(),
        );
        const parsedTimeline = applicationTimelineListSchema.safeParse(
          await timelineResponse.json(),
        );
        if (!parsedApplication.success || !parsedTimeline.success)
          return setResult({ applicationId, error: 'unavailable' });
        setResult({
          applicationId,
          application: parsedApplication.data,
          events: parsedTimeline.data.events,
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== 'AbortError')
          setResult({ applicationId, error: 'unavailable' });
      });
    return () => controller.abort();
  }, [applicationId]);

  async function addEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!application || saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setSaveError(false);
    try {
      const response = await createApplicationTimelineEvent(applicationId, {
        kind: String(form.get('kind')) as ApplicationTimelineEvent['kind'],
        title: String(form.get('title') ?? ''),
        note: String(form.get('note') ?? ''),
        occurredAt: new Date(String(form.get('occurredAt'))).toISOString(),
      });
      if (!response.ok) throw new Error();
      const created = applicationTimelineEventSchema.parse(
        await response.json(),
      );
      setResult({ applicationId, application, events: [created, ...events] });
      formElement.reset();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const identity = application
    ? { applicationId, company: application.company, role: application.role }
    : {
        applicationId,
        company: t('dossier.application'),
        role: t('dossier.loading'),
      };

  return (
    <DossierShell
      active="timeline"
      actions={null}
      identity={identity}
      state={
        application ? (
          <Badge tone="muted">{t('dossier.manual.log.persisted.data')}</Badge>
        ) : undefined
      }
    >
      <div className="co-dossier-content co-application-timeline">
        {!application ? (
          <section className="co-panel co-live-dossier-state">
            <h1>
              {current?.error === 'auth'
                ? t('dossier.sign.in.to.open.this.application')
                : current?.error === 'missing'
                  ? t('dossier.this.application.could.not.be.found')
                  : current?.error === 'unavailable'
                    ? t('dossier.unable.to.load.this.application')
                    : t('dossier.loading.application.activity')}
            </h1>
          </section>
        ) : (
          <>
            <section className="co-panel co-timeline-intro">
              <p>{t('dossier.application.activity')}</p>
              <h1>{t('dossier.contacts.interviews.and.outcomes')}</h1>
              <Link
                className="co-button quiet"
                href={`/applications/${applicationId}/debrief`}
              >
                {locale === 'fr' ? 'Débrief d’entretien' : 'Interview debrief'}
              </Link>
              <span>
                {t(
                  'dossier.keep.important.interactions.in.a.factual.log.nothing.is',
                )}{' '}
              </span>
            </section>
            <ApplicationContactsPanel
              applicationId={applicationId}
              company={application.company}
            />
            <section className="co-panel co-timeline-form">
              <h2>{t('dossier.add.an.event')}</h2>
              <form onSubmit={addEvent}>
                <label>
                  {t('applications.type')}{' '}
                  <select defaultValue="contact" name="kind">
                    <option value="contact">Contact</option>
                    <option value="interview">
                      {t('applications.interview')}
                    </option>
                    <option value="response">{t('dossier.response')}</option>
                    <option value="outcome">{t('dossier.outcome')}</option>
                  </select>
                </label>
                <label>
                  {t('dossier.date.and.time')}{' '}
                  <input name="occurredAt" required type="datetime-local" />
                </label>
                <label className="wide">
                  {t('dossier.title')}{' '}
                  <input
                    maxLength={200}
                    name="title"
                    placeholder={t(
                      'dossier.technical.interview.with.the.product.team',
                    )}
                    required
                  />
                </label>
                <label className="wide">
                  {t('dossier.notes')}{' '}
                  <textarea
                    maxLength={2_000}
                    name="note"
                    placeholder={t(
                      'dossier.decisions.expectations.and.next.step',
                    )}
                    rows={3}
                  />
                </label>
                <button className="co-button" disabled={saving} type="submit">
                  {saving ? t('applications.saving') : t('dossier.add.to.log')}
                </button>
                {saveError ? (
                  <p role="alert">
                    {t('dossier.the.event.could.not.be.saved')}
                  </p>
                ) : null}
              </form>
            </section>
            <section className="co-panel co-timeline-list">
              <header>
                <h2>{t('dossier.activity.log')}</h2>
                <Badge>{events.length}</Badge>
              </header>
              {events.length ? (
                events.map((event) => (
                  <article key={event.eventId}>
                    <Icon>{timelineIcon(event.kind)}</Icon>
                    <div>
                      <p>
                        <strong>{event.title}</strong>
                        <Badge tone={event.kind === 'outcome' ? 'ok' : 'muted'}>
                          {timelineKindLabel(event.kind, locale)}
                        </Badge>
                      </p>
                      <time dateTime={event.occurredAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(event.occurredAt))}
                      </time>
                      {event.note ? (
                        readDebrief(event.note) ? (
                          <Link href={`/applications/${applicationId}/debrief`}>
                            {locale === 'fr'
                              ? 'Ouvrir le débrief privé'
                              : 'Open private debrief'}
                          </Link>
                        ) : (
                          <span>{event.note}</span>
                        )
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="co-timeline-empty">
                  <Icon>calendar_add_on</Icon>
                  <h3>{t('dossier.no.activity.yet')}</h3>
                  <p>
                    {t(
                      'dossier.add.the.first.contact.or.interview.for.this.application',
                    )}{' '}
                  </p>
                </div>
              )}
            </section>
            <ApplicationTasksPanel applicationId={applicationId} />
          </>
        )}
      </div>
    </DossierShell>
  );
}

export function timelineKindLabel(
  kind: ApplicationTimelineEvent['kind'],
  locale: 'en' | 'fr',
) {
  const labels = {
    contact: ['Contact', 'Contact'],
    interview: ['Interview', 'Entretien'],
    response: ['Response', 'Réponse'],
    outcome: ['Outcome', 'Résultat'],
  } as const;
  return labels[kind][locale === 'en' ? 0 : 1];
}

export function timelineIcon(kind: ApplicationTimelineEvent['kind']) {
  return {
    contact: 'person',
    interview: 'record_voice_over',
    response: 'mark_email_read',
    outcome: 'flag',
  }[kind];
}
