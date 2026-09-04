'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { LocaleSwitch, useLocalizer } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import {
  allowedUseLabels,
  importCandidateGroupLabels,
  provenanceLabels,
  sensitivityLabels,
  useMemoryImport,
  type AllowedUse,
  type CandidateGroup,
  type ProvenanceLevel,
  type ReviewCandidate,
  type Sensitivity,
} from './use-memory-import';

const navigation = [
  ['grid_view', 'Accueil', '/'],
  ['account_tree', 'Candidatures', '/applications'],
  ['database', 'Mémoire', '/memory'],
  ['send', 'Liens privés', '/links'],
  ['settings', 'Réglages', '/settings/models'],
] as const;

const mobileNavigation = [
  ['grid_view', 'Accueil', '/'],
  ['database', 'Mémoire', '/memory'],
  ['account_tree', 'Candidatures', '/applications'],
  ['settings', 'Réglages', '/settings/models'],
] as const;

function Icon({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className={styles.icon}>
      {children}
    </span>
  );
}

function Brand() {
  return (
    <Link aria-label="Career OS, accueil" className={styles.brand} href="/">
      <Image
        alt=""
        height={30}
        priority
        src="/brand/symbol/careeros-symbol-ink.svg"
        width={30}
      />
      <span>Career OS</span>
    </Link>
  );
}

function AppChrome({ children }: { children: React.ReactNode }) {
  const localize = useLocalizer([memoryMessages]);
  return localize(
    <main className={styles.canvas}>
      <a className={styles.skipLink} href="#memory-import-content">
        Aller à l’import
      </a>
      <section className={styles.screen} aria-label="Import de la mémoire">
        <aside className={styles.sidebar} aria-label="Navigation Career OS">
          <Brand />
          <nav className={styles.navigation} aria-label="Navigation principale">
            {navigation.map(([icon, label, href]) => (
              <Link
                aria-current={href === '/memory' ? 'page' : undefined}
                className={href === '/memory' ? styles.active : undefined}
                href={href}
                key={label}
              >
                <Icon>{icon}</Icon>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <LocaleSwitch compact />
          <section className={styles.setup} aria-labelledby="setup-title">
            <h2 id="setup-title">Mise en route</h2>
            <ol>
              <li className={styles.current}>
                <Icon>upload_file</Icon>
                <span>Choisir une source</span>
              </li>
              <li>
                <Icon>fact_check</Icon>
                <span>Relire les informations</span>
              </li>
              <li>
                <Icon>verified_user</Icon>
                <span>Valider la mémoire</span>
              </li>
            </ol>
          </section>
          <div className={styles.localNote}>
            <Icon>lock</Icon>
            <span>
              <strong>Lecture locale</strong>
              <small>Le fichier reste dans ce navigateur.</small>
            </span>
          </div>
        </aside>

        <header className={styles.mobileHeader}>
          <Brand />
          <LocaleSwitch compact />
          <Link href="/memory" aria-label="Fermer l’import">
            <Icon>close</Icon>
          </Link>
        </header>

        <section className={styles.content} id="memory-import-content">
          {children}
        </section>

        <nav className={styles.mobileNavigation} aria-label="Navigation mobile">
          {mobileNavigation.map(([icon, label, href]) => (
            <Link
              aria-current={href === '/memory' ? 'page' : undefined}
              href={href}
              key={label}
            >
              <Icon>{icon}</Icon>
              <small>{label}</small>
            </Link>
          ))}
        </nav>
      </section>
    </main>,
  );
}

export function MemoryImportFlow() {
  const controller = useMemoryImport();

  return (
    <AppChrome>
      {controller.stage === 'source' ? (
        <SourceStep controller={controller} />
      ) : null}
      {controller.stage === 'reading' ? (
        <ReadingStep controller={controller} />
      ) : null}
      {controller.stage === 'review' || controller.stage === 'saving' ? (
        <ReviewStep controller={controller} />
      ) : null}
      {controller.stage === 'saved' ? <SavedStep /> : null}
    </AppChrome>
  );
}

type Controller = ReturnType<typeof useMemoryImport>;

function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeading}>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{copy}</span>
      </div>
      {action}
    </header>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className={styles.error} role="alert">
      <Icon>error</Icon>
      <span>{message}</span>
    </div>
  );
}

