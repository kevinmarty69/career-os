'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { memoryMessages } from '@/lib/i18n/dictionaries/memory';
import type { Profile } from '@/lib/schemas';
import { useCareerMemory } from './use-career-memory';

const kindLabels: Record<Profile['claims'][number]['kind'], string> = {
  summary: 'Synthèse',
  experience: 'Expérience',
  project: 'Projet',
  skill: 'Compétence',
  education: 'Formation',
  result: 'Résultat',
  preference: 'Préférence',
  other: 'Autre',
};
const levelLabels: Record<Profile['claims'][number]['level'], string> = {
  verified: 'Vérifié',
  declared: 'Déclaré',
  inferred: 'Inféré',
  unsupported: 'Sans preuve',
};
const useLabels = {
  application: 'Candidature',
  resume: 'CV',
  linkedin: 'LinkedIn',
  interview: 'Entretien',
} as const;

export function CareerMemoryContent() {
  const { locale } = useI18n();
  const localize = useLocalizer([memoryMessages]);
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
      memory.setMessage('Une affirmation et sa source sont nécessaires.');
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
              label: 'Extrait ajouté manuellement',
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
    memory.setMessage(
      'Élément ajouté au brouillon. Enregistrez pour le conserver.',
    );
    event.currentTarget.reset();
  }

  if (memory.state === 'loading')
    return localize(
      <p className="co-memory-status" role="status">
        Chargement de la mémoire…
      </p>,
    );

  return localize(
    <>
      {memory.message ? (
        <p className="co-memory-status" role="status">
          {memory.message}
        </p>
      ) : null}
      <div className="co-memory-identity">
        <label>
          Nom
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
          Positionnement
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
            <h2>Liens partagés sur les pages privées</h2>
            <p>
              Seuls les liens renseignés ici seront visibles par les
              destinataires de vos candidatures.
            </p>
          </div>
          <span>Partage explicite</span>
        </header>
        <div>
          <label>
            Email
            <input
              inputMode="email"
              onChange={(event) => setPublicLink('email', event.target.value)}
              placeholder="alex@example.com"
              type="email"
              value={memory.profile.publicLinks?.email ?? ''}
            />
          </label>
          <label>
            CV
            <input
              inputMode="url"
              onChange={(event) => setPublicLink('resume', event.target.value)}
              placeholder="https://…"
              type="url"
              value={memory.profile.publicLinks?.resume ?? ''}
            />
          </label>
          <label>
            LinkedIn
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
            GitHub
            <input
              inputMode="url"
              onChange={(event) => setPublicLink('github', event.target.value)}
              placeholder="https://github.com/…"
              type="url"
              value={memory.profile.publicLinks?.github ?? ''}
            />
          </label>
          <label>
            Portfolio
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
          <span>Couverture expliquée</span>
          <div>
            <strong>
              {memory.coverage.presentCount}/{memory.coverage.totalCount}
            </strong>
          </div>
          <small>catégories documentées, sans score artificiel</small>
        </article>
        <article>
          <span>Affirmations</span>
          <div>
            <strong>{memory.profile.claims.length}</strong>
          </div>
          <small>{memory.profile.sources.length} source(s) reliée(s)</small>
        </article>
        <article>
          <span>Non publiables</span>
          <div>
            <strong className={unsupported ? 'crit' : ''}>{unsupported}</strong>
          </div>
          <small>inférées ou encore sans preuve</small>
        </article>
        <article>
          <span>Historique</span>
          <div>
            <strong>{memory.history.length}</strong>
          </div>
          <small>
            révision actuelle : {memory.revision || 'non enregistrée'}
          </small>
        </article>
      </div>
      <div className="co-memory-body">
        <section className="co-memory-main">
          <div className="co-memory-toolbar">
            <Link className="co-button" href="/memory/import">
              Importer une source
            </Link>
            <button
              className="co-button quiet"
              onClick={() => setShowManual(!showManual)}
              type="button"
            >
              Ajouter manuellement
            </button>
            <button
              className="co-button quiet"
              onClick={memory.mergeDuplicates}
              type="button"
            >
              Fusionner les doublons
            </button>
            <button
              className="co-button"
              disabled={memory.state === 'saving'}
              onClick={() => void memory.save()}
              type="button"
            >
              {memory.state === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          {showManual ? (
            <form className="co-memory-manual" onSubmit={addManual}>
              <h2>Nouvel élément</h2>
              <label>
                Affirmation
                <textarea name="statement" required />
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
                Source
                <input name="source" required />
              </label>
              <label>
                Extrait de preuve (facultatif)
                <textarea name="evidence" />
              </label>
              <button className="co-button" type="submit">
                Ajouter au brouillon
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
                        <code>{evidence.length} preuve(s)</code>
                      </header>
                      <textarea
                        aria-label="Affirmation"
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
                            ? 'Fermer la provenance'
                            : 'Voir et corriger la provenance'}
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
                <h2>Votre mémoire est vide</h2>
                <p>
                  Importez votre CV ou ajoutez une première information. Rien ne
                  sera publié automatiquement.
                </p>
                <Link className="co-button" href="/memory/import">
                  Commencer par une source
                </Link>
              </section>
            )}
          </div>
        </section>
        <aside className="co-memory-side">
          <header>
            <h2>Couverture</h2>
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
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <footer>
            <h2>Dernières corrections</h2>
            <dl>
              {memory.history.slice(0, 5).map((item) => (
                <div key={item.revision}>
                  <dt>Révision {item.revision}</dt>
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
    </>,
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
  const localize = useLocalizer([memoryMessages]);
  return localize(
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
          Statut
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
          Sensibilité
          <select
            value={claim.sensitivity}
            onChange={(event) =>
              updateClaim(memory, claimId, {
                sensitivity: event.target.value as typeof claim.sensitivity,
              })
            }
          >
            <option value="public">Public</option>
            <option value="private">Privé</option>
            <option value="restricted">Restreint</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Usages autorisés</legend>
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
                Source
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
                Type de source
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
                  <option value="linkedin">LinkedIn</option>
                  <option value="web">Web</option>
                  <option value="manual">Saisie manuelle</option>
                </select>
              </label>
              <label>
                Localisation
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
                Sensibilité de la source
                <select
                  value={source?.sensitivity ?? 'private'}
                  onChange={(event) =>
                    updateSource(memory, item.sourceId, {
                      sensitivity: event.target
                        .value as Profile['sources'][number]['sensitivity'],
                    })
                  }
                >
                  <option value="public">Public</option>
                  <option value="private">Privé</option>
                  <option value="restricted">Restreint</option>
                </select>
              </label>
              <label>
                Repère
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
          <p>
            Cette affirmation n’a pas encore de preuve. Elle ne peut pas être
            publiée.
          </p>
          <button
            className="co-button quiet"
            onClick={() => addEvidence(memory, claimId)}
            type="button"
          >
            Ajouter une preuve
          </button>
        </div>
      )}
    </section>,
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
