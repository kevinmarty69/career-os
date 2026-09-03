'use client';

import { useEffect, useRef, useState } from 'react';
import type { Profile } from '@/lib/schemas';
import {
  dossierStage,
  dossierStatus,
  reviewProcessState,
  reviewsComplete,
  unresolvedReviewIssues,
  type ApplicationDossier,
} from '@/lib/workspace-state';
import type { DossierView } from './use-career-workspace';
import {
  deliverableLabel,
  levelLabel,
  reviewerLabel,
  sectionLabel,
} from './workspace-view-labels';

export function HomeView({
  dossiers,
  onCreateApplication,
  onOpenApplication,
  onOpenMemory,
  profile,
}: {
  dossiers: ApplicationDossier[];
  onCreateApplication: () => void;
  onOpenApplication: (dossierId: string, view?: DossierView) => void;
  onOpenMemory: () => void;
  profile: Profile;
}) {
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const verified = profile.claims.filter(
    (claim) => claim.level === 'verified',
  ).length;
  const coverage = profile.claims.length
    ? Math.round((verified / profile.claims.length) * 100)
    : 0;
  const findings = dossiers.flatMap((dossier) =>
    unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions).map(
      (finding) => ({ ...finding, dossier }),
    ),
  );
  const priority =
    findings[0]?.dossier ??
    [...dossiers].sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const priorityHasReviews = reviewsComplete(priority?.reviews ?? []);
  const priorityReviewState = priority ? reviewProcessState(priority) : 'idle';
  const recentEvents = dossiers
    .flatMap((dossier) =>
      dossier.events.map((event, index) => ({
        dossier,
        event,
        order: dossier.updatedAt + index,
      })),
    )
    .sort((left, right) => right.order - left.order)
    .slice(0, 3);
  const activeLinks = dossiers.filter((dossier) => dossier.capability).length;
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? [
        ...dossiers.map((dossier) => ({
          id: dossier.id,
          label: `${dossier.opportunity.company || 'Nouvelle offre'} · ${dossier.opportunity.role || 'Brief à compléter'}`,
          meta: 'Candidature',
          open: () => onOpenApplication(dossier.id),
        })),
        ...profile.claims.map((claim) => ({
          id: claim.id,
          label: claim.statement,
          meta: `Affirmation ${levelLabel(claim.level).toLowerCase()}`,
          open: onOpenMemory,
        })),
        ...profile.sources.map((source) => ({
          id: source.id,
          label: source.title,
          meta: `Source ${source.kind}`,
          open: onOpenMemory,
        })),
      ]
        .filter((item) =>
          `${item.label} ${item.meta}`.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  return (
    <div className="home-view">
      <header className="home-topbar">
        <div className="search-shell">
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Rechercher dans l’espace"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) {
                  searchResults[0].open();
                  setQuery('');
                }
              }}
              placeholder="Chercher une preuve, une entreprise, une affirmation…"
              ref={searchInput}
              type="search"
              value={query}
            />
            <kbd>⌘K</kbd>
          </label>
          {normalizedQuery ? (
            <div className="search-results" aria-label="Résultats de recherche">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      result.open();
                      setQuery('');
                    }}
                  >
                    <span>{result.label}</span>
                    <small>{result.meta}</small>
                  </button>
                ))
              ) : (
                <p>Aucune preuve, source ou candidature correspondante.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="home-account">
          <button onClick={onCreateApplication}>Coller une offre</button>
          <button
            className="header-icon"
            aria-label="Aide, bientôt disponible"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            ?
          </button>
          <button
            className="header-icon notification"
            aria-label="Notifications, bientôt disponibles"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            <span aria-hidden="true">♢</span>
          </button>
          <div className="header-person">
            <span className="rail-avatar" aria-hidden="true">
              {profile.name.charAt(0)}
            </span>
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.headline}</small>
            </span>
          </div>
        </div>
      </header>

      <div className="home-grid">
        <div className="home-main">
          <section className="decision-hero">
            <p>
              {findings.length ? 'Action requise' : 'Prochaine candidature'}
              {priority?.opportunity.company
                ? ` · ${priority.opportunity.company}`
                : ''}
            </p>
            <h1>
              {findings.length
                ? `${findings.length} décision${findings.length > 1 ? 's' : ''} à trancher avant d’envoyer vos pages privées.`
                : priority?.spec && priorityHasReviews
                  ? 'Votre prochaine candidature est prête pour validation.'
                  : priorityReviewState === 'running'
                    ? 'Les vérifications sont en cours.'
                    : priorityReviewState === 'failed'
                      ? 'Les vérifications se sont arrêtées.'
                      : priority?.spec
                        ? 'Votre brouillon est prêt à relire.'
                        : 'Construisez une candidature qui ne promet que ce que vos preuves démontrent.'}
            </h1>
            <span>
              {priority?.spec && priorityHasReviews
                ? `La passe d’agents est terminée. ${dossierStatus(priority)}.`
                : priorityReviewState === 'running'
                  ? `${priority.reviews.length} sur 3 vérifications terminées. Vous pouvez revenir plus tard.`
                  : priorityReviewState === 'failed'
                    ? 'Le brouillon reste intact. Relancez la candidature lorsque vous êtes prêt.'
                    : priority?.spec
                      ? 'Le brouillon reprend la stratégie approuvée. Relisez exactement ce que l’entreprise verra.'
                      : 'Partez du poste, confrontez-le à vos preuves, puis gardez la décision finale.'}
            </span>
            <div>
              <button
                onClick={() =>
                  priority
                    ? onOpenApplication(priority.id)
                    : onCreateApplication()
                }
              >
                {priority?.spec && priorityHasReviews
                  ? 'Ouvrir la revue'
                  : priorityReviewState === 'running'
                    ? 'Voir l’avancement'
                    : priorityReviewState === 'failed'
                      ? 'Ouvrir et relancer'
                      : priority?.spec
                        ? 'Relire la page privée'
                        : 'Commencer par l’offre'}{' '}
                <b>→</b>
              </button>
              {priority?.spec ? (
                <button
                  className="hero-secondary"
                  onClick={() => onOpenApplication(priority.id, 'journey')}
                >
                  Voir le run
                </button>
              ) : null}
            </div>
          </section>

          {findings.length ? (
            <section className="home-pipeline decision-queue">
              <header>
                <div>
                  <h2>À trancher maintenant</h2>
                  <span>
                    Chaque point doit être corrigé ou explicitement assumé.
                  </span>
                </div>
              </header>
              {findings
                .slice(0, 3)
                .map(({ dossier, issue, review, issueIndex }) => (
                  <article
                    key={`${dossier.id}:${review.reviewId ?? review.reviewer}:${issueIndex}`}
                  >
                    <span className="decision-icon" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <strong>{reviewerLabel(review.reviewer)}</strong>
                      <p>{issue.message}</p>
                      <small>
                        {dossier.opportunity.company} ·{' '}
                        {sectionLabel(issue.section)}
                      </small>
                    </div>
                    <button
                      onClick={() => onOpenApplication(dossier.id, 'review')}
                    >
                      Trancher
                    </button>
                  </article>
                ))}
            </section>
          ) : null}

          <section className="home-stats" aria-label="Résumé de l’espace">
            <article>
              <span className="metric-icon">▣</span>
              <div>
                <small>Candidatures</small>
                <strong>
                  {dossiers.length} active{dossiers.length > 1 ? 's' : ''}
                </strong>
              </div>
            </article>
            <article>
              <span className="metric-icon green">✓</span>
              <div>
                <small>Affirmations</small>
                <strong>
                  {verified} / {profile.claims.length} sourcées
                </strong>
              </div>
            </article>
            <article>
              <span className="metric-icon amber">↗</span>
              <div>
                <small>Liens privés</small>
                <strong>
                  {activeLinks
                    ? `${activeLinks} actif${activeLinks > 1 ? 's' : ''}`
                    : 'Aucun actif'}
                </strong>
              </div>
            </article>
          </section>

          <section className="home-pipeline">
            <header>
              <div>
                <h2>Pipeline</h2>
                <span>Chaque candidature et sa prochaine action concrète.</span>
              </div>
              <button
                className="round-action quiet"
                onClick={onCreateApplication}
                aria-label="Créer une candidature"
              >
                +
              </button>
            </header>
            <div className="pipeline-head" aria-hidden="true">
              <span>Poste</span>
              <span>Étape</span>
              <span>Preuves</span>
              <span>Prochaine action</span>
            </div>
            {dossiers.length ? (
              [...dossiers]
                .sort((left, right) => right.updatedAt - left.updatedAt)
                .slice(0, 5)
                .map((dossier) => {
                  const dossierFindings = unresolvedReviewIssues(
                    dossier.reviews,
                    dossier.reviewDecisions,
                  ).length;
                  const evidenceCount = dossier.spec
                    ? new Set(
                        dossier.spec.blocks.flatMap((block) =>
                          'claimIds' in block ? block.claimIds : [],
                        ),
                      ).size
                    : 0;
                  return (
                    <button
                      className="pipeline-row"
                      key={dossier.id}
                      onClick={() => onOpenApplication(dossier.id)}
                    >
                      <span className="company-mark compact" aria-hidden="true">
                        {dossier.opportunity.company.charAt(0) || '+'}
                      </span>
                      <span>
                        <strong>
                          {dossier.opportunity.role || 'Brief à compléter'}
                        </strong>
                        <small>
                          {dossier.opportunity.company || 'Nouvelle offre'}
                        </small>
                      </span>
                      <span className="status-label">
                        {dossierStatus(dossier)}
                      </span>
                      <span>
                        {evidenceCount
                          ? `${evidenceCount} retenue${evidenceCount > 1 ? 's' : ''}`
                          : 'À sélectionner'}
                      </span>
                      <b>
                        {dossier.spec
                          ? dossierFindings
                            ? 'Trancher'
                            : reviewProcessState(dossier) === 'running'
                              ? 'Suivre'
                              : reviewProcessState(dossier) === 'failed'
                                ? 'Relancer'
                                : reviewsComplete(dossier.reviews)
                                  ? 'Valider'
                                  : 'Relire'
                          : 'Lancer'}{' '}
                        →
                      </b>
                    </button>
                  );
                })
            ) : (
              <div className="home-empty-state">
                <strong>Aucune candidature</strong>
                <span>Collez une offre pour créer votre premier dossier.</span>
              </div>
            )}
          </section>
        </div>

        <aside className="home-insights">
          <section className="interview-card">
            <header>
              <h2>Entretiens à venir</h2>
            </header>
            <div className="home-empty-state">
              <strong>Aucun entretien planifié</strong>
              <span>
                La préparation apparaîtra ici dès qu’un entretien sera ajouté.
              </span>
            </div>
          </section>
          <section>
            <header>
              <h2>Mémoire pro</h2>
              <button onClick={onOpenMemory} aria-label="Ouvrir la mémoire pro">
                ···
              </button>
            </header>
            <div
              className="coverage-ring"
              style={{ '--coverage': `${coverage}%` } as React.CSSProperties}
            >
              <strong>{coverage}%</strong>
              <span>sourcé</span>
            </div>
            <dl>
              <div>
                <dt>Sources importées</dt>
                <dd>{profile.sources.length}</dd>
              </div>
              <div>
                <dt>Affirmations vérifiées</dt>
                <dd>{verified}</dd>
              </div>
              <div>
                <dt>Sans source</dt>
                <dd>{profile.claims.length - verified}</dd>
              </div>
            </dl>
          </section>
          <section className="home-activity-card">
            <header>
              <h2>Activité</h2>
            </header>
            {recentEvents.length ? (
              recentEvents.map(({ dossier, event }, index) => (
                <article key={`${dossier.id}:${event.actor}:${index}`}>
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>{deliverableLabel(event)}</strong>
                    <small>
                      {dossier.opportunity.company} ·{' '}
                      {event.actor.replaceAll('-', ' ')}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <div className="home-empty-state">
                <strong>Aucun run pour le moment</strong>
                <span>Les dernières actions vérifiées apparaîtront ici.</span>
              </div>
            )}
            {activeLinks ? (
              <small>
                {activeLinks} lien{activeLinks > 1 ? 's' : ''} privé
                {activeLinks > 1 ? 's' : ''} actif{activeLinks > 1 ? 's' : ''}.
              </small>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function ApplicationsView({
  dossiers,
  onCreate,
  onOpen,
  profile,
}: {
  dossiers: ApplicationDossier[];
  onCreate: () => void;
  onOpen: (dossierId: string, view?: DossierView) => void;
  profile: Profile;
}) {
  const [layout, setLayout] = useState<'list' | 'kanban'>('kanban');
  const columns = ['Brouillon', 'À valider', 'Envoyée', 'Entretien'] as const;
  const renderCard = (dossier: ApplicationDossier) => {
    const findings = unresolvedReviewIssues(
      dossier.reviews,
      dossier.reviewDecisions,
    ).length;
    const evidenceCount = dossier.spec
      ? new Set(
          dossier.spec.blocks.flatMap((block) =>
            'claimIds' in block ? block.claimIds : [],
          ),
        ).size
      : 0;
    const company = dossier.opportunity.company || 'Nouvelle offre';
    const role = dossier.opportunity.role || 'Brief à compléter';
    return (
      <button
        className="application-card"
        key={dossier.id}
        onClick={() => onOpen(dossier.id)}
        aria-label={`Ouvrir la candidature ${company}`}
      >
        <span className="company-mark" aria-hidden="true">
          {dossier.opportunity.company.charAt(0) || '+'}
        </span>
        <span className="application-card-copy">
          <strong>{role}</strong>
          <small>{company}</small>
        </span>
        <span className="status-label">{dossierStatus(dossier)}</span>
        <span className="application-card-meta">
          {evidenceCount
            ? `${evidenceCount} sur ${profile.claims.length} affirmations retenues`
            : `${profile.claims.length} affirmations disponibles`}
        </span>
        <b>
          {findings
            ? `${findings} décision${findings > 1 ? 's' : ''} à trancher`
            : dossier.runId && !dossier.spec
              ? dossier.runStatus === 'running' || !dossier.runStatus
                ? 'Voir l’avancement'
                : dossier.runStatus === 'paused'
                  ? 'Ouvrir l’analyse'
                  : 'Reprendre la génération'
              : dossier.spec
                ? 'Ouvrir la candidature'
                : 'Compléter l’offre'}{' '}
          →
        </b>
      </button>
    );
  };

  return (
    <div className="standalone-view applications-view">
      <header className="applications-header">
        <div>
          <p className="section-label">Espace</p>
          <h1>Candidatures</h1>
          <p>Une prochaine action claire pour chaque poste.</p>
        </div>
        <div className="applications-actions">
          <div
            className="layout-switch"
            aria-label="Disposition des candidatures"
          >
            <button
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              Liste
            </button>
            <button
              aria-pressed={layout === 'kanban'}
              onClick={() => setLayout('kanban')}
            >
              Kanban
            </button>
            <button
              disabled
              title="La vue calendrier n’est pas encore disponible"
            >
              Calendrier
            </button>
          </div>
          <button onClick={onCreate}>Coller une offre</button>
        </div>
      </header>

      <section className="applications-toolbar" aria-label="Vues enregistrées">
        <strong className="active">
          Toutes les candidatures <span>{dossiers.length}</span>
        </strong>
        <span>Synchronisé avec l’espace actif</span>
      </section>

      {layout === 'kanban' ? (
        <div className="applications-board">
          {columns.map((column) => (
            <section className="application-column" key={column}>
              <header>
                <h2>{column}</h2>
                <span>
                  {
                    dossiers.filter(
                      (dossier) => dossierStage(dossier) === column,
                    ).length
                  }
                </span>
              </header>
              {dossiers.some((dossier) => dossierStage(dossier) === column) ? (
                [...dossiers]
                  .filter((dossier) => dossierStage(dossier) === column)
                  .sort((left, right) => right.updatedAt - left.updatedAt)
                  .map(renderCard)
              ) : (
                <div className="empty-column">
                  Aucune candidature à cette étape
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <section
          className="applications-list"
          aria-label="Liste des candidatures"
        >
          <div className="applications-list-head" aria-hidden="true">
            <span>Poste</span>
            <span>Étape</span>
            <span>Preuves</span>
            <span>Prochaine action</span>
          </div>
          {[...dossiers]
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .map(renderCard)}
        </section>
      )}
    </div>
  );
}
