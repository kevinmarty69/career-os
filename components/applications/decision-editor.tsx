'use client';

import styles from '@/components/applications/applications-page.module.css';
import {
  decisionError,
  qualificationFor,
  reasonCopy,
} from '@/components/applications/opportunity-labels';
import { useTranslations } from '@/components/i18n/i18n-provider';
import { saveOpportunityDecision } from '@/lib/career-api';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import {
  type OpportunityDecision,
  opportunityDecisionMutationResponseSchema,
} from '@/lib/opportunity-decision';
import { type SearchProfile } from '@/lib/search-profile';
import { useState } from 'react';

export function DecisionEditor({
  decision,
  initialDisposition,
  onCancel,
  onSaved,
  opportunityId,
  searchProfiles,
}: {
  decision?: OpportunityDecision;
  initialDisposition: OpportunityDecision['disposition'];
  onCancel: () => void;
  onSaved: (decision: OpportunityDecision) => void;
  opportunityId: string;
  searchProfiles: SearchProfile[];
}) {
  const t = useTranslations([applicationsMessages]);
  const [disposition, setDisposition] = useState(initialDisposition);
  const [qualification, setQualification] = useState<
    OpportunityDecision['qualification']
  >(decision?.qualification ?? qualificationFor(initialDisposition));
  const [reason, setReason] = useState<OpportunityDecision['reason'] | ''>(
    decision?.reason ?? '',
  );
  const [note, setNote] = useState(decision?.note ?? '');
  const [searchProfileId, setSearchProfileId] = useState(
    decision?.searchProfileId ?? '',
  );
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function changed(action: () => void) {
    action();
    setOperationKey(crypto.randomUUID());
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError(t('applications.choose.a.reason.before.saving'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await saveOpportunityDecision(
        opportunityId,
        {
          searchProfileId: searchProfileId || null,
          disposition,
          qualification,
          reason,
          note: note.trim() || null,
          expectedRevision: decision?.revision ?? 0,
        },
        operationKey,
      );
      if (!response.ok) throw new Error(decisionError(t, response.status));
      const payload = opportunityDecisionMutationResponseSchema.parse(
        await response.json(),
      );
      onSaved(payload.decision);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('applications.the.decision.could.not.be.saved'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.decisionEditor} onSubmit={submit}>
      <header>
        <div>
          <strong>{t('applications.human.decision')}</strong>
          <small>
            {decision ? (
              <>
                {t('applications.revision')} {decision.revision} ·{' '}
                {decision.history.length}{' '}
                {decision.history.length > 1
                  ? t('applications.decisions.retained')
                  : t('applications.decision.retained')}
              </>
            ) : (
              t('applications.first.decision')
            )}
          </small>
        </div>
        <button
          aria-label={t('applications.close.decision')}
          onClick={onCancel}
          type="button"
        >
          ×
        </button>
      </header>
      <div className={styles.decisionFields}>
        <label>
          <span>{t('applications.status')}</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setDisposition(
                  event.target.value as OpportunityDecision['disposition'],
                ),
              )
            }
            value={disposition}
          >
            <option value="saved">{t('applications.saved')}</option>
            <option value="ignored">{t('applications.ignored')}</option>
            <option value="archived">{t('applications.archived')}</option>
          </select>
        </label>
        <label>
          <span>{t('applications.corrected.qualification')}</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setQualification(
                  event.target.value as OpportunityDecision['qualification'],
                ),
              )
            }
            value={qualification}
          >
            <option value="priority">{t('applications.priority')}</option>
            <option value="interesting">{t('applications.interesting')}</option>
            <option value="exploratory">{t('applications.exploratory')}</option>
            <option value="ignore">{t('applications.ignore.2')}</option>
          </select>
        </label>
        <label>
          <span>{t('applications.reason')}</span>
          <select
            aria-invalid={!reason || undefined}
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setReason(event.target.value as OpportunityDecision['reason']),
              )
            }
            required
            value={reason}
          >
            <option value="">{t('applications.choose.a.reason')}</option>
            {decisionReasons.map((candidate) => (
              <option key={candidate} value={candidate}>
                {reasonCopy(t, candidate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('applications.search.profile')}</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() => setSearchProfileId(event.target.value))
            }
            value={searchProfileId}
          >
            <option value="">{t('applications.no.linked.profile')}</option>
            {searchProfiles.map((profile) => (
              <option
                key={profile.searchProfileId}
                value={profile.searchProfileId}
              >
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={styles.noteField}>
        <span>
          {t('applications.optional.note')} <small>{note.length}/500</small>
        </span>
        <textarea
          disabled={saving}
          maxLength={500}
          onChange={(event) => changed(() => setNote(event.target.value))}
          placeholder={t(
            'applications.add.only.the.context.useful.for.your.next.decisions',
          )}
          rows={2}
          value={note}
        />
      </label>
      {error ? (
        <p className={styles.decisionError} role="alert">
          {error}
        </p>
      ) : null}
      <footer>
        <button disabled={saving} onClick={onCancel} type="button">
          {t('applications.cancel')}{' '}
        </button>
        <button
          className="co-button"
          disabled={saving || !reason}
          type="submit"
        >
          {saving ? t('applications.saving') : t('applications.save.decision')}
        </button>
      </footer>
    </form>
  );
}

export const decisionReasons: OpportunityDecision['reason'][] = [
  'strong_fit',
  'career_direction',
  'hard_constraint',
  'weak_evidence',
  'compensation',
  'location',
  'company',
  'duplicate',
  'closed',
  'other',
];
