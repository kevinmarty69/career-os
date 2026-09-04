'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  LocaleSwitch,
  useI18n,
  useLocalizer,
} from '@/components/i18n/i18n-provider';
import { publicationMessages } from '@/lib/i18n/dictionaries/publication';
import {
  pageSpecSchema,
  profileSchema,
  type PageSpec,
  type Profile,
} from '@/lib/schemas';

type Publication = {
  spec: PageSpec;
  profile: Profile;
  brand?: { logoUrl?: string };
};

export function PrivatePublication() {
  const { capability } = useParams<{ capability: string }>();
  const { locale } = useI18n();
  const localize = useLocalizer([publicationMessages]);
  const [publication, setPublication] = useState<Publication | null>();
  const recorded = useRef(new Set<string>());
  const record = useCallback(
    (type: 'open' | 'section' | 'action' | 'download', key?: string) => {
      const signature = `${type}:${key ?? ''}`;
      if (recorded.current.has(signature)) return;
      recorded.current.add(signature);
      void fetch(`/api/publications/${capability}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, ...(key ? { key } : {}) }),
        keepalive: true,
      }).catch(() => undefined);
    },
    [capability],
  );

  useEffect(() => {
    let request = 0;

    async function load() {
      const currentRequest = ++request;
      setPublication(undefined);
      try {
        const token = location.hash.slice(1);
        if (token) {
          const exchange = await fetch(
            `/api/publications/${capability}/exchange`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token }),
            },
          );
          history.replaceState(null, '', location.pathname);
          if (!exchange.ok) throw new Error('Invalid capability.');
        }
        const response = await fetch(`/api/publications/${capability}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Private publication unavailable.');
        const parsed = (await response.json()) as Publication;
        const spec = pageSpecSchema.safeParse(parsed?.spec);
        const profile = profileSchema.safeParse(parsed?.profile);
        if (currentRequest !== request) return;
        setPublication(
          spec.success && profile.success
            ? {
                spec: spec.data,
                profile: profile.data,
                ...(parsed.brand?.logoUrl
                  ? { brand: { logoUrl: parsed.brand.logoUrl } }
                  : {}),
              }
            : null,
        );
        if (spec.success && profile.success) record('open');
      } catch {
        if (currentRequest === request) setPublication(null);
      }
    }

    void load();
    return () => {
      request += 1;
    };
  }, [capability, record]);

  if (publication === undefined)
    return localize(
      <main className="co-public-state" aria-busy="true">
        <div className="co-public-language">
          <LocaleSwitch compact />
        </div>
        <span className="co-public-mark" aria-hidden="true">
          <i />
        </span>
        <p role="status">Vérification du lien privé…</p>
      </main>,
    );
  if (!publication?.spec)
    return localize(
      <main className="co-public-state">
        <div className="co-public-language">
          <LocaleSwitch compact />
        </div>
        <span className="co-public-mark" aria-hidden="true">
          <i />
        </span>
        <p>Page privée</p>
        <span className="material-symbols-rounded" aria-hidden="true">
          link_off
        </span>
        <h1>Ce lien n’est plus actif.</h1>
        <strong>
          Le candidat a révoqué l’accès ou la date d’expiration est passée.
        </strong>
        <small>Aucune information n’est conservée sur cette page.</small>
        <a href="mailto:?subject=Demande%20de%20nouvel%20accès">
          Demander un nouvel accès
        </a>
        <footer>Career OS · les pages privées ne sont jamais indexées</footer>
      </main>,
    );

  const { spec, profile } = publication;
  const logoUrl = publication.brand?.logoUrl ?? spec.company.logoUrl;
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  const publicLinks = profile.publicLinks ?? {};

  return localize(
    <main
      className="co-public-page"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <header>
        <span>
          {logoUrl ? (
            // Published company logos may come from any validated HTTPS host.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${spec.company.name} logo`}
              className="co-public-company-logo"
              src={logoUrl}
            />
          ) : (
            <i aria-hidden="true">
              {spec.company.name.slice(0, 2).toUpperCase()}
            </i>
          )}
          <span>
            <strong>{profile.name}</strong>
            <small>→ {spec.company.name}</small>
          </span>
        </span>
        <div className="co-public-actions">
          <span>
            <span className="material-symbols-rounded" aria-hidden="true">
              lock
            </span>
            Lien privé · non indexable
          </span>
          <LocaleSwitch compact />
        </div>
      </header>
      <section className="co-public-hero">
        <p>
          {spec.hero.eyebrow} · {spec.company.role} · {spec.company.name}
        </p>
        <span className="co-public-independent">
          Candidature indépendante préparée et validée par {profile.name}
        </span>
        <h1>{spec.hero.title}</h1>
        <p>{spec.hero.thesis}</p>
        <a
          href="#strongest-evidence"
          onClick={() => record('action', 'strongest-evidence')}
        >
          Voir les preuves principales
        </a>
      </section>
      <div className="co-public-body">
        <article>
          {spec.blocks.map((block, index) => (
            <section
              className="co-public-block"
              id={index === 0 ? 'strongest-evidence' : undefined}
              key={`${block.type}-${index}`}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h2>{block.title}</h2>
                {'claimIds' in block ? (
                  block.claimIds.map((id, claimIndex) => {
                    const claim = claims.get(id);
                    const evidence = claim?.evidenceIds
                      .map((evidenceId) =>
                        profile.evidence.find((item) => item.id === evidenceId),
                      )
                      .filter(Boolean);
                    return claim ? (
                      <details
                        key={id}
                        onToggle={(event) => {
                          if (event.currentTarget.open)
                            record(
                              'section',
                              `evidence:${index}:${claimIndex}`,
                            );
                        }}
                      >
                        <summary>{claim.statement}</summary>
                        <p>
                          <span className={`co-public-level ${claim.level}`}>
                            {claim.level === 'verified'
                              ? 'Sourcé'
                              : claim.level === 'declared'
                                ? 'Déclaré'
                                : 'Sans source'}
                          </span>
                          {claim.evidenceIds.length
                            ? locale === 'fr'
                              ? ` · ${claim.evidenceIds.length} preuve${claim.evidenceIds.length > 1 ? 's' : ''} rattachée${claim.evidenceIds.length > 1 ? 's' : ''}`
                              : ` · ${claim.evidenceIds.length} evidence item${claim.evidenceIds.length > 1 ? 's' : ''} attached`
                            : locale === 'fr'
                              ? ' · aucune preuve indépendante rattachée'
                              : ' · no independent evidence attached'}
                        </p>
                        {evidence?.map((item) => {
                          const source = profile.sources.find(
                            (candidate) => candidate.id === item!.sourceId,
                          );
                          return (
                            <blockquote key={item!.id}>
                              <strong>{source?.title}</strong>
                              <span>« {item!.excerpt} »</span>
                              <small>
                                Extrait partagé volontairement par le candidat.
                                Le document complet n’est pas accessible.
                              </small>
                            </blockquote>
                          );
                        })}
                      </details>
                    ) : null;
                  })
                ) : (
                  <p>{block.text}</p>
                )}
              </div>
            </section>
          ))}
        </article>
        <aside>
          <span aria-hidden="true">
            {profile.name.slice(0, 2).toUpperCase()}
          </span>
          <h2>{profile.name}</h2>
          <p>{profile.headline}</p>
          <h3>Liens du candidat</h3>
          <a
            href="#strongest-evidence"
            onClick={() => record('action', 'inspectable-evidence')}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              description
            </span>
            Preuves inspectables
          </a>
          {publicLinks.resume ? (
            <a
              href={publicLinks.resume}
              onClick={() => record('download', 'resume')}
              rel="noreferrer noopener"
              target="_blank"
            >
              CV
              <span className="material-symbols-rounded" aria-hidden="true">
                north_east
              </span>
            </a>
          ) : null}
          {publicLinks.linkedin ? (
            <a
              href={publicLinks.linkedin}
              onClick={() => record('action', 'linkedin')}
              rel="noreferrer noopener"
              target="_blank"
            >
              LinkedIn
              <span className="material-symbols-rounded" aria-hidden="true">
                north_east
              </span>
            </a>
          ) : null}
          {publicLinks.github ? (
            <a
              href={publicLinks.github}
              onClick={() => record('action', 'github')}
              rel="noreferrer noopener"
              target="_blank"
            >
              GitHub
              <span className="material-symbols-rounded" aria-hidden="true">
                north_east
              </span>
            </a>
          ) : null}
          {publicLinks.portfolio ? (
            <a
              href={publicLinks.portfolio}
              onClick={() => record('action', 'portfolio')}
              rel="noreferrer noopener"
              target="_blank"
            >
              Portfolio
              <span className="material-symbols-rounded" aria-hidden="true">
                north_east
              </span>
            </a>
          ) : null}
          {publicLinks.email ? (
            <a
              href={`mailto:${publicLinks.email}?subject=${encodeURIComponent(spec.company.role)}`}
              onClick={() => record('action', 'contact')}
            >
              Proposer un échange
              <span className="material-symbols-rounded" aria-hidden="true">
                north_east
              </span>
            </a>
          ) : null}
        </aside>
      </div>
      <footer>
        Page privée générée avec Career OS. Contenu validé par le candidat.
      </footer>
    </main>,
  );
}
