'use client';

import Link from 'next/link';
import { agentRoles } from '@/lib/workflow';
import type { Profile } from '@/lib/schemas';
import type { InstanceStatus } from '@/lib/run-contract';
import {
  dossierStatus,
  reviewsComplete,
  unresolvedReviewIssues,
  type ApplicationDossier,
} from '@/lib/workspace-state';
import { workerServiceDetails } from './use-career-workspace';
import {
  deliverableLabel,
  levelLabel,
  reviewerLabel,
} from './workspace-view-labels';

export function CareerMemoryView({
  dirty,
  error,
  memoryDraft,
  onAdd,
  onCreateApplication,
  onDismissHandoff,
  onDraftChange,
  onProfileChange,
  onSave,
  profile,
  signedIn,
  showHandoff,
  syncing,
  syncMessage,
}: {
  dirty: boolean;
  error: string;
  memoryDraft: {
    source: string;
    claim: string;
    evidence: string;
    level: 'verified' | 'declared' | 'inferred';
  };
  onAdd: () => void;
  onCreateApplication: () => void;
  onDismissHandoff: () => void;
  onDraftChange: (draft: typeof memoryDraft) => void;
  onProfileChange: (profile: Profile) => void;
  onSave: () => void;
  profile: Profile;
  signedIn: boolean;
  showHandoff: boolean;
  syncing: boolean;
  syncMessage: string;
}) {
  return (
    <div className="standalone-view">
      <header className="view-header">
        <div>
          <p className="section-label">Mémoire pro</p>
          <h1>Mémoire professionnelle</h1>
          <p>Chaque affirmation reste reliée à sa source et à sa preuve.</p>
        </div>
        <div className="memory-header-actions">
          <div
            className="memory-counts"
            aria-label="Totaux de la mémoire professionnelle"
          >
            <span>{profile.sources.length} sources</span>
            <span>{profile.claims.length} affirmations</span>
            <span>{profile.evidence.length} preuves</span>
          </div>
          {signedIn ? (
            <button disabled={!dirty || syncing} onClick={onSave}>
              {syncing
                ? 'Enregistrement…'
                : dirty
                  ? 'Enregistrer'
                  : 'Enregistré'}
            </button>
          ) : (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour enregistrer
            </Link>
          )}
        </div>
      </header>
      {syncMessage ? (
        <p className="memory-sync-message" role="status">
          {syncMessage}
        </p>
      ) : null}
      {showHandoff ? (
        <section
          className="memory-handoff"
          aria-labelledby="memory-ready-title"
        >
          <div>
            <p className="section-label">Étape 2 sur 2</p>
            <h2 id="memory-ready-title">Votre mémoire est prête.</h2>
            <p>
              {profile.sources.length} source
              {profile.sources.length > 1 ? 's' : ''}, {profile.claims.length}{' '}
              affirmation
              {profile.claims.length > 1 ? 's' : ''} retenue
              {profile.claims.length > 1 ? 's' : ''}, dont{' '}
              {
                profile.claims.filter((claim) => claim.level !== 'verified')
                  .length
              }{' '}
              à étayer.
            </p>
          </div>
          <div>
            <button className="quiet" onClick={onDismissHandoff} type="button">
              Relire ma mémoire
            </button>
            <button onClick={onCreateApplication} type="button">
              Créer ma première candidature
            </button>
          </div>
        </section>
      ) : null}
      <div className="memory-layout" id="career-memory-content">
        <section className="document memory-profile">
          <div className="memory-sources-list">
            <div className="list-heading">
              <h2>Sources</h2>
              <span>{profile.sources.length}</span>
            </div>
            {profile.sources.map((source) => (
              <article key={source.id}>
                <span aria-hidden="true">▤</span>
                <div>
                  <strong>{source.title}</strong>
                  <small>{source.kind}</small>
                </div>
              </article>
            ))}
          </div>
          <h2>Profil</h2>
          <label>
            Nom
            <input
              autoComplete="name"
              name="candidate-name"
              value={profile.name}
              onChange={(event) =>
                onProfileChange({ ...profile, name: event.target.value })
              }
            />
          </label>
          <label>
            Positionnement
            <input
              autoComplete="off"
              name="candidate-headline"
              value={profile.headline}
              onChange={(event) =>
                onProfileChange({ ...profile, headline: event.target.value })
              }
            />
          </label>
          <details>
            <summary>Ajouter une affirmation</summary>
            <label>
              Titre de la source
              <input
                autoComplete="off"
                name="source-title"
                value={memoryDraft.source}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, source: event.target.value })
                }
              />
            </label>
            <label>
              Affirmation
              <textarea
                autoComplete="off"
                name="statement"
                rows={3}
                value={memoryDraft.claim}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, claim: event.target.value })
                }
              />
            </label>
            <label>
              Niveau de preuve
              <select
                name="evidence-status"
                value={memoryDraft.level}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    level: event.target.value as typeof memoryDraft.level,
                  })
                }
              >
                <option value="declared">Déclarée</option>
                <option value="inferred">Inférée</option>
                <option value="verified">Vérifiée</option>
              </select>
            </label>
            <label>
              Extrait de preuve
              <textarea
                autoComplete="off"
                name="evidence-excerpt"
                rows={3}
                value={memoryDraft.evidence}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    evidence: event.target.value,
                  })
                }
              />
            </label>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <button onClick={onAdd}>Ajouter</button>
          </details>
        </section>
        <section className="statement-list" aria-labelledby="statements-title">
          <div className="list-heading">
            <h2 id="statements-title">Affirmations</h2>
            <span>{profile.claims.length}</span>
          </div>
          {profile.claims.map((claim) => (
            <article key={claim.id}>
              <div>
                <span>{levelLabel(claim.level)}</span>
                <small>
                  {claim.evidenceIds.length
                    ? `${claim.evidenceIds.length} preuve`
                    : 'Aucune preuve rattachée'}
                </small>
              </div>
              <label>
                Affirmation
                <textarea
                  rows={3}
                  value={claim.statement}
                  onChange={(event) =>
                    onProfileChange({
                      ...profile,
                      claims: profile.claims.map((item) =>
                        item.id === claim.id
                          ? { ...item, statement: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </article>
          ))}
        </section>
        <aside className="memory-audit">
          <section>
            <p className="section-label">Complétude</p>
            <strong>
              {profile.claims.length
                ? Math.round(
                    (profile.claims.filter(
                      (claim) => claim.level === 'verified',
                    ).length /
                      profile.claims.length) *
                      100,
                  )
                : 0}
              %
            </strong>
            <span>des affirmations sont vérifiées</span>
          </section>
          <section>
            <p className="section-label">À corriger</p>
            <strong>
              {
                profile.claims.filter((claim) => !claim.evidenceIds.length)
                  .length
              }
            </strong>
            <span>affirmations sans preuve</span>
          </section>
          <section>
            <p className="section-label">Confidentialité</p>
            <dl>
              <div>
                <dt>Sensibilité par défaut</dt>
                <dd>Privé</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>Validation explicite</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function ActivityView({
  dossiers,
  onOpenReview,
}: {
  dossiers: ApplicationDossier[];
  onOpenReview: (dossierId: string) => void;
}) {
  const findings = dossiers.flatMap((dossier) =>
    unresolvedReviewIssues(dossier.reviews, dossier.reviewDecisions).map(
      (finding) => ({ ...finding, dossier }),
    ),
  );
  const active =
    findings[0]?.dossier ??
    [...dossiers]
      .filter((dossier) => dossier.events.length)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const events = active?.events ?? [];
  const deliverables = events.filter((event) => event.artifact);
  return (
    <div className="standalone-view run-review-view">
      <header className="view-header">
        <div>
          <p className="section-label">Run d’agents · revue humaine</p>
          <h1>Revue avant publication</h1>
          <p>
            Étapes, entrées, sorties et décisions. Jamais de chaîne de pensée.
          </p>
        </div>
      </header>
      {active ? (
        <div className="run-review-layout">
          <section
            className="run-timeline"
            aria-label="Étapes terminées du run"
          >
            <header>
              <div>
                <span className="status-label">
                  {active.paused ? 'Mis en pause' : dossierStatus(active)}
                </span>
                <strong>
                  {active.opportunity.company || 'Nouvelle offre'} ·{' '}
                  {events.length} événements enregistrés
                </strong>
              </div>
            </header>
            {deliverables.map((event, index) => (
              <article key={`${event.actor}-${index}`}>
                <span className="timeline-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>{deliverableLabel(event)}</strong>
                  <p>{event.action}</p>
                  <small>{event.actor.replaceAll('-', ' ')}</small>
                </div>
                <code>{event.artifact}</code>
              </article>
            ))}
            <details>
              <summary>Métadonnées techniques</summary>
              <small>
                Événements du run et identifiants d’artefacts uniquement.
              </small>
              {events.map((event, index) => (
                <code key={`${event.actor}-${index}`} translate="no">
                  {String(index + 1).padStart(2, '0')} · {event.actor} ·{' '}
                  {event.action} · {event.artifact ?? 'no-artifact'} · €
                  {(event.costMicros / 1_000_000).toFixed(2)}
                </code>
              ))}
            </details>
          </section>
          <aside className="human-review-panel">
            <header>
              <div>
                <p className="section-label">Avant publication</p>
                <h2>Revue humaine</h2>
              </div>
              <span>{findings.length} points à trancher</span>
            </header>
            {findings.map(({ dossier, issue, issueIndex, review }) => (
              <article
                key={`${dossier.id}:${review.reviewId ?? review.reviewer}:${issueIndex}`}
              >
                <span className="blocked">Décision requise</span>
                <strong>
                  {dossier.opportunity.company || 'Nouvelle offre'} ·{' '}
                  {reviewerLabel(review.reviewer)}
                </strong>
                <p>{issue.message}</p>
                <button onClick={() => onOpenReview(dossier.id)}>
                  Trancher ce point
                </button>
              </article>
            ))}
            {!findings.length ? (
              <div className="review-placeholder">
                <strong>Aucune décision en attente</strong>
                <p>Les nouvelles objections des agents apparaîtront ici.</p>
              </div>
            ) : null}
            {reviewsComplete(active.reviews) ? (
              <button onClick={() => onOpenReview(active.id)}>
                Ouvrir la revue de {active.opportunity.company}
              </button>
            ) : null}
            <details>
              <summary>Contrats techniques des agents</summary>
              <div className="role-grid">
                {agentRoles.map((role) => (
                  <article key={role.name}>
                    <strong>{role.name}</strong>
                    <p>
                      {role.input} → {role.output}
                    </p>
                    <small>{role.authority}</small>
                  </article>
                ))}
              </div>
            </details>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <h2>Aucun run</h2>
          <p>Générez une candidature pour créer le premier journal.</p>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  instanceStatus,
  onExport,
  onRefreshStatus,
  onReset,
  onReturnToApplication,
  signedIn,
  statusError,
  statusLoading,
}: {
  instanceStatus?: InstanceStatus;
  onExport: () => void;
  onRefreshStatus: () => void;
  onReset: () => void;
  onReturnToApplication?: () => void;
  signedIn: boolean;
  statusError: boolean;
  statusLoading: boolean;
}) {
  const unavailableServices =
    instanceStatus?.services.filter(({ status }) => status !== 'fresh') ?? [];
  const allWorkersActive =
    instanceStatus?.services.every(({ status }) => status === 'fresh') ?? false;

  return (
    <div className="standalone-view settings-view">
      <header className="view-header">
        <div>
          <p className="section-label">Réglages</p>
          <h1 id="instance-settings-title" tabIndex={-1}>
            Réglages de l’espace
          </h1>
          <p>
            Contrôlez l’exécution et les données conservées dans ce navigateur.
          </p>
        </div>
      </header>
      <section
        className="settings-row instance-settings"
        id="instance-execution"
      >
        <div className="instance-settings-heading">
          <div>
            <h2>Disponibilité des workers</h2>
            <p>Les sept processus doivent répondre pour terminer un dossier.</p>
          </div>
          {signedIn ? (
            <button
              className="quiet"
              disabled={statusLoading}
              onClick={onRefreshStatus}
              type="button"
            >
              Actualiser
            </button>
          ) : null}
        </div>
        <div aria-live="polite" className="instance-status">
          {!signedIn ? (
            <>
              <strong>Connexion requise</strong>
              <p>
                Connectez-vous pour vérifier les services de votre instance.
              </p>
              <Link href="/sign-in?next=/?view=settings">Se connecter</Link>
            </>
          ) : statusLoading ? (
            <>
              <strong>Vérification de l’instance…</strong>
              <p>Lecture de l’état des services.</p>
            </>
          ) : statusError || !instanceStatus ? (
            <>
              <strong>État non disponible</strong>
              <p>Impossible de vérifier les services pour le moment.</p>
            </>
          ) : allWorkersActive ? (
            <>
              <strong className="instance-ready">7 workers actifs</strong>
              <p>
                Les processus répondent. Le modèle local et ses réponses sont
                vérifiés pendant l’exécution.
              </p>
            </>
          ) : (
            <>
              <strong>Configuration incomplète</strong>
              <p>
                {unavailableServices.length} service
                {unavailableServices.length > 1 ? 's' : ''} ne répond
                {unavailableServices.length > 1 ? 'ent' : ''} pas actuellement.
              </p>
              {instanceStatus.mode === 'self-hosted' ? (
                <>
                  <div className="instance-service-groups">
                    {(['Analyse', 'Vérification'] as const).map((stage) => {
                      const services = unavailableServices.filter(
                        ({ service }) =>
                          workerServiceDetails[service].stage === stage,
                      );
                      return services.length ? (
                        <section key={stage}>
                          <h3>{stage}</h3>
                          <ul>
                            {services.map(({ service, status }) => (
                              <li key={service}>
                                <span>
                                  <strong>
                                    {workerServiceDetails[service].label}
                                  </strong>
                                  <small>
                                    {status === 'stale'
                                      ? 'Arrêté ou sans réponse'
                                      : 'Non détecté'}
                                  </small>
                                </span>
                                <code>
                                  {workerServiceDetails[service].command}
                                </code>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ) : null;
                    })}
                  </div>
                  <details className="instance-setup-help">
                    <summary>Configurer les services</summary>
                    <p>
                      Exportez les variables propres à chaque service avant de
                      lancer ces commandes. Les workers ne chargent pas le
                      fichier <code>.env.local</code>.
                    </p>
                    <ul>
                      {unavailableServices.map(({ service }) => (
                        <li key={service}>
                          <code>
                            {workerServiceDetails[service].databaseVariable}
                          </code>
                          {workerServiceDetails[service].requiresModel
                            ? ' + CAREER_OS_LOCAL_MODEL_*'
                            : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <p>
                  Le traitement cloud est géré par Career OS. Actualisez ou
                  contactez l’assistance si l’état persiste.
                </p>
              )}
            </>
          )}
        </div>
        {onReturnToApplication ? (
          <button
            className="quiet instance-return"
            onClick={onReturnToApplication}
            type="button"
          >
            Revenir au brief
          </button>
        ) : null}
      </section>
      <section className="settings-row">
        <div>
          <h2>Exporter le cache de ce navigateur</h2>
          <p>
            Téléchargez la copie locale du profil, des candidatures et de
            l’activité.
          </p>
        </div>
        <button onClick={onExport}>Export JSON</button>
      </section>
      <section className="settings-row danger-zone">
        <div>
          <h2>Effacer le cache local</h2>
          <p>
            Effacez uniquement les données de ce navigateur. Les données
            synchronisées sur le serveur ne seront pas supprimées.
          </p>
        </div>
        <button className="danger-link" onClick={onReset}>
          Effacer le cache
        </button>
      </section>
      <p className="demo-footer">Les fichiers CV bruts ne sont pas exportés.</p>
    </div>
  );
}
