'use client';

import type { Profile } from '@/lib/schemas';
import type { ImportReview, OnboardingMode } from './use-career-workspace';
import { importCandidateGroupLabels } from './use-career-workspace';
import { allowedUseLabel } from './workspace-view-labels';
import styles from './signed-in-empty-state.module.css';

export function OnboardingView({
  error,
  importing,
  manualConfirmed,
  memoryDraft,
  mode,
  onAcceptImport,
  onAcceptManual,
  onCancel,
  onFile,
  onManualConfirmed,
  onMemoryDraftChange,
  onModeChange,
  onPasteTextChange,
  onProfileChange,
  onReviewChange,
  onSubmitPaste,
  onUseDemo,
  pasteText,
  profile,
  review,
  signedIn,
  userName,
}: {
  error: string;
  importing: boolean;
  manualConfirmed: boolean;
  memoryDraft: {
    source: string;
    claim: string;
    evidence: string;
    level: 'verified' | 'declared' | 'inferred';
  };
  mode: OnboardingMode;
  onAcceptImport: () => void;
  onAcceptManual: () => void;
  onCancel: () => void;
  onFile: (file: File) => void;
  onManualConfirmed: (confirmed: boolean) => void;
  onMemoryDraftChange: (draft: typeof memoryDraft) => void;
  onModeChange: (mode: OnboardingMode) => void;
  onPasteTextChange: (text: string) => void;
  onProfileChange: (profile: Profile) => void;
  onReviewChange: (review: ImportReview) => void;
  onSubmitPaste: () => void;
  onUseDemo: () => void;
  pasteText: string;
  profile: Profile;
  review?: ImportReview;
  signedIn: boolean;
  userName?: string;
}) {
  const selectedCount =
    review?.candidates.filter((candidate) => candidate.selected).length ?? 0;
  const reviewReady = Boolean(
    review &&
    review.name.trim().length >= 2 &&
    review.headline.trim().length >= 2 &&
    review.permissionsConfirmed &&
    selectedCount > 0 &&
    review.candidates
      .filter((candidate) => candidate.selected)
      .every((candidate) => candidate.allowedUses.length > 0),
  );

  if (signedIn && mode === 'start')
    return (
      <SignedInEmptyState
        error={error}
        importing={importing}
        onFile={onFile}
        userName={userName ?? ''}
      />
    );

  return (
    <main className="onboarding-shell" id="main-content">
      <a className="skip-link" href="#onboarding-workspace">
        Aller au contenu
      </a>
      <header className="onboarding-header">
        <div className="brand">
          <span className="brand-mark light" aria-hidden="true">
            C
          </span>
          <span>
            <strong>Career OS</strong>
            <small>Mémoire professionnelle</small>
          </span>
        </div>
        <span className="local-processing">Traitement local</span>
      </header>

      <section className="onboarding-workspace" id="onboarding-workspace">
        <aside className="onboarding-intro">
          <p className="section-label">Étape 1 sur 2</p>
          <h1>Construisons votre mémoire professionnelle.</h1>
          <p>
            Career OS part de votre travail réel. Vous choisissez les sources,
            relisez chaque affirmation et décidez de ce qui pourra être utilisé.
          </p>
          <ol>
            <li className="active">Importer et relire</li>
            <li>Créer votre première candidature</li>
          </ol>
          <div className="privacy-note">
            <strong>Votre CV reste dans ce navigateur.</strong>
            <span>
              Le fichier brut n’est ni envoyé au serveur ni conservé. Seules les
              informations que vous acceptez rejoignent votre mémoire.
            </span>
          </div>
        </aside>

        <div className="onboarding-panel">
          {mode === 'start' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Point de départ</p>
                <h2>Comment voulez-vous commencer ?</h2>
                <p>
                  Le CV est le chemin le plus rapide. Rien n’est ajouté sans
                  votre validation.
                </p>
              </div>
              <div className="onboarding-options">
                <label className="onboarding-option primary-option">
                  <input
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="file-input"
                    disabled={importing}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onFile(file);
                      event.currentTarget.value = '';
                    }}
                    type="file"
                  />
                  <span className="option-icon" aria-hidden="true">
                    ↥
                  </span>
                  <span>
                    <strong>
                      {importing ? 'Lecture du CV…' : 'Importer mon CV'}
                    </strong>
                    <small>PDF, DOCX ou TXT · 4 Mo maximum</small>
                  </span>
                  <b aria-hidden="true">→</b>
                </label>
                <button
                  className="onboarding-option quiet"
                  onClick={() => onModeChange('paste')}
                  type="button"
                >
                  <span className="option-icon" aria-hidden="true">
                    ≡
                  </span>
                  <span>
                    <strong>Coller le texte de mon CV</strong>
                    <small>Pratique si votre document est déjà ouvert</small>
                  </span>
                  <b aria-hidden="true">→</b>
                </button>
                <button
                  className="onboarding-option quiet"
                  onClick={() => onModeChange('manual')}
                  type="button"
                >
                  <span className="option-icon" aria-hidden="true">
                    ＋
                  </span>
                  <span>
                    <strong>Commencer manuellement</strong>
                    <small>
                      Ajoutez une première expérience à votre rythme
                    </small>
                  </span>
                  <b aria-hidden="true">→</b>
                </button>
              </div>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="demo-entry" onClick={onUseDemo} type="button">
                Explorer avec des données fictives
              </button>
            </>
          ) : null}

          {mode === 'paste' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Import texte</p>
                <h2>Collez votre CV</h2>
                <p>
                  Les titres, expériences et résultats seront proposés à la
                  revue.
                </p>
              </div>
              <label>
                Contenu du CV
                <textarea
                  autoFocus
                  maxLength={200_000}
                  onChange={(event) => onPasteTextChange(event.target.value)}
                  placeholder="Collez ici le texte complet de votre CV…"
                  rows={14}
                  value={pasteText}
                />
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Retour
                </button>
                <button
                  disabled={importing || pasteText.trim().length < 40}
                  onClick={onSubmitPaste}
                  type="button"
                >
                  {importing ? 'Analyse locale…' : 'Relire les informations'}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'manual' ? (
            <>
              <div className="onboarding-panel-heading">
                <p className="section-label">Saisie manuelle</p>
                <h2>Posez une première base</h2>
                <p>
                  Vous pourrez enrichir et corriger cette mémoire à tout moment.
                </p>
              </div>
              <div className="field-grid">
                <label>
                  Nom
                  <input
                    autoComplete="name"
                    onChange={(event) =>
                      onProfileChange({ ...profile, name: event.target.value })
                    }
                    value={profile.name}
                  />
                </label>
                <label>
                  Positionnement
                  <input
                    onChange={(event) =>
                      onProfileChange({
                        ...profile,
                        headline: event.target.value,
                      })
                    }
                    placeholder="Product Engineer, Applied AI…"
                    value={profile.headline}
                  />
                </label>
              </div>
              <label>
                Source
                <input
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      source: event.target.value,
                    })
                  }
                  placeholder="CV, entretien, bilan de projet…"
                  value={memoryDraft.source}
                />
              </label>
              <label>
                Première affirmation
                <textarea
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      claim: event.target.value,
                    })
                  }
                  placeholder="Ce que vous avez réellement construit, amélioré ou opéré"
                  rows={3}
                  value={memoryDraft.claim}
                />
              </label>
              <label>
                Extrait associé <span>facultatif</span>
                <textarea
                  onChange={(event) =>
                    onMemoryDraftChange({
                      ...memoryDraft,
                      evidence: event.target.value,
                    })
                  }
                  placeholder="La phrase ou donnée qui permet de retrouver cette information"
                  rows={3}
                  value={memoryDraft.evidence}
                />
              </label>
              <label className="permission-confirmation">
                <input
                  checked={manualConfirmed}
                  onChange={(event) => onManualConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Privée · candidature uniquement</strong>
                  J’autorise Career OS à utiliser cette information pour
                  préparer mes candidatures.
                </span>
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Retour
                </button>
                <button onClick={onAcceptManual} type="button">
                  {signedIn
                    ? 'Enregistrer ma mémoire'
                    : 'Créer ma mémoire locale'}
                </button>
              </div>
            </>
          ) : null}

          {mode === 'review' && review ? (
            <>
              <div className="onboarding-panel-heading review-heading">
                <div>
                  <p className="section-label">Revue humaine</p>
                  <h2>Gardez seulement ce qui vous ressemble.</h2>
                  <p>
                    {review.source.displayName} · {review.candidates.length}{' '}
                    propositions
                  </p>
                </div>
                <span className="source-digest" title={review.source.sha256}>
                  {review.source.type.toUpperCase()} ·{' '}
                  {review.source.sha256.slice(0, 8)}
                </span>
              </div>
              <div className="field-grid">
                <label>
                  Nom
                  <input
                    onChange={(event) =>
                      onReviewChange({ ...review, name: event.target.value })
                    }
                    value={review.name}
                  />
                </label>
                <label>
                  Positionnement
                  <input
                    onChange={(event) =>
                      onReviewChange({
                        ...review,
                        headline: event.target.value,
                      })
                    }
                    value={review.headline}
                  />
                </label>
              </div>
              <div className="import-candidate-groups">
                {Object.entries(importCandidateGroupLabels).map(
                  ([group, label]) => {
                    const candidates = review.candidates
                      .map((candidate, index) => ({ candidate, index }))
                      .filter(({ candidate }) => candidate.group === group);
                    if (!candidates.length) return null;
                    const groupSelected = candidates.filter(
                      ({ candidate }) => candidate.selected,
                    ).length;
                    return (
                      <details
                        className="import-candidate-group"
                        key={group}
                        open={review.candidates.length <= 8 ? true : undefined}
                      >
                        <summary>
                          <strong>{label}</strong>
                          <span>
                            {groupSelected} sur {candidates.length} retenues
                          </span>
                        </summary>
                        <div className="import-candidate-list">
                          {candidates.map(({ candidate, index }) => (
                            <article
                              className={candidate.selected ? 'selected' : ''}
                              key={candidate.id}
                            >
                              <label className="candidate-selection">
                                <input
                                  checked={candidate.selected}
                                  onChange={(event) =>
                                    onReviewChange({
                                      ...review,
                                      candidates: review.candidates.map(
                                        (item) =>
                                          item.id === candidate.id
                                            ? {
                                                ...item,
                                                selected: event.target.checked,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  type="checkbox"
                                />
                                <span>
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </label>
                              <div>
                                <textarea
                                  aria-label={`Affirmation ${index + 1}`}
                                  readOnly={!candidate.selected}
                                  onChange={(event) =>
                                    onReviewChange({
                                      ...review,
                                      candidates: review.candidates.map(
                                        (item) =>
                                          item.id === candidate.id
                                            ? {
                                                ...item,
                                                statement: event.target.value,
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                  rows={2}
                                  value={candidate.statement}
                                />
                                <div className="candidate-meta">
                                  <span>Déclarée</span>
                                  <span>{candidate.locator}</span>
                                </div>
                                <details>
                                  <summary>
                                    Voir la source et les autorisations
                                  </summary>
                                  <blockquote>{candidate.excerpt}</blockquote>
                                  <div className="candidate-permissions">
                                    <label>
                                      Confidentialité
                                      <select
                                        disabled={!candidate.selected}
                                        onChange={(event) =>
                                          onReviewChange({
                                            ...review,
                                            candidates: review.candidates.map(
                                              (item) =>
                                                item.id === candidate.id
                                                  ? {
                                                      ...item,
                                                      sensitivity: event.target
                                                        .value as typeof candidate.sensitivity,
                                                    }
                                                  : item,
                                            ),
                                          })
                                        }
                                        value={candidate.sensitivity}
                                      >
                                        <option value="private">Privée</option>
                                        <option value="public">Publique</option>
                                        <option value="restricted">
                                          Restreinte
                                        </option>
                                      </select>
                                    </label>
                                    <fieldset>
                                      <legend>Utilisations autorisées</legend>
                                      {(
                                        [
                                          'application',
                                          'resume',
                                          'linkedin',
                                          'interview',
                                        ] as const
                                      ).map((use) => (
                                        <label key={use}>
                                          <input
                                            checked={candidate.allowedUses.includes(
                                              use,
                                            )}
                                            disabled={!candidate.selected}
                                            onChange={(event) =>
                                              onReviewChange({
                                                ...review,
                                                candidates:
                                                  review.candidates.map(
                                                    (item) =>
                                                      item.id === candidate.id
                                                        ? {
                                                            ...item,
                                                            allowedUses: event
                                                              .target.checked
                                                              ? [
                                                                  ...item.allowedUses,
                                                                  use,
                                                                ]
                                                              : item.allowedUses.filter(
                                                                  (value) =>
                                                                    value !==
                                                                    use,
                                                                ),
                                                          }
                                                        : item,
                                                  ),
                                              })
                                            }
                                            type="checkbox"
                                          />
                                          {allowedUseLabel(use)}
                                        </label>
                                      ))}
                                    </fieldset>
                                  </div>
                                </details>
                              </div>
                            </article>
                          ))}
                        </div>
                      </details>
                    );
                  },
                )}
              </div>
              <label className="permission-confirmation">
                <input
                  checked={review.permissionsConfirmed}
                  onChange={(event) =>
                    onReviewChange({
                      ...review,
                      permissionsConfirmed: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>
                  <strong>
                    Je valide les {selectedCount} affirmations sélectionnées.
                  </strong>
                  Elles resteront déclarées, reliées à ce document et limitées
                  aux usages indiqués.
                </span>
              </label>
              {error ? (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions sticky-actions">
                <button className="quiet" onClick={onCancel} type="button">
                  Recommencer
                </button>
                <span>
                  {selectedCount} sur {review.candidates.length} retenues
                </span>
                <button
                  disabled={!reviewReady}
                  onClick={onAcceptImport}
                  type="button"
                >
                  {signedIn
                    ? 'Enregistrer ma mémoire'
                    : 'Créer ma mémoire locale'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const desktopNavigation = [
  ['space_dashboard', 'Accueil', 'active'],
  ['inbox', 'À trancher', 'disabled'],
  ['work_history', 'Candidatures', 'disabled'],
  ['database', 'Mémoire pro', 'rest'],
  ['description', 'Assets', 'disabled'],
  ['link', 'Liens privés', 'disabled'],
  ['settings', 'Réglages', 'rest'],
] as const;

const mobileNavigation = [
  ['space_dashboard', 'Accueil', 'active'],
  ['inbox', 'Trancher', 'disabled'],
  ['work_history', 'Suivi', 'disabled'],
  ['link', 'Liens', 'disabled'],
] as const;

function SignedInEmptyState({
  error,
  importing,
  onFile,
  userName,
}: {
  error: string;
  importing: boolean;
  onFile: (file: File) => void;
  userName: string;
}) {
  const names = userName.trim().split(/\s+/).filter(Boolean);
  const firstName = names[0] ?? '';
  const initials =
    names
      .slice(0, 2)
      .map((name) => name.charAt(0))
      .join('')
      .toLocaleUpperCase('fr-FR') || 'CO';

  return (
    <main className={styles.shell}>
      <a className={styles.skipLink} href="#first-run-content">
        Aller au contenu
      </a>

      <aside className={styles.sidebar} aria-label="Navigation Career OS">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <span />
          </span>
          <span>Career OS</span>
        </div>

        <nav className={styles.desktopNavigation} aria-label="Espace">
          {desktopNavigation.map(([icon, label, state]) => (
            <span
              aria-current={state === 'active' ? 'page' : undefined}
              className={`${styles.navigationItem} ${state === 'rest' ? '' : styles[state]}`}
              key={label}
            >
              <span className={styles.symbol} aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
            </span>
          ))}
        </nav>

        <div className={styles.setupCard}>
          <strong>Mise en place</strong>
          <span className={styles.progress} aria-hidden="true">
            <span />
          </span>
          <span>1 étape sur 4 · compte créé</span>
        </div>
      </aside>

      <section className={styles.panel}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark} aria-hidden="true">
              <span />
            </span>
            <strong>Career OS</strong>
          </div>
          <div className={styles.search} aria-disabled="true">
            <span className={styles.symbol} aria-hidden="true">
              search
            </span>
            <span>Rien à chercher pour l&apos;instant</span>
          </div>
          <div className={styles.account}>
            <span>Documentation</span>
            <span className={styles.avatar} aria-label={userName}>
              {initials}
            </span>
          </div>
        </header>

        <div className={styles.contentViewport} id="first-run-content">
          <div className={styles.content}>
            <div className={styles.introduction}>
              <span className={styles.overline}>
                BIENVENUE
                {firstName ? `, ${firstName.toLocaleUpperCase('fr-FR')}` : ''}
              </span>
              <h1>
                Career OS ne saura rien dire de vous avant que vous lui donniez
                des preuves.
              </h1>
              <p>
                Importez d&apos;abord ce qui existe déjà : votre CV, un
                post-mortem, une review, un dépôt. L&apos;app en extrait des
                affirmations datées et sourcées — c&apos;est cette matière que
                les agents utiliseront, jamais leur imagination.
              </p>
            </div>

            <div className={styles.actions}>
              <label className={styles.resumeCard}>
                <input
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className={styles.fileInput}
                  disabled={importing}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onFile(file);
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
                <span className={styles.resumeIcon} aria-hidden="true">
                  <span className={styles.symbol}>upload_file</span>
                </span>
                <span className={styles.actionCopy}>
                  <strong>Importer mon CV</strong>
                  <span>
                    Deux minutes. C&apos;est le socle : postes, dates, premières
                    affirmations.
                  </span>
                </span>
                <span className={styles.primaryButton}>
                  {importing ? 'Lecture du CV…' : 'Choisir un fichier'}
                </span>
              </label>

              <div className={styles.secondaryActions}>
                <button
                  aria-label="Lier LinkedIn, indisponible"
                  className={styles.secondaryAction}
                  disabled
                  type="button"
                >
                  <span className={styles.secondaryIcon} aria-hidden="true">
                    <span className={styles.symbol}>badge</span>
                  </span>
                  <span className={styles.actionCopy}>
                    <strong>Lier LinkedIn</strong>
                    <span>Postes, dates, recommandations · indisponible</span>
                  </span>
                  <span className={styles.symbol} aria-hidden="true">
                    chevron_right
                  </span>
                </button>
                <button
                  aria-label="Lier GitHub, indisponible"
                  className={styles.secondaryAction}
                  disabled
                  type="button"
                >
                  <span className={styles.secondaryIcon} aria-hidden="true">
                    <span className={styles.symbol}>code</span>
                  </span>
                  <span className={styles.actionCopy}>
                    <strong>Lier GitHub</strong>
                    <span>
                      Projets et contributions publiques · indisponible
                    </span>
                  </span>
                  <span className={styles.symbol} aria-hidden="true">
                    chevron_right
                  </span>
                </button>
                <button
                  aria-label="Répondre à 7 questions, indisponible"
                  className={styles.secondaryAction}
                  disabled
                  type="button"
                >
                  <span className={styles.secondaryIcon} aria-hidden="true">
                    <span className={styles.symbol}>record_voice_over</span>
                  </span>
                  <span className={styles.actionCopy}>
                    <strong>Répondre à 7 questions</strong>
                    <span>
                      Si vous n&apos;avez aucun document sous la main ·
                      indisponible
                    </span>
                  </span>
                  <span className={styles.symbol} aria-hidden="true">
                    chevron_right
                  </span>
                </button>
              </div>
            </div>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            <div className={styles.explanation}>
              <div>
                <span className={styles.explanationTitle}>
                  <span className={styles.symbol} aria-hidden="true">
                    database
                  </span>
                  <strong>1 · Mémoire</strong>
                </span>
                <span>
                  Vos preuves, datées et rangées une fois pour toutes.
                </span>
              </div>
              <div>
                <span className={styles.explanationTitle}>
                  <span className={styles.symbol} aria-hidden="true">
                    add_link
                  </span>
                  <strong>2 · Une offre</strong>
                </span>
                <span>
                  Collez l&apos;URL. Les agents analysent, apparient, rédigent.
                </span>
              </div>
              <div>
                <span className={styles.explanationTitle}>
                  <span className={styles.symbol} aria-hidden="true">
                    how_to_reg
                  </span>
                  <strong>3 · Vous validez</strong>
                </span>
                <span>Rien ne part sans votre accord, phrase par phrase.</span>
              </div>
            </div>

            <div className={styles.privacy}>
              <span className={styles.symbol} aria-hidden="true">
                lock
              </span>
              <span>
                Instance auto-hébergée. Vos documents restent chez vous, et
                l&apos;export complet est disponible dès le premier jour.
              </span>
            </div>
          </div>
        </div>

        <nav className={styles.mobileNavigation} aria-label="Navigation mobile">
          {mobileNavigation.map(([icon, label, state]) => (
            <span
              aria-current={state === 'active' ? 'page' : undefined}
              className={`${styles.mobileNavigationItem} ${styles[state]}`}
              key={label}
            >
              <span className={styles.symbol} aria-hidden="true">
                {icon}
              </span>
              <span>{label}</span>
            </span>
          ))}
        </nav>
      </section>
    </main>
  );
}
