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
    async function load() {
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
        setPublication(
          spec.success && profile.success
            ? { spec: spec.data, profile: profile.data }
            : null,
        );
      } catch {
        setPublication(null);
      }
    }
    void load();
  }, [capability]);

  if (publication === undefined)
    return <main className="private-error">Checking private link…</main>;
  if (!publication?.spec)
    return (
      <main className="private-error">
        <h1>Private application unavailable.</h1>
        <p>The private link is invalid, expired, or revoked.</p>
      </main>
    );

  const { spec, profile } = publication;
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));

  return (
    <main
      className="private-page"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <header>
        <strong>{spec.company.name}</strong>
        <span>{spec.company.role} · Private application</span>
      </header>
      <section className="memo-hero">
        <p className="section-label">Prepared for {spec.company.name}</p>
        <h1>{spec.hero.title}</h1>
        <p className="recipient-line">
          {profile.name} · {spec.company.role}
        </p>
        <p className="thesis">{spec.hero.thesis}</p>
        <div className="memo-meta">
          <span>Why sent: a concise, evidence-backed fit assessment</span>
          <span>3 min read</span>
        </div>
        <a className="memo-action" href="#strongest-evidence">
          View Strongest Evidence
        </a>
      </section>
      {spec.blocks.map((block, index) => (
        <section
          className="proof-block"
          id={index === 0 ? 'strongest-evidence' : undefined}
          key={`${block.type}-${index}`}
        >
          <span>0{index + 1}</span>
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
                      <span className={`level ${claim.level}`}>
                        {claim.level}
                      </span>{' '}
                      ·{' '}
                      {claim.evidenceIds.length
                        ? `${claim.evidenceIds.length} linked proof`
                        : 'No independent proof attached.'}
                    </p>
                    {evidence?.map((item) => {
                      const source = profile.sources.find(
                        (candidate) => candidate.id === item!.sourceId,
                      );
                      return (
                        <p key={item!.id}>
                          <strong>{source?.title}</strong>: “{item!.excerpt}”
                        </p>
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
      <footer>
        Synthetic demonstration data · Access can be revoked by the sender
      </footer>
    </main>
  );
}
