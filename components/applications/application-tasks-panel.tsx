'use client';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { Badge, Icon } from '@/components/ui/primitives';
import {
  type ApplicationTask,
  applicationTaskListSchema,
  applicationTaskSchema,
} from '@/lib/application-task';
import {
  createApplicationTask,
  readApplicationTasks,
  setApplicationTaskCompleted,
} from '@/lib/career-api';
import { dossierMessages } from '@/lib/i18n/dictionaries/dossier';
import { useEffect, useState } from 'react';

export function ApplicationTasksPanel({
  applicationId,
}: {
  applicationId: string;
}) {
  const { locale } = useI18n();
  const t = useTranslations([dossierMessages, applicationsMessages]);
  const [tasks, setTasks] = useState<ApplicationTask[]>();
  const [saving, setSaving] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void readApplicationTasks(applicationId, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const parsed = applicationTaskListSchema.parse(await response.json());
        setTasks(parsed.tasks);
      })
      .catch((requestError: unknown) => {
        if (
          !(requestError instanceof DOMException) ||
          requestError.name !== 'AbortError'
        )
          setError(true);
      });
    return () => controller.abort();
  }, [applicationId]);

  async function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError(false);
    try {
      const response = await createApplicationTask(applicationId, {
        kind: String(form.get('kind')) as ApplicationTask['kind'],
        title: String(form.get('title') ?? ''),
        dueAt: new Date(String(form.get('dueAt'))).toISOString(),
      });
      if (!response.ok) throw new Error();
      const created = applicationTaskSchema.parse(await response.json());
      setTasks([...(tasks ?? []), created].sort(compareApplicationTasks));
      formElement.reset();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: ApplicationTask) {
    if (pendingTaskId) return;
    setPendingTaskId(task.taskId);
    setError(false);
    try {
      const response = await setApplicationTaskCompleted(
        task,
        !task.completedAt,
      );
      if (!response.ok) throw new Error();
      const updated = applicationTaskSchema.parse(await response.json());
      setTasks(
        (tasks ?? [])
          .map((candidate) =>
            candidate.taskId === updated.taskId ? updated : candidate,
          )
          .sort(compareApplicationTasks),
      );
    } catch {
      setError(true);
    } finally {
      setPendingTaskId(undefined);
    }
  }

  return (
    <section className="co-panel co-application-tasks">
      <header>
        <div>
          <p>{t('dossier.next.actions')}</p>
          <h2>{t('dossier.dated.tasks.and.follow.ups')}</h2>
        </div>
        <Badge>{tasks?.filter((task) => !task.completedAt).length ?? 0}</Badge>
      </header>
      <form onSubmit={addTask}>
        <label>
          {t('dossier.type')}{' '}
          <select defaultValue="follow_up" name="kind">
            <option value="task">{t('dossier.task')}</option>
            <option value="follow_up">{t('dossier.follow.up.2')}</option>
          </select>
        </label>
        <label>
          {t('dossier.due.date')}{' '}
          <input name="dueAt" required type="datetime-local" />
        </label>
        <label className="wide">
          {t('dossier.action')}{' '}
          <input
            maxLength={200}
            name="title"
            placeholder={t(
              'dossier.follow.up.with.the.recruiter.after.the.interview',
            )}
            required
          />
        </label>
        <button className="co-button" disabled={saving} type="submit">
          {saving ? t('applications.saving') : t('dossier.schedule')}
        </button>
      </form>
      {error ? (
        <p className="co-task-error" role="alert">
          {t('dossier.the.change.could.not.be.saved')}{' '}
        </p>
      ) : null}
      <div className="co-task-list">
        {tasks === undefined ? (
          <p>{t('dossier.loading.next.actions')}</p>
        ) : tasks.length ? (
          tasks.map((task) => (
            <article
              className={task.completedAt ? 'done' : ''}
              key={task.taskId}
            >
              <button
                aria-label={
                  locale === 'en'
                    ? `${task.completedAt ? 'Reopen' : 'Complete'}: ${task.title}`
                    : `${task.completedAt ? 'Rouvrir' : 'Terminer'} : ${task.title}`
                }
                disabled={pendingTaskId === task.taskId}
                onClick={() => void toggleTask(task)}
                type="button"
              >
                <Icon>
                  {task.completedAt ? 'check_circle' : 'radio_button_unchecked'}
                </Icon>
              </button>
              <div>
                <p>
                  <strong>{task.title}</strong>
                  <Badge tone={task.kind === 'follow_up' ? 'warn' : 'muted'}>
                    {taskKindLabel(task.kind, locale)}
                  </Badge>
                </p>
                <time dateTime={task.dueAt}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(task.dueAt))}
                </time>
              </div>
            </article>
          ))
        ) : (
          <p>{t('dossier.no.action.scheduled')}</p>
        )}
      </div>
    </section>
  );
}

export function taskKindLabel(
  kind: ApplicationTask['kind'],
  locale: 'en' | 'fr',
) {
  if (kind === 'follow_up') return locale === 'en' ? 'Follow-up' : 'Relance';
  return locale === 'en' ? 'Task' : 'Tâche';
}

export function compareApplicationTasks(
  left: ApplicationTask,
  right: ApplicationTask,
) {
  return (
    Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)) ||
    left.dueAt.localeCompare(right.dueAt)
  );
}
