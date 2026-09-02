'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { latestPageSpec, runAgentTeam } from '@/lib/agent-runtime';
import { syntheticProfile } from '@/lib/fixture';
import {
  agentRoles,
  buildStrategy,
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
import {
  persistedRunSchema,
  reviewIssueDecisionResultSchema,
  type PersistedRun,
} from '@/lib/run-contract';

type WorkspaceReview = Review & {
  reviewId?: string;
  issues?: PersistedRun['reviews'][number]['issues'];
};
type ReviewDecision = {
  reviewId: string;
  issueIndex: number;
  decision: 'keep' | 'correct';
};

type SavedState = {
  profile: Profile;
  opportunity: Opportunity;
  strategy?: Strategy;
  spec?: PageSpec;
  runId?: string;
  runProfile?: Profile;
  reviews: WorkspaceReview[];
  reviewDecisions?: ReviewDecision[];
  publicationEligible?: boolean;
  approved: boolean;
  capability?: string;
  events: WorkflowEvent[];
  paused: boolean;
};
type PrimaryView = 'home' | 'applications' | 'memory' | 'activity' | 'settings';
type DossierView =
  'board' | 'brief' | 'company' | 'journey' | 'draft' | 'review' | 'share';

const initialOpportunity: Opportunity = {
  company: 'Northstar Labs',
  role: 'Senior Product Engineer',
  description:
    'Build dependable customer-facing workflows with a small product team.',
  accent: '#21504b',
};
const primaryViews: Array<[PrimaryView, string]> = [
  ['home', 'Accueil'],
  ['activity', 'À trancher'],
  ['applications', 'Candidatures'],
  ['memory', 'Mémoire pro'],
  ['settings', 'Réglages'],
];
const dossierViews: Array<[Exclude<DossierView, 'board'>, string]> = [
  ['brief', 'Offre'],
  ['company', 'Entreprise'],
  ['journey', 'Parcours'],
  ['draft', 'Page privée'],
  ['share', 'Partager'],
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
  const [primaryView, setPrimaryView] = useState<PrimaryView>('home');
  const [dossierView, setDossierView] = useState<DossierView>('brief');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [decisionPending, setDecisionPending] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [memoryError, setMemoryError] = useState('');
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [savedProfileJson, setSavedProfileJson] = useState('');
  const [memorySyncing, setMemorySyncing] = useState(false);
  const [memorySyncMessage, setMemorySyncMessage] = useState('');
  const [resolvedScope, setResolvedScope] = useState('anonymous');
  const [memoryDraft, setMemoryDraft] = useState({
    source: '',
    claim: '',
    evidence: '',
    level: 'declared' as 'verified' | 'declared' | 'inferred',
  });
  const requestedScope = useRef('');
  const pendingRun = useRef<{ input: string; key: string } | undefined>(
    undefined,
  );
  const pendingDecisions = useRef(new Map<string, string>());
  const activeTenantId = session.data?.session.activeOrganizationId;
  const storageKey = activeTenantId
    ? `career-os-workspace:${activeTenantId}`
    : 'career-os-demo';

  useEffect(() => {
    if (session.isPending) return;
    const scope = activeTenantId ?? 'anonymous';
    requestedScope.current = scope;
    const controller = new AbortController();

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setShareUrl('');
      setMemorySyncMessage('');
      const saved = localStorage.getItem(storageKey);
      let nextState: SavedState = {
        profile: syntheticProfile,
        opportunity: initialOpportunity,
        reviews: [],
        approved: false,
        events: [],
        paused: false,
      };
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as SavedState;
          nextState = {
            ...parsed,
            events: parsed.events ?? [],
            paused: parsed.paused ?? false,
          };
        } catch {
          localStorage.removeItem(storageKey);
        }
      }
      let revision = 0;
      if (activeTenantId) {
        try {
          const response = await fetch('/api/profile', {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('PROFILE_LOAD_FAILED');
          const result = (await response.json()) as {
            profile: Profile | null;
            revision: number;
          };
          if (result.profile) nextState.profile = result.profile;
          revision = result.revision;
        } catch {
          if (controller.signal.aborted) return;
          setMemorySyncMessage(
            'La mémoire professionnelle enregistrée n’a pas pu être chargée. Les changements locaux restent disponibles.',
          );
        }
      }
      if (controller.signal.aborted || requestedScope.current !== scope) return;
      setState(nextState);
      setMemoryRevision(revision);
      setSavedProfileJson(revision ? JSON.stringify(nextState.profile) : '');
      setResolvedScope(scope);
      setLoaded(true);
    })();

    return () => controller.abort();
  }, [activeTenantId, session.isPending, storageKey]);

  useEffect(() => {
    const scope = activeTenantId ?? 'anonymous';
    if (loaded && resolvedScope === scope)
      localStorage.setItem(storageKey, JSON.stringify(state));
  }, [activeTenantId, loaded, resolvedScope, state, storageKey]);

  const workspaceReady =
    loaded && resolvedScope === (activeTenantId ?? 'anonymous');

  if (!workspaceReady)
    return (
      <main className="workspace-loading" aria-busy="true">
        <span className="brand-mark light" aria-hidden="true">
          C
        </span>
        <p role="status">Chargement de l’espace…</p>
      </main>
    );

  const decisionCount = unresolvedReviewIssues(
    state.reviews,
    state.reviewDecisions,
  ).length;
  const status = state.capability
    ? 'Partagée'
    : state.approved
      ? 'Validée'
      : state.spec && decisionCount
        ? 'Revue requise'
        : state.spec && reviewGateReady(state)
          ? 'Prête à valider'
          : state.spec
            ? 'Brouillon prêt'
            : 'Offre prête';

  async function generate() {
    if (activeTenantId && JSON.stringify(state.profile) !== savedProfileJson) {
      setGenerateError(
        'Enregistrez la mémoire professionnelle avant de générer la page.',
      );
      setPrimaryView('memory');
      return;
    }
    setGenerating(true);
    setGenerateError('');
    try {
      const strategy = buildStrategy(state.profile, state.opportunity);
      const persistedInput = JSON.stringify({
        opportunity: state.opportunity,
        profileRevision: memoryRevision,
      });
      let runId: string | undefined;
      let runProfile = state.profile;
      let reviews: WorkspaceReview[];
      let events: WorkflowEvent[];
      let spec: PageSpec | undefined;
      let publicationEligible = false;

      if (activeTenantId) {
        if (pendingRun.current?.input !== persistedInput)
          pendingRun.current = {
            input: persistedInput,
            key: crypto.randomUUID(),
          };
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': pendingRun.current.key,
          },
          body: persistedInput,
        });
        if (!response.ok)
          throw new Error(
            response.status === 409 ? 'RUN_CONFLICT' : 'RUN_FAILED',
          );
        const persisted = persistedRunSchema.parse(await response.json());
        runId = persisted.runId;
        runProfile = persisted.profile;
        reviews = persisted.reviews;
        spec = persisted.spec;
        events = persistedEvents(persisted);
        publicationEligible = persisted.reviews.every(
          (review) => review.passed,
        );
        pendingRun.current = undefined;
      } else {
        const localRun = await runAgentTeam({
          tenantId: 'local-demo',
          runId: crypto.randomUUID(),
          profile: state.profile,
          opportunity: state.opportunity,
        });
        spec = latestPageSpec(localRun);
        reviews = localRun.reviews;
        publicationEligible = reviews.every((review) => review.passed);
        events = localRun.events.map((event) => ({
          actor:
            event.actor === 'human' || event.actor === 'evidence-archivist'
              ? 'system'
              : event.actor,
          action: event.summary,
          artifact: event.artifactId,
          costMicros: event.costMicros,
        }));
      }
      if (!spec) throw new Error('Draft missing.');
      setState((current) => ({
        ...current,
        strategy,
        spec,
        runId,
        runProfile,
        reviews,
        reviewDecisions: [],
        publicationEligible,
        approved: false,
        capability: undefined,
        events,
      }));
      setDossierView('journey');
    } catch (error) {
      setGenerateError(
        error instanceof Error && error.message === 'RUN_CONFLICT'
          ? 'La mémoire professionnelle a changé dans une autre session. Rechargez-la avant de relancer.'
          : error instanceof Error && error.message.includes('not supported')
            ? 'Aucune preuve ne correspond à ce poste. Ajustez le brief ou ajoutez une preuve pertinente, puis réessayez.'
            : 'La génération s’est arrêtée sans modifier le brief. Réessayez lorsque vous êtes prêt.',
      );
    } finally {
      setGenerating(false);
    }
  }

  function review() {
    if (!state.spec) return;
    const reviews = runReviews(state.runProfile ?? state.profile, state.spec);
    setState((current) => ({
      ...current,
      reviews,
      reviewDecisions: [],
      publicationEligible: reviews.every((item) => item.passed),
      approved: false,
      events: [
        ...current.events,
        ...reviews.map((result) => ({
          actor:
            result.reviewer === 'factuality'
              ? ('fact-checker' as const)
              : result.reviewer,
          action: result.passed
            ? 'Contrôle observable validé.'
            : `${result.findings.length} point(s) à trancher ouvert(s).`,
          artifact: `${result.reviewer}-review-v1`,
          costMicros: 0,
        })),
      ],
    }));
  }

  async function decideReviewIssue(
    review: WorkspaceReview,
    issueIndex: number,
    decision: ReviewDecision['decision'],
  ) {
    if (!state.runId || !review.reviewId) {
      setDecisionError(
        'Cette ancienne revue doit être régénérée avant de pouvoir être tranchée.',
      );
      return;
    }
    const issueKey = `${review.reviewId}:${issueIndex}`;
    const operationKey = `${state.runId}:${issueKey}:${decision}`;
    const idempotencyKey =
      pendingDecisions.current.get(operationKey) ?? crypto.randomUUID();
    pendingDecisions.current.set(operationKey, idempotencyKey);
    setDecisionPending(issueKey);
    setDecisionError('');
    setDecisionMessage('');
    try {
      const response = await fetch(
        `/api/runs/${state.runId}/review-decisions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            reviewId: review.reviewId,
            issueIndex,
            decision,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'DECISION_CONFLICT'
            : response.status === 401
              ? 'AUTH_REQUIRED'
              : response.status === 400
                ? 'DECISION_REJECTED'
                : 'DECISION_FAILED',
        );
      const result = reviewIssueDecisionResultSchema.parse(
        await response.json(),
      );
      pendingDecisions.current.delete(operationKey);
      if (result.correctedRun) {
        setState((current) => ({
          ...current,
          spec: result.correctedRun!.spec,
          runId: result.correctedRun!.runId,
          runProfile: result.correctedRun!.profile,
          reviews: result.correctedRun!.reviews,
          reviewDecisions: [],
          publicationEligible: result.correctedRun!.reviews.every(
            (item) => item.passed,
          ),
          approved: false,
          capability: undefined,
          events: persistedEvents(result.correctedRun!),
        }));
        setShareUrl('');
        setShareMessage('');
        setDecisionMessage(
          'Une nouvelle version a été générée et validée par les trois contrôles.',
        );
      } else {
        setState((current) => ({
          ...current,
          reviewDecisions: [
            ...(current.reviewDecisions ?? []).filter(
              (item) =>
                item.reviewId !== result.reviewId ||
                item.issueIndex !== result.issueIndex,
            ),
            {
              reviewId: result.reviewId,
              issueIndex: result.issueIndex,
              decision: result.decision,
            },
          ],
          publicationEligible: result.publicationEligible,
          approved: false,
        }));
        setDecisionMessage(
          result.publicationEligible
            ? 'Votre décision est enregistrée. La candidature peut maintenant être validée.'
            : 'Votre décision est enregistrée. Il reste des points à trancher.',
        );
      }
    } catch (error) {
      setDecisionError(
        error instanceof Error && error.message === 'DECISION_CONFLICT'
          ? 'Une autre session a déjà tranché ce point différemment. Relancez la candidature depuis son état enregistré.'
          : error instanceof Error && error.message === 'AUTH_REQUIRED'
            ? 'Reconnectez-vous avant de trancher ce point.'
            : error instanceof Error && error.message === 'DECISION_REJECTED'
              ? 'Cette correction ne peut pas être appliquée automatiquement sans inventer. Modifiez le brief ou régénérez la candidature.'
              : 'La décision n’a pas pu être enregistrée. Vous pouvez réessayer sans risque de doublon.',
      );
    } finally {
      setDecisionPending('');
    }
  }

  async function publish() {
    if (!state.runId || !state.approved || !reviewGateReady(state)) return;
    setPublishing(true);
    setPublishError('');
    try {
      const response = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: state.runId }),
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
      setShareUrl(`/p/${publication.publicationId}#${publication.rawToken}`);
      setShareMessage('Lien privé créé.');
    } catch (error) {
      setPublishError(
        error instanceof Error && error.message === 'AUTH_REQUIRED'
          ? 'Connectez-vous avant de créer un lien privé.'
          : 'Le lien privé n’a pas pu être créé. Vérifiez la connexion au serveur, puis réessayez.',
      );
    } finally {
      setPublishing(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
    setShareMessage('Lien privé copié.');
  }

  async function revoke() {
    if (
      !state.capability ||
      !confirm(
        'Révoquer ce lien privé ? Toutes les personnes qui l’utilisent perdront leur accès.',
      )
    )
      return;
    const response = await fetch(`/api/publications/${state.capability}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setPublishError(
        response.status === 401
          ? 'Connectez-vous pour révoquer ce lien privé.'
          : 'Le lien privé n’a pas pu être révoqué. Réessayez.',
      );
      return;
    }
    setState((current) => ({ ...current, capability: undefined }));
    setShareUrl('');
    setShareMessage('Lien privé révoqué.');
  }

  async function signOut() {
    const result = await authClient.signOut();
    if (result.error) return;
    setShareUrl('');
    setShareMessage(
      state.capability
        ? 'Vous êtes déconnecté. Le lien privé existant reste actif jusqu’à sa révocation.'
        : 'Vous êtes déconnecté.',
    );
  }

  async function saveCareerMemory() {
    if (!activeTenantId) {
      setMemorySyncMessage(
        'Connectez-vous pour enregistrer la mémoire professionnelle dans un espace.',
      );
      return;
    }
    setMemorySyncing(true);
    setMemorySyncMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile: state.profile,
          expectedRevision: memoryRevision,
        }),
      });
      if (response.status === 409) throw new Error('PROFILE_CONFLICT');
      if (!response.ok) throw new Error('PROFILE_SAVE_FAILED');
      const result = (await response.json()) as {
        profile: Profile;
        revision: number;
      };
      setSavedProfileJson(JSON.stringify(result.profile));
      setMemoryRevision(result.revision);
      setState((current) => ({
        ...current,
        profile: result.profile,
        strategy: undefined,
        spec: undefined,
        runId: undefined,
        runProfile: undefined,
        reviews: [],
        reviewDecisions: [],
        publicationEligible: undefined,
        approved: false,
      }));
      setMemorySyncMessage(
        'Mémoire professionnelle enregistrée dans cet espace.',
      );
    } catch (error) {
      setMemorySyncMessage(
        error instanceof Error && error.message === 'PROFILE_CONFLICT'
          ? 'La mémoire professionnelle a changé dans une autre session. Actualisez avant de l’enregistrer à nouveau.'
          : 'La mémoire professionnelle n’a pas pu être enregistrée. Vos changements locaux sont conservés.',
      );
    } finally {
      setMemorySyncing(false);
    }
  }

  function addMemory() {
    if (
      !memoryDraft.source.trim() ||
      !memoryDraft.claim.trim() ||
      (memoryDraft.level === 'verified' && !memoryDraft.evidence.trim())
    ) {
      setMemoryError(
        'Ajoutez une source et une affirmation. Une affirmation vérifiée exige aussi un extrait de preuve.',
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
      runId: undefined,
      runProfile: undefined,
      reviews: [],
      reviewDecisions: [],
      publicationEligible: undefined,
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

  function openApplications(view: DossierView = 'board') {
    setDossierView(view);
    setPrimaryView('applications');
  }

  return (
    <main
      className={`app-shell ${primaryView === 'applications' && dossierView !== 'board' ? 'dossier-mode' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar" aria-label="Career OS navigation">
        <div className="tool-rail">
          <button
            className="brand-mark"
            aria-label="Ouvrir les candidatures"
            onClick={() => openApplications()}
            type="button"
          >
            <span aria-hidden="true">C</span>
          </button>
          <nav className="primary-nav" aria-label="Primary">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                data-label={label}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
          <span className="rail-avatar" aria-hidden="true">
            {session.data?.user.name.charAt(0).toUpperCase() ?? 'K'}
          </span>
        </div>
        <div className="sidebar-panel">
          <div className="brand">
            <span className="brand-mark light" aria-hidden="true">
              C
            </span>
            <span>
              <strong>Career OS</strong>
              <small>
                {activeOrganization.data?.name ?? 'Espace personnel'}
              </small>
            </span>
          </div>
          <p className="sidebar-label">Espace</p>
          <nav className="workspace-nav" aria-label="Espace">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
              >
                <NavIcon name={id} />
                <span>{label}</span>
                {id === 'activity' && decisionCount ? (
                  <small>{decisionCount}</small>
                ) : null}
              </button>
            ))}
          </nav>
          <p className="sidebar-label">En cours</p>
          <div className="application-list">
            <button
              className="application-row"
              onClick={() => openApplications(state.spec ? 'journey' : 'brief')}
            >
              <span className="company-mark compact" aria-hidden="true">
                {state.opportunity.company.charAt(0)}
              </span>
              <span>
                <strong>{state.opportunity.company}</strong>
                <small>{state.opportunity.role}</small>
              </span>
            </button>
          </div>

          <p className="demo-label">
            {activeTenantId
              ? memoryRevision
                ? 'Espace synchronisé'
                : 'Données de départ non enregistrées'
              : 'Données de démonstration'}
          </p>
          <section className="hosting-card" aria-label="État de l’instance">
            <strong>Auto-hébergé</strong>
            <span>Vos preuves ne quittent pas votre instance.</span>
            <button onClick={() => setPrimaryView('settings')} type="button">
              Voir la config
            </button>
          </section>
          <div className="account-control">
            {session.isPending ? (
              <small>Vérification du compte…</small>
            ) : session.data ? (
              <>
                <span aria-hidden="true">
                  {session.data.user.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{session.data.user.name}</strong>
                  <small>
                    {activeOrganization.data?.name ?? 'Choisir un espace'}
                  </small>
                  <button onClick={() => void signOut()} type="button">
                    Se déconnecter
                  </button>
                </div>
              </>
            ) : (
              <Link href="/sign-in?next=/">Se connecter pour partager</Link>
            )}
          </div>
        </div>
      </aside>

      <section className="shell-content" id="main-content">
        {primaryView !== 'applications' || dossierView === 'board' ? (
          <nav className="mobile-primary-nav" aria-label="Espace sur mobile">
            {primaryViews.map(([id, label]) => (
              <button
                aria-current={primaryView === id ? 'page' : undefined}
                aria-label={label}
                className={primaryView === id ? 'active' : ''}
                key={id}
                onClick={() =>
                  id === 'applications'
                    ? openApplications()
                    : setPrimaryView(id)
                }
                title={label}
              >
                <NavIcon name={id} />
                <small>
                  {label === 'Candidatures'
                    ? 'Dossiers'
                    : label === 'Mémoire pro'
                      ? 'Mémoire'
                      : label === 'À trancher'
                        ? 'Revue'
                        : label}
                </small>
              </button>
            ))}
          </nav>
        ) : null}
        {primaryView === 'home' ? (
          <HomeView
            capability={state.capability}
            events={state.events}
            opportunity={state.opportunity}
            profile={state.profile}
            reviews={state.reviews}
            decisions={state.reviewDecisions}
            spec={state.spec}
            status={status}
            onOpenApplication={(view) => {
              openApplications(view);
            }}
            onOpenMemory={() => setPrimaryView('memory')}
          />
        ) : null}
        {primaryView === 'applications' && dossierView === 'board' ? (
          <ApplicationsView
            capability={state.capability}
            opportunity={state.opportunity}
            profile={state.profile}
            reviews={state.reviews}
            decisions={state.reviewDecisions}
            spec={state.spec}
            status={status}
            onOpen={(view) => openApplications(view)}
          />
        ) : null}
        {primaryView === 'applications' && dossierView !== 'board' ? (
          <>
            <header className="application-topbar">
              <button
                aria-label="Retour aux candidatures"
                className="round-action quiet"
                onClick={() => openApplications('board')}
                type="button"
              >
                ←
              </button>
              <div className="object-identity">
                <span className="company-mark" aria-hidden="true">
                  {state.opportunity.company.charAt(0)}
                </span>
                <div>
                  <p>
                    {state.opportunity.company} · {state.opportunity.role}
                  </p>
                  <h1>Parcours de candidature</h1>
                </div>
              </div>
              <nav className="dossier-tabs" aria-label="Vues de la candidature">
                {dossierViews.map(([id, label]) => (
                  <button
                    aria-current={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'page'
                        : undefined
                    }
                    className={
                      dossierView === id ||
                      (dossierView === 'review' && id === 'journey')
                        ? 'active'
                        : ''
                    }
                    disabled={
                      id !== 'brief' &&
                      id !== 'company' &&
                      id !== 'journey' &&
                      !state.spec &&
                      !(id === 'share' && state.capability)
                    }
                    key={id}
                    onClick={() => setDossierView(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="status-block">
                {state.spec ? (
                  <button
                    className="round-action inspector-toggle quiet"
                    aria-label="Voir les preuves"
                    aria-controls="evidence-inspector"
                    aria-expanded={inspectorOpen}
                    onClick={() => {
                      setSelectedClaimId('');
                      setInspectorOpen(true);
                    }}
                  >
                    ⌕
                  </button>
                ) : null}
                <button
                  disabled={!state.approved}
                  onClick={() => setDossierView('share')}
                >
                  {state.approved ? 'Valider et publier' : status}
                </button>
              </div>
            </header>
            <div className="application-layout">
              <div className="document-area">
                {dossierView === 'brief' ? (
                  <BriefView
                    error={generateError}
                    generating={generating}
                    hasDraft={Boolean(state.spec)}
                    opportunity={state.opportunity}
                    onChange={(opportunity) => {
                      pendingRun.current = undefined;
                      setState((current) => ({
                        ...current,
                        opportunity,
                        strategy: undefined,
                        spec: undefined,
                        runId: undefined,
                        runProfile: undefined,
                        reviews: [],
                        reviewDecisions: [],
                        publicationEligible: undefined,
                        approved: false,
                        capability: undefined,
                        events: [],
                      }));
                    }}
                    onGenerate={generate}
                  />
                ) : null}
                {dossierView === 'company' ? (
                  <CompanyView opportunity={state.opportunity} />
                ) : null}
                {dossierView === 'journey' ? (
                  <JourneyView
                    approved={state.approved}
                    opportunity={state.opportunity}
                    profile={state.runProfile ?? state.profile}
                    reviews={state.reviews}
                    spec={state.spec}
                    onGenerate={generate}
                    onOpenBrief={() => setDossierView('brief')}
                    onOpenDraft={() => setDossierView('draft')}
                    onOpenEvidence={(claimId) => {
                      setSelectedClaimId(claimId);
                      setInspectorOpen(true);
                    }}
                    onReview={() => {
                      if (!state.runId) review();
                      setDossierView('review');
                    }}
                  />
                ) : null}
                {dossierView === 'draft' && state.spec ? (
                  <DraftView
                    profile={state.runProfile ?? state.profile}
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
                    decisions={state.reviewDecisions}
                    decisionError={decisionError}
                    decisionMessage={decisionMessage}
                    decisionPending={decisionPending}
                    publicationEligible={reviewGateReady(state)}
                    canRerun={!state.runId}
                    onApprove={(approved) =>
                      setState((current) => ({ ...current, approved }))
                    }
                    onContinue={() => setDossierView('share')}
                    onDecide={(review, issueIndex, decision) =>
                      void decideReviewIssue(review, issueIndex, decision)
                    }
                    onReview={review}
                  />
                ) : null}
                {dossierView === 'share' && (state.spec || state.capability) ? (
                  <ShareView
                    canPublish={
                      memoryRevision > 0 &&
                      Boolean(state.runId) &&
                      state.approved &&
                      reviewGateReady(state)
                    }
                    error={publishError}
                    publishing={publishing}
                    shareMessage={shareMessage}
                    shareUrl={shareUrl}
                    publicationExists={Boolean(state.capability)}
                    hasPersistedRun={Boolean(state.runId)}
                    signedIn={Boolean(
                      session.data?.session.activeOrganizationId,
                    )}
                    onCopy={copyLink}
                    onPublish={publish}
                    onRevoke={revoke}
                  />
                ) : null}
              </div>
              {state.spec && dossierView !== 'journey' ? (
                <EvidenceInspector
                  open={inspectorOpen}
                  profile={state.runProfile ?? state.profile}
                  selectedClaimId={selectedClaimId}
                  spec={state.spec}
                  onClose={() => {
                    setInspectorOpen(false);
                    setSelectedClaimId('');
                  }}
                />
              ) : dossierView === 'brief' ? (
                <aside className="brief-context" aria-label="Prochaine étape">
                  <p className="section-label">Prochaine action</p>
                  <h2>Générer la première page</h2>
                  <p>
                    Seules les affirmations appuyées par une preuve admissible
                    peuvent apparaître dans la page.
                  </p>
                </aside>
              ) : null}
            </div>
          </>
        ) : null}

        {primaryView === 'memory' ? (
          <CareerMemoryView
            error={memoryError}
            memoryDraft={memoryDraft}
            dirty={JSON.stringify(state.profile) !== savedProfileJson}
            signedIn={Boolean(activeTenantId)}
            syncing={memorySyncing}
            syncMessage={memorySyncMessage}
            profile={state.profile}
            onAdd={addMemory}
            onDraftChange={setMemoryDraft}
            onSave={() => void saveCareerMemory()}
            onProfileChange={(profile) =>
              setState((current) => ({
                ...current,
                profile,
                spec: undefined,
                runId: undefined,
                runProfile: undefined,
                reviews: [],
                reviewDecisions: [],
                publicationEligible: undefined,
                approved: false,
              }))
            }
          />
        ) : null}
        {primaryView === 'activity' ? (
          <ActivityView
            events={state.events}
            paused={state.paused}
            reviews={state.reviews}
            decisions={state.reviewDecisions}
            onOpenReview={() => {
              setDossierView('review');
              setPrimaryView('applications');
            }}
          />
        ) : null}
        {primaryView === 'settings' ? (
          <SettingsView
            onExport={exportData}
            onReset={() => {
              if (
                confirm(
                  'Réinitialiser cette démo locale ? Les pages et changements de mémoire seront supprimés.',
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

function HomeView({
  capability,
  decisions,
  events,
  onOpenApplication,
  onOpenMemory,
  opportunity,
  profile,
  reviews,
  spec,
  status,
}: {
  capability?: string;
  decisions?: ReviewDecision[];
  events: WorkflowEvent[];
  onOpenApplication: (view: DossierView) => void;
  onOpenMemory: () => void;
  opportunity: Opportunity;
  profile: Profile;
  reviews: WorkspaceReview[];
  spec?: PageSpec;
  status: string;
}) {
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const verified = profile.claims.filter(
    (claim) => claim.level === 'verified',
  ).length;
  const coverage = profile.claims.length
    ? Math.round((verified / profile.claims.length) * 100)
    : 0;
  const findings = unresolvedReviewIssues(reviews, decisions);
  const nextView: DossierView = spec
    ? capability
      ? 'share'
      : reviews.length
        ? 'review'
        : 'journey'
    : 'brief';
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? [
        {
          id: 'opportunity',
          label: `${opportunity.company} · ${opportunity.role}`,
          meta: 'Candidature',
          open: () => onOpenApplication(nextView),
        },
        ...profile.claims.map((claim) => ({
          id: claim.id,
          label: claim.statement,
          meta: `Affirmation ${levelLabel(claim.level).toLowerCase()}`,
          open: onOpenMemory,
        })),
        ...profile.sources.map((source) => ({
          id: source.id,
          label: source.title,
          meta: `Source ${source.kind}`,
          open: onOpenMemory,
        })),
      ]
        .filter((item) =>
          `${item.label} ${item.meta}`.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 5)
    : [];

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  return (
    <div className="home-view">
      <header className="home-topbar">
        <div className="search-shell">
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Rechercher dans l’espace"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && searchResults[0]) {
                  searchResults[0].open();
                  setQuery('');
                }
              }}
              placeholder="Chercher une preuve, une entreprise, une affirmation…"
              ref={searchInput}
              type="search"
              value={query}
            />
            <kbd>⌘K</kbd>
          </label>
          {normalizedQuery ? (
            <div className="search-results" aria-label="Résultats de recherche">
              {searchResults.length ? (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      result.open();
                      setQuery('');
                    }}
                  >
                    <span>{result.label}</span>
                    <small>{result.meta}</small>
                  </button>
                ))
              ) : (
                <p>Aucune preuve, source ou candidature correspondante.</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="home-account">
          <button onClick={() => onOpenApplication('brief')}>
            Coller une offre
          </button>
          <button
            className="header-icon"
            aria-label="Aide, bientôt disponible"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            ?
          </button>
          <button
            className="header-icon notification"
            aria-label="Notifications, bientôt disponibles"
            disabled
            title="Bientôt disponible"
            type="button"
          >
            <span aria-hidden="true">♢</span>
          </button>
          <div className="header-person">
            <span className="rail-avatar" aria-hidden="true">
              {profile.name.charAt(0)}
            </span>
            <span>
              <strong>{profile.name}</strong>
              <small>Ingénieur plateforme</small>
            </span>
          </div>
        </div>
      </header>

      <div className="home-grid">
        <div className="home-main">
          <section className="decision-hero">
            <p>
              {spec ? 'Action requise' : 'Prochaine candidature'} ·{' '}
              {opportunity.company}
            </p>
            <h1>
              {spec
                ? reviews.length
                  ? findings.length
                    ? `${findings.length} décision${findings.length > 1 ? 's' : ''} à trancher avant d’envoyer votre page privée.`
                    : 'Votre candidature est prête pour validation.'
                  : 'Votre candidature est prête pour une revue humaine.'
                : 'Construisez une candidature qui ne promet que ce que vos preuves démontrent.'}
            </h1>
            <span>
              {spec
                ? `La passe d’agents est terminée. ${status}.`
                : 'Partez du poste, confrontez-le à vos preuves, puis gardez la décision finale.'}
            </span>
            <div>
              <button onClick={() => onOpenApplication(nextView)}>
                {spec ? 'Ouvrir la revue' : 'Commencer par l’offre'} <b>→</b>
              </button>
              {spec ? (
                <button
                  className="hero-secondary"
                  onClick={() => onOpenApplication('journey')}
                >
                  Voir le run
                </button>
              ) : null}
            </div>
          </section>

          {findings.length ? (
            <section className="home-pipeline decision-queue">
              <header>
                <div>
                  <h2>À trancher maintenant</h2>
                  <span>
                    Chaque point doit être corrigé ou explicitement assumé.
                  </span>
                </div>
              </header>
              {findings.slice(0, 3).map(({ issue, review, issueIndex }) => (
                <article
                  key={`${review.reviewId ?? review.reviewer}:${issueIndex}`}
                >
                  <span className="decision-icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>{reviewerLabel(review.reviewer)}</strong>
                    <p>{issue.message}</p>
                    <small>{sectionLabel(issue.section)}</small>
                  </div>
                  <button onClick={() => onOpenApplication('review')}>
                    Trancher
                  </button>
                </article>
              ))}
            </section>
          ) : null}

          <section className="home-stats" aria-label="Résumé de l’espace">
            <article>
              <span className="metric-icon">▣</span>
              <div>
                <small>Candidatures</small>
                <strong>1 active</strong>
              </div>
            </article>
            <article>
              <span className="metric-icon green">✓</span>
              <div>
                <small>Affirmations</small>
                <strong>
                  {verified} / {profile.claims.length} sourcées
                </strong>
              </div>
            </article>
            <article>
              <span className="metric-icon amber">↗</span>
              <div>
                <small>Liens privés</small>
                <strong>{capability ? '1 actif' : 'Aucun actif'}</strong>
              </div>
            </article>
          </section>

          <section className="home-pipeline">
            <header>
              <div>
                <h2>Pipeline</h2>
                <span>Chaque candidature et sa prochaine action concrète.</span>
              </div>
              <button
                className="round-action quiet"
                onClick={() => onOpenApplication(nextView)}
                aria-label="Ouvrir la candidature"
              >
                →
              </button>
            </header>
            <div className="pipeline-head" aria-hidden="true">
              <span>Poste</span>
              <span>Étape</span>
              <span>Preuves</span>
              <span>Prochaine action</span>
            </div>
            <button
              className="pipeline-row"
              onClick={() => onOpenApplication(nextView)}
            >
              <span className="company-mark compact" aria-hidden="true">
                {opportunity.company.charAt(0)}
              </span>
              <span>
                <strong>{opportunity.role}</strong>
                <small>{opportunity.company}</small>
              </span>
              <span className="status-label">{status}</span>
              <span>
                {spec
                  ? `${profile.claims.filter((claim) => claim.level === 'verified').length} vérifiée`
                  : 'À sélectionner'}
              </span>
              <b>
                {spec ? (findings.length ? 'Trancher' : 'Valider') : 'Lancer'} →
              </b>
            </button>
          </section>
        </div>

        <aside className="home-insights">
          <section className="interview-card">
            <header>
              <h2>Entretiens à venir</h2>
            </header>
            <div className="home-empty-state">
              <strong>Aucun entretien planifié</strong>
              <span>
                La préparation apparaîtra ici dès qu’un entretien sera ajouté.
              </span>
            </div>
          </section>
          <section>
            <header>
              <h2>Mémoire pro</h2>
              <button onClick={onOpenMemory} aria-label="Ouvrir la mémoire pro">
                ···
              </button>
            </header>
            <div
              className="coverage-ring"
              style={{ '--coverage': `${coverage}%` } as React.CSSProperties}
            >
              <strong>{coverage}%</strong>
              <span>sourcé</span>
            </div>
            <dl>
              <div>
                <dt>Sources importées</dt>
                <dd>{profile.sources.length}</dd>
              </div>
              <div>
                <dt>Affirmations vérifiées</dt>
                <dd>{verified}</dd>
              </div>
              <div>
                <dt>Sans source</dt>
                <dd>{profile.claims.length - verified}</dd>
              </div>
            </dl>
          </section>
          <section className="home-activity-card">
            <header>
              <h2>Activité</h2>
            </header>
            {events.length ? (
              events
                .slice(-3)
                .reverse()
                .map((event, index) => (
                  <article key={`${event.actor}-${index}`}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      <strong>{deliverableLabel(event)}</strong>
                      <small>{event.actor.replaceAll('-', ' ')}</small>
                    </div>
                  </article>
                ))
            ) : (
              <div className="home-empty-state">
                <strong>Aucun run pour le moment</strong>
                <span>Les dernières actions vérifiées apparaîtront ici.</span>
              </div>
            )}
            {capability ? <small>Un lien privé est actif.</small> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ApplicationsView({
  capability,
  decisions,
  onOpen,
  opportunity,
  profile,
  reviews,
  spec,
  status,
}: {
  capability?: string;
  decisions?: ReviewDecision[];
  onOpen: (view: DossierView) => void;
  opportunity: Opportunity;
  profile: Profile;
  reviews: WorkspaceReview[];
  spec?: PageSpec;
  status: string;
}) {
  const [layout, setLayout] = useState<'list' | 'kanban'>('kanban');
  const findings = unresolvedReviewIssues(reviews, decisions).length;
  const nextView: DossierView = spec
    ? capability
      ? 'share'
      : reviews.length
        ? 'review'
        : 'journey'
    : 'brief';
  const stage = !spec
    ? 'Brouillon'
    : reviews.length
      ? 'À valider'
      : 'Brouillon';
  const columns = ['Brouillon', 'À valider', 'Envoyée', 'Entretien'] as const;
  const evidenceCount = spec
    ? new Set(
        spec.blocks.flatMap((block) =>
          'claimIds' in block ? block.claimIds : [],
        ),
      ).size
    : 0;

  const card = (
    <button
      className="application-card"
      onClick={() => onOpen(nextView)}
      aria-label={`Ouvrir la candidature ${opportunity.company}`}
    >
      <span className="company-mark" aria-hidden="true">
        {opportunity.company.charAt(0)}
      </span>
      <span className="application-card-copy">
        <strong>{opportunity.role}</strong>
        <small>{opportunity.company}</small>
      </span>
      <span className="status-label">{status}</span>
      <span className="application-card-meta">
        {evidenceCount
          ? `${evidenceCount} sur ${profile.claims.length} affirmations retenues`
          : `${profile.claims.length} affirmations disponibles`}
      </span>
      <b>
        {findings
          ? `${findings} décision${findings > 1 ? 's' : ''} à trancher`
          : spec
            ? 'Ouvrir la candidature'
            : 'Compléter l’offre'}{' '}
        →
      </b>
    </button>
  );

  return (
    <div className="standalone-view applications-view">
      <header className="applications-header">
        <div>
          <p className="section-label">Espace</p>
          <h1>Candidatures</h1>
          <p>Une prochaine action claire pour chaque poste.</p>
        </div>
        <div className="applications-actions">
          <div
            className="layout-switch"
            aria-label="Disposition des candidatures"
          >
            <button
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              Liste
            </button>
            <button
              aria-pressed={layout === 'kanban'}
              onClick={() => setLayout('kanban')}
            >
              Kanban
            </button>
            <button
              disabled
              title="La vue calendrier n’est pas encore disponible"
            >
              Calendrier
            </button>
          </div>
          <button onClick={() => onOpen('brief')}>Coller une offre</button>
        </div>
      </header>

      <section className="applications-toolbar" aria-label="Vues enregistrées">
        <strong className="active">
          Toutes les candidatures <span>1</span>
        </strong>
        <span>Synchronisé avec l’espace actif</span>
      </section>

      {layout === 'kanban' ? (
        <div className="applications-board">
          {columns.map((column) => (
            <section className="application-column" key={column}>
              <header>
                <h2>{column}</h2>
                <span>{stage === column ? 1 : 0}</span>
              </header>
              {stage === column ? (
                card
              ) : (
                <div className="empty-column">
                  Aucune candidature à cette étape
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <section
          className="applications-list"
          aria-label="Liste des candidatures"
        >
          <div className="applications-list-head" aria-hidden="true">
            <span>Poste</span>
            <span>Étape</span>
            <span>Preuves</span>
            <span>Prochaine action</span>
          </div>
          {card}
        </section>
      )}
    </div>
  );
}

function JourneyView({
  approved,
  onGenerate,
  onOpenBrief,
  onOpenDraft,
  onOpenEvidence,
  onReview,
  opportunity,
  profile,
  reviews,
  spec,
}: {
  approved: boolean;
  onGenerate: () => void;
  onOpenBrief: () => void;
  onOpenDraft: () => void;
  onOpenEvidence: (claimId: string) => void;
  onReview: () => void;
  opportunity: Opportunity;
  profile: Profile;
  reviews: Review[];
  spec?: PageSpec;
}) {
  const usedClaimIds = new Set(
    spec?.blocks.flatMap((block) =>
      'claimIds' in block ? block.claimIds : [],
    ) ?? [],
  );
  const usedClaims = profile.claims.filter((claim) =>
    usedClaimIds.has(claim.id),
  );
  const sourced = usedClaims.filter((claim) => claim.evidenceIds.length);
  const reviewed = reviews.length === 3;

  return (
    <div className="journey-view">
      <section className="journey-summary" aria-label="État du parcours">
        <span className="summary-state">
          <b>{spec ? '✓' : '○'}</b>
          {spec ? 'Passe terminée' : 'Prêt à démarrer'}
        </span>
        <span>
          Preuves retenues <strong>{usedClaims.length}</strong>
        </span>
        <span>
          Affirmations sourcées{' '}
          <strong>
            {sourced.length} / {usedClaims.length || 0}
          </strong>
        </span>
        <span className="journey-people">4 agents · 1 humain</span>
      </section>

      <section className="journey-board" aria-label="Parcours de candidature">
        <JourneyColumn number="1" state="complete" title="Lecture de l’offre">
          <JourneyCard icon="↗" status={spec ? 'Terminé' : 'Prêt'}>
            <strong>Offre importée</strong>
            <p>{opportunity.role}</p>
            <small>{opportunity.description.length} caractères analysés</small>
            <button className="text-action" onClick={onOpenBrief}>
              Ouvrir l’offre
            </button>
          </JourneyCard>
          <JourneyCard icon="⌕" status={spec ? 'Terminé' : 'En attente'}>
            <strong>Entreprise analysée</strong>
            <p>{opportunity.company}</p>
            <small>Chaque information reste rattachée à sa source.</small>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="2"
          state={spec ? 'complete' : 'idle'}
          title="Appariement"
        >
          <JourneyCard icon="⌁" status={spec ? 'Terminé' : 'Non démarré'}>
            <strong>{usedClaims.length} expériences retenues</strong>
            {usedClaims.slice(0, 3).map((claim) => (
              <button
                className="matched-claim"
                key={claim.id}
                onClick={() => onOpenEvidence(claim.id)}
              >
                <span>{claim.statement}</span>
                <small>{claim.level}</small>
              </button>
            ))}
            {!spec ? (
              <button onClick={onGenerate}>Générer la candidature</button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="3"
          state={approved ? 'complete' : spec ? 'attention' : 'idle'}
          title="Vérification"
        >
          <JourneyCard
            dark={Boolean(spec && !approved)}
            icon="!"
            status={
              approved ? 'Validé' : spec ? 'Décision humaine' : 'En attente'
            }
          >
            <strong>
              {reviewed
                ? 'Trois vérifications terminées'
                : spec
                  ? 'Une décision humaine est requise'
                  : 'Rien à vérifier pour le moment'}
            </strong>
            <p>
              {reviewed
                ? `${reviews.filter((item) => item.passed).length} / 3 vérifications validées.`
                : 'Les agents proposent. Vous décidez de ce qui devient public.'}
            </p>
            {spec ? <button onClick={onReview}>Ouvrir la revue</button> : null}
          </JourneyCard>
          <JourneyCard icon="✓" status={sourced.length ? 'Prêt' : 'En attente'}>
            <strong>{sourced.length} affirmations sourcées</strong>
            <p>Chaque affirmation garde un chemin vers sa preuve.</p>
          </JourneyCard>
        </JourneyColumn>

        <JourneyColumn
          number="4"
          state={approved ? 'complete' : spec ? 'attention' : 'idle'}
          title="Page privée"
        >
          <JourneyCard
            icon="□"
            status={approved ? 'Validée' : spec ? 'Brouillon' : 'En attente'}
          >
            <strong>{spec?.blocks.length ?? 0} sections prêtes</strong>
            {spec?.blocks.map((block, index) => (
              <button
                className="page-section-row"
                key={`${block.type}-${index}`}
                onClick={onOpenDraft}
              >
                <span>{block.title}</span>
                <small>{approved ? '✓' : 'À relire'}</small>
              </button>
            ))}
            {spec ? (
              <button className="text-action" onClick={onOpenDraft}>
                Prévisualiser la page
              </button>
            ) : null}
          </JourneyCard>
        </JourneyColumn>
      </section>

      <section className="journey-evidence">
        <header>
          <div>
            <h2>Preuves mobilisées</h2>
            <span>
              {usedClaims.length} dans cette candidature ·{' '}
              {profile.claims.length} disponibles dans la mémoire pro
            </span>
          </div>
        </header>
        {usedClaims.length ? (
          <div
            className="evidence-table"
            role="table"
            aria-label="Preuves mobilisées dans cette candidature"
          >
            <div className="evidence-table-head" role="row">
              <span role="columnheader">Preuve</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Rattachée à</span>
              <span role="columnheader">Statut</span>
              <span role="columnheader">Action</span>
            </div>
            {usedClaims.map((claim) => {
              const evidence = profile.evidence.find((item) =>
                claim.evidenceIds.includes(item.id),
              );
              const source = profile.sources.find(
                (item) => item.id === evidence?.sourceId,
              );
              return (
                <div className="evidence-table-row" role="row" key={claim.id}>
                  <strong role="cell">{claim.statement}</strong>
                  <code role="cell">
                    {source?.title ?? 'Aucune source rattachée'}
                  </code>
                  <span role="cell">Page privée</span>
                  <span
                    className={evidence ? 'verified-pill' : 'missing-pill'}
                    role="cell"
                  >
                    {evidence ? 'Vérifiée' : 'Non sourcée'}
                  </span>
                  <span role="cell">
                    <button onClick={() => onOpenEvidence(claim.id)}>
                      Ouvrir
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="journey-empty">
            Générez la candidature pour voir les preuves retenues pour ce poste.
          </p>
        )}
      </section>
    </div>
  );
}

function JourneyColumn({
  children,
  number,
  state,
  title,
}: {
  children: React.ReactNode;
  number: string;
  state: 'complete' | 'attention' | 'idle';
  title: string;
}) {
  return (
    <section className="journey-column">
      <header>
        <span className={state}>{number}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function JourneyCard({
  children,
  dark = false,
  icon,
  status,
}: {
  children: React.ReactNode;
  dark?: boolean;
  icon: string;
  status: string;
}) {
  return (
    <article className={`journey-card ${dark ? 'dark' : ''}`}>
      <header>
        <span aria-hidden="true">{icon}</span>
        <small>{status}</small>
      </header>
      {children}
    </article>
  );
}

function CompanyView({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section className="document company-document">
      <header className="document-heading">
        <p className="section-label">Entreprise</p>
        <h2>{opportunity.company}</h2>
        <p>
          Le contexte utilisé par les agents reste séparé des preuves sur votre
          parcours.
        </p>
      </header>
      <dl className="company-facts">
        <div>
          <dt>Poste ciblé</dt>
          <dd>{opportunity.role}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {opportunity.url ? 'URL de l’offre' : 'Brief saisi manuellement'}
          </dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>À confronter aux preuves</dd>
        </div>
      </dl>
      <section className="company-context">
        <span>Contexte reçu</span>
        <p>{opportunity.description}</p>
      </section>
      {opportunity.url ? (
        <a
          className="company-source"
          href={opportunity.url}
          rel="noreferrer"
          target="_blank"
        >
          Consulter l’offre source ↗
        </a>
      ) : null}
      <p className="document-note">
        Le contenu de l’offre est traité comme une donnée non fiable. Aucune
        affirmation sur votre profil n’en est déduite sans preuve.
      </p>
    </section>
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
        <p className="section-label">Offre</p>
        <h2 id="brief-title">Que doit démontrer cette candidature ?</h2>
        <p>
          Ajoutez le contexte du poste. La page ne retiendra que les preuves qui
          le soutiennent réellement.
        </p>
      </header>
      <div className="field-grid">
        <label>
          Entreprise
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
          Poste
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
        Description du poste
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
          URL de l’offre{' '}
          <span>Facultative, conservée comme donnée non fiable</span>
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
          Couleur <span>Décorative uniquement</span>
          <input
            aria-label="Couleur de l’entreprise"
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
          <strong>Page non générée</strong>
          <p>{error}</p>
        </div>
      ) : null}
      <div className="document-actions">
        <p>Le brief est enregistré localement pendant la saisie.</p>
        <button disabled={generating} onClick={onGenerate}>
          {generating
            ? 'Génération de la page…'
            : error
              ? 'Réessayer'
              : hasDraft
                ? 'Régénérer la page'
                : 'Générer la page'}
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
        <span>Brouillon · Appuyé par des preuves</span>
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
                    <small>{levelLabel(claim.level)} · Voir la preuve</small>
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
      aria-label="Inspecteur de preuves"
    >
      <header>
        <div>
          <p className="section-label">Preuves</p>
          <h2>Pourquoi ces affirmations ?</h2>
        </div>
        <button
          className="inspector-close quiet"
          onClick={onClose}
          aria-label="Fermer l’inspecteur de preuves"
        >
          Fermer
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
  canRerun,
  decisionError,
  decisionMessage,
  decisionPending,
  decisions,
  onApprove,
  onContinue,
  onDecide,
  onReview,
  paused,
  publicationEligible,
  reviews,
}: {
  approved: boolean;
  canRerun: boolean;
  decisionError: string;
  decisionMessage: string;
  decisionPending: string;
  decisions?: ReviewDecision[];
  onApprove: (approved: boolean) => void;
  onContinue: () => void;
  onDecide: (
    review: WorkspaceReview,
    issueIndex: number,
    decision: ReviewDecision['decision'],
  ) => void;
  onReview: () => void;
  paused: boolean;
  publicationEligible: boolean;
  reviews: WorkspaceReview[];
}) {
  const ready =
    reviews.length === 3 &&
    (publicationEligible || reviews.every((item) => item.passed));
  return (
    <section className="document review-document">
      <header className="document-heading">
        <p className="section-label">Revue</p>
        <h2>Confirmer la pertinence et les preuves</h2>
        <p>
          Corrigez une objection ou assumez-la explicitement. Un point factuel
          doit toujours être corrigé.
        </p>
      </header>
      {decisionError ? <p role="alert">{decisionError}</p> : null}
      {decisionMessage ? <p role="status">{decisionMessage}</p> : null}
      <div className="review-list">
        {reviews.map((item) => {
          const issues = item.issues ?? [];
          const unresolved = issues.some(
            (_, issueIndex) =>
              !decisions?.some(
                (decision) =>
                  decision.reviewId === item.reviewId &&
                  decision.issueIndex === issueIndex,
              ),
          );
          const kept = !item.passed && issues.length > 0 && !unresolved;
          return (
            <article className="review-card" key={item.reviewer}>
              <header>
                <div>
                  <strong>{reviewerLabel(item.reviewer)}</strong>
                  <small>
                    {item.passed
                      ? 'Aucun blocage détecté.'
                      : `${item.findings.length} point${item.findings.length > 1 ? 's' : ''} à examiner.`}
                  </small>
                </div>
                <span className={item.passed || kept ? 'passed' : 'blocked'}>
                  {item.passed ? 'Validé' : kept ? 'Assumé' : 'À trancher'}
                </span>
              </header>
              {issues.map((issue, issueIndex) => {
                const choice = decisions?.find(
                  (decision) =>
                    decision.reviewId === item.reviewId &&
                    decision.issueIndex === issueIndex,
                );
                const issueKey = `${item.reviewId}:${issueIndex}`;
                return (
                  <section className="review-issue" key={issueKey}>
                    <p>{issue.message}</p>
                    <small>{sectionLabel(issue.section)}</small>
                    {choice ? (
                      <span className="decision-recorded">
                        Version gardée · décision enregistrée
                      </span>
                    ) : (
                      <div className="review-actions">
                        <button
                          disabled={Boolean(decisionPending)}
                          onClick={() => onDecide(item, issueIndex, 'correct')}
                        >
                          Corriger
                        </button>
                        {item.reviewer !== 'factuality' ? (
                          <button
                            className="quiet"
                            disabled={Boolean(decisionPending)}
                            onClick={() => onDecide(item, issueIndex, 'keep')}
                          >
                            Garder cette version
                          </button>
                        ) : (
                          <small className="decision-policy">
                            Une affirmation factuelle ne peut pas être conservée
                            sans correction.
                          </small>
                        )}
                        {decisionPending === issueKey ? (
                          <small className="decision-saving" role="status">
                            Enregistrement de votre décision…
                          </small>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })}
              {!item.passed && !issues.length ? (
                <p className="review-legacy-note">
                  {item.findings.join(' ')} Cette ancienne revue doit être
                  régénérée pour devenir actionnable.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {canRerun ? (
        <button className="quiet" disabled={paused} onClick={onReview}>
          Relancer la revue
        </button>
      ) : null}
      <label className="approval">
        <input
          checked={approved}
          disabled={!ready}
          onChange={(event) => onApprove(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Valider cette candidature</strong>
          J’ai vérifié les preuves et je valide cette candidature.
        </span>
      </label>
      <div className="document-actions">
        <p>
          {ready
            ? 'Les contrôles et vos décisions autorisent la validation.'
            : 'Résolvez d’abord les blocages de la revue.'}
        </p>
        <button disabled={!approved} onClick={onContinue}>
          Continuer vers le partage
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
  hasPersistedRun,
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
  hasPersistedRun: boolean;
  signedIn: boolean;
}) {
  return (
    <section className="document share-document">
      <header className="document-heading">
        <p className="section-label">Partage</p>
        <h2>Un lien privé, sous votre contrôle</h2>
        <p>
          Le lien expire après 7 jours. Il ouvre uniquement cette candidature et
          peut être révoqué à tout moment.
        </p>
      </header>
      {shareUrl ? (
        <div className="share-result" role="status" aria-live="polite">
          <span className="passed">Actif · Expire dans 7 jours</span>
          <code translate="no">{shareUrl}</code>
          <div className="share-actions">
            <button onClick={onCopy}>Copier le lien privé</button>
            <a href={shareUrl}>Ouvrir la page privée</a>
            <button className="danger-link" onClick={onRevoke}>
              Révoquer le lien privé
            </button>
          </div>
        </div>
      ) : (
        <div className="share-empty">
          <strong>Non partagée</strong>
          <p>Créez le lien uniquement lorsque la page relue est prête.</p>
        </div>
      )}
      {error ? (
        <div className="inline-error" role="alert">
          <strong>Lien privé non créé</strong>
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
              ? 'Le lien existant est masqué sur cet appareil. Le remplacer invalidera tous les anciens liens.'
              : !hasPersistedRun
                ? 'Connectez-vous, puis relancez la génération pour enregistrer cette candidature avant de la partager.'
                : 'La mémoire enregistrée, votre validation et trois contrôles réussis sont requis.'}
          </p>
          {!signedIn ? (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour{' '}
              {publicationExists ? 'gérer le lien' : 'créer le lien'}
            </Link>
          ) : publicationExists ? (
            <div className="share-actions">
              {hasPersistedRun ? (
                <button
                  disabled={!canPublish || publishing}
                  onClick={onPublish}
                >
                  {publishing
                    ? 'Remplacement du lien…'
                    : 'Remplacer le lien privé'}
                </button>
              ) : null}
              <button className="danger-link" onClick={onRevoke}>
                Révoquer tous les liens
              </button>
            </div>
          ) : (
            <button disabled={!canPublish || publishing} onClick={onPublish}>
              {publishing ? 'Création du lien privé…' : 'Créer le lien privé'}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CareerMemoryView({
  dirty,
  error,
  memoryDraft,
  onAdd,
  onDraftChange,
  onProfileChange,
  onSave,
  profile,
  signedIn,
  syncing,
  syncMessage,
}: {
  dirty: boolean;
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
  onSave: () => void;
  profile: Profile;
  signedIn: boolean;
  syncing: boolean;
  syncMessage: string;
}) {
  return (
    <div className="standalone-view">
      <header className="view-header">
        <div>
          <p className="section-label">Mémoire pro</p>
          <h1>Mémoire professionnelle</h1>
          <p>Chaque affirmation reste reliée à sa source et à sa preuve.</p>
        </div>
        <div className="memory-header-actions">
          <div
            className="memory-counts"
            aria-label="Totaux de la mémoire professionnelle"
          >
            <span>{profile.sources.length} sources</span>
            <span>{profile.claims.length} affirmations</span>
            <span>{profile.evidence.length} preuves</span>
          </div>
          {signedIn ? (
            <button disabled={!dirty || syncing} onClick={onSave}>
              {syncing
                ? 'Enregistrement…'
                : dirty
                  ? 'Enregistrer'
                  : 'Enregistré'}
            </button>
          ) : (
            <Link className="button-link" href="/sign-in?next=/">
              Se connecter pour enregistrer
            </Link>
          )}
        </div>
      </header>
      {syncMessage ? (
        <p className="memory-sync-message" role="status">
          {syncMessage}
        </p>
      ) : null}
      <div className="memory-layout">
        <section className="document memory-profile">
          <div className="memory-sources-list">
            <div className="list-heading">
              <h2>Sources</h2>
              <span>{profile.sources.length}</span>
            </div>
            {profile.sources.map((source) => (
              <article key={source.id}>
                <span aria-hidden="true">▤</span>
                <div>
                  <strong>{source.title}</strong>
                  <small>{source.kind}</small>
                </div>
              </article>
            ))}
          </div>
          <h2>Profil</h2>
          <label>
            Nom
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
            Positionnement
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
            <summary>Ajouter une affirmation</summary>
            <label>
              Titre de la source
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
              Affirmation
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
              Niveau de preuve
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
                <option value="declared">Déclarée</option>
                <option value="inferred">Inférée</option>
                <option value="verified">Vérifiée</option>
              </select>
            </label>
            <label>
              Extrait de preuve
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
            <button onClick={onAdd}>Ajouter</button>
          </details>
        </section>
        <section className="statement-list" aria-labelledby="statements-title">
          <div className="list-heading">
            <h2 id="statements-title">Affirmations</h2>
            <span>{profile.claims.length}</span>
          </div>
          {profile.claims.map((claim) => (
            <article key={claim.id}>
              <div>
                <span>{levelLabel(claim.level)}</span>
                <small>
                  {claim.evidenceIds.length
                    ? `${claim.evidenceIds.length} preuve`
                    : 'Aucune preuve rattachée'}
                </small>
              </div>
              <label>
                Affirmation
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
        <aside className="memory-audit">
          <section>
            <p className="section-label">Complétude</p>
            <strong>
              {profile.claims.length
                ? Math.round(
                    (profile.claims.filter(
                      (claim) => claim.level === 'verified',
                    ).length /
                      profile.claims.length) *
                      100,
                  )
                : 0}
              %
            </strong>
            <span>des affirmations sont vérifiées</span>
          </section>
          <section>
            <p className="section-label">À corriger</p>
            <strong>
              {
                profile.claims.filter((claim) => !claim.evidenceIds.length)
                  .length
              }
            </strong>
            <span>affirmations sans preuve</span>
          </section>
          <section>
            <p className="section-label">Confidentialité</p>
            <dl>
              <div>
                <dt>Sensibilité par défaut</dt>
                <dd>Privé</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>Validation explicite</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ActivityView({
  decisions,
  events,
  onOpenReview,
  paused,
  reviews,
}: {
  decisions?: ReviewDecision[];
  events: WorkflowEvent[];
  onOpenReview: () => void;
  paused: boolean;
  reviews: WorkspaceReview[];
}) {
  const deliverables = events.filter((event) => event.artifact);
  const findings = unresolvedReviewIssues(reviews, decisions);
  return (
    <div className="standalone-view run-review-view">
      <header className="view-header">
        <div>
          <p className="section-label">Run d’agents · revue humaine</p>
          <h1>Revue avant publication</h1>
          <p>
            Étapes, entrées, sorties et décisions. Jamais de chaîne de pensée.
          </p>
        </div>
      </header>
      {events.length ? (
        <div className="run-review-layout">
          <section
            className="run-timeline"
            aria-label="Étapes terminées du run"
          >
            <header>
              <div>
                <span className="status-label">
                  {paused ? 'Mis en pause' : 'En attente de l’humain'}
                </span>
                <strong>{events.length} événements enregistrés</strong>
              </div>
            </header>
            {deliverables.map((event, index) => (
              <article key={`${event.actor}-${index}`}>
                <span className="timeline-check" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <strong>{deliverableLabel(event)}</strong>
                  <p>{event.action}</p>
                  <small>{event.actor.replaceAll('-', ' ')}</small>
                </div>
                <code>{event.artifact}</code>
              </article>
            ))}
            <details>
              <summary>Métadonnées techniques</summary>
              <small>
                Événements du run et identifiants d’artefacts uniquement.
              </small>
              {events.map((event, index) => (
                <code key={`${event.actor}-${index}`} translate="no">
                  {String(index + 1).padStart(2, '0')} · {event.actor} ·{' '}
                  {event.action} · {event.artifact ?? 'no-artifact'} · €
                  {(event.costMicros / 1_000_000).toFixed(2)}
                </code>
              ))}
            </details>
          </section>
          <aside className="human-review-panel">
            <header>
              <div>
                <p className="section-label">Avant publication</p>
                <h2>Revue humaine</h2>
              </div>
              <span>{findings.length} points à trancher</span>
            </header>
            {reviews.map((review) => {
              const reviewFindings = findings.filter(
                (finding) => finding.review.reviewer === review.reviewer,
              );
              return (
                <article key={review.reviewer}>
                  <span className={review.passed ? 'passed' : 'blocked'}>
                    {review.passed
                      ? 'Validé'
                      : reviewFindings.length
                        ? 'Décision requise'
                        : 'Décision enregistrée'}
                  </span>
                  <strong>{reviewerLabel(review.reviewer)}</strong>
                  <p>
                    {reviewFindings
                      .map((finding) => finding.issue.message)
                      .join(' ') ||
                      (review.passed
                        ? 'Aucun blocage détecté.'
                        : 'Tous les points ont été explicitement tranchés.')}
                  </p>
                </article>
              );
            })}
            {!reviews.length ? (
              <div className="review-placeholder">
                <strong>Aucune revue</strong>
                <p>Générez une candidature pour créer la première revue.</p>
              </div>
            ) : null}
            <button disabled={!reviews.length} onClick={onOpenReview}>
              Ouvrir la revue de candidature
            </button>
            <details>
              <summary>Contrats techniques des agents</summary>
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
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <h2>Aucun run</h2>
          <p>Générez une candidature pour créer le premier journal.</p>
        </div>
      )}
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
          <p className="section-label">Réglages</p>
          <h1>Espace local</h1>
          <p>
            Exportez ou réinitialisez les données de démonstration de ce
            navigateur.
          </p>
        </div>
      </header>
      <section className="settings-row">
        <div>
          <h2>Exporter toutes les données</h2>
          <p>
            Téléchargez le profil, la candidature, les revues et l’activité.
          </p>
        </div>
        <button onClick={onExport}>Export JSON</button>
      </section>
      <section className="settings-row danger-zone">
        <div>
          <h2>Réinitialiser la démo locale</h2>
          <p>
            Supprimez les changements locaux et restaurez les données de
            démonstration.
          </p>
        </div>
        <button className="danger-link" onClick={onReset}>
          Réinitialiser
        </button>
      </section>
      <p className="demo-footer">
        Tout le contenu candidat visible est fictif.
      </p>
    </div>
  );
}

function NavIcon({ name }: { name: PrimaryView }) {
  const paths: Record<PrimaryView, React.ReactNode> = {
    home: (
      <>
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    applications: (
      <>
        <rect height="14" rx="2" width="16" x="4" y="6" />
        <path d="M9 6V4h6v2M4 11h16" />
      </>
    ),
    memory: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
        <path d="M8 8h7M8 12h7M8 16h4" />
      </>
    ),
    activity: (
      <>
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="18" cy="18" r="2" />
        <path d="m8 11 8-4M8 13l8 4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}

function levelLabel(level: Profile['claims'][number]['level']) {
  if (level === 'verified') return 'Vérifiée';
  if (level === 'declared') return 'Déclarée';
  return 'Inférée';
}

function reviewerLabel(reviewer: Review['reviewer']) {
  if (reviewer === 'hiring-manager') return 'Pertinence pour le poste';
  if (reviewer === 'factuality') return 'Vérification des preuves';
  return 'Clarté de la candidature';
}

function persistedEvents(run: PersistedRun): WorkflowEvent[] {
  return run.events.map((event) => ({
    actor:
      event.actor === 'human' || event.actor === 'evidence-archivist'
        ? 'system'
        : event.actor,
    action: event.summary,
    artifact: event.artifactId,
    costMicros: event.costMicros,
  }));
}

function reviewGateReady(
  state: Pick<SavedState, 'publicationEligible' | 'reviews'>,
) {
  return (
    state.publicationEligible ??
    (state.reviews.length === 3 &&
      state.reviews.every((review) => review.passed))
  );
}

function unresolvedReviewIssues(
  reviews: WorkspaceReview[],
  decisions: ReviewDecision[] = [],
) {
  const resolved = new Set(
    decisions.map(({ issueIndex, reviewId }) => `${reviewId}:${issueIndex}`),
  );
  return reviews.flatMap((review) => {
    const issues = review.issues?.length
      ? review.issues
      : review.findings.map((message) => ({
          section: '',
          message,
          blocking: false,
        }));
    return issues
      .map((issue, issueIndex) => ({ issue, issueIndex, review }))
      .filter(
        ({ issueIndex }) =>
          !review.reviewId || !resolved.has(`${review.reviewId}:${issueIndex}`),
      );
  });
}

function sectionLabel(section: string) {
  if (section === 'hero.thesis') return 'Ouverture de la page';
  if (section.startsWith('blocks.evidence')) return 'Preuves détaillées';
  return section ? `Section ${section}` : 'Ancienne revue';
}

function deliverableLabel(event: WorkflowEvent) {
  if (event.artifact?.includes('research'))
    return 'Analyse de l’offre terminée';
  if (event.artifact?.includes('strategy'))
    return 'Appariement des preuves terminé';
  if (
    event.artifact?.includes('page-spec') ||
    event.artifact?.includes('page_spec')
  )
    return 'Brouillon terminé';
  if (event.artifact?.includes('review')) return 'Revue terminée';
  return 'Run mis à jour';
}
