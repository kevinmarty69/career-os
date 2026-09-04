'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  pageSpecSchema,
  profileSchema,
  type PageSpec,
  type Profile,
} from '@/lib/schemas';

type Publication = { spec: PageSpec; profile: Profile };

export function PrivatePublication() {
  const { capability } = useParams<{ capability: string }>();
  const [publication, setPublication] = useState<Publication | null>();

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
            ? { spec: spec.data, profile: profile.data }
            : null,
        );
      } catch {
        if (currentRequest === request) setPublication(null);
      }
    }

    void load();
    window.addEventListener('hashchange', load);
    return () => {
      request += 1;
      window.removeEventListener('hashchange', load);
    };
  }, [capability]);

  if (publication === undefined)
    return (
      <main className="co-public-state" aria-busy="true">
        <span className="co-public-mark" aria-hidden="true">
          <i />
        </span>
        <p role="status">Vérification du lien privé…</p>
      </main>
    );
  if (!publication?.spec)
    return (
      <main className="co-public-state">
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
      </main>
    );

  const { spec, profile } = publication;
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));

  return (
    <main
      className="co-public-page"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <header>
        <span>
          <strong>{profile.name}</strong>
          <small>→ {spec.company.name}</small>
        </span>
        <span>
          <span className="material-symbols-rounded" aria-hidden="true">
            lock
          </span>
          Lien privé · non indexable
        </span>
      </header>
      <section className="co-public-hero">
        <p>
          Candidature · {spec.company.role} · {spec.company.name}
        </p>
        <h1>{spec.hero.title}</h1>
        <p>{spec.hero.thesis}</p>
        <a href="#strongest-evidence">Voir les preuves principales</a>
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
                  block.claimIds.map((id) => {
                    const claim = claims.get(id);
                    const evidence = claim?.evidenceIds
                      .map((evidenceId) =>
                        profile.evidence.find((item) => item.id === evidenceId),
                      )
                      .filter(Boolean);
                    return claim ? (
                      <details key={id}>
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
                            ? ` · ${claim.evidenceIds.length} preuve${claim.evidenceIds.length > 1 ? 's' : ''} rattachée${claim.evidenceIds.length > 1 ? 's' : ''}`
                            : ' · aucune preuve indépendante rattachée'}
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
          <h3>Documents</h3>
          <a href="#strongest-evidence">
            <span className="material-symbols-rounded" aria-hidden="true">
              description
            </span>
            Preuves inspectables
          </a>
          <a href={`mailto:?subject=${encodeURIComponent(spec.company.role)}`}>
            Proposer un échange
            <span className="material-symbols-rounded" aria-hidden="true">
              north_east
            </span>
          </a>
        </aside>
      </div>
      <footer>
        Page privée générée avec Career OS. Contenu validé par le candidat.
      </footer>
    </main>
  );
}
