'use client';

import { useEffect, useRef } from 'react';
import type { Opportunity } from '@/lib/workflow';
import { type PageSpec, type Profile, type Review } from '@/lib/schemas';
import type { PersistedRun } from '@/lib/run-contract';
import {
  opportunityReady,
  reviewProcessState,
  reviewsComplete,
  type ApplicationDossier,
} from '@/lib/workspace-state';

export function JourneyView({
  approved,
  onGenerate,
  onOpenBrief,
  onOpenDraft,
  onOpenEvidence,
  onRefresh,
  onRetry,
  onReview,
  opportunity,
  pollingError,
  workerAvailability,
  profile,
  retryError,
  retryPending,
  reviewState,
  reviews,
  spec,
}: {
  approved: boolean;
  onGenerate: () => void;
  onOpenBrief: () => void;
  onOpenDraft: () => void;
  onOpenEvidence: (claimId: string) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onReview: () => void;
  opportunity: Opportunity;
  pollingError: string;
  workerAvailability?: PersistedRun['workerAvailability'];
  profile: Profile;
  retryError: string;
  retryPending: boolean;
  reviewState: ReturnType<typeof reviewProcessState>;
  reviews: Review[];
  spec?: PageSpec;
}) {
  const usedClaimIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ) ?? [],
  );
  const usedClaims = profile.claims.filter((claim) =>
    usedClaimIds.has(claim.id),
  );
  const sourced = usedClaims.filter((claim) => claim.evidenceIds.length);
  const reviewed = reviewsComplete(reviews);
  const reviewing = reviewState === 'running';
  const reviewFailed = reviewState === 'failed';
  const reviewStatusHeading = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reviewing) reviewStatusHeading.current?.focus();
  }, [reviewing]);

  return (
    <div className="journey-view">
      <section className="journey-summary" aria-label="État du parcours">
        <span
          className={`summary-state ${reviewing || reviewFailed ? 'attention' : ''}`}
        >
          <b>{reviewFailed ? '!' : reviewing ? '…' : spec ? '✓' : '○'}</b>
          {reviewed
            ? 'Vérifications terminées'
            : reviewFailed
              ? 'Vérifications arrêtées'
              : reviewing
                ? 'Vérifications en cours'
                : spec
                  ? 'Brouillon prêt'
                  : 'Prêt à démarrer'}
        </span>
        <span>
          Preuves retenues <strong>{usedClaims.length}</strong>
        </span>
        <span>
          Affirmations sourcées{' '}
          <strong>
            {sourced.length} / {usedClaims.length || 0}
          </strong>
        </span>
        <span className="journey-people">
          {reviewed
            ? 'Brouillon composé · vérifications terminées'
            : reviewing
              ? `${reviews.length} / 3 vérifications terminées`
              : spec
                ? 'Brouillon composé · prêt à vérifier'
                : 'Composition non démarrée'}
        </span>
      </section>
      {pollingError ? (
        <div className="inline-error" role="status">
          <p>{pollingError}</p>
          <button className="quiet" onClick={onRefresh}>
            Actualiser
          </button>
        </div>
      ) : null}
      {!pollingError ? (
        <WorkerAvailabilityNotice
          availability={workerAvailability}
          onRefresh={onRefresh}
        />
      ) : null}

      <section className="journey-board" aria-label="Parcours de candidature">
        <JourneyColumn number="1" state="complete" title="Lecture de l’offre">
          <JourneyCard icon="↗" status={spec ? 'Terminé' : 'Prêt'}>
            <strong>Offre importée</strong>
            <p>{opportunity.role}</p>
            <small>{opportunity.description.length} caractères analysés</small>
            <button className="text-action" onClick={onOpenBrief}>
              Ouvrir l’offre
            </button>
          </JourneyCard>
          <JourneyCard icon="⌕" status={spec ? 'Terminé' : 'En attente'}>
            <strong>Entreprise analysée</strong>
            <p>{opportunity.company}</p>
            <small>Chaque information reste rattachée à sa source.</small>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="2"
          state={spec ? 'complete' : 'idle'}
          title="Appariement"
        >
          <JourneyCard icon="⌁" status={spec ? 'Terminé' : 'Non démarré'}>
            <strong>{usedClaims.length} expériences retenues</strong>
            {usedClaims.slice(0, 3).map((claim) => (
              <button
                className="matched-claim"
                key={claim.id}
                onClick={() => onOpenEvidence(claim.id)}
              >
                <span>{claim.statement}</span>
                <small>{claim.level}</small>
              </button>
            ))}
            {!spec ? (
              <button
                disabled={!opportunityReady(opportunity)}
                onClick={onGenerate}
              >
                Générer la candidature
              </button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="3"
          state={
            approved
              ? 'complete'
              : reviewed || reviewing || reviewFailed
                ? 'attention'
                : 'idle'
          }
          title="Vérification"
        >
          <JourneyCard
            dark={Boolean(reviewed && !approved)}
            icon="!"
            status={
              approved
                ? 'Validé'
                : reviewed
                  ? 'Décision humaine'
                  : reviewFailed
                    ? 'Arrêté'
                    : reviewing
                      ? 'En cours'
                      : spec
                        ? 'À lancer'
                        : 'En attente'
            }
          >
            <strong aria-live="polite" ref={reviewStatusHeading} tabIndex={-1}>
              {reviewed
                ? 'Trois vérifications terminées'
                : reviewFailed
                  ? 'Vérifications arrêtées'
                  : reviewing
                    ? `${reviews.length} / 3 vérifications terminées`
                    : spec
                      ? 'Brouillon prêt'
                      : 'Rien à vérifier pour le moment'}
            </strong>
            <p>
              {reviewed
                ? `${reviews.filter((item) => item.passed).length} / 3 vérifications validées.`
                : reviewFailed
                  ? 'Le brouillon reste disponible. Relancez la candidature pour reprendre sur une base propre.'
                  : reviewing
                    ? 'Les agents relisent la pertinence, le fond et chaque preuve.'
                    : spec
                      ? 'Relisez le brouillon, puis lancez les trois vérifications.'
                      : 'Les contrôles démarreront après la composition.'}
            </p>
            {reviewed ? (
              <button onClick={onReview}>Ouvrir la revue</button>
            ) : reviewFailed ? (
              <button disabled={retryPending} onClick={onRetry}>
                {retryPending ? 'Relance en cours…' : 'Relancer la candidature'}
              </button>
            ) : null}
            {reviewFailed && retryError ? (
              <p className="inline-error" role="alert">
                {retryError}
              </p>
            ) : null}
          </JourneyCard>
          <JourneyCard icon="✓" status={sourced.length ? 'Prêt' : 'En attente'}>
            <strong>{sourced.length} affirmations sourcées</strong>
            <p>Chaque affirmation garde un chemin vers sa preuve.</p>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="4"
          state={approved ? 'complete' : spec ? 'attention' : 'idle'}
          title="Page privée"
        >
          <JourneyCard
            icon="□"
            status={approved ? 'Validée' : spec ? 'Brouillon' : 'En attente'}
          >
            <strong>{spec?.blocks.length ?? 0} sections prêtes</strong>
            {spec?.blocks.map((block, index) => (
              <button
                className="page-section-row"
                key={`${block.type}-${index}`}
                onClick={onOpenDraft}
              >
                <span>{block.title}</span>
                <small>{approved ? '✓' : 'À relire'}</small>
              </button>
            ))}
            {spec ? (
              <button className="text-action" onClick={onOpenDraft}>
                Prévisualiser la page
              </button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>
      </section>

      <section className="journey-evidence">
        <header>
          <div>
            <h2>Preuves mobilisées</h2>
            <span>
              {usedClaims.length} dans cette candidature ·{' '}
              {profile.claims.length} disponibles dans la mémoire pro
            </span>
          </div>
        </header>
        {usedClaims.length ? (
          <div
            className="evidence-table"
            role="table"
            aria-label="Preuves mobilisées dans cette candidature"
          >
            <div className="evidence-table-head" role="row">
              <span role="columnheader">Preuve</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Rattachée à</span>
              <span role="columnheader">Statut</span>
              <span role="columnheader">Action</span>
            </div>
            {usedClaims.map((claim) => {
              const evidence = profile.evidence.find((item) =>
                claim.evidenceIds.includes(item.id),
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return (
                <div className="evidence-table-row" role="row" key={claim.id}>
                  <strong role="cell">{claim.statement}</strong>
                  <code role="cell">
                    {source?.title ?? 'Aucune source rattachée'}
                  </code>
                  <span role="cell">Page privée</span>
                  <span
                    className={evidence ? 'verified-pill' : 'missing-pill'}
                    role="cell"
                  >
                    {evidence ? 'Vérifiée' : 'Non sourcée'}
                  </span>
                  <span role="cell">
                    <button onClick={() => onOpenEvidence(claim.id)}>
                      Ouvrir
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="journey-empty">
            Générez la candidature pour voir les preuves retenues pour ce poste.
          </p>
        )}
      </section>
    </div>
  );
}

type RunProgressGroup = {
  title: string;
  description: string;
  stages: string[];
};

const runProgressGroups: RunProgressGroup[] = [
  {
    title: 'Analyse de l’offre',
    description: 'Comprendre le poste et son contexte.',
    stages: ['company-researcher'],
  },
  {
    title: 'Sélection des preuves',
    description: 'Retenir uniquement les expériences pertinentes.',
    stages: ['evidence-archivist'],
  },
  {
    title: 'Stratégie de candidature',
    description: 'Hiérarchiser l’angle, les preuves et les limites.',
    stages: ['recruiter-strategist'],
  },
  {
    title: 'Composition de la page',
    description: 'Assembler une page adaptée au poste.',
    stages: ['page-composer'],
  },
  {
    title: 'Vérifications',
    description: 'Contrôler la clarté, la pertinence et les faits.',
    stages: [
      'recruiter-reviewer',
      'hiring-manager-reviewer',
      'factuality-reviewer',
    ],
  },
];

export function RunProgressView({
  dossier,
  onBack,
  onOpenBrief,
  onRefresh,
  onRetry,
  onConfirmResearch,
  onStartStrategy,
  onApproveStrategy,
  onToggleSignal,
  onOpenEvidence,
  pollingError,
  selectionError,
  selectionPending,
}: {
  dossier: ApplicationDossier;
  onBack: () => void;
  onOpenBrief: () => void;
  onRefresh: () => void;
  onRetry: () => void;
  onConfirmResearch: () => void;
  onStartStrategy: () => void;
  onApproveStrategy: () => void;
  onToggleSignal: (signalId: string) => void;
  onOpenEvidence: (claimId: string) => void;
  pollingError?: string;
  selectionError?: string;
  selectionPending: boolean;
}) {
  const status = dossier.runStatus ?? 'running';
  const running = status === 'running';
  const terminalCopy = runTerminalCopy(status);
  const reviewingResearch = Boolean(
    status === 'paused' &&
    dossier.runStage === 'evidence_archive' &&
    dossier.runResearch &&
    !dossier.runEvidenceArchive,
  );
  const archiveReady = Boolean(
    status === 'paused' &&
    dossier.runStage === 'strategy' &&
    dossier.runEvidenceArchive,
  );
  const strategyReady = Boolean(
    status === 'paused' &&
    dossier.runStage === 'strategy_review' &&
    dossier.runStrategy,
  );
  const strategyApproved = Boolean(
    status === 'paused' &&
    dossier.runStage === 'page_spec' &&
    dossier.runStrategy,
  );
  const selectedSignals = new Set(dossier.selectedResearchSignalIds ?? []);
  const selectedCount = selectedSignals.size;
  const currentGroup = runProgressGroups.find((group) => {
    const groupStatus = runProgressGroupStatus(
      dossier.runSteps ?? [],
      group.stages,
    );
    return groupStatus === 'active' || groupStatus === 'pending';
  });
  const matchedSignalCount =
    dossier.runEvidenceArchive?.signals.filter(
      (signal) => signal.matches.length,
    ).length ?? 0;
  const workerUnavailable =
    !pollingError &&
    running &&
    dossier.workerAvailability?.state === 'unavailable';
  const workerWaiting =
    !pollingError && running && dossier.workerAvailability?.state === 'waiting';
  const title = pollingError
    ? 'État de l’analyse non actualisé'
    : reviewingResearch
      ? 'Analyse de l’offre à vérifier'
      : archiveReady
        ? 'Preuves candidates sélectionnées'
        : strategyReady
          ? 'Angle de candidature à valider'
          : strategyApproved
            ? 'Stratégie validée'
            : workerUnavailable
              ? `${currentGroup?.title ?? 'Traitement'} indisponible`
              : workerWaiting
                ? `${currentGroup?.title ?? 'Traitement'} en attente`
                : running
                  ? `${currentGroup?.title ?? 'Analyse de la candidature'} en cours`
                  : terminalCopy.title;
  const description = pollingError
    ? 'La dernière progression enregistrée reste visible ci-dessous.'
    : reviewingResearch
      ? 'Vérifiez ce que nous avons compris du poste. Vous gardez la main avant que votre parcours soit analysé.'
      : archiveReady
        ? 'Les correspondances ci-dessous respectent les permissions de votre mémoire. Vérifiez-les avant de demander au stratège de choisir l’angle de candidature.'
        : strategyReady
          ? 'Le stratège a hiérarchisé les preuves sans modifier les faits. Vérifiez ce choix avant la composition de la page.'
          : strategyApproved
            ? 'Votre décision est enregistrée. Le compositeur de page sera la prochaine étape durable du workflow.'
            : workerUnavailable
              ? 'Le service requis n’est pas actif sur cette instance. La progression enregistrée reste intacte.'
              : workerWaiting
                ? 'Le service est disponible et prendra en charge cette étape dès que possible.'
                : running
                  ? `${currentGroup?.description ?? 'Le traitement continue.'} Vous pouvez quitter ce dossier : son état restera disponible ici.`
                  : terminalCopy.description;

  return (
    <section className="run-progress" aria-labelledby="run-progress-title">
      <header>
        <p className="section-label">Analyse de la candidature</p>
        <h2 id="run-progress-title">{title}</h2>
        <p className="run-progress-status" role="status" aria-live="polite">
          {description}
        </p>
      </header>

      <div className="run-snapshot-note">
        <strong>Contenu utilisé pour ce run</strong>
        <span>
          L’offre et la mémoire professionnelle enregistrées au lancement. Les
          changements ultérieurs ne modifient pas cette génération.
        </span>
      </div>

      <ol className="run-progress-steps" aria-label="Progression enregistrée">
        {runProgressGroups.map((group) => {
          const groupStatus = runProgressGroupStatus(
            dossier.runSteps ?? [],
            group.stages,
          );
          return (
            <li className={groupStatus} key={group.title}>
              <span className="run-step-marker" aria-hidden="true">
                {groupStatus === 'complete'
                  ? '✓'
                  : groupStatus === 'failed'
                    ? '!'
                    : '·'}
              </span>
              <div>
                <strong>{group.title}</strong>
                <p>{group.description}</p>
              </div>
              <small>{runProgressStatusLabel(groupStatus)}</small>
            </li>
          );
        })}
      </ol>

      {reviewingResearch && dossier.runResearch ? (
        <form
          aria-busy={selectionPending}
          className="research-checkpoint"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirmResearch();
          }}
        >
          <header>
            <div>
              <p className="section-label">Votre décision</p>
              <h3>Quels critères doivent guider la candidature&nbsp;?</h3>
            </div>
            <strong aria-live="polite">
              {selectedCount}/{dossier.runResearch.signals.length} retenus
            </strong>
          </header>
          <fieldset
            className="research-signal-list"
            disabled={selectionPending}
          >
            <legend className="sr-only">
              Critères retenus pour guider la candidature
            </legend>
            {dossier.runResearch.signals.map((signal) => (
              <label className="research-signal" key={signal.signalId}>
                <input
                  checked={selectedSignals.has(signal.signalId)}
                  onChange={() => onToggleSignal(signal.signalId)}
                  type="checkbox"
                />
                <span className="research-signal-copy">
                  <span className="research-signal-meta">
                    <span>{researchCategoryLabel(signal.category)}</span>
                    <span>{researchPriorityLabel(signal.priority)}</span>
                  </span>
                  <strong>{signal.statement}</strong>
                  <q>{signal.excerpt}</q>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="research-source">
            Source analysée&nbsp;:{' '}
            {dossier.runResearch.source.url ? (
              <a
                href={dossier.runResearch.source.url}
                rel="noreferrer"
                target="_blank"
              >
                ouvrir l’offre
              </a>
            ) : (
              'texte importé'
            )}
          </p>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer>
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Corriger l’offre
            </button>
            <button disabled={!selectedCount || selectionPending} type="submit">
              {selectionPending
                ? 'Sélection en cours…'
                : `Confirmer ${selectedCount} critère${selectedCount > 1 ? 's' : ''}`}
            </button>
          </footer>
          <p className="research-edit-note">
            Modifier l’offre conservera cette analyse jusqu’au lancement de la
            suivante.
          </p>
        </form>
      ) : null}

      {archiveReady && dossier.runEvidenceArchive ? (
        <section className="evidence-selection-result">
          <header>
            <p className="section-label">Correspondances auditées</p>
            <h3>
              {matchedSignalCount} critère{matchedSignalCount === 1 ? '' : 's'}{' '}
              sur {dossier.runEvidenceArchive.signals.length} relié
              {matchedSignalCount === 1 ? '' : 's'} à votre parcours
            </h3>
          </header>
          <ul>
            {dossier.runEvidenceArchive.signals.map((result) => {
              const signal = dossier.runResearch?.signals.find(
                ({ signalId }) => signalId === result.signalId,
              );
              return (
                <li key={result.signalId}>
                  <div>
                    <strong>{signal?.statement ?? result.signalId}</strong>
                    <span>
                      {result.matches.length
                        ? `${result.matches.length} preuve${result.matches.length > 1 ? 's' : ''} candidate${result.matches.length > 1 ? 's' : ''}`
                        : 'Aucune preuve suffisamment proche'}
                    </span>
                  </div>
                  {result.matches.map((match) => {
                    const claim = dossier.runProfile?.claims.find(
                      ({ id }) => id === match.claimId,
                    );
                    return (
                      <button
                        className="quiet"
                        key={match.claimId}
                        onClick={() => onOpenEvidence(match.claimId)}
                        type="button"
                      >
                        {claim?.statement ?? 'Voir la preuve'}
                        <small>
                          Correspondance lexicale&nbsp;: {match.relevanceScore}%
                        </small>
                      </button>
                    );
                  })}
                </li>
              );
            })}
          </ul>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer className="run-progress-actions">
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Modifier le brief
            </button>
            <button
              disabled={selectionPending || matchedSignalCount === 0}
              onClick={onStartStrategy}
              type="button"
            >
              {selectionPending
                ? 'Stratégie en préparation…'
                : 'Construire la stratégie'}
            </button>
          </footer>
        </section>
      ) : null}

      {strategyReady && dossier.runStrategy ? (
        <section className="strategy-review">
          <header>
            <p className="section-label">Direction éditoriale interne</p>
            <h3>{dossier.runStrategy.positioning.message}</h3>
            <p>
              Cette formulation guide la future page. Les faits affichés
              resteront ceux de votre mémoire professionnelle.
            </p>
          </header>
          <div className="strategy-proof-list">
            {[dossier.runStrategy.lead, ...dossier.runStrategy.supports].map(
              (selection, index) => {
                const claim = dossier.runProfile?.claims.find(
                  ({ id }) => id === selection.claimId,
                );
                const signal = dossier.runResearch?.signals.find(
                  ({ signalId }) => signalId === selection.signalId,
                );
                return (
                  <article key={`${selection.signalId}:${selection.claimId}`}>
                    <small>{index === 0 ? 'Preuve principale' : 'Appui'}</small>
                    <strong>{claim?.statement ?? 'Preuve enregistrée'}</strong>
                    <span>{signal?.statement ?? selection.signalId}</span>
                    <button
                      className="text-action"
                      onClick={() => onOpenEvidence(selection.claimId)}
                      type="button"
                    >
                      Vérifier la source
                    </button>
                  </article>
                );
              },
            )}
          </div>
          {dossier.runStrategy.gaps.length ? (
            <div className="strategy-gaps">
              <strong>Sujets à traiter honnêtement</strong>
              <ul>
                {dossier.runStrategy.gaps.map((gap) => {
                  const signal = dossier.runResearch?.signals.find(
                    ({ signalId }) => signalId === gap.signalId,
                  );
                  return (
                    <li key={gap.signalId}>
                      {signal?.statement ?? gap.signalId}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p className="strategy-omissions">
            {dossier.runStrategy.omittedSignalIds.length} critère
            {dossier.runStrategy.omittedSignalIds.length === 1 ? '' : 's'}{' '}
            volontairement écarté
            {dossier.runStrategy.omittedSignalIds.length === 1 ? '' : 's'} de la
            page courte.
          </p>
          {selectionError ? (
            <p className="form-error" role="alert">
              {selectionError}
            </p>
          ) : null}
          <footer className="run-progress-actions">
            <button
              className="quiet"
              disabled={selectionPending}
              onClick={onOpenBrief}
              type="button"
            >
              Modifier le brief
            </button>
            <button
              disabled={selectionPending}
              onClick={onApproveStrategy}
              type="button"
            >
              {selectionPending ? 'Validation…' : 'Valider la stratégie'}
            </button>
          </footer>
        </section>
      ) : null}

      {pollingError ? (
        <div className="run-polling-warning" role="status" aria-live="polite">
          <p>{pollingError}</p>
          <button className="quiet" onClick={onRefresh} type="button">
            Actualiser
          </button>
        </div>
      ) : null}
      {!pollingError ? (
        <WorkerAvailabilityNotice
          availability={dossier.workerAvailability}
          onRefresh={onRefresh}
        />
      ) : null}

      {!reviewingResearch && !archiveReady && !strategyReady ? (
        <div className="run-progress-actions">
          {running ? (
            <button className="quiet" onClick={onBack} type="button">
              Retour aux candidatures
            </button>
          ) : status === 'paused' ? (
            <button onClick={onOpenBrief} type="button">
              Modifier le brief
            </button>
          ) : (
            <>
              <button onClick={onRetry} type="button">
                Relancer la génération
              </button>
              <button className="quiet" onClick={onOpenBrief} type="button">
                Modifier le brief
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function researchCategoryLabel(
  category: NonNullable<
    ApplicationDossier['runResearch']
  >['signals'][number]['category'],
) {
  if (category === 'responsibility') return 'Responsabilité';
  if (category === 'requirement') return 'Attendu';
  if (category === 'culture') return 'Culture';
  return 'Contrainte';
}

function researchPriorityLabel(
  priority: NonNullable<
    ApplicationDossier['runResearch']
  >['signals'][number]['priority'],
) {
  if (priority === 'high') return 'Prioritaire';
  if (priority === 'medium') return 'Important';
  return 'Secondaire';
}

function runProgressGroupStatus(
  steps: NonNullable<ApplicationDossier['runSteps']>,
  stages: string[],
) {
  const relevant = steps.filter((step) => stages.includes(step.stage));
  if (!relevant.length) return 'future';
  if (relevant.some((step) => step.status === 'failed')) return 'failed';
  if (relevant.some((step) => step.status === 'cancelled')) return 'cancelled';
  if (
    relevant.length &&
    relevant.some((step) =>
      ['leased', 'in_flight', 'completed'].includes(step.status),
    ) &&
    !stages.every((stage) =>
      relevant.some(
        (step) => step.stage === stage && step.status === 'completed',
      ),
    )
  )
    return 'active';
  if (
    stages.every((stage) =>
      relevant.some(
        (step) => step.stage === stage && step.status === 'completed',
      ),
    )
  )
    return 'complete';
  return 'pending';
}

function runProgressStatusLabel(
  status: ReturnType<typeof runProgressGroupStatus>,
) {
  if (status === 'complete') return 'Terminé';
  if (status === 'active') return 'En cours';
  if (status === 'failed') return 'Échec';
  if (status === 'cancelled') return 'Annulé';
  if (status === 'future') return 'À venir';
  return 'En attente';
}

export function WorkerAvailabilityNotice({
  availability,
  onRefresh,
}: {
  availability?: PersistedRun['workerAvailability'];
  onRefresh: () => void;
}) {
  if (!availability || availability.state === 'ready') return null;
  const unavailable = availability.state === 'unavailable';
  return (
    <div
      className={`worker-availability-notice ${availability.state}`}
      role={unavailable ? 'alert' : 'status'}
      aria-live={unavailable ? 'assertive' : 'polite'}
    >
      <div>
        <strong>
          {unavailable
            ? 'Traitement indisponible'
            : 'En attente de prise en charge'}
        </strong>
        <p>
          {unavailable
            ? 'Le service requis n’est pas actif sur cette instance. Démarrez les workers ou contactez l’administrateur, puis vérifiez à nouveau.'
            : 'Le service est disponible. Cette étape démarrera dès qu’elle pourra être prise en charge.'}
        </p>
      </div>
      {unavailable ? (
        <button className="quiet" onClick={onRefresh} type="button">
          Vérifier à nouveau
        </button>
      ) : null}
    </div>
  );
}

function runTerminalCopy(status: ApplicationDossier['runStatus']) {
  if (status === 'paused')
    return {
      title: 'Analyse de l’offre terminée',
      description:
        'Le premier agent a enregistré ses résultats. La sélection des preuves n’est pas encore activée dans cette version.',
    };
  if (status === 'budget_exhausted')
    return {
      title: 'La limite de ce run a été atteinte.',
      description:
        'Aucune page partielle ne sera publiée. Vous pouvez relancer la génération.',
    };
  if (status === 'cancelled')
    return {
      title: 'La génération a été annulée.',
      description: 'Aucune page partielle ne sera publiée.',
    };
  if (status === 'failed')
    return {
      title: 'La génération s’est arrêtée.',
      description:
        'Le brief est intact et aucune page partielle ne sera publiée.',
    };
  return {
    title: 'Le résultat n’est pas encore disponible.',
    description: 'Actualisez le suivi avant de relancer la génération.',
  };
}

function JourneyColumn({
  children,
  number,
  state,
  title,
}: {
  children: React.ReactNode;
  number: string;
  state: 'complete' | 'attention' | 'idle';
  title: string;
}) {
  return (
    <section className="journey-column">
      <header>
        <span className={state}>{number}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function JourneyCard({
  children,
  dark = false,
  icon,
  status,
}: {
  children: React.ReactNode;
  dark?: boolean;
  icon: string;
  status: string;
}) {
  return (
    <article className={`journey-card ${dark ? 'dark' : ''}`}>
      <header>
        <span aria-hidden="true">{icon}</span>
        <small>{status}</small>
      </header>
      {children}
    </article>
  );
}
