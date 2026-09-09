'use client';

import { useUnsavedChanges } from '@/components/use-unsaved-changes';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/i18n-provider';
import { useCareerMemory } from '@/components/memory/use-career-memory';
import { AppShell } from '@/components/layout/app-shell';
import {
  Button,
  Icon,
  Overline,
  StatusChip,
  StepDots,
} from '@/components/ui/controls';
import { Card, Panel, ActionBar } from '@/components/ui/surfaces';
import { CharCount, Checkbox, Field, TextArea } from '@/components/ui/form';
import { SkeletonBlock, useDelayedPending } from '@/components/ui/feedback';
import {
  listInterviews,
  readInterview,
  saveInterview,
} from '@/lib/guided-interview';

export function GuidedInterviewScreen({
  sessionId,
  claimId,
}: {
  sessionId?: string;
  claimId?: string;
}) {
  const memory = useCareerMemory();
  const fr = useI18n().locale === 'fr';
  const showSkeleton = useDelayedPending(memory.state === 'loading');
  if (
    !memory.loadError &&
    memory.state !== 'loading' &&
    memory.profile.name.length >= 2 &&
    memory.profile.headline.length >= 2
  )
    return (
      <Interview
        key={sessionId ?? claimId ?? 'default'}
        memory={memory}
        sessionId={sessionId}
        claimId={claimId}
      />
    );
  return (
    <AppShell path="/memory">
      <div className="co-kit flex flex-col gap-[22px]">
        <h1 className="m-0 text-display">
          {fr ? 'Entretien guidé' : 'Guided interview'}
        </h1>
        {memory.loadError ? (
          <Panel>
            <p role="alert">{memory.message}</p>
            <Link href="/memory">
              {fr ? 'Retour à la mémoire' : 'Back to memory'}
            </Link>
          </Panel>
        ) : memory.state === 'loading' ? (
          showSkeleton ? (
            <SkeletonBlock />
          ) : null
        ) : memory.profile.name.length < 2 ||
          memory.profile.headline.length < 2 ? (
          <Panel>
            <h2 className="m-0 text-hero">
              {fr
                ? 'Commençons par votre parcours'
                : 'Start with your background'}
            </h2>
            <p>
              {fr
                ? 'Importez votre CV avant de compléter vos preuves par un entretien.'
                : 'Import your CV before adding evidence through an interview.'}
            </p>
            <Link href="/memory/import">
              {fr ? 'Importer mon CV' : 'Import my CV'}
            </Link>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}

function Interview({
  memory,
  sessionId,
  claimId,
}: {
  memory: ReturnType<typeof useCareerMemory>;
  sessionId?: string;
  claimId?: string;
}) {
  const router = useRouter();
  const fr = useI18n().locale === 'fr';
  const [draft, setDraft] = useState(() => ({
    ...readInterview(memory.profile, sessionId),
    ...(sessionId ? { sessionId } : {}),
    ...(claimId
      ? {
          targetStatement: memory.profile.claims.find(
            (claim) => claim.id === claimId,
          )?.statement,
        }
      : {}),
  }));
  const [started, setStarted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      ...readInterview(memory.profile, sessionId),
      ...(sessionId ? { sessionId } : {}),
      ...(draft.targetStatement
        ? { targetStatement: draft.targetStatement }
        : {}),
    });
  useUnsavedChanges(
    dirty,
    fr
      ? 'Quitter sans sauvegarder cette réponse ?'
      : 'Leave without saving this answer?',
  );
  const questions = fr
    ? [
        'Qu’avez-vous changé exactement ?',
        'Sur quelle période et dans quel contexte ?',
        'Quel était le résultat avant votre intervention ?',
        'Qu’avez-vous mesuré après votre intervention ?',
        'Quel document ou quelle personne pourrait le confirmer ?',
      ]
    : [
        'What exactly did you change?',
        'Over what period and in what context?',
        'What was the outcome before your work?',
        'What did you measure after your work?',
        'Which document or person could confirm it?',
      ];
  const saving = memory.state === 'saving';
  async function persist(next = draft, sign = false) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setError('');
    try {
      const timestamp = sign ? new Date().toISOString() : undefined;
      const profile = saveInterview(
        memory.profile,
        next,
        {
          source: crypto.randomUUID(),
          evidence: crypto.randomUUID(),
          claim: crypto.randomUUID(),
        },
        timestamp,
      );
      if (!(await memory.save(profile))) {
        setError(
          fr
            ? 'Enregistrement impossible. Vos réponses restent sur cette page ; réessayez avant de quitter.'
            : 'Could not save. Your answers remain on this page; retry before leaving.',
        );
        return false;
      }
      setDraft({ ...next, ...(timestamp ? { signedAt: timestamp } : {}) });
      return true;
    } catch {
      setError(
        fr
          ? 'Vérifiez votre texte et réessayez. Vos réponses restent sur cette page.'
          : 'Check your text and retry. Your answers remain on this page.',
      );
      return false;
    } finally {
      inFlight.current = false;
    }
  }
  const notice = (
    <>
      {(error || memory.message) && (
        <p
          role={error ? 'alert' : 'status'}
          className="m-0 text-label text-ink-600"
        >
          {error || memory.message}
        </p>
      )}
    </>
  );
  if (draft.signedAt)
    return (
      <AppShell path="/memory">
        <h1 className="m-0 mb-[22px] text-display">
          {fr ? 'Entretien guidé' : 'Guided interview'}
        </h1>
        <Panel>
          <Overline>{fr ? 'Témoignage signé' : 'Signed testimony'}</Overline>
          <h2 className="m-0 text-hero">
            {fr
              ? 'Votre expérience rejoint votre mémoire'
              : 'Your experience is now in your memory'}
          </h2>
          <Card>
            <StatusChip status="declared" />
            <p className="m-0 text-body-lg">{draft.statement}</p>
            <p className="m-0 text-label text-ink-600">
              {draft.signedAt.slice(0, 10)} · {memory.profile.name}
            </p>
          </Card>
          <p className="m-0 text-body-sm">
            {draft.shareStatement
              ? fr
                ? 'Seul le témoignage relu peut être sélectionné pour vos prochaines candidatures. Les réponses et les références restent privées. L’ancienne formulation reste sans source ; aucune page publiée n’a changé.'
                : 'Only the reviewed statement can be selected for future applications. Answers and references stay private. The old wording remains unsupported; no published page has changed.'
              : fr
                ? 'Conservé comme déclaré par vous, jamais comme documenté. Son usage reste limité à l’entretien. Aucune candidature publiée n’a été modifiée.'
                : 'Kept as declared by you, never as documented. Usage remains limited to interviews. No published application was changed.'}
          </p>
          <Link href="/memory">
            {fr ? 'Voir dans ma mémoire' : 'Open career memory'}
          </Link>
          <Link href="/applications">
            {fr
              ? 'Choisir une candidature à enrichir'
              : 'Choose an application to strengthen'}
          </Link>
          {draft.shareStatement && draft.targetStatement && (
            <AffectedApplications statement={draft.targetStatement} />
          )}
          <Button
            onClick={() => {
              router.push(`/memory/interview?session=${crypto.randomUUID()}`);
            }}
          >
            {fr ? 'Combler le suivant' : 'Start another interview'}
          </Button>
          {notice}
        </Panel>
      </AppShell>
    );
  if (!started)
    return (
      <AppShell path="/memory">
        <h1 className="m-0 mb-[22px] text-display">
          {fr ? 'Entretien guidé' : 'Guided interview'}
        </h1>
        <Panel padding={26}>
          <Overline>
            {fr ? 'Mémoire · entretien guidé' : 'Memory · guided interview'}
          </Overline>
          <h2 className="m-0 text-hero">
            {fr
              ? 'Retrouvons ce que vous avez réellement fait'
              : 'Recover the facts behind your work'}
          </h2>
          {draft.targetStatement && (
            <Card>
              <StatusChip status="unsourced" />
              <p className="m-0 text-body-sm">{draft.targetStatement}</p>
              <span className="text-caption text-ink-600">
                {fr
                  ? 'Formulation à reprendre, pas une réponse suggérée.'
                  : 'Wording to revisit, not a suggested answer.'}
              </span>
            </Card>
          )}
          <div className="grid gap-[18px] lg:grid-cols-2">
            <Card>
              <h3 className="m-0 text-section">
                {fr ? 'Ce qu’on va faire' : 'What happens next'}
              </h3>
              <ol className="m-0 flex flex-col gap-4 pl-5 text-body-sm">
                <li>
                  {fr
                    ? 'Cinq questions courtes sur ce que vous avez fait et mesuré.'
                    : 'Five short questions about what you did and measured.'}
                </li>
                <li>
                  {fr
                    ? 'Vous retrouvez les documents ou les personnes qui peuvent confirmer.'
                    : 'Identify documents or people who could confirm it.'}
                </li>
                <li>
                  {fr
                    ? 'Vous relisez et signez votre témoignage, sans vérification automatique.'
                    : 'Review and sign your testimony, without automatic verification.'}
                </li>
              </ol>
            </Card>
            <Card>
              <Icon name="shield" />
              <h3 className="m-0 text-section">
                {fr
                  ? 'On ne vous soufflera aucun chiffre'
                  : 'No numbers will be suggested'}
              </h3>
              <p className="m-0 text-body-sm text-ink-700">
                {fr
                  ? 'Si vous ne savez pas, passez la question. Ce questionnaire n’exécute aucun modèle. Vos réponses sont sauvegardées à chaque étape.'
                  : 'If you do not know, skip the question. This questionnaire does not run a model. Your answers are saved at each step.'}
              </p>
            </Card>
          </div>
          <ActionBar
            message={fr ? '≈ 10 min · interruptible' : '≈ 10 min · resumable'}
            primary={
              <Button
                variant="primary"
                icon="arrow_forward"
                onClick={() => setStarted(true)}
              >
                {draft.answers.some(Boolean)
                  ? fr
                    ? 'Reprendre'
                    : 'Resume'
                  : fr
                    ? 'Commencer les 5 questions'
                    : 'Start the 5 questions'}
              </Button>
            }
          />
          {notice}
          {!sessionId && listInterviews(memory.profile).length > 0 && (
            <Card>
              <Overline>{fr ? 'Vos entretiens' : 'Your interviews'}</Overline>
              {listInterviews(memory.profile)
                .filter(({ draft: item }) => item.sessionId)
                .map(({ source, draft: item }) => (
                  <Link
                    key={source.id}
                    href={`/memory/interview?session=${item.sessionId}`}
                  >
                    {item.targetStatement ?? source.title} ·{' '}
                    {item.signedAt
                      ? fr
                        ? 'Signé'
                        : 'Signed'
                      : fr
                        ? 'Reprendre'
                        : 'Resume'}
                  </Link>
                ))}
              <Button
                onClick={() =>
                  router.push(
                    `/memory/interview?session=${crypto.randomUUID()}`,
                  )
                }
              >
                {fr ? 'Nouvel entretien' : 'New interview'}
              </Button>
            </Card>
          )}
        </Panel>
      </AppShell>
    );
  return (
    <main
      className="co-kit grid min-h-dvh grid-rows-[auto_1fr_auto] bg-canvas"
      id="main-content"
    >
      <header className="flex flex-wrap items-center gap-5 border-b border-hairline px-[26px] py-[22px]">
        <Button
          variant="icon"
          icon="close"
          aria-label={fr ? 'Sauvegarder et fermer' : 'Save and close'}
          disabled={saving}
          onClick={async () => {
            if (await persist()) setStarted(false);
          }}
        />
        <span className="text-body-lg font-semibold">
          {fr ? 'Entretien guidé' : 'Guided interview'}
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-[1148px] self-center flex-col gap-[26px] px-[22px] py-[40px] sm:px-[34px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Overline>
            {draft.step < 5
              ? fr
                ? `Question ${draft.step + 1} sur 5`
                : `Question ${draft.step + 1} of 5`
              : fr
                ? 'Relecture avant signature'
                : 'Review before signing'}
          </Overline>
          <StepDots total={5} current={draft.step} />
        </div>
        <h1 className="m-0 text-decision">
          {draft.step < 5
            ? questions[draft.step]
            : fr
              ? 'Relisez. C’est vous qui l’affirmez, pas Career OS.'
              : 'Review it. This is your statement, not Career OS’s.'}
        </h1>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_372px]">
          <Card padding={24}>
            {draft.step < 5 ? (
              <Field
                htmlFor="interview-answer"
                label={fr ? 'Votre réponse' : 'Your answer'}
                meta={
                  <CharCount
                    value={draft.answers[draft.step].length}
                    max={1000}
                  />
                }
                hint={
                  fr
                    ? 'Écrivez comme vous le diriez à l’oral. Aucun chiffre ne sera ajouté.'
                    : 'Write as you would speak. No numbers will be added.'
                }
              >
                <TextArea
                  id="interview-answer"
                  maxLength={1000}
                  disabled={saving}
                  value={draft.answers[draft.step]}
                  onChange={(value) => {
                    setConfirmed(false);
                    setDraft({
                      ...draft,
                      answers: draft.answers.map((a, i) =>
                        i === draft.step ? value : a,
                      ),
                    });
                  }}
                />
              </Field>
            ) : (
              <>
                <Field
                  htmlFor="interview-statement"
                  label={fr ? 'Votre témoignage' : 'Your testimony'}
                  meta={<CharCount value={draft.statement.length} max={3000} />}
                  hint={
                    fr
                      ? 'Reprenez uniquement ce que vous avez répondu. Ce texte reste une déclaration personnelle.'
                      : 'Use only facts from your answers. This remains a personal declaration.'
                  }
                >
                  <TextArea
                    id="interview-statement"
                    maxLength={3000}
                    disabled={saving}
                    value={draft.statement}
                    onChange={(value) => {
                      setConfirmed(false);
                      setDraft({ ...draft, statement: value });
                    }}
                  />
                </Field>
                <Checkbox
                  checked={draft.shareStatement ?? false}
                  disabled={saving}
                  onChange={(value) =>
                    setDraft({ ...draft, shareStatement: value })
                  }
                  label={
                    fr
                      ? 'Autoriser uniquement ce texte relu pour mes candidatures et mon CV. Mes réponses restent privées.'
                      : 'Allow only this reviewed text in applications and my resume. My answers stay private.'
                  }
                />
                <Checkbox
                  checked={confirmed}
                  disabled={saving}
                  onChange={setConfirmed}
                  label={
                    fr
                      ? 'J’affirme que ces éléments sont exacts.'
                      : 'I confirm these statements are accurate.'
                  }
                />
                <p className="m-0 text-label text-ink-600">
                  {fr
                    ? 'Source personnelle, non vérifiée. La signature ne rend pas une affirmation automatiquement publiable.'
                    : 'Personal, unverified source. Signing does not automatically make a claim publishable.'}
                </p>
              </>
            )}
          </Card>
          <aside className="flex flex-col gap-4">
            <Card padding={22}>
              <Overline>{fr ? 'DÉJÀ RÉPONDU' : 'YOUR ANSWERS'}</Overline>
              {draft.answers.some(Boolean) ? (
                draft.answers.map((answer, i) =>
                  answer ? (
                    <div key={questions[i]} className="flex gap-3">
                      <Icon name="check_circle" className="text-green-strong" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <strong className="text-label text-ink-600">
                          {questions[i]}
                        </strong>
                        <p className="m-0 break-words text-body-sm text-ink-700">
                          {answer}
                        </p>
                      </div>
                    </div>
                  ) : null,
                )
              ) : (
                <p className="m-0 text-body-sm text-ink-600">
                  {fr
                    ? 'Vos réponses apparaîtront ici au fil de l’entretien.'
                    : 'Your answers will appear here as you progress.'}
                </p>
              )}
            </Card>
            <Card padding={22}>
              <div className="flex gap-3">
                <Icon name="history" />
                <p className="m-0 text-label text-ink-600">
                  {fr
                    ? 'Chaque étape est sauvegardée. Utilisez « Sauvegarder et sortir » avant de quitter une réponse en cours.'
                    : 'Each step is saved. Use “Save and exit” before leaving an answer in progress.'}
                </p>
              </div>
            </Card>
          </aside>
        </div>
        {notice}
      </div>
      <footer className="flex flex-wrap items-center gap-[11px] border-t border-hairline px-[28px] py-5">
        <Button
          disabled={saving}
          onClick={async () => {
            if (await persist()) setStarted(false);
          }}
        >
          {fr ? 'Sauvegarder et sortir' : 'Save and exit'}
        </Button>
        {draft.step > 0 && (
          <Button
            disabled={saving}
            onClick={() => setDraft({ ...draft, step: draft.step - 1 })}
          >
            {fr ? 'Précédente' : 'Previous'}
          </Button>
        )}
        {draft.step < 5 && (
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() =>
              void persist({
                ...draft,
                answers: draft.answers.map((answer, index) =>
                  index === draft.step ? '' : answer,
                ),
                step: draft.step + 1,
              })
            }
          >
            {fr ? 'Je ne sais pas' : 'I don’t know'}
          </Button>
        )}
        <Button
          variant="primary"
          className="ml-auto"
          disabled={
            saving ||
            (draft.step === 5 &&
              (!confirmed ||
                !draft.statement.trim() ||
                !draft.answers.some((answer) => answer.trim())))
          }
          icon="arrow_forward"
          onClick={() =>
            void persist(
              draft.step < 5 ? { ...draft, step: draft.step + 1 } : draft,
              draft.step === 5,
            )
          }
        >
          {saving
            ? fr
              ? 'Enregistrement…'
              : 'Saving…'
            : draft.step < 5
              ? fr
                ? 'Question suivante'
                : 'Next question'
              : fr
                ? 'Signer et ajouter à ma mémoire'
                : 'Sign and add to my memory'}
        </Button>
      </footer>
    </main>
  );
}

