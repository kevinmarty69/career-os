'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  pageSpecSchema,
  profileSchema,
  type PageSpec,
  type Profile,
} from '@/lib/schemas';

type Publication = { capability?: string; spec?: PageSpec; profile: Profile };

export function PrivatePublication() {
  const { capability } = useParams<{ capability: string }>();
  const [publication, setPublication] = useState<Publication | null>();

  useEffect(() => {
    const saved = localStorage.getItem('career-os-demo');
    queueMicrotask(() => {
      try {
        const parsed = saved ? (JSON.parse(saved) as Publication) : null;
        const spec = pageSpecSchema.safeParse(parsed?.spec);
        const profile = profileSchema.safeParse(parsed?.profile);
        setPublication(
          parsed?.capability === capability && spec.success && profile.success
            ? { ...parsed, spec: spec.data, profile: profile.data }
            : null,
        );
      } catch {
        setPublication(null);
      }
    });
  }, [capability]);

  if (publication === undefined)
    return <main className="private-error">Checking private capability…</main>;
  if (!publication?.spec)
    return (
      <main className="private-error">
        <h1>Private application unavailable.</h1>
        <p>The capability is invalid or revoked.</p>
      </main>
    );

  const { spec, profile } = publication;
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));

  return (
    <main
      className="private-page"
      style={{ '--accent': spec.company.accent } as React.CSSProperties}
    >
      <header>
        <strong>{spec.company.name}</strong>
        <span>Private application · no cross-navigation</span>
      </header>
      <section>
        <p className="eyebrow">{spec.hero.eyebrow}</p>
        <h1>{spec.hero.title}</h1>
        <p className="thesis">{spec.hero.thesis}</p>
      </section>
      {spec.blocks.map((block, index) => (
        <section className="proof-block" key={`${block.type}-${index}`}>
          <span>0{index + 1}</span>
          <div>
            <h2>{block.title}</h2>
            {'claimIds' in block ? (
              block.claimIds.map((id) => {
                const claim = claims.get(id);
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
        Generated from synthetic demo data · revoke from the originating
        workspace
      </footer>
    </main>
  );
}
