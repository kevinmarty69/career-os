'use client';

import { useState } from 'react';
import { useI18n } from '@/components/i18n/i18n-provider';
import { buildApplicationKit } from '@/lib/application-kit';
import type { PersistedRun } from '@/lib/run-contract';

export function ApplicationKitPanel({
  company,
  profile,
  research,
  role,
  strategy,
}: {
  company: string;
  profile: PersistedRun['profile'];
  research: NonNullable<PersistedRun['research']>;
  role: string;
  strategy: NonNullable<PersistedRun['strategy']>;
}) {
  const { locale } = useI18n();
  const [copied, setCopied] = useState<'contact' | 'application'>();
  const kit = buildApplicationKit({
    company,
    locale,
    profile,
    research,
    role,
    strategy,
  });
  const copy =
    locale === 'en'
      ? {
          eyebrow: 'Application kit',
          title: 'Turn the approved strategy into the next conversation.',
          intro:
            'Drafts stay tied to the selected signals and evidence. Review them before using them.',
          questions: 'Interview questions',
          messages: 'Short messages',
          contact: 'First contact',
          application: 'Application note',
          copy: 'Copy',
          copied: 'Copied',
          sample: 'Optional work sample',
          sampleBoundary: 'Not started automatically',
          provenance: 'Built from approved strategy',
        }
      : {
          eyebrow: 'Kit de candidature',
          title: 'Transformez la stratégie validée en prochaine conversation.',
          intro:
            'Les brouillons restent liés aux signaux et preuves retenus. Relisez-les avant utilisation.',
          questions: 'Questions d’entretien',
          messages: 'Messages courts',
          contact: 'Premier contact',
          application: 'Note de candidature',
          copy: 'Copier',
          copied: 'Copié',
          sample: 'Preuve de travail facultative',
          sampleBoundary: 'Jamais lancée automatiquement',
          provenance: 'Construit depuis la stratégie validée',
        };

  async function copyMessage(kind: 'contact' | 'application', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(undefined);
    }
  }

  return (
    <section className="co-panel co-application-kit">
      <header>
        <div>
          <p>{copy.eyebrow}</p>
          <h2>{copy.title}</h2>
          <span>{copy.intro}</span>
        </div>
        <small>{copy.provenance}</small>
      </header>
      <div>
        <section>
          <h3>{copy.questions}</h3>
          <ol>
            {kit.questions.map((question) => (
              <li key={question.sourceSignalId}>{question.text}</li>
            ))}
          </ol>
        </section>
        <section>
          <h3>{copy.messages}</h3>
          {kit.messages.map((message) => (
            <article key={message.kind}>
              <small>
                {message.kind === 'contact' ? copy.contact : copy.application}
              </small>
              <p>{message.text}</p>
              <button
                onClick={() => void copyMessage(message.kind, message.text)}
                type="button"
              >
                {copied === message.kind ? copy.copied : copy.copy}
              </button>
            </article>
          ))}
        </section>
      </div>
      {kit.workSample ? (
        <footer>
          <div>
            <small>{copy.sample}</small>
            <strong>{kit.workSample.title}</strong>
            <p>{kit.workSample.brief}</p>
          </div>
          <span>{copy.sampleBoundary}</span>
        </footer>
      ) : null}
    </section>
  );
}
