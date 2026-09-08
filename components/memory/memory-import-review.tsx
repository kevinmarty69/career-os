'use client';

import { useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import type {
  AllowedUse,
  CandidateGroup,
  ProvenanceLevel,
  ReviewCandidate,
  Sensitivity,
} from './use-memory-import';
import {
  Icon,
  PageHeading,
  ErrorBanner,
  importLabels,
  type MemoryImportController as Controller,
} from './memory-import-presentation';
export function ReviewStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages, applicationsMessages]);
  const router = useRouter();
  const review = controller.review;
  const saving = controller.stage === 'saving';
  if (!review) return null;
  const selectedCount = review.candidates.filter(
    (item) => item.selected,
  ).length;
  function reviewLater() {
    router.push('/memory');
  }

  return (
    <div className={styles.flowStep} data-motion="enter">
      <PageHeading
        accessibleTitle={t('memory.review.what.was.extracted')}
        copy={t('memory.review.extraction.intro')}
        eyebrow={`${t('memory.step.2.of.3')} · ${review.source.displayName}`}
        title={`${review.candidates.length} ${t('memory.claims.extracted')}`}
        action={
          <button
            className={styles.ghostButton}
            disabled={saving}
            onClick={() => controller.discard()}
            type="button"
          >
            {t('memory.start.over')}
          </button>
        }
      />
      <ErrorBanner message={controller.error} />
      <div className={styles.reviewProgress}>
        <div>
          <strong>
            {selectedCount} {t('memory.of')} {review.candidates.length}{' '}
            {t('memory.selected')}
          </strong>
          <span>{t('memory.review.estimated.time')}</span>
        </div>
        <progress
          max={Math.max(review.candidates.length, 1)}
          value={selectedCount}
        />
      </div>
      <fieldset
        className={styles.reviewLayout}
        disabled={saving}
        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
      >
        <section className={styles.reviewMain}>
          <article className={styles.identityPanel}>
            <div className={styles.panelHeading}>
              <span className={styles.panelIcon}>
                <Icon>person</Icon>
              </span>
              <div>
                <p>{t('memory.professional.identity')}</p>
                <h2>{t('memory.check.your.identity')}</h2>
              </div>
            </div>
            <div className={styles.identityFields}>
              <label>
                {t('memory.full.name')}
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
                {t('memory.positioning')}
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
          <section aria-labelledby="claims-title" className={styles.candidates}>
            <header>
              <div>
                <p>{t('memory.these.need.your.review')}</p>
                <h2 id="claims-title">
                  {t('memory.review.wording.and.permissions')}
                </h2>
              </div>
              <button
                className={styles.inlineButton}
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
                {t('memory.select.all')}
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
                <h3>{t('memory.no.usable.claim')}</h3>
                <p>
                  {t(
                    'memory.this.source.does.not.contain.enough.structured.text.try',
                  )}
                </p>
              </div>
            )}
          </section>
        </section>
        <aside className={styles.reviewAside}>
          <section className={styles.sourceSummary}>
            <span className={styles.fileIcon}>
              <Icon>description</Icon>
            </span>
            <div>
              <p>{t('memory.local.source')}</p>
              <strong>{review.source.displayName}</strong>
              <small>{review.source.type.toUpperCase()}</small>
            </div>
          </section>
          <section className={styles.sourceLinkedPanel}>
            <header>
              <div>
                <p>{t('memory.source.linked')}</p>
                <h2>
                  {selectedCount} {t('memory.claims.ready.to.save')}
                </h2>
              </div>
              <span className={styles.countBadge}>{selectedCount}</span>
            </header>
            <ul>
              {review.candidates
                .filter((candidate) => candidate.selected)
                .slice(0, 6)
                .map((candidate) => (
                  <li key={candidate.id}>
                    <Icon>check</Icon>
                    <span>
                      <strong>{candidate.statement}</strong>
                      <small>{candidate.locator}</small>
                    </span>
                  </li>
                ))}
            </ul>
            {selectedCount > 6 ? (
              <p>{t('memory.and.more.claims', { count: selectedCount - 6 })}</p>
            ) : null}
          </section>
          <section className={styles.validationPanel}>
            <div>
              <Icon>lightbulb</Icon>
              <p>{t('memory.review.later.explanation')}</p>
            </div>
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
                {t(
                  'memory.i.reviewed.this.selection.and.authorize.the.listed.uses',
                )}
              </span>
            </label>
          </section>
        </aside>
      </fieldset>
      <footer className={styles.actionBar}>
        <div>
          <Icon>verified_user</Icon>
          <p>
            <strong>{t('memory.explicit.save')}</strong>
            <span>
              {t('memory.only.when.you.click.here.does.the.selection.leave')}
            </span>
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          disabled={saving}
          onClick={reviewLater}
          type="button"
        >
          {t('memory.review.later')}
        </button>
        <button
          aria-label={t('memory.confirm.and.save')}
          className={styles.primaryButton}
          disabled={saving}
          onClick={() => void controller.validate()}
          type="button"
        >
          {saving ? (
            <>
              <Icon className={styles.spinning}>autorenew</Icon>
              {t('applications.saving')}
            </>
          ) : (
            <>
              {t('memory.validate.my.memory')}
              <Icon>arrow_forward</Icon>
            </>
          )}
        </button>
      </footer>
    </div>
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
  const t = useTranslations([memoryMessages, activeRoutesMessages]);
  const {
    importCandidateGroupLabels,
    allowedUseLabels,
    sensitivityLabels,
    provenanceLabels,
  } = importLabels(t);
  const statementId = `statement-${candidate.id}`;
  function toggleUse(use: AllowedUse) {
    onChange({
      allowedUses: candidate.allowedUses.includes(use)
        ? candidate.allowedUses.filter((value) => value !== use)
        : [...candidate.allowedUses, use],
    });
  }
  return (
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
            {t('memory.select.claim')} {index + 1}
          </span>
        </label>
        <button
          aria-controls={`candidate-details-${candidate.id}`}
          aria-expanded={open}
          className={styles.candidateSummary}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span>
            <span className={styles.claimMeta}>
              <span className={styles.statusChip}>
                {provenanceLabels[candidate.level]}
              </span>
              <small>{candidate.locator}</small>
            </span>
            <strong>{candidate.statement}</strong>
          </span>
          <Icon>{open ? 'expand_less' : 'chevron_right'}</Icon>
        </button>
      </header>
      {open ? (
        <div
          className={styles.candidateDetails}
          id={`candidate-details-${candidate.id}`}
        >
          <label htmlFor={statementId}>
            {t('memory.wording')}
            <textarea
              id={statementId}
              onChange={(event) => onChange({ statement: event.target.value })}
              value={candidate.statement}
            />
          </label>
          <div className={styles.editorGrid}>
            <label>
              {t('memory.type')}
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
              {t('memory.sensitivity')}
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
              {t('active-routes.status')}
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
            <legend>{t('memory.allowed.uses')}</legend>
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
                {t('memory.choose.at.least.one.use.or.remove.this.claim')}
              </small>
            ) : null}
          </fieldset>
          <details className={styles.sourceDetail}>
            <summary>{t('memory.view.source.excerpt')}</summary>
            <blockquote>« {candidate.excerpt} »</blockquote>
            <small>{candidate.locator}</small>
          </details>
        </div>
      ) : null}
    </article>
  );
}
