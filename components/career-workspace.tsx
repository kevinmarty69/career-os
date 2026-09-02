'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { latestPageSpec, runAgentTeam } from '@/lib/agent-runtime';
import { syntheticProfile } from '@/lib/fixture';
import {
  agentRoles,
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
type PrimaryView = 'applications' | 'memory' | 'activity' | 'settings';
type DossierView = 'brief' | 'draft' | 'review' | 'share';

const initialOpportunity: Opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description:
    'Build dependable customer-facing workflows with a small product team.',
  accent: '#21504b',
};
const primaryViews: Array<[PrimaryView, string]> = [
  ['applications', 'Applications'],
  ['memory', 'Career Memory'],
  ['activity', 'Activity'],
  ['settings', 'Settings'],
];
const dossierViews: Array<[DossierView, string]> = [
  ['brief', 'Brief'],
  ['draft', 'Draft'],
  ['review', 'Review'],
  ['share', 'Share'],
];

export function CareerWorkspace() {
  const session = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization();
  const [state, setState] = useState<SavedState>({
    profile: syntheticProfile,
    opportunity: initialOpportunity,
    reviews: [],
    approved: false,
    events: [],
    paused: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [primaryView, setPrimaryView] = useState<PrimaryView>('applications');
  const [dossierView, setDossierView] = useState<DossierView>('brief');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [memoryError, setMemoryError] = useState('');
  const [memoryDraft, setMemoryDraft] = useState({
    source: '',
    claim: '',
    evidence: '',
    level: 'declared' as 'verified' | 'declared' | 'inferred',
  });
  const publishedInput = useRef('');

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

  useEffect(() => {
    const publicationId = state.capability;
    if (
      publicationId &&
      publishedInput.current &&
      publishedInput.current !==
        JSON.stringify([state.profile, state.opportunity])
    ) {
      void fetch(`/api/publications/${publicationId}`, {
        method: 'DELETE',
      }).then((response) => {
        if (response.ok) {
          publishedInput.current = '';
          setState((current) => ({ ...current, capability: undefined }));
          setShareUrl('');
        } else {
          setPublishError(
            'Your Draft changed, but the existing private link is still active. Open Share to revoke it.',
          );
        }
      });
    }
  }, [state.capability, state.profile, state.opportunity]);

  const status = state.capability
    ? 'Shared'
    : state.approved
      ? 'Approved'
      : state.spec && state.reviews.length === 3
        ? 'Ready for approval'
        : state.spec
          ? 'Draft ready'
          : 'Brief ready';

  async function generate() {
    setGenerating(true);
    setGenerateError('');
    try {
      const strategy = buildStrategy(state.profile, state.opportunity);
      const run = await runAgentTeam({
        tenantId: 'local-demo',
        runId: crypto.randomUUID(),
        profile: state.profile,
        opportunity: state.opportunity,
      });
      const spec = latestPageSpec(run);
      if (!spec) throw new Error('Draft missing.');
      setState((current) => ({
        ...current,
        strategy,
        spec,
        reviews: run.reviews,
        approved: false,
        capability: undefined,
        events: run.events.map((event) => ({
          actor:
            event.actor === 'human' || event.actor === 'evidence-archivist'
              ? 'system'
              : event.actor,
          action: event.summary,
          artifact: event.artifactId,
          costMicros: event.costMicros,
        })),
      }));
      setDossierView('draft');
    } catch (error) {
      setGenerateError(
        error instanceof Error && error.message.includes('not supported')
          ? 'No evidence matches this role. Update the brief or add relevant evidence, then retry.'
          : 'Draft generation stopped safely. Your brief is unchanged; retry when ready.',
      );
    } finally {
      setGenerating(false);
    }
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

  async function publish() {
    if (!canPublish(state.approved, state.reviews)) return;
    setPublishing(true);
    setPublishError('');
    try {
      const response = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile: state.profile,
          spec: state.spec,
          opportunity: state.opportunity,
          approved: true,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('AUTH_REQUIRED');
        throw new Error('Publication rejected.');
      }
      const publication = (await response.json()) as {
        publicationId: string;
        rawToken: string;
      };
      setState((current) => ({
        ...current,
        capability: publication.publicationId,
      }));
      publishedInput.current = JSON.stringify([
        state.profile,
        state.opportunity,
      ]);
      setShareUrl(`/p/${publication.publicationId}#${publication.rawToken}`);
      setShareMessage('Private link created.');
    } catch (error) {
      setPublishError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Sign in before creating a private link.'
          : 'The private link could not be created. Check the server connection and retry.',
      );
    } finally {
      setPublishing(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
    setShareMessage('Private link copied.');
  }

  async function revoke() {
    if (
      !state.capability ||
      !confirm('Revoke this private link? Anyone using it will lose access.')
    )
      return;
    const response = await fetch(`/api/publications/${state.capability}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setPublishError(
        response.status === 401
          ? 'Sign in to revoke this private link.'
          : 'The private link could not be revoked. Retry.',
      );
      return;
    }
    setState((current) => ({ ...current, capability: undefined }));
    setShareUrl('');
    setShareMessage('Private link revoked.');
  }

  async function signOut() {
    const result = await authClient.signOut();
    if (result.error) return;
    setShareUrl('');
    setShareMessage(
      state.capability
        ? 'Signed out. The existing private link remains active until you sign in and revoke it.'
        : 'Signed out.',
    );
  }

  function addMemory() {
    if (
      !memoryDraft.source.trim() ||
      !memoryDraft.claim.trim() ||
      (memoryDraft.level === 'verified' && !memoryDraft.evidence.trim())
    ) {
      setMemoryError(
        'Add a source and statement. Verified statements also need an evidence excerpt.',
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
    setState((current) => ({
      ...current,
      profile,
      strategy: undefined,
      spec: undefined,
      reviews: [],
      approved: false,
      events: [],
    }));
    setMemoryDraft({ source: '', claim: '', evidence: '', level: 'declared' });
    setMemoryError('');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'career-os-export.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to application
      </a>
      <aside className="sidebar" aria-label="Career OS navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span>
            <strong>Career OS</strong>
            <small>Living dossier</small>
          </span>
        </div>
        <nav className="primary-nav" aria-label="Primary">
          {primaryViews.map(([id, label]) => (
            <button
              aria-current={primaryView === id ? 'page' : undefined}
              className={primaryView === id ? 'active' : ''}
              key={id}
              onClick={() => setPrimaryView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="application-list">
          <p>Open application</p>
          <button
            className="application-row"
            onClick={() => setPrimaryView('applications')}
          >
            <span className="company-dot" aria-hidden="true" />
            <span>
              <strong>{state.opportunity.company}</strong>
              <small>{state.opportunity.role}</small>
            </span>
          </button>
        </div>
        <p className="demo-label">Synthetic demo data</p>
        <div className="account-control">
          {session.isPending ? (
            <small>Checking account…</small>
          ) : session.data ? (
            <>
              <span aria-hidden="true">
                {session.data.user.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{session.data.user.name}</strong>
                <small>
                  {activeOrganization.data?.name ?? 'Choose workspace'}
                </small>
                <button onClick={() => void signOut()} type="button">
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <Link href="/sign-in?next=/">Sign in to share</Link>
          )}
        </div>
      </aside>

      <section className="shell-content" id="main-content">
        {primaryView === 'applications' ? (
          <>
            <header className="object-header">
              <div className="object-identity">
                <span className="company-mark" aria-hidden="true">
                  {state.opportunity.company.charAt(0)}
                </span>
                <div>
                  <p>Application dossier</p>
                  <h1>{state.opportunity.company}</h1>
                  <span>{state.opportunity.role}</span>
                </div>
              </div>
              <div className="status-block">
                <span className="status-label">{status}</span>
                {state.spec ? (
                  <button
                    className="inspector-toggle quiet"
                    aria-controls="evidence-inspector"
                    aria-expanded={inspectorOpen}
                    onClick={() => {
                      setSelectedClaimId('');
                      setInspectorOpen(true);
                    }}
                  >
                    View Evidence
                  </button>
                ) : null}
              </div>
            </header>
            <nav className="dossier-nav" aria-label="Application dossier">
              {dossierViews.map(([id, label]) => (
                <button
                  aria-current={dossierView === id ? 'step' : undefined}
                  className={dossierView === id ? 'active' : ''}
                  disabled={id !== 'brief' && !state.spec}
                  key={id}
                  onClick={() => setDossierView(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="application-layout">
              <div className="document-area">
                {dossierView === 'brief' ? (
                  <BriefView
                    error={generateError}
                    generating={generating}
                    hasDraft={Boolean(state.spec)}
                    opportunity={state.opportunity}
                    onChange={(opportunity) =>
                      setState((current) => ({ ...current, opportunity }))
                    }
                    onGenerate={generate}
                  />
                ) : null}
                {dossierView === 'draft' && state.spec ? (
                  <DraftView
                    profile={state.profile}
                    spec={state.spec}
                    onOpenEvidence={(claimId) => {
                      setSelectedClaimId(claimId);
                      setInspectorOpen(true);
                    }}
                  />
                ) : null}
                {dossierView === 'review' && state.spec ? (
                  <ReviewView
                    approved={state.approved}
                    paused={state.paused}
                    reviews={state.reviews}
                    onApprove={(approved) =>
                      setState((current) => ({ ...current, approved }))
                    }
                    onContinue={() => setDossierView('share')}
                    onReview={review}
                  />
                ) : null}
                {dossierView === 'share' && state.spec ? (
                  <ShareView
                    canPublish={canPublish(state.approved, state.reviews)}
                    error={publishError}
                    publishing={publishing}
                    shareMessage={shareMessage}
                    shareUrl={shareUrl}
                    publicationExists={Boolean(state.capability)}
                    signedIn={Boolean(
                      session.data?.session.activeOrganizationId,
                    )}
                    onCopy={copyLink}
                    onPublish={publish}
                    onRevoke={revoke}
                  />
                ) : null}
              </div>
              {state.spec ? (
                <EvidenceInspector
                  open={inspectorOpen}
                  profile={state.profile}
                  selectedClaimId={selectedClaimId}
                  spec={state.spec}
                  onClose={() => {
                    setInspectorOpen(false);
                    setSelectedClaimId('');
                  }}
                />
              ) : (
                <aside className="brief-context" aria-label="Next step">
                  <p className="section-label">Next action</p>
                  <h2>Generate the first Draft</h2>
                  <p>
                    Only statements with eligible supporting evidence can enter
                    the Draft.
                  </p>
                </aside>
              )}
            </div>
          </>
        ) : null}

        {primaryView === 'memory' ? (
          <CareerMemoryView
            error={memoryError}
            memoryDraft={memoryDraft}
            profile={state.profile}
            onAdd={addMemory}
            onDraftChange={setMemoryDraft}
            onProfileChange={(profile) =>
              setState((current) => ({
                ...current,
                profile,
                spec: undefined,
                reviews: [],
                approved: false,
              }))
            }
          />
        ) : null}
        {primaryView === 'activity' ? (
          <ActivityView
            events={state.events}
            paused={state.paused}
            onPause={() =>
              setState((current) => ({
                ...current,
                paused: !current.paused,
              }))
            }
          />
        ) : null}
        {primaryView === 'settings' ? (
          <SettingsView
            onExport={exportData}
            onReset={() => {
              if (
                confirm(
                  'Reset this local demo? Drafts and Career Memory changes will be removed.',
                )
              ) {
                localStorage.removeItem('career-os-demo');
                location.reload();
              }
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function BriefView({
  error,
  generating,
  hasDraft,
  opportunity,
  onChange,
  onGenerate,
}: {
  error: string;
  generating: boolean;
  hasDraft: boolean;
  opportunity: Opportunity;
  onChange: (opportunity: Opportunity) => void;
  onGenerate: () => void;
}) {
  return (
    <section className="document brief-document" aria-labelledby="brief-title">
      <header className="document-heading">
        <p className="section-label">Brief</p>
        <h2 id="brief-title">What should this application prove?</h2>
        <p>
          Paste the role context. The Draft will include only evidence that
          supports it.
        </p>
      </header>
      <div className="field-grid">
        <label>
          Company
          <input
            autoComplete="organization"
            name="company"
            value={opportunity.company}
            onChange={(event) =>
              onChange({ ...opportunity, company: event.target.value })
            }
          />
        </label>
        <label>
          Role
          <input
            autoComplete="organization-title"
            name="role"
            value={opportunity.role}
            onChange={(event) =>
              onChange({ ...opportunity, role: event.target.value })
            }
          />
        </label>
      </div>
      <label>
        Job Description
        <textarea
          autoComplete="off"
          name="job-description"
          rows={8}
          value={opportunity.description}
          onChange={(event) =>
            onChange({ ...opportunity, description: event.target.value })
          }
        />
      </label>
      <div className="field-grid compact">
        <label>
          Job URL <span>Optional, saved as untrusted input</span>
          <input
            autoComplete="url"
            name="job-url"
            placeholder="https://company.example/jobs/role…"
            type="url"
            value={opportunity.url ?? ''}
            onChange={(event) =>
              onChange({ ...opportunity, url: event.target.value })
            }
          />
        </label>
        <label>
          Accent <span>Decorative only</span>
          <input
            aria-label="Company accent color"
            name="company-accent"
            type="color"
            value={opportunity.accent}
            onChange={(event) =>
              onChange({ ...opportunity, accent: event.target.value })
            }
          />
        </label>
      </div>
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Draft not generated</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="document-actions">
        <p>Your brief is saved locally as you type.</p>
        <button disabled={generating} onClick={onGenerate}>
          {generating
            ? 'Generating Draft…'
            : error
              ? 'Retry Draft'
              : hasDraft
                ? 'Regenerate Draft'
                : 'Generate Draft'}
        </button>
      </div>
    </section>
  );
}

function DraftView({
  onOpenEvidence,
  profile,
  spec,
}: {
  onOpenEvidence: (claimId: string) => void;
  profile: Profile;
  spec: PageSpec;
}) {
  const claims = new Map(profile.claims.map((claim) => [claim.id, claim]));
  return (
    <article
      className="document draft-document"
      style={{ '--company-accent': spec.company.accent } as React.CSSProperties}
    >
      <div className="draft-accent" aria-hidden="true" />
      <header className="draft-heading">
        <p>{spec.company.role}</p>
        <span>Draft · Evidence-backed</span>
      </header>
      <p className="section-label">{spec.hero.eyebrow}</p>
      <h2>{spec.hero.title}</h2>
      <p className="draft-thesis">{spec.hero.thesis}</p>
      {spec.blocks.map((block, index) => (
        <section className="proof-section" key={`${block.type}-${index}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <h3>{block.title}</h3>
            {'claimIds' in block ? (
              block.claimIds.map((id) => {
                const claim = claims.get(id);
                return claim ? (
                  <button
                    className="statement"
                    key={id}
                    onClick={() => onOpenEvidence(id)}
                    type="button"
                  >
                    <span>{claim.statement}</span>
                    <small>{levelLabel(claim.level)} · View evidence</small>
                  </button>
                ) : null;
              })
            ) : (
              <p>{block.text}</p>
            )}
          </div>
        </section>
      ))}
    </article>
  );
}

function EvidenceInspector({
  onClose,
  open,
  profile,
  selectedClaimId,
  spec,
}: {
  onClose: () => void;
  open: boolean;
  profile: Profile;
  selectedClaimId: string;
  spec: PageSpec;
}) {
  const selectedIds = new Set(
    spec.blocks.flatMap((block) => ('claimIds' in block ? block.claimIds : [])),
  );
  return (
    <aside
      className={`evidence-inspector ${open ? 'open' : ''}`}
      id="evidence-inspector"
      aria-label="Evidence inspector"
    >
      <header>
        <div>
          <p className="section-label">Evidence</p>
          <h2>Why these statements?</h2>
        </div>
        <button
          className="inspector-close quiet"
          onClick={onClose}
          aria-label="Close evidence inspector"
        >
          Close
        </button>
      </header>
      {profile.claims
        .filter((claim) =>
          selectedClaimId
            ? claim.id === selectedClaimId
            : selectedIds.has(claim.id),
        )
        .map((claim) => (
          <section className="evidence-item" key={claim.id}>
            <div className="evidence-status">
              <span>{levelLabel(claim.level)}</span>
              <code translate="no">{claim.id}</code>
            </div>
            <h3>{claim.statement}</h3>
            {claim.evidenceIds.map((evidenceId) => {
              const evidence = profile.evidence.find(
                (item) => item.id === evidenceId,
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return evidence ? (
                <blockquote key={evidence.id}>
                  <strong>{source?.title}</strong>
                  <p>“{evidence.excerpt}”</p>
                </blockquote>
              ) : null;
            })}
          </section>
        ))}
    </aside>
  );
}

function ReviewView({
  approved,
  onApprove,
  onContinue,
  onReview,
  paused,
  reviews,
}: {
  approved: boolean;
  onApprove: (approved: boolean) => void;
  onContinue: () => void;
  onReview: () => void;
  paused: boolean;
  reviews: Review[];
}) {
  const ready = reviews.length === 3 && reviews.every((item) => item.passed);
  return (
    <section className="document review-document">
      <header className="document-heading">
        <p className="section-label">Review</p>
        <h2>Confirm relevance and evidence</h2>
        <p>All 3 checks must pass before human approval.</p>
      </header>
      <div className="review-list">
        {reviews.map((item) => (
          <article key={item.reviewer}>
            <div>
              <strong>{reviewerLabel(item.reviewer)}</strong>
              <small>
                {item.findings.length
                  ? item.findings.join(' ')
                  : 'No blockers found.'}
              </small>
            </div>
            <span className={item.passed ? 'passed' : 'blocked'}>
              {item.passed ? 'Passed' : 'Needs changes'}
            </span>
          </article>
        ))}
      </div>
      <button className="quiet" disabled={paused} onClick={onReview}>
        Run Review
      </button>
      <label className="approval">
        <input
          checked={approved}
          disabled={!ready}
          onChange={(event) => onApprove(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Approve this application</strong>I reviewed the evidence and
          approve this application.
        </span>
      </label>
      <div className="document-actions">
        <p>{ready ? 'All checks passed.' : 'Resolve review blockers first.'}</p>
        <button disabled={!approved} onClick={onContinue}>
          Continue to Share
        </button>
      </div>
    </section>
  );
}

function ShareView({
  canPublish,
  error,
  onCopy,
  onPublish,
  onRevoke,
  publishing,
  shareMessage,
  shareUrl,
  publicationExists,
  signedIn,
}: {
  canPublish: boolean;
  error: string;
  onCopy: () => void;
  onPublish: () => void;
  onRevoke: () => void;
  publishing: boolean;
  shareMessage: string;
  shareUrl: string;
  publicationExists: boolean;
  signedIn: boolean;
}) {
  return (
    <section className="document share-document">
      <header className="document-heading">
        <p className="section-label">Share</p>
        <h2>One private link, under your control</h2>
        <p>
          The link expires after 7 days. It opens only this application and can
          be revoked at any time.
        </p>
      </header>
      {shareUrl ? (
        <div className="share-result" role="status" aria-live="polite">
          <span className="passed">Active · Expires in 7 days</span>
          <code translate="no">{shareUrl}</code>
          <div className="share-actions">
            <button onClick={onCopy}>Copy Private Link</button>
            <a href={shareUrl}>Open Private Page</a>
            <button className="danger-link" onClick={onRevoke}>
              Revoke Private Link
            </button>
          </div>
        </div>
      ) : (
        <div className="share-empty">
          <strong>Not shared</strong>
          <p>Create a link only when the reviewed Draft is ready.</p>
        </div>
      )}
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Private link not created</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <p className="sr-status" aria-live="polite">
        {shareMessage}
      </p>
      {!shareUrl ? (
        <div className="document-actions">
          <p>
            {publicationExists
              ? 'The existing link is hidden on this device.'
              : 'Approval and 3 passing checks are required.'}
          </p>
          {!signedIn ? (
            <Link className="button-link" href="/sign-in?next=/">
              Sign In to {publicationExists ? 'Manage Link' : 'Create Link'}
            </Link>
          ) : publicationExists ? (
            <button className="danger-link" onClick={onRevoke}>
              Revoke Existing Link
            </button>
          ) : (
            <button disabled={!canPublish || publishing} onClick={onPublish}>
              {publishing ? 'Creating Private Link…' : 'Create Private Link'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CareerMemoryView({
  error,
  memoryDraft,
  onAdd,
  onDraftChange,
  onProfileChange,
  profile,
}: {
  error: string;
  memoryDraft: {
    source: string;
    claim: string;
    evidence: string;
    level: 'verified' | 'declared' | 'inferred';
  };
  onAdd: () => void;
  onDraftChange: (draft: typeof memoryDraft) => void;
  onProfileChange: (profile: Profile) => void;
  profile: Profile;
}) {
  return (
    <div className="standalone-view">
      <header className="view-header">
        <div>
          <p className="section-label">Career Memory</p>
          <h1>Your evidence library</h1>
          <p>Statements stay connected to their source and evidence.</p>
        </div>
        <div className="memory-counts" aria-label="Career Memory totals">
          <span>{profile.sources.length} sources</span>
          <span>{profile.claims.length} statements</span>
          <span>{profile.evidence.length} evidence items</span>
        </div>
      </header>
      <div className="memory-layout">
        <section className="document memory-profile">
          <h2>Profile</h2>
          <label>
            Name
            <input
              autoComplete="name"
              name="candidate-name"
              value={profile.name}
              onChange={(event) =>
                onProfileChange({ ...profile, name: event.target.value })
              }
            />
          </label>
          <label>
            Headline
            <input
              autoComplete="off"
              name="candidate-headline"
              value={profile.headline}
              onChange={(event) =>
                onProfileChange({ ...profile, headline: event.target.value })
              }
            />
          </label>
          <details>
            <summary>Add Statement & Source</summary>
            <label>
              Source Title
              <input
                autoComplete="off"
                name="source-title"
                value={memoryDraft.source}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, source: event.target.value })
                }
              />
            </label>
            <label>
              Statement
              <textarea
                autoComplete="off"
                name="statement"
                rows={3}
                value={memoryDraft.claim}
                onChange={(event) =>
                  onDraftChange({ ...memoryDraft, claim: event.target.value })
                }
              />
            </label>
            <label>
              Evidence Status
              <select
                name="evidence-status"
                value={memoryDraft.level}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    level: event.target.value as typeof memoryDraft.level,
                  })
                }
              >
                <option value="declared">Self-reported</option>
                <option value="inferred">Inferred</option>
                <option value="verified">Verified</option>
              </select>
            </label>
            <label>
              Evidence Excerpt
              <textarea
                autoComplete="off"
                name="evidence-excerpt"
                rows={3}
                value={memoryDraft.evidence}
                onChange={(event) =>
                  onDraftChange({
                    ...memoryDraft,
                    evidence: event.target.value,
                  })
                }
              />
            </label>
            {error ? (
              <p className="inline-error" role="alert">
                {error}
              </p>
            ) : null}
            <button onClick={onAdd}>Save to Career Memory</button>
          </details>
        </section>
        <section className="statement-list" aria-labelledby="statements-title">
          <div className="list-heading">
            <h2 id="statements-title">Statements & Sources</h2>
            <span>{profile.claims.length}</span>
          </div>
          {profile.claims.map((claim) => (
            <article key={claim.id}>
              <div>
                <span>{levelLabel(claim.level)}</span>
                <small>
                  {claim.evidenceIds.length
                    ? `${claim.evidenceIds.length} evidence item`
                    : 'No supporting evidence'}
                </small>
              </div>
              <label>
                Statement
                <textarea
                  rows={3}
                  value={claim.statement}
                  onChange={(event) =>
                    onProfileChange({
                      ...profile,
                      claims: profile.claims.map((item) =>
                        item.id === claim.id
                          ? { ...item, statement: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function ActivityView({
  events,
  onPause,
  paused,
}: {
  events: WorkflowEvent[];
  onPause: () => void;
  paused: boolean;
}) {
  const deliverables = events.filter((event) => event.artifact);
  return (
    <div className="standalone-view activity-view">
      <header className="view-header">
        <div>
          <p className="section-label">Activity</p>
          <h1>Run history</h1>
          <p>Named deliverables first; technical events stay expandable.</p>
        </div>
        <button className="quiet" onClick={onPause}>
          {paused ? 'Resume Run' : 'Interrupt Run'}
        </button>
      </header>
      {events.length ? (
        <ol className="event-list">
          {deliverables.map((event, index) => (
            <li key={`${event.actor}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{deliverableLabel(event)}</strong>
              </div>
            </li>
          ))}
          <li>
            <span aria-hidden="true">↳</span>
            <details>
              <summary>Run details</summary>
              {events.map((event, index) => (
                <code key={`${event.actor}-${index}`} translate="no">
                  {String(index + 1).padStart(2, '0')} · {event.actor} ·{' '}
                  {event.action} · {event.artifact ?? 'no-artifact'} · €
                  {(event.costMicros / 1_000_000).toFixed(2)}
                </code>
              ))}
            </details>
          </li>
        </ol>
      ) : (
        <div className="empty-state">
          <h2>No runs yet</h2>
          <p>Generate a Draft to create the first activity record.</p>
        </div>
      )}
      <details className="role-contracts">
        <summary>Technical Role Contracts</summary>
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
    </div>
  );
}

function SettingsView({
  onExport,
  onReset,
}: {
  onExport: () => void;
  onReset: () => void;
}) {
  return (
    <div className="standalone-view settings-view">
      <header className="view-header">
        <div>
          <p className="section-label">Settings</p>
          <h1>Local workspace</h1>
          <p>Export or reset the synthetic data stored in this browser.</p>
        </div>
      </header>
      <section className="settings-row">
        <div>
          <h2>Export all data</h2>
          <p>Download the profile, application, reviews, and activity.</p>
        </div>
        <button onClick={onExport}>Export JSON</button>
      </section>
      <section className="settings-row danger-zone">
        <div>
          <h2>Reset local demo</h2>
          <p>Remove local changes and restore the synthetic fixture.</p>
        </div>
        <button className="danger-link" onClick={onReset}>
          Reset Demo
        </button>
      </section>
      <p className="demo-footer">All visible candidate content is synthetic.</p>
    </div>
  );
}

function levelLabel(level: Profile['claims'][number]['level']) {
  if (level === 'verified') return 'Verified evidence';
  if (level === 'declared') return 'Self-reported';
  return 'Inferred';
}

function reviewerLabel(reviewer: Review['reviewer']) {
  if (reviewer === 'hiring-manager') return 'Role relevance';
  if (reviewer === 'factuality') return 'Evidence check';
  return 'Application clarity';
}

function deliverableLabel(event: WorkflowEvent) {
  if (event.artifact?.includes('research'))
    return 'Opportunity brief completed';
  if (event.artifact?.includes('strategy')) return 'Evidence match completed';
  if (
    event.artifact?.includes('page-spec') ||
    event.artifact?.includes('page_spec')
  )
    return 'Draft completed';
  if (event.artifact?.includes('review')) return 'Review completed';
  return 'Run updated';
}