const affectedApplicationsSchema = z.object({
  applications: z
    .array(
      z.object({
        applicationId: z.uuid(),
        company: z.string().max(200),
        role: z.string().max(200),
      }),
    )
    .max(100),
});

function AffectedApplications({ statement }: { statement: string }) {
  const fr = useI18n().locale === 'fr';
  const [result, setResult] =
    useState<z.infer<typeof affectedApplicationsSchema>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/profile/affected-applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statement }),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const parsed = affectedApplicationsSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setResult(parsed);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [statement, attempt]);
  return (
    <Card>
      <h3 className="m-0 text-section">
        {fr ? 'Candidatures à reprendre' : 'Applications to revisit'}
      </h3>
      {failed ? (
        <>
          <p role="alert" className="m-0 text-body-sm">
            {fr
              ? 'Liste indisponible. Votre témoignage est sauvegardé.'
              : 'List unavailable. Your testimony is saved.'}
          </p>
          <Button onClick={() => setAttempt((value) => value + 1)}>
            {fr ? 'Réessayer' : 'Retry'}
          </Button>
        </>
      ) : !result ? (
        <p role="status" className="m-0 text-body-sm">
          {fr ? 'Recherche des brouillons liés…' : 'Finding related drafts…'}
        </p>
      ) : (
        <>
          <p className="m-0 text-label text-ink-600">
            {fr
              ? 'Brouillons dont un historique d’analyse contient exactement l’ancienne formulation. Ouvrez le dossier pour décider d’une nouvelle analyse ; aucune relance automatique.'
              : 'Drafts with an analysis history containing the exact old wording. Open a dossier to decide on a new analysis; nothing restarts automatically.'}
          </p>
          {result.applications.length ? (
            result.applications.map((application) => (
              <Link
                key={application.applicationId}
                href={`/applications/${application.applicationId}`}
                className="flex min-h-[42px] flex-wrap items-center justify-between gap-3 rounded-tile bg-panel px-4 py-3 text-body-sm"
              >
                <span className="min-w-0">
                  {application.company} · {application.role}
                </span>
                <span className="shrink-0">
                  {fr ? 'Ouvrir le dossier' : 'Open dossier'} →
                </span>
              </Link>
            ))
          ) : (
            <p className="m-0 text-body-sm">
              {fr
                ? 'Aucun brouillon associé à cette formulation.'
                : 'No draft is linked to this wording.'}
            </p>
          )}
          <p className="m-0 text-label text-ink-600">
            {fr
              ? 'Les candidatures envoyées et les pages publiées restent inchangées.'
              : 'Sent applications and published pages remain unchanged.'}
          </p>
        </>
      )}
    </Card>
  );
}
