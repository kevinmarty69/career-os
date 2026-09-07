'use client';

import { useI18n } from '@/components/i18n/i18n-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Icon, PageHeader, Stat } from '@/components/ui/primitives';
import {
  type ApplicationInsights,
  applicationInsightsSchema,
} from '@/lib/application-insights';
import { readApplicationInsights } from '@/lib/career-api';
import { useEffect, useState } from 'react';

export function InsightsScreen() {
  const { locale } = useI18n();
  const [insights, setInsights] = useState<ApplicationInsights>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void readApplicationInsights(controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setInsights(applicationInsightsSchema.parse(await response.json()));
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);
  const copy =
    locale === 'fr'
      ? {
          intro:
            'Des tendances descriptives tirées de vos candidatures et événements enregistrés.',
          total: 'Candidatures suivies',
          coverage: 'Avec une réponse enregistrée',
          interviews: 'Entretiens enregistrés',
          outcomes: 'Résultats enregistrés',
          trend: 'Activité sur 8 semaines',
          responses: 'Réponses',
          noActivity: 'Aucune activité enregistrée sur cette période.',
          basis: 'Base de lecture',
          sent: 'candidatures marquées envoyées ou à une étape ultérieure',
          answered: 'ont au moins une réponse enregistrée',
          boundary:
            'Ces chiffres décrivent vos données. Ils n’attribuent aucune réponse à une page privée, une preuve, un wording ou une action des agents.',
          loading: 'Calcul des tendances…',
          error: 'Les tendances ne peuvent pas être chargées.',
        }
      : {
          intro:
            'Descriptive trends from your recorded applications and timeline events.',
          total: 'Tracked applications',
          coverage: 'With a recorded response',
          interviews: 'Recorded interviews',
          outcomes: 'Recorded outcomes',
          trend: 'Activity over 8 weeks',
          responses: 'Responses',
          noActivity: 'No activity was recorded during this period.',
          basis: 'Reading basis',
          sent: 'applications marked sent or at a later stage',
          answered: 'have at least one recorded response',
          boundary:
            'These figures describe your data. They do not attribute any response to a private page, evidence item, wording choice, or agent action.',
          loading: 'Calculating trends…',
          error: 'Trends could not be loaded.',
        };
  const maximum = Math.max(
    1,
    ...(insights?.weekly.map(
      (week) => week.responses + week.interviews + week.outcomes,
    ) ?? [1]),
  );
  return (
    <AppShell path="/insights">
      <PageHeader title="Insights" copy={copy.intro} />
      {state === 'loading' ? <p>{copy.loading}</p> : null}
      {state === 'error' ? (
        <p className="co-error" role="alert">
          {copy.error}
        </p>
      ) : null}
      <div className="co-stats">
        <Stat
          icon="trending_up"
          value={String(insights?.totalApplications ?? '—')}
          label={copy.total}
        />
        <Stat
          icon="mark_email_read"
          value={
            insights?.responseCoveragePct === null || !insights
              ? '—'
              : `${insights.responseCoveragePct}%`
          }
          label={copy.coverage}
        />
        <Stat
          icon="record_voice_over"
          value={String(insights?.interviews ?? '—')}
          label={copy.interviews}
        />
        <Stat
          icon="flag"
          value={String(insights?.outcomes ?? '—')}
          label={copy.outcomes}
        />
      </div>
      <div className="co-insights-grid">
        <section className="co-panel">
          <h2>{copy.trend}</h2>
          <div className="co-insight-weeks">
            {insights?.weekly.map((week) => {
              const total = week.responses + week.interviews + week.outcomes;
              return (
                <div key={week.weekStart}>
                  <span title={`${total}`}>
                    <i style={{ height: `${(total / maximum) * 100}%` }} />
                  </span>
                  <small>
                    {new Intl.DateTimeFormat(locale, {
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(week.weekStart))}
                  </small>
                </div>
              );
            })}
          </div>
          {insights &&
          !insights.weekly.some(
            (week) => week.responses + week.interviews + week.outcomes,
          ) ? (
            <p className="co-insight-empty">{copy.noActivity}</p>
          ) : null}
        </section>
        <section className="co-panel">
          <h2>{copy.basis}</h2>
          <p className="co-insight-basis">
            <strong>{insights?.applicationsWithResponse ?? '—'}</strong>{' '}
            {copy.answered}
          </p>
          <p className="co-insight-basis">
            <strong>{insights?.sentOrLater ?? '—'}</strong> {copy.sent}
          </p>
          <div className="co-note">
            <Icon>info</Icon>
            {copy.boundary}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