function SourceStep({ controller }: { controller: Controller }) {
  const localize = useLocalizer([memoryMessages]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canReadPaste = controller.pasteText.trim().length > 0;

  function chooseFile(files: FileList | null) {
    const file = files?.item(0);
    if (file) void controller.importFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files);
  }

  return localize(
    <>
      <PageHeading
        copy="Importez une source. Vous déciderez ensuite ce qui entre réellement dans votre mémoire."
        eyebrow="Mémoire professionnelle · 1 sur 3"
        title="Ajoutez votre parcours"
        action={
          <Link className={styles.secondaryButton} href="/memory">
            Annuler
          </Link>
        }
      />
      <ErrorBanner message={controller.error} />
      <div className={styles.sourceGrid}>
        <section className={styles.sourcePanel} aria-labelledby="file-title">
          <div
            className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <div className={styles.dropIcon}>
              <Icon>upload_file</Icon>
            </div>
            <h2 id="file-title">Déposez votre CV ici</h2>
            <p>PDF, DOCX ou TXT · 4 Mo maximum</p>
            <button
              className={styles.primaryButton}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              Choisir un fichier
            </button>
            <input
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className={styles.fileInput}
              onChange={(event) => chooseFile(event.currentTarget.files)}
              ref={inputRef}
              type="file"
            />
          </div>
        </section>

        <section className={styles.pastePanel} aria-labelledby="paste-title">
          <div className={styles.panelTitle}>
            <span className={styles.panelIcon}>
              <Icon>content_paste</Icon>
            </span>
            <div>
              <h2 id="paste-title">Ou collez du texte</h2>
              <p>CV, export LinkedIn ou notes de parcours.</p>
            </div>
          </div>
          <label htmlFor="pasted-source-kind">Nature de la source</label>
          <select
            id="pasted-source-kind"
            onChange={(event) =>
              controller.setPasteSourceKind(
                event.target.value as Controller['pasteSourceKind'],
              )
            }
            value={controller.pasteSourceKind}
          >
            <option value="linkedin">Profil LinkedIn</option>
            <option value="document">CV en texte</option>
            <option value="manual">Notes de parcours</option>
          </select>
          <label htmlFor="profile-text">Contenu à analyser</label>
          <textarea
            id="profile-text"
            onChange={(event) => controller.setPasteText(event.target.value)}
            placeholder="Collez ici le texte de votre profil…"
            value={controller.pasteText}
          />
          <button
            className={styles.secondaryButton}
            disabled={!canReadPaste}
            onClick={() => void controller.importPastedText()}
            type="button"
          >
            Lire ce texte <Icon>arrow_forward</Icon>
          </button>
        </section>

        <aside className={styles.privacyPanel}>
          <div className={styles.panelTitle}>
            <span className={styles.safeIcon}>
              <Icon>shield_lock</Icon>
            </span>
            <div>
              <h2>Avant de commencer</h2>
              <p>La confidentialité ne dépend pas d’une promesse floue.</p>
            </div>
          </div>
          <ul>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>Extraction dans votre navigateur</strong>
                <small>Le fichier brut n’est pas envoyé au serveur.</small>
              </span>
            </li>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>Revue obligatoire</strong>
                <small>
                  Chaque affirmation reste modifiable ou supprimable.
                </small>
              </span>
            </li>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>Enregistrement explicite</strong>
                <small>
                  Seule votre sélection est sauvegardée après validation.
                </small>
              </span>
            </li>
          </ul>
        </aside>
      </div>
    </>,
  );
}

function ReadingStep({ controller }: { controller: Controller }) {
  const localize = useLocalizer([memoryMessages]);
  return localize(
    <>
      <PageHeading
        copy="L’extraction s’exécute localement. La durée dépend du document et de votre appareil."
        eyebrow="Mémoire professionnelle · Lecture locale"
        title="Lecture de votre source"
      />
      <section className={styles.readingPanel} aria-busy="true">
        <div className={styles.fileGlyph}>
          <Icon>description</Icon>
        </div>
        <div>
          <h2>{controller.sourceName}</h2>
          <p role="status">Extraction et structuration en cours…</p>
        </div>
        <span className={styles.indeterminate} aria-hidden="true">
          <i />
        </span>
        <button
          className={styles.secondaryButton}
          onClick={controller.cancelReading}
          type="button"
        >
          Annuler la lecture
        </button>
      </section>
      <aside className={styles.readingNote}>
        <Icon>info</Icon>
        <p>
          Aucun pourcentage ni temps restant n’est affiché : ces informations ne
          sont pas mesurables de façon fiable pendant la lecture locale.
        </p>
      </aside>
    </>,
  );
}

