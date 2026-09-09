'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useUnsavedChanges } from '@/components/use-unsaved-changes';
import { AppShell } from '@/components/layout/app-shell';
import { useI18n } from '@/components/i18n/i18n-provider';
import { Button, Icon, Overline } from '@/components/ui/controls';
import { Field, TextArea } from '@/components/ui/form';
import { Card, Panel } from '@/components/ui/surfaces';
import { SkeletonBlock, useDelayedPending } from '@/components/ui/feedback';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  applicationTimelineEventSchema,
  applicationTimelineListSchema,
} from '@/lib/application-timeline';
import {
  readApplication,
  readApplicationTimeline,
  createApplicationTimelineEvent,
} from '@/lib/career-api';
import {
  readDebrief,
  serializeDebrief,
  type InterviewDebrief,
} from '@/lib/interview-debrief';

const empty: InterviewDebrief = {
  version: 1,
  feeling: 3,
  nextStep: '',
  questions: [{ question: '', answer: '', coverage: 'gap' }],
  notes: '',
};

export function InterviewDebriefScreen({
  applicationId,
}: {
  applicationId: string;
}) {
  const fr = useI18n().locale === 'fr';
  const [application, setApplication] = useState<Application>();
  const [draft, setDraft] = useState(empty);
  const [saved, setSaved] = useState<string>();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const pending = useDelayedPending(!application && !error);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [app, timeline] = await Promise.all([
          readApplication(applicationId, controller.signal),
          readApplicationTimeline(applicationId, controller.signal),
        ]);
        if (!app.ok || !timeline.ok) throw new Error();
        const details = applicationSchema.parse(await app.json());
        const events = applicationTimelineListSchema.parse(
          await timeline.json(),
        ).events;
        const previous = events.find(
          (event) => event.kind === 'interview' && readDebrief(event.note),
        );
        if (controller.signal.aborted) return;
        if (previous) {
          setDraft(readDebrief(previous.note)!);
          setSaved(previous.createdAt);
        }
        setApplication(details);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [applicationId]);
  const dirty =
    !saved &&
    !!(
      draft.notes ||
      draft.nextStep ||
      draft.questions.some((item) => item.question || item.answer)
    );
  useUnsavedChanges(
    dirty,
    fr
      ? 'Quitter sans enregistrer le débrief ?'
      : 'Leave without saving the debrief?',
  );
  function change(next: InterviewDebrief) {
    setDraft(next);
    setSaved(undefined);
  }
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(false);
    try {
      const response = await createApplicationTimelineEvent(applicationId, {
        kind: 'interview',
        title: fr ? 'Débrief d’entretien' : 'Interview debrief',
        note: serializeDebrief(draft),
        occurredAt: new Date().toISOString(),
      });
      if (!response.ok) throw new Error();
      setSaved(
        applicationTimelineEventSchema.parse(await response.json()).createdAt,
      );
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <AppShell path="/applications">
      <div className="co-kit flex flex-col gap-[22px]">
        <Overline>
          {application?.company ?? (fr ? 'Entretien' : 'Interview')}
        </Overline>
        <h1 className="m-0 text-display">
          {fr ? 'Comment ça s’est passé ?' : 'How did the interview go?'}
        </h1>
        {error && (
          <p role="alert">
            {fr
              ? 'Chargement ou enregistrement impossible. Vos notes restent sur cette page.'
              : 'Could not load or save. Your notes remain on this page.'}
          </p>
        )}
        {error && !application && (
          <Link href="/applications">
            {fr ? 'Retour aux candidatures' : 'Back to applications'}
          </Link>
        )}
        {!application ? (
          pending && <SkeletonBlock />
        ) : (
          <>
            <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <Field label={fr ? 'Votre ressenti' : 'How you felt'}>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Button
                        key={value}
                        disabled={saving}
                        aria-pressed={draft.feeling === value}
                        variant={
                          draft.feeling === value ? 'primary' : 'secondary'
                        }
                        onClick={() => change({ ...draft, feeling: value })}
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field
                  label={fr ? 'Suite annoncée' : 'Expected next step'}
                  htmlFor="debrief-next"
                >
                  <TextArea
                    id="debrief-next"
                    rows={2}
                    maxLength={100}
                    disabled={saving}
                    value={draft.nextStep}
                    onChange={(nextStep) => change({ ...draft, nextStep })}
                  />
                </Field>
                <h2 className="m-0 text-section">
                  {fr ? 'Les questions posées' : 'Questions you were asked'}
                </h2>
                {draft.questions.map((question, index) => (
                  <Card key={index}>
                    <Field
                      label={
                        fr ? `Question ${index + 1}` : `Question ${index + 1}`
                      }
                      htmlFor={`debrief-question-${index}`}
                    >
                      <TextArea
                        id={`debrief-question-${index}`}
                        value={question.question}
                        disabled={saving}
                        maxLength={100}
                        rows={2}
                        onChange={(value) =>
                          change({
                            ...draft,
                            questions: draft.questions.map((item, i) =>
                              i === index ? { ...item, question: value } : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field
                      label={fr ? 'Votre réponse' : 'Your answer'}
                      htmlFor={`debrief-answer-${index}`}
                    >
                      <TextArea
                        id={`debrief-answer-${index}`}
                        value={question.answer}
                        disabled={saving}
                        maxLength={200}
                        onChange={(value) =>
                          change({
                            ...draft,
                            questions: draft.questions.map((item, i) =>
                              i === index ? { ...item, answer: value } : item,
                            ),
                          })
                        }
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      {(['covered', 'gap', 'acknowledged'] as const).map(
                        (coverage) => (
                          <Button
                            key={coverage}
                            disabled={saving}
                            aria-pressed={question.coverage === coverage}
                            variant={
                              question.coverage === coverage
                                ? 'primary'
                                : 'secondary'
                            }
                            onClick={() =>
                              change({
                                ...draft,
                                questions: draft.questions.map((item, i) =>
                                  i === index ? { ...item, coverage } : item,
                                ),
                              })
                            }
                          >
                            {coverage === 'covered'
                              ? fr
                                ? 'Bien couvert'
                                : 'Well covered'
                              : coverage === 'gap'
                                ? fr
                                  ? 'Trou à combler'
                                  : 'Evidence gap'
                                : fr
                                  ? 'Écart assumé'
                                  : 'Acknowledged gap'}
                          </Button>
                        ),
                      )}
                    </div>
                    {draft.questions.length > 1 && (
                      <Button
                        variant="ghost"
                        disabled={saving}
                        onClick={() =>
                          change({
                            ...draft,
                            questions: draft.questions.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        {fr ? 'Retirer cette question' : 'Remove question'}
                      </Button>
                    )}
                  </Card>
                ))}
                {draft.questions.length < 3 && (
                  <Button
                    disabled={saving}
                    icon="add"
                    onClick={() =>
                      change({
                        ...draft,
                        questions: [
                          ...draft.questions,
                          { question: '', answer: '', coverage: 'gap' },
                        ],
                      })
                    }
                  >
                    {fr ? 'Ajouter une question' : 'Add a question'}
                  </Button>
                )}
                <Field
                  label={fr ? 'Notes libres' : 'Private notes'}
                  htmlFor="debrief-notes"
                >
                  <TextArea
                    id="debrief-notes"
                    value={draft.notes}
                    disabled={saving}
                    maxLength={300}
                    onChange={(notes) => change({ ...draft, notes })}
                  />
                </Field>
              </Panel>
              <aside className="flex flex-col gap-4">
                <Card>
                  <Icon name="shield" />
                  <h2 className="m-0 text-section">
                    {fr
                      ? 'Privé, sans vérification automatique'
                      : 'Private, without automatic verification'}
                  </h2>
                  <p className="m-0 text-body-sm">
                    {fr
                      ? 'Un débrief ne prouve pas vos affirmations et ne modifie aucune page partagée. Il conserve les questions et ce qu’il reste à documenter.'
                      : 'A debrief does not verify your claims or change a shared page. It preserves the questions and the evidence you still need.'}
                  </p>
                </Card>
                {draft.questions.some(
                  (item) => item.coverage === 'gap' && item.question,
                ) && (
                  <Card>
                    <Overline>
                      {fr ? 'Trous à combler' : 'Evidence gaps'}
                    </Overline>
                    {draft.questions
                      .filter(
                        (item) => item.coverage === 'gap' && item.question,
                      )
                      .map((item, index) => (
                        <p key={index} className="m-0 text-body-sm">
                          {item.question}
                        </p>
                      ))}
                    <Link href="/memory/interview">
                      {fr
                        ? 'Ouvrir l’entretien guidé'
                        : 'Open guided interview'}
                    </Link>
                  </Card>
                )}
                {saved && (
                  <Card>
                    <Icon name="check_circle" />
                    <p role="status">
                      {fr
                        ? 'Débrief enregistré dans le journal privé'
                        : 'Debrief saved in the private timeline'}
                    </p>
                    <time dateTime={saved}>{saved.slice(0, 10)}</time>
                  </Card>
                )}
              </aside>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link href={`/applications/${applicationId}/timeline`}>
                {fr ? 'Revenir au dossier' : 'Back to application'}
              </Link>
              <Button
                variant="primary"
                disabled={
                  saving ||
                  !!saved ||
                  draft.questions.some((item) => !item.question.trim())
                }
                onClick={() => void save()}
              >
                {saving
                  ? fr
                    ? 'Enregistrement…'
                    : 'Saving…'
                  : fr
                    ? 'Enregistrer le débrief'
                    : 'Save debrief'}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
