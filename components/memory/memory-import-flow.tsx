'use client';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { LocaleSwitch, useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import {
  useMemoryImport,
  type AllowedUse,
  type CandidateGroup,
  type ProvenanceLevel,
  type ReviewCandidate,
  type Sensitivity,
} from './use-memory-import';

function Icon({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className={styles.icon}>
      {children}
    </span>
  );
}

function Brand() {
  const t = useTranslations([memoryMessages]);

  return (
    <Link
      aria-label={t('memory.career.os.home')}
      className={styles.brand}
      href="/"
    >
      <Image
        alt=""
        height={30}
        priority
        src="/brand/symbol/careeros-symbol-ink.svg"
        width={30}
      />
      <span>careeros</span>
    </Link>
  );
}

function AppChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations([memoryMessages]);
  const navigation = [
    ['grid_view', t('memory.home'), '/'],
    ['account_tree', t('memory.applications'), '/applications'],
    ['database', t('memory.career.memory'), '/memory'],
    ['send', t('memory.private.links'), '/links'],
    ['settings', t('memory.settings'), '/settings/models'],
  ] as const;
  const mobileNavigation = [
    ['grid_view', t('memory.home'), '/'],
    ['database', t('memory.career.memory'), '/memory'],
    ['account_tree', t('memory.applications'), '/applications'],
    ['settings', t('memory.settings'), '/settings/models'],
  ] as const;
  return (
    <main className={styles.canvas}>
      <a className={styles.skipLink} href="#memory-import-content">
        {t('memory.skip.to.import')}{' '}
      </a>
      <section
        className={styles.screen}
        aria-label={t('memory.career.memory.import')}
      >
        <aside
          className={styles.sidebar}
          aria-label={t('memory.career.os.navigation')}
        >
          <Brand />
          <nav
            className={styles.navigation}
            aria-label={t('memory.main.navigation')}
          >
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
          <section className={styles.setup} aria-labelledby="setup-title">
            <h2 id="setup-title">{t('memory.setup')}</h2>
            <ol>
              <li className={styles.current}>
                <Icon>upload_file</Icon>
                <span>{t('memory.choose.a.source')}</span>
              </li>
              <li>
                <Icon>fact_check</Icon>
                <span>{t('memory.review.information')}</span>
              </li>
              <li>
                <Icon>verified_user</Icon>
                <span>{t('memory.confirm.career.memory')}</span>
              </li>
            </ol>
          </section>
          <div className={styles.sidebarLocale}>
            <LocaleSwitch compact />
          </div>
          <div className={styles.localNote}>
            <Icon>lock</Icon>
            <span>
              <strong>{t('memory.local.processing')}</strong>
              <small>{t('memory.the.file.stays.in.this.browser')}</small>
            </span>
          </div>
        </aside>

        <header className={styles.mobileHeader}>
          <Brand />
          <LocaleSwitch compact />
          <Link href="/memory" aria-label={t('memory.close.import')}>
            <Icon>close</Icon>
          </Link>
        </header>

        <section className={styles.content} id="memory-import-content">
          {children}
        </section>

        <nav
          className={styles.mobileNavigation}
          aria-label={t('memory.mobile.navigation')}
        >
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
    </main>
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

function ErrorBanner({
  message,
}: {
  message: keyof typeof memoryMessages | '';
}) {
  const t = useTranslations([memoryMessages]);
  if (!message) return null;
  return (
    <div className={styles.error} role="alert">
      <Icon>error</Icon>
      <span>{t(message)}</span>
    </div>
  );
}

function SourceStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
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

  return (
    <>
      <PageHeading
        copy={t('memory.import.a.source.you.will.then.decide.what.actually')}
        eyebrow={t('memory.career.memory.1.of.3')}
        title={t('memory.add.your.background')}
        action={
          <Link className={styles.secondaryButton} href="/memory">
            {t('memory.cancel')}{' '}
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
            <h2 id="file-title">{t('memory.drop.your.resume.here')}</h2>
            <p>{t('memory.pdf.docx.or.txt.4.mb.maximum')}</p>
            <button
              className={styles.primaryButton}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {t('memory.choose.a.file')}{' '}
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
              <h2 id="paste-title">{t('memory.or.paste.text')}</h2>
              <p>{t('memory.resume.linkedin.export.or.career.notes')}</p>
            </div>
          </div>
          <label htmlFor="pasted-source-kind">
            {t('memory.source.type.2')}
          </label>
          <select
            id="pasted-source-kind"
            onChange={(event) =>
              controller.setPasteSourceKind(
                event.target.value as Controller['pasteSourceKind'],
              )
            }
            value={controller.pasteSourceKind}
          >
            <option value="linkedin">{t('memory.linkedin.profile')}</option>
            <option value="document">{t('memory.resume.as.text')}</option>
            <option value="manual">{t('memory.career.notes')}</option>
          </select>
          <label htmlFor="profile-text">{t('memory.content.to.analyze')}</label>
          <textarea
            id="profile-text"
            onChange={(event) => controller.setPasteText(event.target.value)}
            placeholder={t('memory.paste.your.profile.text.here')}
            value={controller.pasteText}
          />
          <button
            className={styles.secondaryButton}
            disabled={!canReadPaste}
            onClick={() => void controller.importPastedText()}
            type="button"
          >
            {t('memory.read.this.text')} <Icon>arrow_forward</Icon>
          </button>
        </section>

        <aside className={styles.privacyPanel}>
          <div className={styles.panelTitle}>
            <span className={styles.safeIcon}>
              <Icon>shield_lock</Icon>
            </span>
            <div>
              <h2>{t('memory.before.you.begin')}</h2>
              <p>{t('memory.privacy.does.not.rely.on.a.vague.promise')}</p>
            </div>
          </div>
          <ul>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>{t('memory.extraction.in.your.browser')}</strong>
                <small>
                  {t('memory.the.raw.file.is.not.sent.to.the.server')}
                </small>
              </span>
            </li>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>{t('memory.review.required')}</strong>
                <small>
                  {t('memory.every.claim.remains.editable.or.removable')}{' '}
                </small>
              </span>
            </li>
            <li>
              <Icon>check</Icon>
              <span>
                <strong>{t('memory.explicit.save')}</strong>
                <small>
                  {t(
                    'memory.only.your.selection.is.saved.after.confirmation',
                  )}{' '}
                </small>
              </span>
            </li>
          </ul>
        </aside>
      </div>
    </>
  );
}

function ReadingStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  return (
    <>
      <PageHeading
        copy={t(
          'memory.extraction.runs.locally.duration.depends.on.the.document.and',
        )}
        eyebrow={t('memory.career.memory.local.processing')}
        title={t('memory.reading.your.source')}
      />
      <section className={styles.readingPanel} aria-busy="true">
        <div className={styles.fileGlyph}>
          <Icon>description</Icon>
        </div>
        <div>
          <h2>{controller.sourceName}</h2>
          <p role="status">{t('memory.extracting.and.structuring.content')}</p>
        </div>
        <span className={styles.indeterminate} aria-hidden="true">
          <i />
        </span>
        <button
          className={styles.secondaryButton}
          onClick={controller.cancelReading}
          type="button"
        >
          {t('memory.cancel.reading')}{' '}
        </button>
      </section>
      <aside className={styles.readingNote}>
        <Icon>info</Icon>
        <p>
          {t(
            'memory.no.percentage.or.time.remaining.is.shown.because.neither',
          )}{' '}
        </p>
      </aside>
    </>
  );
}

function ReviewStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages, applicationsMessages]);
  const review = controller.review;
  if (!review) return null;
  const selectedCount = review.candidates.filter(
    (item) => item.selected,
  ).length;
  const saving = controller.stage === 'saving';

  return (
    <>
      <PageHeading
        copy={t(
          'memory.review.the.wording.category.privacy.and.uses.before.saving',
        )}
        eyebrow={t('memory.career.memory.2.of.3')}
        title={t('memory.review.what.was.extracted')}
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
                <h2>{t('memory.professional.identity')}</h2>
                <p>
                  {t(
                    'memory.pre.filled.from.the.source.never.approved.on.your',
                  )}{' '}
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
                {t('memory.positioning')}{' '}
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
                <h2 id="claims-title">{t('memory.suggested.claims')}</h2>
                <p>
                  {selectedCount} {t('memory.of')} {review.candidates.length}{' '}
                  {t('memory.selected')} {selectedCount > 1 ? 's' : ''}
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
                {t('memory.select.all')}{' '}
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
                  )}{' '}
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
              <p>{t('memory.local.source')}</p>
              <strong>{review.source.displayName}</strong>
              <small>{review.source.type.toUpperCase()}</small>
            </div>
          </section>
          <section className={styles.validationPanel}>
            <p>{t('memory.step.3')}</p>
            <h2>{t('memory.your.confirmation')}</h2>
            <span>
              {t('memory.only.the')} {selectedCount}{' '}
              {t(
                'memory.selected.claims.will.be.saved.each.keeps.the.chosen',
              )}{' '}
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
                {t(
                  'memory.i.reviewed.this.selection.and.authorize.the.listed.uses',
                )}{' '}
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
                  <Icon>progress_activity</Icon> {t('applications.saving')}{' '}
                </>
              ) : (
                <>
                  {t('memory.confirm.and.save')} <Icon>arrow_forward</Icon>
                </>
              )}
            </button>
            <small>
              {t(
                'memory.only.when.you.click.here.does.the.selection.leave',
              )}{' '}
            </small>
          </section>
        </aside>
      </div>
    </>
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
    const uses = candidate.allowedUses.includes(use)
      ? candidate.allowedUses.filter((value) => value !== use)
      : [...candidate.allowedUses, use];
    onChange({ allowedUses: uses });
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
              {t('memory.sensitivity')}{' '}
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
              {t('active-routes.status')}{' '}
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
                {t('memory.choose.at.least.one.use.or.remove.this.claim')}{' '}
              </small>
            ) : null}
          </fieldset>
          <details className={styles.sourceDetail}>
            <summary>{t('memory.view.source.excerpt')}</summary>
            <blockquote>{candidate.excerpt}</blockquote>
            <small>{candidate.locator}</small>
          </details>
        </div>
      ) : null}
    </article>
  );
}

