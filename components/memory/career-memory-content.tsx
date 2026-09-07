'use client';
import { activeRoutesMessages } from '@/lib/i18n/dictionaries/active-routes';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n, useTranslations } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import type { Profile } from '@/lib/schemas';
import { useCareerMemory } from './use-career-memory';

function claimLabels(t: Translator<typeof memoryMessages>) {
  const kindLabels: Record<Profile['claims'][number]['kind'], string> = {
    summary: t('memory.summary'),
    experience: t('memory.experience'),
    project: t('memory.project'),
    skill: t('memory.skill'),
    education: t('memory.education'),
    result: t('memory.result'),
    preference: t('memory.preference'),
    other: t('memory.other'),
  };
  const levelLabels: Record<Profile['claims'][number]['level'], string> = {
    verified: t('memory.verified'),
    declared: t('memory.declared'),
    inferred: t('memory.inferred'),
    unsupported: t('memory.unsupported'),
  };
  const useLabels = {
    application: t('memory.application'),
    resume: t('memory.resume'),
    linkedin: t('memory.linkedin'),
    interview: t('memory.interview'),
  } as const;

  return { kindLabels, levelLabels, useLabels };
}
export function CareerMemoryContent() {
  const { locale } = useI18n();
  const t = useTranslations([memoryMessages, applicationsMessages]);
  const { kindLabels, levelLabels } = claimLabels(t);
  const memory = useCareerMemory();
  const [expanded, setExpanded] = useState<string>();
  const [showManual, setShowManual] = useState(false);
  const unsupported = memory.profile.claims.filter(
    ({ level }) => level === 'inferred' || level === 'unsupported',
  ).length;

  function setPublicLink(
    key: keyof NonNullable<Profile['publicLinks']>,
    value: string,
  ) {
    memory.setProfile((profile) => ({
      ...profile,
      publicLinks: {
        ...profile.publicLinks,
        [key]: value.trim() || undefined,
      },
    }));
  }

  function addManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const statement = String(data.get('statement') ?? '').trim();
    const sourceTitle = String(data.get('source') ?? '').trim();
    const excerpt = String(data.get('evidence') ?? '').trim();
    if (!statement || !sourceTitle) {
      memory.setMessage(t('memory.a.claim.and.its.source.are.required'));
      return;
    }
    const suffix = crypto.randomUUID();
    const sourceId = `source-${suffix}`;
    const evidenceId = `evidence-${suffix}`;
    memory.setProfile((profile) => ({
      ...profile,
      sources: [
        ...profile.sources,
        {
          id: sourceId,
          kind: 'manual',
          title: sourceTitle,
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: excerpt
        ? [
            ...profile.evidence,
            {
              id: evidenceId,
              sourceId,
              label: t('memory.manually.added.excerpt'),
              excerpt,
            },
          ]
        : profile.evidence,
      claims: [
        ...profile.claims,
        {
          id: `claim-${suffix}`,
          statement,
          kind: String(data.get('kind')) as Profile['claims'][number]['kind'],
          level: excerpt ? 'declared' : 'unsupported',
          evidenceIds: excerpt ? [evidenceId] : [],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    }));
    setShowManual(false);
    memory.setMessage(t('memory.item.added.to.the.draft.save.to.keep.it'));
    event.currentTarget.reset();
  }

  if (memory.state === 'loading')
    return (
      <p className="co-memory-status" role="status">
        {t('memory.loading.career.memory')}{' '}
      </p>
    );

  return (
    <>
      {memory.message ? (
        <p className="co-memory-status" role="status">
          {memory.message}
        </p>
      ) : null}
      <div className="co-memory-identity">
        <label>
          {t('memory.name')}{' '}
          <input
            value={memory.profile.name}
            onChange={(event) =>
              memory.setProfile((profile) => ({
                ...profile,
                name: event.target.value,
              }))
            }
          />
        </label>
        <label>
          {t('memory.positioning')}{' '}
          <input
            value={memory.profile.headline}
            onChange={(event) =>
              memory.setProfile((profile) => ({
                ...profile,
                headline: event.target.value,
              }))
            }
          />
        </label>
      </div>
      <section className="co-memory-public-links">
        <header>
          <div>
            <h2>{t('memory.links.shared.on.private.pages')}</h2>
            <p>{t('memory.only.the.links.entered.here.will.be.visible.to')} </p>
          </div>
          <span>{t('memory.explicit.sharing')}</span>
        </header>
        <div>
          <label>
            {t('memory.email')}{' '}
            <input
              inputMode="email"
              onChange={(event) => setPublicLink('email', event.target.value)}
              placeholder="alex@example.com"
              type="email"
              value={memory.profile.publicLinks?.email ?? ''}
            />
          </label>
          <label>
            {t('memory.resume')}{' '}
            <input
              inputMode="url"
              onChange={(event) => setPublicLink('resume', event.target.value)}
              placeholder="https://…"
              type="url"
              value={memory.profile.publicLinks?.resume ?? ''}
            />
          </label>
          <label>
            {t('memory.linkedin')}{' '}
            <input
              inputMode="url"
              onChange={(event) =>
                setPublicLink('linkedin', event.target.value)
              }
              placeholder="https://linkedin.com/in/…"
              type="url"
              value={memory.profile.publicLinks?.linkedin ?? ''}
            />
          </label>
          <label>
            {t('memory.github')}{' '}
            <input
              inputMode="url"
              onChange={(event) => setPublicLink('github', event.target.value)}
              placeholder="https://github.com/…"
              type="url"
              value={memory.profile.publicLinks?.github ?? ''}
            />
          </label>
          <label>
            {t('memory.portfolio')}{' '}
            <input
              inputMode="url"
              onChange={(event) =>
                setPublicLink('portfolio', event.target.value)
              }
              placeholder="https://…"
              type="url"
              value={memory.profile.publicLinks?.portfolio ?? ''}
            />
          </label>
        </div>
      </section>
      <div className="co-memory-metrics">
        <article>
          <span>{t('memory.explained.coverage')}</span>
          <div>
            <strong>
              {memory.coverage.presentCount}/{memory.coverage.totalCount}
            </strong>
          </div>
          <small>
            {t('memory.documented.categories.without.an.artificial.score')}
          </small>
        </article>
        <article>
          <span>{t('memory.claims')}</span>
          <div>
            <strong>{memory.profile.claims.length}</strong>
          </div>
          <small>
            {memory.profile.sources.length} {t('memory.linked.source.s')}
          </small>
        </article>
        <article>
          <span>{t('memory.not.publishable')}</span>
          <div>
            <strong className={unsupported ? 'crit' : ''}>{unsupported}</strong>
          </div>
          <small>{t('memory.inferred.or.still.unsupported')}</small>
        </article>
        <article>
          <span>{t('memory.history')}</span>
          <div>
            <strong>{memory.history.length}</strong>
          </div>
          <small>
            {t('memory.current.revision')}{' '}
            {memory.revision || t('memory.not.saved')}
          </small>
        </article>
      </div>
      <div className="co-memory-body">
        <section className="co-memory-main">
          <div className="co-memory-toolbar">
            <Link className="co-button" href="/memory/import">
              {t('memory.import.a.source')}{' '}
            </Link>
            <button
              className="co-button quiet"
              onClick={() => setShowManual(!showManual)}
              type="button"
            >
              {t('memory.add.manually')}{' '}
            </button>
            <button
              className="co-button quiet"
              onClick={memory.mergeDuplicates}
              type="button"
            >
              {t('memory.merge.duplicates')}{' '}
            </button>
            <button
              className="co-button"
              disabled={memory.state === 'saving'}
              onClick={() => void memory.save()}
              type="button"
            >
              {memory.state === 'saving'
                ? t('applications.saving')
                : t('memory.save')}
            </button>
          </div>
          {showManual ? (
            <form className="co-memory-manual" onSubmit={addManual}>
              <h2>{t('memory.new.item')}</h2>
              <label>
                {t('memory.claim')} <textarea name="statement" required />
              </label>
              <label>
                Type
                <select defaultValue="experience" name="kind">
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('memory.source')} <input name="source" required />
              </label>
              <label>
                {t('memory.evidence.excerpt.optional')}{' '}
                <textarea name="evidence" />
              </label>
              <button className="co-button" type="submit">
                {t('memory.add.to.draft')}{' '}
              </button>
            </form>
          ) : null}
          <div className="co-memory-claims">
            {memory.profile.claims.length ? (
              memory.profile.claims.map((claim) => {
                const evidence = memory.profile.evidence.filter(({ id }) =>
                  claim.evidenceIds.includes(id),
                );
                const open = expanded === claim.id;
                return (
                  <article
                    className={claim.level === 'unsupported' ? 'unsourced' : ''}
                    id={`claim-${claim.id}`}
                    key={claim.id}
                  >
                    <span
                      aria-hidden="true"
                      className="material-symbols-rounded co-icon"
                    >
                      {claim.level === 'unsupported' ? 'link_off' : 'verified'}
                    </span>
                    <div>
                      <header>
                        <span
                          className={`co-badge ${claim.level === 'unsupported' ? 'crit' : claim.level === 'inferred' ? 'warn' : 'ok'}`}
                        >
                          {levelLabels[claim.level]}
                        </span>
                        <small>{kindLabels[claim.kind]}</small>
                        <code>
                          {evidence.length} {t('memory.evidence.item.s')}
                        </code>
                      </header>
                      <textarea
                        aria-label={t('memory.claim')}
                        className="co-memory-statement"
                        value={claim.statement}
                        onChange={(event) =>
                          memory.setProfile((profile) => ({
                            ...profile,
                            claims: profile.claims.map((item) =>
                              item.id === claim.id
                                ? { ...item, statement: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                      <footer>
                        <button
                          className="co-button quiet"
                          onClick={() =>
                            setExpanded(open ? undefined : claim.id)
                          }
                          type="button"
                        >
                          {open
                            ? t('memory.close.provenance')
                            : t('memory.view.and.edit.provenance')}
                        </button>
                      </footer>
                      {open ? (
                        <ClaimEditor claimId={claim.id} memory={memory} />
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <section className="co-memory-empty">
                <h2>{t('memory.your.career.memory.is.empty')}</h2>
                <p>
                  {t(
                    'memory.import.your.resume.or.add.your.first.item.nothing',
                  )}{' '}
                </p>
                <Link className="co-button" href="/memory/import">
                  {t('memory.start.with.a.source')}{' '}
                </Link>
              </section>
            )}
          </div>
        </section>
        <aside className="co-memory-side">
          <header>
            <h2>{t('memory.coverage')}</h2>
          </header>
          <div className="co-memory-prompt-list">
            {memory.coverage.items.map((item) => (
              <div className={item.present ? 'complete' : ''} key={item.kind}>
                <span
                  aria-hidden="true"
                  className="material-symbols-rounded co-icon"
                >
                  {item.present ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span>
                  {
                    {
                      experience: t('memory.experiences'),
                      project: t('memory.projects'),
                      skill: t('memory.skills'),
                      result: t('memory.results'),
                      preference: t('memory.preferences'),
                    }[item.kind]
                  }
                </span>
              </div>
            ))}
          </div>
          <footer>
            <h2>{t('memory.latest.changes')}</h2>
            <dl>
              {memory.history.slice(0, 5).map((item) => (
                <div key={item.revision}>
                  <dt>
                    {t('memory.revision')} {item.revision}
                  </dt>
                  <dd>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(item.createdAt))}
                  </dd>
                </div>
              ))}
            </dl>
          </footer>
        </aside>
      </div>
    </>
  );
}

function ClaimEditor({
  claimId,
  memory,
}: {
  claimId: string;
  memory: ReturnType<typeof useCareerMemory>;
}) {
  const claim = memory.profile.claims.find(({ id }) => id === claimId)!;
  const evidence = memory.profile.evidence.filter(({ id }) =>
    claim.evidenceIds.includes(id),
  );
  const t = useTranslations([
    memoryMessages,
    activeRoutesMessages,
    applicationsMessages,
  ]);
  const { kindLabels, levelLabels, useLabels } = claimLabels(t);
  return (
    <section className="co-memory-provenance">
      <div className="co-memory-edit-grid">
        <label>
          Type
          <select
            value={claim.kind}
            onChange={(event) =>
              updateClaim(memory, claimId, {
                kind: event.target.value as typeof claim.kind,
              })
            }
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('active-routes.status')}{' '}
          <select
            disabled={claim.level === 'verified'}
            value={claim.level}
            onChange={(event) =>
              updateClaim(memory, claimId, {
                level: event.target.value as typeof claim.level,
              })
            }
          >
            {Object.entries(levelLabels).map(([value, label]) => (
              <option disabled={value === 'verified'} key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('memory.sensitivity')}{' '}
          <select
            value={claim.sensitivity}
            onChange={(event) =>
              updateClaim(memory, claimId, {
                sensitivity: event.target.value as typeof claim.sensitivity,
              })
            }
          >
            <option value="public">{t('memory.public.2')}</option>
            <option value="private">{t('memory.private')}</option>
            <option value="restricted">{t('memory.restricted')}</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>{t('memory.allowed.uses')}</legend>
        {Object.entries(useLabels).map(([value, label]) => (
          <label key={value}>
            <input
              checked={claim.allowedUses.includes(
                value as keyof typeof useLabels,
              )}
              onChange={(event) => {
                const use = value as keyof typeof useLabels;
                const allowedUses = event.target.checked
                  ? [...claim.allowedUses, use]
                  : claim.allowedUses.filter((item) => item !== use);
                if (allowedUses.length)
                  updateClaim(memory, claimId, { allowedUses });
              }}
              type="checkbox"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {evidence.length ? (
        evidence.map((item) => {
          const source = memory.profile.sources.find(
            ({ id }) => id === item.sourceId,
          );
          return (
            <div className="co-memory-evidence" key={item.id}>
              <label>
                {t('memory.source')}{' '}
                <input
                  value={source?.title ?? ''}
                  onChange={(event) =>
                    updateSource(memory, item.sourceId, {
                      title: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                {t('memory.source.type')}{' '}
                <select
                  value={source?.kind ?? 'manual'}
                  onChange={(event) =>
                    updateSource(memory, item.sourceId, {
                      kind: event.target
                        .value as Profile['sources'][number]['kind'],
                    })
                  }
                >
                  <option value="document">Document</option>
                  <option value="linkedin">{t('memory.linkedin')}</option>
                  <option value="web">Web</option>
                  <option value="manual">{t('memory.manual.entry')}</option>
                </select>
              </label>
              <label>
                {t('applications.location.2')}{' '}
                <input
                  value={source?.locator ?? ''}
                  onChange={(event) =>
                    updateSource(memory, item.sourceId, {
                      locator: event.target.value || undefined,
                    })
                  }
                />
              </label>
              <label>
                {t('memory.source.sensitivity')}{' '}
                <select
                  value={source?.sensitivity ?? 'private'}
                  onChange={(event) =>
                    updateSource(memory, item.sourceId, {
                      sensitivity: event.target
                        .value as Profile['sources'][number]['sensitivity'],
                    })
                  }
                >
                  <option value="public">{t('memory.public.2')}</option>
                  <option value="private">{t('memory.private')}</option>
                  <option value="restricted">{t('memory.restricted')}</option>
                </select>
              </label>
              <label>
                {t('memory.locator')}{' '}
                <input
                  value={item.label}
                  onChange={(event) =>
                    updateEvidence(memory, item.id, {
                      label: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Extrait
                <textarea
                  value={item.excerpt}
                  onChange={(event) =>
                    updateEvidence(memory, item.id, {
                      excerpt: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          );
        })
      ) : (
        <div>
          <p>{t('memory.this.claim.has.no.evidence.yet.it.cannot.be')} </p>
          <button
            className="co-button quiet"
            onClick={() => addEvidence(memory, claimId)}
            type="button"
          >
            {t('memory.add.evidence')}{' '}
          </button>
        </div>
      )}
    </section>
  );
}

function updateClaim(
  memory: ReturnType<typeof useCareerMemory>,
  id: string,
  patch: Partial<Profile['claims'][number]>,
) {
  memory.setProfile((profile) => ({
    ...profile,
    claims: profile.claims.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}
function updateEvidence(
  memory: ReturnType<typeof useCareerMemory>,
  id: string,
  patch: Partial<Profile['evidence'][number]>,
) {
  memory.setProfile((profile) => ({
    ...profile,
    evidence: profile.evidence.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}
function updateSource(
  memory: ReturnType<typeof useCareerMemory>,
  id: string,
  patch: Partial<Profile['sources'][number]>,
) {
  memory.setProfile((profile) => ({
    ...profile,
    sources: profile.sources.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  }));
}

function addEvidence(
  memory: ReturnType<typeof useCareerMemory>,
  claimId: string,
) {
  const suffix = crypto.randomUUID();
  const sourceId = `source-${suffix}`;
  const evidenceId = `evidence-${suffix}`;
  memory.setProfile((profile) => ({
    ...profile,
    sources: [
      ...profile.sources,
      {
        id: sourceId,
        kind: 'manual',
        title: 'Nouvelle source',
        sensitivity: 'private',
        allowedUses: ['application'],
        trust: 'untrusted-data',
      },
    ],
    evidence: [
      ...profile.evidence,
      {
        id: evidenceId,
        sourceId,
        label: 'Localisation à préciser',
        excerpt: 'Extrait à remplacer',
      },
    ],
    claims: profile.claims.map((claim) =>
      claim.id === claimId
        ? {
            ...claim,
            level: claim.level === 'unsupported' ? 'declared' : claim.level,
            evidenceIds: [...claim.evidenceIds, evidenceId],
          }
        : claim,
    ),
  }));
  memory.setMessage(
    'Preuve ajoutée au brouillon. Corrigez sa source et son extrait avant d’enregistrer.',
  );
}

import type { Translator } from '@/lib/i18n/messages';
