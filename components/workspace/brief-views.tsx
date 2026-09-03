'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { JobPostingImportResponse } from '@/lib/job-posting-extractor';
import type { Opportunity } from '@/lib/workflow';
import { opportunityReady } from '@/lib/workspace-state';

export function CompanyView({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section className="document company-document">
      <header className="document-heading">
        <p className="section-label">Entreprise</p>
        <h2>{opportunity.company}</h2>
        <p>
          Le contexte utilisé par les agents reste séparé des preuves sur votre
          parcours.
        </p>
      </header>
      <dl className="company-facts">
        <div>
          <dt>Poste ciblé</dt>
          <dd>{opportunity.role}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {opportunity.url ? 'URL de l’offre' : 'Brief saisi manuellement'}
          </dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>À confronter aux preuves</dd>
        </div>
      </dl>
      <section className="company-context">
        <span>Contexte reçu</span>
        <p>{opportunity.description}</p>
      </section>
      {opportunity.url ? (
        <a
          className="company-source"
          href={opportunity.url}
          rel="noreferrer"
          target="_blank"
        >
          Consulter l’offre source ↗
        </a>
      ) : null}
      <p className="document-note">
        Le contenu de l’offre est traité comme une donnée non fiable. Aucune
        affirmation sur votre profil n’en est déduite sans preuve.
      </p>
    </section>
  );
}