function SavedStep() {
  const t = useTranslations([memoryMessages]);
  return (
    <section className={styles.savedPanel}>
      <span className={styles.savedIcon}>
        <Icon>check</Icon>
      </span>
      <p>{t('memory.career.memory.complete')}</p>
      <h1>{t('memory.your.selection.is.saved')}</h1>
      <span>
        {t(
          'memory.the.selected.information.is.now.available.in.your.career',
        )}{' '}
      </span>
      <div>
        <Link className={styles.primaryButton} href="/memory">
          {t('memory.open.my.career.memory')} <Icon>arrow_forward</Icon>
        </Link>
        <Link className={styles.secondaryButton} href="/memory/import">
          {t('memory.add.another.source')}{' '}
        </Link>
      </div>
    </section>
  );
}

function importLabels(t: Translator<typeof memoryMessages>) {
  const importCandidateGroupLabels = {
    summary: t('memory.profile.and.summary'),
    experience: t('memory.experience'),
    project: t('memory.project'),
    skill: t('memory.skill'),
    education: t('memory.education'),
    result: t('memory.result'),
    other: t('memory.other.information'),
  } as const;

  const allowedUseLabels = {
    application: t('memory.applications'),
    resume: t('memory.resume'),
    linkedin: t('memory.linkedin'),
    interview: 'Entretiens',
  } as const;

  const sensitivityLabels = {
    public: t('memory.public.2'),
    private: t('memory.private'),
    restricted: t('memory.restricted'),
  } as const;

  const provenanceLabels = {
    declared: t('memory.declared.by.you'),
    inferred: t('memory.inferred.needs.confirmation'),
    unsupported: t('memory.unsupported.2'),
  } as const;

  return {
    importCandidateGroupLabels,
    allowedUseLabels,
    sensitivityLabels,
    provenanceLabels,
  };
}
import type { Translator } from '@/lib/i18n/messages';