function ReviewStep({ controller }: { controller: Controller }) {
  const localize = useLocalizer([memoryMessages]);
  const review = controller.review;
  if (!review) return null;
  const selectedCount = review.candidates.filter(
    (item) => item.selected,
  ).length;
  const saving = controller.stage === 'saving';

  return localize(
    <>
      <PageHeading
        copy="Corrigez les formulations, la catégorie, la confidentialité et les usages avant l’enregistrement."
        eyebrow="Mémoire professionnelle · 2 sur 3"
        title="Relisez ce qui a été extrait"
        action={
          <button
            className={styles.secondaryButton}
            disabled={saving}
            onClick={() => controller.discard()}
            type="button"
          >
            Recommencer
          </button>
        }
      />
      <ErrorBanner message={controller.error} />

      <div className={styles.reviewLayout}>
        <section className={styles.reviewMain}>
          <article className={styles.identityPanel}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}>
                <Icon>person</Icon>
              </span>
              <div>
                <h2>Identité professionnelle</h2>
                <p>
                  Préremplie depuis la source, jamais validée à votre place.
                </p>
              </div>
            </div>
            <div className={styles.identityFields}>
              <label>
                Nom complet
                <input
                  onChange={(event) =>
                    controller.updateReview((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  value={review.name}
                />
              </label>
              <label>
                Positionnement
                <input
                  onChange={(event) =>
                    controller.updateReview((current) => ({
                      ...current,
                      headline: event.target.value,
                    }))
                  }
                  value={review.headline}
                />
              </label>
            </div>
          </article>

          <section className={styles.candidates} aria-labelledby="claims-title">
            <header>
              <div>
                <h2 id="claims-title">Affirmations proposées</h2>
                <p>
                  {selectedCount} sur {review.candidates.length} sélectionnée
                  {selectedCount > 1 ? 's' : ''}
                </p>
              </div>
              <button
                className={styles.textButton}
                onClick={() =>
                  controller.updateReview((current) => ({
                    ...current,
                    candidates: current.candidates.map((candidate) => ({
                      ...candidate,
                      selected: true,
                    })),
                  }))
                }
                type="button"
              >
                Tout sélectionner
              </button>
            </header>
            {review.candidates.length ? (
              <div className={styles.candidateList}>
                {review.candidates.map((candidate, index) => (
                  <CandidateEditor
                    candidate={candidate}
                    index={index}
                    key={candidate.id}
                    onChange={(patch) =>
                      controller.updateCandidate(candidate.id, patch)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyCandidates}>
                <Icon>search_off</Icon>
                <h3>Aucune affirmation exploitable</h3>
                <p>
                  Cette source ne contient pas assez de texte structuré. Essayez
                  un autre fichier ou collez le contenu directement.
                </p>
              </div>
            )}
          </section>
        </section>

        <aside className={styles.reviewAside}>
          <section className={styles.sourceSummary}>
            <span className={styles.fileGlyph}>
              <Icon>description</Icon>
            </span>
            <div>
              <p>Source locale</p>
              <strong>{review.source.displayName}</strong>
              <small>{review.source.type.toUpperCase()}</small>
            </div>
          </section>
          <section className={styles.validationPanel}>
            <p>Étape 3</p>
            <h2>Votre validation</h2>
            <span>
              Seules les {selectedCount} affirmations sélectionnées seront
              enregistrées. Chacune conserve le statut choisi ; les statuts non
              publiables restent bloqués.
            </span>
            <label className={styles.confirmation}>
              <input
                checked={review.permissionsConfirmed}
                onChange={(event) =>
                  controller.updateReview((current) => ({
                    ...current,
                    permissionsConfirmed: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                J’ai relu cette sélection et j’autorise les usages indiqués.
              </span>
            </label>
            <button
              className={styles.primaryButton}
              disabled={saving}
              onClick={() => void controller.validate()}
              type="button"
            >
              {saving ? (
                <>
                  <Icon>progress_activity</Icon> Enregistrement…
                </>
              ) : (
                <>
                  Valider et enregistrer <Icon>arrow_forward</Icon>
                </>
              )}
            </button>
            <small>
              C’est à ce clic, et seulement à ce clic, que la sélection quitte
              votre navigateur.
            </small>
          </section>
        </aside>
      </div>
    </>,
  );
}

function CandidateEditor({
  candidate,
  index,
  onChange,
}: {
  candidate: ReviewCandidate;
  index: number;
  onChange: (
    patch: Partial<
      Pick<
        ReviewCandidate,
        | 'statement'
        | 'group'
        | 'sensitivity'
        | 'allowedUses'
        | 'selected'
        | 'level'
      >
    >,
  ) => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const localize = useLocalizer([memoryMessages]);
  const statementId = `statement-${candidate.id}`;

  function toggleUse(use: AllowedUse) {
    const uses = candidate.allowedUses.includes(use)
      ? candidate.allowedUses.filter((value) => value !== use)
      : [...candidate.allowedUses, use];
    onChange({ allowedUses: uses });
  }

  return localize(
    <article
      className={`${styles.candidate} ${candidate.selected ? '' : styles.unselected}`}
    >
      <header>
        <label className={styles.selectCandidate}>
          <input
            checked={candidate.selected}
            onChange={(event) => onChange({ selected: event.target.checked })}
            type="checkbox"
          />
          <span className={styles.srOnly}>
            Sélectionner l’affirmation {index + 1}
          </span>
        </label>
        <button
          aria-expanded={open}
          aria-controls={`candidate-details-${candidate.id}`}
          className={styles.candidateSummary}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span>
            <strong>{candidate.statement}</strong>
            <small>
              {importCandidateGroupLabels[candidate.group]} ·{' '}
              {candidate.locator}
            </small>
          </span>
          <Icon>{open ? 'expand_less' : 'expand_more'}</Icon>
        </button>
      </header>
      {open ? (
        <div
          className={styles.candidateDetails}
          id={`candidate-details-${candidate.id}`}
        >
          <label htmlFor={statementId}>Formulation</label>
          <textarea
            id={statementId}
            onChange={(event) => onChange({ statement: event.target.value })}
            value={candidate.statement}
          />
          <div className={styles.editorGrid}>
            <label>
              Type
              <select
                onChange={(event) =>
                  onChange({ group: event.target.value as CandidateGroup })
                }
                value={candidate.group}
              >
                {Object.entries(importCandidateGroupLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Sensibilité
              <select
                onChange={(event) =>
                  onChange({ sensitivity: event.target.value as Sensitivity })
                }
                value={candidate.sensitivity}
              >
                {Object.entries(sensitivityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Statut
              <select
                onChange={(event) =>
                  onChange({ level: event.target.value as ProvenanceLevel })
                }
                value={candidate.level}
              >
                {Object.entries(provenanceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Usages autorisés</legend>
            <div className={styles.usageOptions}>
              {Object.entries(allowedUseLabels).map(([value, label]) => (
                <label key={value}>
                  <input
                    checked={candidate.allowedUses.includes(
                      value as AllowedUse,
                    )}
                    onChange={() => toggleUse(value as AllowedUse)}
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {candidate.allowedUses.length === 0 ? (
              <small className={styles.fieldError} role="alert">
                Choisissez au moins un usage ou retirez cette affirmation.
              </small>
            ) : null}
          </fieldset>
          <details className={styles.sourceDetail}>
            <summary>Voir l’extrait source</summary>
            <blockquote>{candidate.excerpt}</blockquote>
            <small>{candidate.locator}</small>
          </details>
        </div>
      ) : null}
    </article>,
  );
}

function SavedStep() {
  const localize = useLocalizer([memoryMessages]);
  return localize(
    <section className={styles.savedPanel}>
      <span className={styles.savedIcon}>
        <Icon>check</Icon>
      </span>
      <p>Mémoire professionnelle · terminée</p>
      <h1>Votre sélection est enregistrée.</h1>
      <span>
        Les informations retenues sont maintenant disponibles dans votre
        mémoire, avec leur source, leur sensibilité et leurs usages.
      </span>
      <div>
        <Link className={styles.primaryButton} href="/memory">
          Ouvrir ma mémoire <Icon>arrow_forward</Icon>
        </Link>
        <Link className={styles.secondaryButton} href="/memory/import">
          Ajouter une autre source
        </Link>
      </div>
    </section>,
  );
}