export function BriefView({
  canImportUrl,
  error,
  generating,
  hasDraft,
  importError,
  importMessage,
  importing,
  instanceCheckSuggested,
  locked,
  missingFields,
  opportunity,
  pendingImport,
  onApplyImport,
  onCancelPendingImport,
  onGenerate,
  onImport,
  onImportClose,
  onCheckInstance,
  onOpportunityChange,
  onRequiredFieldChange,
}: {
  canImportUrl: boolean;
  error: string;
  generating: boolean;
  hasDraft: boolean;
  importError: string;
  importMessage: string;
  importing: boolean;
  instanceCheckSuggested: boolean;
  locked: boolean;
  missingFields: Array<'company' | 'role' | 'description'>;
  opportunity: Opportunity;
  pendingImport?: JobPostingImportResponse;
  onApplyImport: (
    preview: JobPostingImportResponse,
    overwrite: boolean,
  ) => void;
  onCancelPendingImport: () => void;
  onGenerate: () => void;
  onImport: () => void;
  onImportClose: () => void;
  onCheckInstance: () => void;
  onOpportunityChange: (update: Partial<Opportunity>) => void;
  onRequiredFieldChange: (
    field: 'company' | 'role' | 'description',
    value: string,
  ) => void;
}) {
  const importButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => onImportClose(), [onImportClose]);

  function cancelPendingImport() {
    onCancelPendingImport();
    requestAnimationFrame(() => importButton.current?.focus());
  }

  return (
    <section className="document brief-document" aria-labelledby="brief-title">
      <header className="document-heading">
        <p className="section-label">Offre</p>
        <h2 id="brief-title">Que doit démontrer cette candidature ?</h2>
        <p>
          Ajoutez le contexte du poste. La page ne retiendra que les preuves qui
          le soutiennent réellement.
        </p>
      </header>
      {locked ? (
        <div className="run-brief-lock" role="status">
          <strong>Analyse en cours</strong>
          <p>
            Ce brief reste consultable, mais l’instantané utilisé par le run ne
            peut plus être modifié.
          </p>
        </div>
      ) : null}
      <div className="job-import-panel">
        <div>
          <strong>Importer l’offre</strong>
          <p>
            Collez le lien pour préremplir le brief, puis vérifiez le résultat.
          </p>
        </div>
        <form
          aria-busy={importing}
          className="job-import-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onImport();
          }}
        >
          <label htmlFor="job-url">URL publique de l’offre</label>
          <div>
            <input
              autoComplete="url"
              disabled={locked}
              id="job-url"
              name="job-url"
              placeholder="https://entreprise.com/jobs/role…"
              type="url"
              value={opportunity.url ?? ''}
              onChange={(event) =>
                onOpportunityChange({ url: event.target.value })
              }
            />
            <button
              disabled={
                locked || !canImportUrl || importing || !opportunity.url
              }
              ref={importButton}
              type="submit"
            >
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
          {!canImportUrl ? (
            <small>
              Connexion requise pour lire une URL externe.{' '}
              <Link href="/sign-in?next=/">Se connecter</Link>
            </small>
          ) : null}
        </form>
        {importing ? (
          <p className="import-feedback" role="status">
            Lecture de l’annonce et extraction des informations…
          </p>
        ) : null}
        {importMessage ? (
          <p className="import-feedback success" role="status">
            {importMessage}
          </p>
        ) : null}
        {importError ? (
          <p className="import-feedback error" role="alert">
            {importError}
          </p>
        ) : null}
      </div>
      <p className="manual-separator">ou remplir manuellement</p>
      <div className="field-grid">
        <label>
          Entreprise
          <input
            aria-label="Entreprise"
            aria-describedby={
              missingFields.includes('company')
                ? 'job-company-missing'
                : undefined
            }
            aria-invalid={missingFields.includes('company') || undefined}
            autoComplete="organization"
            disabled={locked}
            id="job-company"
            name="company"
            value={opportunity.company}
            onChange={(event) =>
              onRequiredFieldChange('company', event.target.value)
            }
          />
          {missingFields.includes('company') ? (
            <span className="missing-field" id="job-company-missing">
              Entreprise non trouvée dans l’annonce. À compléter.
            </span>
          ) : null}
        </label>
        <label>
          Poste
          <input
            aria-label="Poste"
            aria-describedby={
              missingFields.includes('role') ? 'job-role-missing' : undefined
            }
            aria-invalid={missingFields.includes('role') || undefined}
            autoComplete="organization-title"
            disabled={locked}
            id="job-role"
            name="role"
            value={opportunity.role}
            onChange={(event) =>
              onRequiredFieldChange('role', event.target.value)
            }
          />
          {missingFields.includes('role') ? (
            <span className="missing-field" id="job-role-missing">
              Intitulé non trouvé dans l’annonce. À compléter.
            </span>
          ) : null}
        </label>
      </div>
      <label>
        Description du poste
        <textarea
          aria-label="Description du poste"
          aria-describedby={
            missingFields.includes('description')
              ? 'job-description-missing'
              : undefined
          }
          aria-invalid={missingFields.includes('description') || undefined}
          autoComplete="off"
          disabled={locked}
          id="job-description"
          name="job-description"
          rows={8}
          value={opportunity.description}
          onChange={(event) =>
            onRequiredFieldChange('description', event.target.value)
          }
        />
        {missingFields.includes('description') ? (
          <span className="missing-field" id="job-description-missing">
            Description non trouvée dans l’annonce. À compléter.
          </span>
        ) : null}
      </label>
      <div className="field-grid compact accent-field">
        <p>
          L’annonce importée reste une donnée non fiable. Aucun élément de votre
          profil n’en est déduit sans preuve.
        </p>
        <label>
          Couleur <span>Décorative uniquement</span>
          <input
            aria-label="Couleur de l’entreprise"
            disabled={locked}
            name="company-accent"
            type="color"
            value={opportunity.accent}
            onChange={(event) =>
              onOpportunityChange({ accent: event.target.value })
            }
          />
        </label>
      </div>
      {pendingImport ? (
        <ImportConflictDialog
          onCancel={cancelPendingImport}
          onComplete={() => onApplyImport(pendingImport, false)}
          onReplace={() => onApplyImport(pendingImport, true)}
        />
      ) : null}
      {error ? (
        <div
          className="inline-error"
          id="run-generation-error"
          role="alert"
          tabIndex={-1}
        >
          <strong>Page non générée</strong>
          <p>{error}</p>
          {instanceCheckSuggested ? (
            <button
              className="quiet inline-error-action"
              onClick={onCheckInstance}
              type="button"
            >
              Vérifier l’instance
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="document-actions">
        <p>
          {locked
            ? 'Revenez dans Parcours pour suivre cette génération.'
            : 'Le brief est enregistré localement pendant la saisie.'}
        </p>
        <button
          disabled={locked || generating || !opportunityReady(opportunity)}
          onClick={onGenerate}
        >
          {generating
            ? 'Génération de la page…'
            : error
              ? 'Réessayer'
              : hasDraft
                ? 'Régénérer la page'
                : 'Générer la page'}
        </button>
      </div>
    </section>
  );
}

function ImportConflictDialog({
  onCancel,
  onComplete,
  onReplace,
}: {
  onCancel: () => void;
  onComplete: () => void;
  onReplace: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      className="import-conflict-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialog}
    >
      <h3>L’offre contient des informations différentes</h3>
      <p>Choisissez comment appliquer l’import à votre brief actuel.</p>
      <div>
        <button onClick={onComplete} type="button">
          Compléter sans remplacer
        </button>
        <button onClick={onReplace} type="button">
          Remplacer avec l’import
        </button>
        <button className="quiet" onClick={onCancel} type="button">
          Annuler
        </button>
      </div>
    </dialog>
  );
}
