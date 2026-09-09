'use client';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { githubRepositorySchema } from '@/lib/github-source';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import styles from './memory-import-flow.module.css';
import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import {
  Icon,
  PageHeading,
  ErrorBanner,
  type MemoryImportController as Controller,
} from './memory-import-presentation';
export function SourceStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  const fr = useI18n().locale === 'fr';
  const repository = controller.githubRepository;
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
              accept=".pdf,.docx,.txt,.zip,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/zip,text/csv"
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
          <div className={`${styles.pasteFields} ${styles.sourceInstructions}`}>
            <h2>LinkedIn</h2>
            <p>
              {fr
                ? 'Dans les paramètres LinkedIn, demandez une copie de vos données. Déposez l’archive ZIP ici, ou son fichier Positions.csv. Seuls les postes, dates et descriptions sont lus ; ni messages, ni contacts, ni autres fichiers.'
                : 'Request a copy of your data in LinkedIn settings. Drop the ZIP archive here, or its Positions.csv file. Only positions, dates and descriptions are read; not messages, contacts or other files.'}
            </p>
            <p>
              {fr
                ? '4 Mo maximum. Pour une archive plus lourde, extrayez Positions.csv sur votre ordinateur avant de l’importer.'
                : '4 MB maximum. For a larger archive, extract Positions.csv on your computer before importing it.'}
            </p>
          </div>
          <div className={`${styles.pasteFields} ${styles.sourceInstructions}`}>
            <h2>GitHub</h2>
            <p>
              {fr
                ? 'Importez le README d’un dépôt public. Le serveur lit uniquement sa présentation et ses métadonnées publiques, sans clé ni code privé. Aucune contribution ne vous est attribuée automatiquement.'
                : 'Import a public repository README. The server reads only its overview and public metadata, without a key or private code. No contribution is automatically attributed to you.'}
            </p>
            <label htmlFor="github-repository">
              {fr ? 'Dépôt public' : 'Public repository'}
              <input
                id="github-repository"
                value={repository}
                onChange={(event) =>
                  controller.setGithubRepository(event.target.value)
                }
                placeholder="https://github.com/owner/repository"
                maxLength={2048}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!githubRepositorySchema.safeParse(repository).success}
              onClick={() => void controller.importGitHub(repository)}
            >
              {fr ? 'Lire le README public' : 'Read public README'}
              <Icon>arrow_forward</Icon>
            </button>
          </div>
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

export function ReadingStep({ controller }: { controller: Controller }) {
  const t = useTranslations([memoryMessages]);
  const fr = useI18n().locale === 'fr';
  return (
    <div className={styles.flowStep} data-motion="enter">
      <PageHeading
        copy={t('memory.reading.resume.intro')}
        eyebrow={t('memory.step.1.of.3')}
        title={
          controller.readingLocation === 'github'
            ? fr
              ? 'Lecture du README public'
              : 'Reading the public README'
            : t('memory.reading.your.resume')
        }
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
              <p>
                {controller.readingLocation === 'github'
                  ? fr
                    ? 'Lecture publique par le serveur, puis revue locale.'
                    : 'Public server fetch, followed by local review.'
                  : t('memory.local.source.processed.in.browser')}
              </p>
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
