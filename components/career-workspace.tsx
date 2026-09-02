'use client';

import { useEffect, useMemo, useState } from 'react';
import { syntheticProfile } from '@/lib/fixture';
import {
  agentRoles,
  buildPageSpec,
  buildStrategy,
  canPublish,
  runReviews,
  type Opportunity,
  type Strategy,
  type WorkflowEvent,
} from '@/lib/workflow';
import {
  profileSchema,
  type PageSpec,
  type Profile,
  type Review,
} from '@/lib/schemas';

type SavedState = {
  profile: Profile;
  opportunity: Opportunity;
  strategy?: Strategy;
  spec?: PageSpec;
  reviews: Review[];
  approved: boolean;
  capability?: string;
  events: WorkflowEvent[];
  paused: boolean;
};

const initialOpportunity: Opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description:
    'Build dependable customer-facing workflows with a small product team.',
  accent: '#21504b',
};

export function CareerWorkspace() {
  const [state, setState] = useState<SavedState>({
    profile: syntheticProfile,
    opportunity: initialOpportunity,
    reviews: [],
    approved: false,
    events: [],
    paused: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState({
    source: '',
    claim: '',
    evidence: '',
    level: 'declared' as 'verified' | 'declared' | 'inferred',
  });
  const [memoryError, setMemoryError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('career-os-demo');
    queueMicrotask(() => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as SavedState;
          setState({
            ...parsed,
            events: parsed.events ?? [],
            paused: parsed.paused ?? false,
          });
        } catch {
          localStorage.removeItem('career-os-demo');
        }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem('career-os-demo', JSON.stringify(state));
  }, [loaded, state]);

  const claims = useMemo(
    () => new Map(state.profile.claims.map((claim) => [claim.id, claim])),
    [state.profile.claims],
  );

  function generate() {
    const strategy = buildStrategy(state.profile, state.opportunity);
    const spec = buildPageSpec(state.profile, state.opportunity, strategy);
    setState((current) => ({
      ...current,
      strategy,
      spec,
      reviews: [],
      approved: false,
      capability: undefined,
      events: [
        {
          actor: 'system',
          action: current.opportunity.url
            ? 'Blocked URL extraction; using pasted text.'
            : 'Accepted pasted offer text.',
          artifact: 'offer-v1',
          costMicros: 0,
        },
        {
          actor: 'company-researcher',
          action: 'Produced bounded company context from the offer only.',
          artifact: 'research-v1',
          costMicros: 0,
        },
        {
          actor: 'recruiter-strategist',
          action: `Selected ${strategy.selectedClaimIds.length} eligible claims.`,
          artifact: 'strategy-v1',
          costMicros: 0,
        },
        {
          actor: 'page-composer',
          action: 'Produced schema-valid PageSpec.',
          artifact: 'page-spec-v1',
          costMicros: 0,
        },
      ],
    }));
  }

  function review() {
    if (!state.spec) return;
    const reviews = runReviews(state.profile, state.spec);
    setState((current) => ({
      ...current,
      reviews,
      approved: false,
      events: [
        ...current.events,
        ...reviews.map((result) => ({
          actor:
            result.reviewer === 'factuality'
              ? ('fact-checker' as const)
              : result.reviewer,
          action: result.passed
            ? 'Passed observable review.'
            : `Opened ${result.findings.length} structured issue(s).`,
          artifact: `${result.reviewer}-review-v1`,
          costMicros: 0,
        })),
      ],
    }));
  }

  function publish() {
    if (!canPublish(state.approved, state.reviews)) return;
    const next = {
      ...state,
      capability: crypto.randomUUID().replaceAll('-', ''),
    };
    localStorage.setItem('career-os-demo', JSON.stringify(next));
    setState(next);
  }

  function addMemory() {
    if (
      !memoryDraft.source.trim() ||
      !memoryDraft.claim.trim() ||
      (memoryDraft.level === 'verified' && !memoryDraft.evidence.trim())
    ) {
      setMemoryError(
        'Source and claim are required; verified claims also require proof.',
      );
      return;
    }
    const suffix = crypto.randomUUID();
    const evidenceId = `evidence-${suffix}`;
    const profile = profileSchema.parse({
      ...state.profile,
      sources: [
        ...state.profile.sources,
        {
          id: `source-${suffix}`,
          kind: 'manual',
          title: memoryDraft.source.trim(),
          sensitivity: 'private',
          allowedUses: ['application'],
          trust: 'untrusted-data',
        },
      ],
      evidence: memoryDraft.evidence.trim()
        ? [
            ...state.profile.evidence,
            {
              id: evidenceId,
              sourceId: `source-${suffix}`,
              label: 'User-provided evidence',
              excerpt: memoryDraft.evidence.trim(),
            },
          ]
        : state.profile.evidence,
      claims: [
        ...state.profile.claims,
        {
          id: `claim-${suffix}`,
          statement: memoryDraft.claim.trim(),
          level: memoryDraft.level,
          evidenceIds: memoryDraft.evidence.trim() ? [evidenceId] : [],
          sensitivity: 'private',
          allowedUses: ['application'],
        },
      ],
    });
    setState({
      ...state,
      profile,
      strategy: undefined,
      spec: undefined,
      reviews: [],
      approved: false,
      capability: undefined,
      events: [],
    });
    setMemoryDraft({ source: '', claim: '', evidence: '', level: 'declared' });
    setMemoryError('');
  }

  return (
    <main>
      <header className="masthead">
        <a className="wordmark" href="#workspace">
          Career OS <span>0.1</span>
        </a>
        <p>Open source · local-first demo</p>
      </header>

      <section className="intro">
        <p className="eyebrow">Career memory → private application</p>
        <h1>
          Turn your real work into <em>evidence-backed applications.</em>
        </h1>
        <p>
          Structure the source, mark what is known, and publish only after human
          approval.
        </p>
      </section>

      <section
        id="workspace"
        className="workspace"
        aria-label="Career application workspace"
      >
        <aside>
          <p className="step">01 / Career memory</p>
          <label>
            Name
            <input
              value={state.profile.name}
              onChange={(event) =>
                setState({
                  ...state,
                  profile: { ...state.profile, name: event.target.value },
                })
              }
            />
          </label>
          <label>
            Headline
            <input
              value={state.profile.headline}
              onChange={(event) =>
                setState({
                  ...state,
                  profile: { ...state.profile, headline: event.target.value },
                })
              }
            />
          </label>
          <div className="memory-counts">
            <span>{state.profile.sources.length} source</span>
            <span>{state.profile.claims.length} claims</span>
            <span>{state.profile.evidence.length} proof</span>
          </div>
          <details>
            <summary>Add source, claim & proof</summary>
            <label>
              Source title
              <input
                value={memoryDraft.source}
                onChange={(event) =>
                  setMemoryDraft({ ...memoryDraft, source: event.target.value })
                }
              />
            </label>
            <label>
              Claim
              <textarea
                rows={3}
                value={memoryDraft.claim}
                onChange={(event) =>
                  setMemoryDraft({ ...memoryDraft, claim: event.target.value })
                }
              />
            </label>
            <label>
              Status
              <select
                value={memoryDraft.level}
                onChange={(event) =>
                  setMemoryDraft({
                    ...memoryDraft,
                    level: event.target.value as typeof memoryDraft.level,
                  })
                }
              >
                <option value="declared">Declared</option>
                <option value="inferred">Inferred</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label>
              Proof excerpt
              <textarea
                rows={3}
                value={memoryDraft.evidence}
                onChange={(event) =>
                  setMemoryDraft({
                    ...memoryDraft,
                    evidence: event.target.value,
                  })
                }
              />
            </label>
            {memoryError && (
              <p className="notice" role="alert">
                {memoryError}
              </p>
            )}
            <button onClick={addMemory}>Save to Career Memory</button>
          </details>
          <details>
            <summary>Inspect provenance</summary>
            {state.profile.claims.map((claim) => (
              <article className="claim" key={claim.id}>
                <span className={`level ${claim.level}`}>{claim.level}</span>
                <label>
                  Claim text
                  <textarea
                    rows={3}
                    value={claim.statement}
                    onChange={(event) =>
                      setState({
                        ...state,
                        profile: {
                          ...state.profile,
                          claims: state.profile.claims.map((item) =>
                            item.id === claim.id
                              ? { ...item, statement: event.target.value }
                              : item,
                          ),
                        },
                        spec: undefined,
                        reviews: [],
                        approved: false,
                        capability: undefined,
                      })
                    }
                  />
                </label>
                <small>
                  {claim.evidenceIds.length
                    ? `${claim.evidenceIds.length} linked proof`
                    : 'Explicitly unverified'}
                </small>
              </article>
            ))}
          </details>
          <button
            className="quiet"
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], {
                type: 'application/json',
              });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = 'career-os-export.json';
              link.click();
              URL.revokeObjectURL(link.href);
            }}
          >
            Export all data
          </button>
        </aside>

        <div className="flow">
          <section className="panel">
            <p className="step">02 / Opportunity</p>
            <div className="field-grid">
              <label>
                Company
                <input
                  value={state.opportunity.company}
                  onChange={(event) =>
                    setState({
                      ...state,
                      opportunity: {
                        ...state.opportunity,
                        company: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Role
                <input
                  value={state.opportunity.role}
                  onChange={(event) =>
                    setState({
                      ...state,
                      opportunity: {
                        ...state.opportunity,
                        role: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <label>
              Job description
              <textarea
                rows={4}
                value={state.opportunity.description}
                onChange={(event) =>
                  setState({
                    ...state,
                    opportunity: {
                      ...state.opportunity,
                      description: event.target.value,
                    },
                  })
                }
              />
            </label>
            <div className="field-grid compact">
              <label>
                Job URL <span>(optional)</span>
                <input
                  type="url"
                  placeholder="Extraction not connected yet"
                  value={state.opportunity.url ?? ''}
                  onChange={(event) =>
                    setState({
                      ...state,
                      opportunity: {
                        ...state.opportunity,
                        url: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Brand accent
                <input
                  type="color"
                  value={state.opportunity.accent}
                  onChange={(event) =>
                    setState({
                      ...state,
                      opportunity: {
                        ...state.opportunity,
                        accent: event.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            {state.opportunity.url && (
              <p className="notice">
                URL saved as untrusted input. Paste the job text until
                extraction is connected.
              </p>
            )}
            <button disabled={state.paused} onClick={generate}>
              {state.spec
                ? 'Replay strategy & PageSpec'
                : 'Build strategy & PageSpec'}
            </button>
          </section>

          {state.spec && (
            <section
              className="preview"
              style={
                { '--accent': state.spec.company.accent } as React.CSSProperties
              }
            >
              <p className="step">03 / Deterministic preview</p>
              <div className="application-head">
                <span>{state.spec.company.name}</span>
                <small>{state.spec.company.role}</small>
              </div>
              <p className="eyebrow">{state.spec.hero.eyebrow}</p>
              <h2>{state.spec.hero.title}</h2>
              <p className="thesis">{state.spec.hero.thesis}</p>
              {state.spec.blocks.map((block, index) => (
                <article className="proof-block" key={`${block.type}-${index}`}>
                  <span>0{index + 1}</span>
                  <div>
                    <h3>{block.title}</h3>
                    {'claimIds' in block ? (
                      block.claimIds.map((id) => {
                        const claim = claims.get(id);
                        return claim ? (
                          <p key={id}>
                            {claim.statement}{' '}
                            <small className={`level ${claim.level}`}>
                              {claim.level}
                            </small>
                          </p>
                        ) : null;
                      })
                    ) : (
                      <p>{block.text}</p>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}

          {state.spec && (
            <section className="panel ledger">
              <div className="ledger-head">
                <p className="step">Agent run ledger · deterministic runtime</p>
                <button
                  className="quiet"
                  onClick={() => setState({ ...state, paused: !state.paused })}
                >
                  {state.paused ? 'Resume' : 'Interrupt'}
                </button>
              </div>
              <p className="notice">
                No model was called in this slice. Metered cost: €0.00. The same
                ledger is reserved for server-enforced token, cost, latency and
                cache records.
              </p>
              <ol>
                {state.events.map((event, index) => (
                  <li key={`${event.actor}-${index}`}>
                    <span>{event.actor}</span>
                    <p>{event.action}</p>
                    <code>
                      {event.artifact ?? 'no artifact'} · €
                      {(event.costMicros / 1_000_000).toFixed(2)}
                    </code>
                  </li>
                ))}
              </ol>
              <details>
                <summary>Inspect the six bounded role contracts</summary>
                <div className="role-grid">
                  {agentRoles.map((role) => (
                    <article key={role.name}>
                      <strong>{role.name}</strong>
                      <p>
                        {role.input} → {role.output}
                      </p>
                      <small>{role.authority}</small>
                    </article>
                  ))}
                </div>
              </details>
            </section>
          )}

          {state.spec && (
            <section className="panel review-panel">
              <p className="step">04 / Review & approval</p>
              <button disabled={state.paused} onClick={review}>
                Run 3 observable reviews
              </button>
              {state.reviews.length > 0 && (
                <div className="reviews">
                  {state.reviews.map((review) => (
                    <article key={review.reviewer}>
                      <strong>{review.reviewer}</strong>
                      <span>{review.passed ? 'pass' : 'revise'}</span>
                      {review.findings.map((finding) => (
                        <p key={finding}>{finding}</p>
                      ))}
                    </article>
                  ))}
                </div>
              )}
              <label className="approval">
                <input
                  type="checkbox"
                  checked={state.approved}
                  disabled={
                    !state.reviews.every((review) => review.passed) ||
                    state.reviews.length !== 3
                  }
                  onChange={(event) =>
                    setState({ ...state, approved: event.target.checked })
                  }
                />{' '}
                I reviewed the claims and approve this private publication.
              </label>
              <button
                disabled={
                  state.paused || !canPublish(state.approved, state.reviews)
                }
                onClick={publish}
              >
                Publish private capability
              </button>
              {state.capability && (
                <div className="capability" role="status">
                  <strong>Private demo link issued</strong>
                  <code>/p/{state.capability}</code>
                  <a href={`/p/${state.capability}`}>Open private demo</a>
                  <p>
                    No cross-navigation. Revoke by resetting this workspace.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </section>

      <footer>
        <span>All visible candidate content is synthetic.</span>
        <button
          className="quiet"
          onClick={() => {
            localStorage.removeItem('career-os-demo');
            location.reload();
          }}
        >
          Reset demo
        </button>
      </footer>
    </main>
  );
}
