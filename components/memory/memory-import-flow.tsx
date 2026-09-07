'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslations } from '@/components/i18n/i18n-provider';
import { ProfileMenu } from '@/components/layout/profile-menu';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import type { Translator } from '@/lib/i18n/messages';
import styles from './memory-import-flow.module.css';
import {
  useMemoryImport,
  type AllowedUse,
  type CandidateGroup,
  type ProvenanceLevel,
  type ReviewCandidate,
  type Sensitivity,
} from './use-memory-import';

type Controller = ReturnType<typeof useMemoryImport>;

function Icon({
  children,
  className = '',
}: {
  children: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`${styles.icon} ${className}`}>
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

function AppChrome({
  children,
  stage,
}: {
  children: ReactNode;
  stage: Controller['stage'];
}) {
  const t = useTranslations([memoryMessages]);
  const navigation = [
    ['grid_view', t('memory.home'), '/'],
    ['account_tree', t('memory.applications'), '/applications'],
    ['database', t('memory.career.memory'), '/memory'],
    ['send', t('memory.private.links'), '/links'],
    ['settings', t('memory.settings'), '/settings/models'],
  ] as const;
  const mobileNavigation = navigation.slice(0, 4);
  const memoryComplete = stage === 'saved';

  return (
    <main className={styles.canvas}>
      <a className={styles.skipLink} href="#memory-import-content">
        {t('memory.skip.to.import')}
      </a>
      <section
        aria-label={t('memory.career.memory.import')}
        className={styles.screen}
      >
        <aside
          aria-label={t('memory.career.os.navigation')}
          className={styles.sidebar}
        >
          <Brand />
          <nav
            aria-label={t('memory.main.navigation')}
            className={styles.navigation}
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
          <section aria-labelledby="setup-title" className={styles.setup}>
            <h2 id="setup-title">{t('memory.setup')}</h2>
            <ol>
              <SetupItem label={t('memory.account.created')} state="done" />
              <SetupItem
                label={t('memory.import.a.resume')}
                state={memoryComplete ? 'done' : 'current'}
              />
              <SetupItem
                label={t('memory.paste.a.job')}
                state={memoryComplete ? 'current' : 'upcoming'}
              />
              <SetupItem label={t('memory.publish.a.page')} state="upcoming" />
            </ol>
          </section>
          <div className={styles.sidebarFooter}>
            <ProfileMenu />
            <div className={styles.localNote}>
              <Icon>shield</Icon>
              <span>
                <strong>{t('memory.local.processing')}</strong>
                <small>{t('memory.the.file.stays.in.this.browser')}</small>
              </span>
            </div>
          </div>
        </aside>
        <header className={styles.mobileHeader}>
          <Brand />
          <div>
            <ProfileMenu placement="below" />
            <Link href="/memory" aria-label={t('memory.close.import')}>
              <Icon>close</Icon>
            </Link>
          </div>
        </header>
        <section className={styles.content} id="memory-import-content">
          {children}
        </section>
        <nav
          aria-label={t('memory.mobile.navigation')}
          className={styles.mobileNavigation}
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

function SetupItem({
  label,
  state,
}: {
  label: string;
  state: 'done' | 'current' | 'upcoming';
}) {
  return (
    <li className={styles[state]}>
      <Icon>
        {state === 'done'
          ? 'check_circle'
          : state === 'current'
            ? 'autorenew'
            : 'radio_button_unchecked'}
      </Icon>
      <span>{label}</span>
    </li>
  );
}

export function MemoryImportFlow() {
  const controller = useMemoryImport();
  return (
    <AppChrome stage={controller.stage}>
      {controller.stage === 'source' ? (
        <SourceStep controller={controller} />
      ) : null}
      {controller.stage === 'reading' ? (
        <ReadingStep controller={controller} />
      ) : null}
      {controller.stage === 'review' || controller.stage === 'saving' ? (
        <ReviewStep controller={controller} />
      ) : null}
      {controller.stage === 'saved' ? (
        <SavedStep controller={controller} />
      ) : null}
    </AppChrome>
  );
}

function PageHeading({
  eyebrow,
  title,
  accessibleTitle,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  accessibleTitle?: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeading}>
      <div>
        <p>{eyebrow}</p>
        <h1 aria-label={accessibleTitle}>{title}</h1>
        <span>{copy}</span>
      </div>
      {action ? <div className={styles.headingAction}>{action}</div> : null}
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
    <div className={styles.flowStep} data-motion="enter">
      <PageHeading
        accessibleTitle={t('memory.add.your.background')}
        copy={t('memory.import.resume.intro')}
        eyebrow={t('memory.step.1.of.3')}
        title={t('memory.import.your.resume')}
        action={
          <Link className={styles.ghostButton} href="/memory">
            {t('memory.cancel')}
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
            <span className={styles.majorIcon}>
              <Icon>picture_as_pdf</Icon>
            </span>
            <h2 id="file-title">{t('memory.drop.your.resume.here')}</h2>
            <p>{t('memory.pdf.docx.or.txt.4.mb.maximum')}</p>
            <button
              className={styles.primaryButton}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              {t('memory.choose.a.file')}
              <Icon>arrow_forward</Icon>
            </button>
            <input
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className={styles.fileInput}
              onChange={(event) => chooseFile(event.currentTarget.files)}
              ref={inputRef}
              type="file"
            />
          </div>
          <div className={styles.pasteDivider}>
            <span>{t('memory.or.paste.text')}</span>
          </div>
          <div className={styles.pasteFields}>
            <label htmlFor="pasted-source-kind">
              {t('memory.source.type.2')}
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
            </label>
            <label htmlFor="profile-text">
              {t('memory.content.to.analyze')}
              <textarea
                id="profile-text"
                onChange={(event) =>
                  controller.setPasteText(event.target.value)
                }
                placeholder={t('memory.paste.your.profile.text.here')}
                value={controller.pasteText}
              />
            </label>
            <button
              className={styles.secondaryButton}
              disabled={!canReadPaste}
              onClick={() => void controller.importPastedText()}
              type="button"
            >
              {t('memory.read.this.text')}
              <Icon>arrow_forward</Icon>
            </button>
          </div>
        </section>
        <aside className={styles.privacyPanel}>
          <div className={styles.panelHeading}>
            <span className={styles.safeIcon}>
              <Icon>shield</Icon>
            </span>
            <div>
              <p>{t('memory.before.you.begin')}</p>
              <h2>{t('memory.nothing.is.saved.without.your.approval')}</h2>
            </div>
          </div>
          <ul>
            <PrivacyItem
              body={t('memory.the.raw.file.is.not.sent.to.the.server')}
              title={t('memory.extraction.in.your.browser')}
            />
            <PrivacyItem
              body={t('memory.every.claim.remains.editable.or.removable')}
              title={t('memory.review.required')}
            />
            <PrivacyItem
              body={t('memory.only.your.selection.is.saved.after.confirmation')}
              title={t('memory.explicit.save')}
            />
          </ul>
          <div className={styles.privacyFootnote}>
            <Icon>info</Icon>
            <p>{t('memory.you.will.review.everything.before.saving')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PrivacyItem({ title, body }: { title: string; body: string }) {
  return (
    <li>
      <Icon>check</Icon>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
    </li>
  );
}

function ReadingStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  return (
    <div className={styles.flowStep} data-motion="enter">
      <PageHeading
        copy={t('memory.reading.resume.intro')}
        eyebrow={t('memory.step.1.of.3')}
        title={t('memory.reading.your.resume')}
        action={
          <button
            className={styles.ghostButton}
            onClick={controller.cancelReading}
            type="button"
          >
            {t('memory.cancel.import')}
          </button>
        }
      />
      <div className={styles.readingLayout}>
        <section aria-busy="true" className={styles.readingPanel}>
          <header className={styles.fileHeader}>
            <span className={styles.fileIcon}>
              <Icon>picture_as_pdf</Icon>
            </span>
            <div>
              <h2>{controller.sourceName}</h2>
              <p>{t('memory.local.source.processed.in.browser')}</p>
            </div>
          </header>
          <div className={styles.progressMeta}>
            <strong>{t('memory.processing')}</strong>
            <span>{t('memory.duration.depends.on.your.device')}</span>
          </div>
          <div
            aria-label={t('memory.extracting.and.structuring.content')}
            aria-valuetext={t('memory.extracting.and.structuring.content')}
            className={styles.indeterminate}
            role="progressbar"
          >
            <i />
          </div>
          <ol className={styles.readingSteps}>
            <ReadingPhase
              icon="autorenew"
              state="current"
              title={t('memory.text.extracted.and.structured')}
              value={t('memory.reading.the.document')}
            />
            <ReadingPhase
              icon="radio_button_unchecked"
              state="upcoming"
              title={t('memory.splitting.into.claims')}
              value={t('memory.queued')}
            />
            <ReadingPhase
              icon="radio_button_unchecked"
              state="upcoming"
              title={t('memory.linking.to.the.original.location')}
              value={t('memory.queued')}
            />
            <ReadingPhase
              icon="radio_button_unchecked"
              state="upcoming"
              title={t('memory.grouping.by.skill')}
              value={t('memory.queued')}
            />
          </ol>
          <div className={styles.infoNote}>
            <Icon>info</Icon>
            <div>
              <strong>{t('memory.you.will.review.everything')}</strong>
              <p>{t('memory.reading.review.promise')}</p>
            </div>
          </div>
        </section>
        <aside aria-live="polite" className={styles.livePanel}>
          <header>
            <div>
              <Icon className={styles.spinning}>autorenew</Icon>
              <div>
                <p>{t('memory.live.extraction')}</p>
                <h2>{t('memory.building.the.first.claims')}</h2>
              </div>
            </div>
            <span className={styles.machineChip}>{t('memory.local')}</span>
          </header>
          <div className={styles.liveEmpty}>
            <span className={styles.liveIcon}>
              <Icon>format_quote</Icon>
            </span>
            <p>{t('memory.claims.will.appear.after.local.parsing')}</p>
            <small>{t('memory.no.result.is.invented.while.reading')}</small>
          </div>
          <footer>
            <span>
              <i className={styles.directDot} />
              {t('memory.direct.quote')}
            </span>
            <span>
              <i className={styles.reviewDot} />
              {t('memory.to.confirm')}
            </span>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function ReadingPhase({
  icon,
  state,
  title,
  value,
}: {
  icon: string;
  state: 'current' | 'upcoming';
  title: string;
  value: string;
}) {
  return (
    <li className={styles[state]}>
      <Icon className={state === 'current' ? styles.spinning : ''}>{icon}</Icon>
      <span>
        <strong>{title}</strong>
        <small>{value}</small>
      </span>
    </li>
  );
}

function ReviewStep({ controller }: { controller: Controller }) {
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
      <div className={styles.reviewLayout}>
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
      </div>
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

function SavedStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  const [jobSource, setJobSource] = useState('');
  const review = controller.review;
  const selected =
    review?.candidates.filter((candidate) => candidate.selected) ?? [];
  const groupCounts = selected.reduce<Map<CandidateGroup, number>>(
    (counts, candidate) => {
      counts.set(candidate.group, (counts.get(candidate.group) ?? 0) + 1);
      return counts;
    },
    new Map(),
  );
  const topGroups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const labels = importLabels(t).importCandidateGroupLabels;
  const sourceMode = /^https?:\/\//i.test(jobSource.trim()) ? 'url' : 'text';
  return (
    <div className={styles.flowStep} data-motion="enter">
      <div className={styles.readyGrid}>
        <section className={styles.savedPanel}>
          <header>
            <span className={styles.savedIcon}>
              <Icon>check</Icon>
            </span>
            <div>
              <p>{t('memory.career.memory.complete')}</p>
              <h1 aria-label={t('memory.your.selection.is.saved')}>
                {t('memory.memory.created')}
              </h1>
            </div>
            <Link className={styles.inlineButton} href="/memory">
              {t('memory.open.my.career.memory')}
            </Link>
          </header>
          <dl className={styles.memoryStats}>
            <div>
              <dt>{t('memory.claims')}</dt>
              <dd>{selected.length}</dd>
            </div>
            <div>
              <dt>{t('memory.skill.groups')}</dt>
              <dd>{groupCounts.size}</dd>
            </div>
            <div>
              <dt>{t('memory.sources')}</dt>
              <dd>{review ? 1 : 0}</dd>
            </div>
          </dl>
          <div className={styles.nextStep}>
            <p>{t('memory.next.step')}</p>
            <h2>{t('memory.paste.a.job.you.are.interested.in')}</h2>
            <span>{t('memory.saved.job.intro')}</span>
            <form action="/applications/new" method="get">
              <Icon>link</Icon>
              <input
                autoFocus
                aria-label={t('memory.public.job.url.or.text')}
                name="source"
                onChange={(event) => setJobSource(event.target.value)}
                placeholder={t('memory.url.placeholder')}
                value={jobSource}
              />
              <input name="mode" type="hidden" value={sourceMode} />
              <button
                aria-label={t('memory.continue.with.this.job')}
                className={styles.primaryIconButton}
                disabled={!jobSource.trim()}
                type="submit"
              >
                <Icon>arrow_forward</Icon>
              </button>
            </form>
            <small>{t('memory.or.paste.job.text.or.import.pdf')}</small>
          </div>
        </section>
        <aside className={styles.missingPanel}>
          <header>
            <Icon>priority_high</Icon>
            <div>
              <p>{t('memory.what.is.missing')}</p>
              <h2>{t('memory.a.resume.covers.facts.rarely.evidence')}</h2>
            </div>
          </header>
          <span>
            {t('memory.adding.sources.will.expand.what.career.os.can.claim')}
          </span>
          <ul>
            <SourceSuggestion
              icon="badge"
              label={t('memory.linkedin.profile')}
              action={t('memory.connect')}
              href="/memory/import?source=linkedin"
              onActivate={() => controller.discard()}
            />
            <SourceSuggestion
              icon="code"
              label={t('memory.public.repositories')}
              action={t('memory.connect')}
              href="/settings/integrations"
            />
            <SourceSuggestion
              icon="description"
              label={t('memory.postmortems.specs.recommendations')}
              action={t('memory.import')}
              href="/memory/import?source=document"
              onActivate={() => controller.discard()}
            />
          </ul>
        </aside>
      </div>
      <div className={styles.readyLowerGrid}>
        <section className={styles.evidenceMap}>
          <header>
            <div>
              <p>{t('memory.your.evidence.map')}</p>
              <h2>{t('memory.derived.from.your.claims')}</h2>
            </div>
            <span className={styles.countBadge}>{selected.length}</span>
          </header>
          {topGroups.length ? (
            <ul>
              {topGroups.map(([group, count]) => (
                <li key={group}>
                  <span>{labels[group]}</span>
                  <strong>
                    {count}{' '}
                    {count === 1
                      ? t('memory.claim.singular')
                      : t('memory.claims')}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('memory.your.saved.claims.will.appear.here')}</p>
          )}
          <Link
            className={styles.secondaryButton}
            href="/memory/import"
            onClick={() => controller.discard()}
          >
            {t('memory.add.another.source')}
          </Link>
        </section>
        <section className={styles.howPanel}>
          <header>
            <p>{t('memory.how.it.will.work')}</p>
            <h2>{t('memory.for.every.job')}</h2>
          </header>
          <ol>
            <HowStep
              number="1"
              title={t('memory.agents.match')}
              body={t('memory.agents.match.body')}
            />
            <HowStep
              number="2"
              title={t('memory.you.decide')}
              body={t('memory.you.decide.body')}
            />
            <HowStep
              number="3"
              title={t('memory.you.send')}
              body={t('memory.you.send.body')}
            />
          </ol>
          <div className={styles.safetyLine}>
            <Icon>shield</Icon>
            <p>{t('memory.no.automatic.publication.or.email')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function SourceSuggestion({
  icon,
  label,
  action,
  href,
  onActivate,
}: {
  icon: string;
  label: string;
  action: string;
  href: string;
  onActivate?: () => void;
}) {
  return (
    <li>
      <span>
        <Icon>{icon}</Icon>
        {label}
      </span>
      <Link href={href} onClick={onActivate}>
        {action}
      </Link>
    </li>
  );
}

function HowStep({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <b>{number}</b>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
    </li>
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
    interview: t('memory.interviews'),
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
