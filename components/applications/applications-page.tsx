'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  importOpportunity,
  promoteOpportunityToApplication,
  readApplications,
  readOpportunityDecisions,
  readOpportunities,
  readSearchProfiles,
  saveOpportunityDecision,
} from '@/lib/career-api';
import {
  opportunityImportResponseSchema,
  opportunityListResponseSchema,
  type DiscoveredJob,
} from '@/lib/discovered-job-contract';
import {
  opportunityDecisionListResponseSchema,
  opportunityDecisionMutationResponseSchema,
  type OpportunityDecision,
} from '@/lib/opportunity-decision';
import { searchProfileSchema, type SearchProfile } from '@/lib/search-profile';
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { semanticAnalysisMessages } from '@/lib/i18n/dictionaries/semantic-analysis';
import styles from './applications-page.module.css';
import { SemanticAnalysisPanel } from './semantic-analysis-panel';

type LoadState = 'loading' | 'ready' | 'error';
type IconComponent = ComponentType<{ children: string }>;
type ShellComponent = ComponentType<{
  path: string;
  children: ReactNode;
  sidebarContext?: ReactNode;
  sidebarFooter?: ReactNode;
}>;

export function ApplicationsPage({
  AppShell,
  Icon,
}: {
  AppShell: ShellComponent;
  Icon: IconComponent;
}) {
  const [opportunities, setOpportunities] = useState<DiscoveredJob[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [decisions, setDecisions] = useState<OpportunityDecision[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string>();
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const controller = signal ? undefined : new AbortController();
    const activeSignal = signal ?? controller!.signal;
    try {
      const [
        opportunityResponse,
        applicationResponse,
        decisionResponse,
        searchProfileResponse,
      ] = await Promise.all([
        readOpportunities(activeSignal),
        readApplications(activeSignal),
        readOpportunityDecisions(activeSignal),
        readSearchProfiles(activeSignal),
      ]);
      if (
        !opportunityResponse.ok ||
        !applicationResponse.ok ||
        !decisionResponse.ok ||
        !searchProfileResponse.ok
      )
        throw new Error(
          opportunityResponse.status === 401 ||
            applicationResponse.status === 401 ||
            decisionResponse.status === 401 ||
            searchProfileResponse.status === 401
            ? 'Connectez-vous pour retrouver vos opportunités et candidatures.'
            : 'Impossible de charger cet espace.',
        );
      const opportunityPayload = opportunityListResponseSchema.parse(
        await opportunityResponse.json(),
      );
      const applicationPayload: unknown = await applicationResponse.json();
      const decisionPayload = opportunityDecisionListResponseSchema.parse(
        await decisionResponse.json(),
      );
      const searchProfilePayload: unknown = await searchProfileResponse.json();
      const parsedApplications = applicationSchema
        .array()
        .parse(
          typeof applicationPayload === 'object' &&
            applicationPayload !== null &&
            'applications' in applicationPayload
            ? applicationPayload.applications
            : [],
        );
      setOpportunities(opportunityPayload.opportunities);
      setApplications(parsedApplications);
      setDecisions(decisionPayload.decisions);
      setSearchProfiles(
        searchProfileSchema
          .array()
          .parse(
            typeof searchProfilePayload === 'object' &&
              searchProfilePayload !== null &&
              'searchProfiles' in searchProfilePayload
              ? searchProfilePayload.searchProfiles
              : [],
          ),
      );
      setLoadState('ready');
    } catch (caught) {
      if (!activeSignal.aborted) {
        setLoadState('error');
        setError(
          caught instanceof Error
            ? caught.message
            : 'Impossible de charger cet espace.',
        );
      }
    }
    return () => controller?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  function imported(opportunity: DiscoveredJob) {
    setOpportunities((current) => [
      opportunity,
      ...current.filter(
        (item) => item.opportunityId !== opportunity.opportunityId,
      ),
    ]);
    setImportOpen(false);
  }

  function retry() {
    setLoadState('loading');
    setError(undefined);
    void load();
  }

  function decisionSaved(decision: OpportunityDecision) {
    setDecisions((current) => [
      decision,
      ...current.filter((item) => item.decisionId !== decision.decisionId),
    ]);
  }

  const decisionsByOpportunity = new Map(
    decisions.map((decision) => [decision.opportunityId, decision]),
  );
  const activeOpportunities = opportunities.filter((opportunity) => {
    const disposition = decisionsByOpportunity.get(
      opportunity.opportunityId,
    )?.disposition;
    return disposition !== 'ignored' && disposition !== 'archived';
  });
  const processedOpportunities = opportunities.filter((opportunity) => {
    const disposition = decisionsByOpportunity.get(
      opportunity.opportunityId,
    )?.disposition;
    return disposition === 'ignored' || disposition === 'archived';
  });

  return (
    <AppShell
      path="/applications"
      sidebarContext={
        <div className={styles.sidebarNote}>
          <Icon>source</Icon>
          <strong>Deux états distincts</strong>
          <span>
            Une offre importée reste une opportunité tant que vous ne démarrez
            pas une candidature.
          </span>
        </div>
      }
      sidebarFooter={<></>}
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <p>Pipeline de recherche</p>
            <h1>Candidatures</h1>
            <span>
              Consultez les offres collectées, puis suivez séparément les
              candidatures réellement démarrées.
            </span>
          </div>
          <button
            className="co-button"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            <Icon>add_link</Icon>Coller une offre
          </button>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            <Icon>error</Icon>
            <span>{error}</span>
            <button onClick={retry} type="button">
              Réessayer
            </button>
          </div>
        ) : null}

        <section
          className={styles.workspace}
          aria-label="Opportunités et candidatures"
        >
          <header className={styles.sectionHeader}>
            <div className={styles.sectionIcon}>
              <Icon>travel_explore</Icon>
            </div>
            <div>
              <h2>Opportunités découvertes</h2>
              <p>
                Des offres conservées avec leur source, pas encore transformées
                en candidature.
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label="Chargement des opportunités" />
          ) : activeOpportunities.length ? (
            <div className={styles.opportunityList}>
              {activeOpportunities.map((opportunity) => (
                <OpportunityCard
                  decision={decisionsByOpportunity.get(
                    opportunity.opportunityId,
                  )}
                  Icon={Icon}
                  key={opportunity.opportunityId}
                  onDecisionSaved={decisionSaved}
                  opportunity={opportunity}
                  searchProfiles={searchProfiles}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              action="Coller une offre"
              copy="Ajoutez l’URL d’une annonce pour conserver son contenu et sa provenance."
              Icon={Icon}
              icon="link"
              onAction={() => setImportOpen(true)}
              title="Aucune opportunité enregistrée"
            />
          ) : null}
        </section>

        {loadState === 'ready' && processedOpportunities.length ? (
          <ProcessedOpportunities
            decisionsByOpportunity={decisionsByOpportunity}
            Icon={Icon}
            onDecisionSaved={decisionSaved}
            opportunities={processedOpportunities}
            searchProfiles={searchProfiles}
          />
        ) : null}

        <section
          className={styles.workspace}
          aria-label="Candidatures démarrées"
        >
          <header className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.applicationIcon}`}>
              <Icon>work_history</Icon>
            </div>
            <div>
              <h2>Candidatures</h2>
              <p>
                Uniquement les dossiers que vous avez choisi de préparer ou
                d’envoyer.
              </p>
            </div>
          </header>
          {loadState === 'loading' ? (
            <LoadingRows label="Chargement des candidatures" />
          ) : applications.length ? (
            <div className={styles.applicationList}>
              {applications.map((application) => (
                <ApplicationRow
                  Icon={Icon}
                  application={application}
                  key={application.applicationId}
                />
              ))}
            </div>
          ) : loadState === 'ready' ? (
            <EmptyState
              copy="Aucun dossier n’a encore été démarré. Vos opportunités restent disponibles au-dessus."
              Icon={Icon}
              icon="work_outline"
              title="Aucune candidature en cours"
            />
          ) : null}
        </section>
      </div>
      {importOpen ? (
        <ImportDialog
          Icon={Icon}
          onClose={() => setImportOpen(false)}
          onImported={imported}
        />
      ) : null}
    </AppShell>
  );
}

function OpportunityCard({
  decision,
  Icon,
  onDecisionSaved,
  opportunity,
  searchProfiles,
}: {
  decision?: OpportunityDecision;
  Icon: IconComponent;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunity: DiscoveredJob;
  searchProfiles: SearchProfile[];
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const localize = useLocalizer([
    applicationsMessages,
    semanticAnalysisMessages,
  ]);
  const source = opportunity.sources[0];
  const lifecycle = lifecycleCopy(opportunity.lifecycle);
  const [editing, setEditing] = useState<
    OpportunityDecision['disposition'] | undefined
  >();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();

  async function startApplication() {
    setStarting(true);
    setStartError(undefined);
    try {
      const response = await promoteOpportunityToApplication(
        opportunity.opportunityId,
      );
      if (!response.ok) {
        setStartError(promotionError(response.status));
        return;
      }
      const application = applicationSchema.parse(await response.json());
      router.push(`/applications/${application.applicationId}`);
    } catch {
      setStartError('Impossible de démarrer la candidature. Réessayez.');
    } finally {
      setStarting(false);
    }
  }

  return localize(
    <article
      className={`${styles.opportunityCard} ${styles[`lifecycle-${opportunity.lifecycle}`]}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(opportunity.company ?? opportunity.role ?? 'Offre')}
      </div>
      <div className={styles.opportunityBody}>
        <div className={styles.opportunityTitle}>
          <div>
            <small>{opportunity.company ?? 'À vérifier'}</small>
            <h3>{opportunity.role ?? 'À vérifier'}</h3>
          </div>
          <span className={styles.lifecycle}>
            <i />
            {lifecycle}
          </span>
        </div>
        <dl className={styles.jobFacts}>
          <Fact
            Icon={Icon}
            icon="location_on"
            label="Lieu"
            value={opportunity.location ?? 'À vérifier'}
          />
          <Fact
            Icon={Icon}
            icon="home_work"
            label="Mode"
            value={remoteCopy(opportunity.remoteMode)}
          />
          <Fact
            Icon={Icon}
            icon="contract"
            label="Contrat"
            value={contractCopy(opportunity.contractType)}
          />
          <Fact
            Icon={Icon}
            icon="payments"
            label="Salaire"
            value={salaryCopy(opportunity, locale)}
          />
          <Fact
            Icon={Icon}
            icon="dataset_linked"
            label="Source ATS"
            value={atsCopy(opportunity.sourceKind)}
          />
        </dl>
        <a href={opportunity.sourceUrl} rel="noreferrer" target="_blank">
          <Icon>open_in_new</Icon>Voir l’offre d’origine
        </a>
        <details>
          <summary>
            <Icon>verified</Icon>Provenance et historique ·{' '}
            {opportunity.observations.length}{' '}
            {opportunity.observations.length > 1
              ? 'observations'
              : 'observation'}
          </summary>
          <div className={styles.provenance}>
            <section>
              <h4>Source consultée</h4>
              <dl>
                <div>
                  <dt>URL demandée</dt>
                  <dd>
                    <a
                      href={source.requestedUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {host(source.requestedUrl)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>URL finale</dt>
                  <dd>
                    <a href={source.finalUrl} rel="noreferrer" target="_blank">
                      {host(source.finalUrl)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Collecteur</dt>
                  <dd>{sourceKindCopy(source.sourceKind)}</dd>
                </div>
                <div>
                  <dt>Identifiant source</dt>
                  <dd>{source.externalId ?? 'À vérifier'}</dd>
                </div>
                <div>
                  <dt>Consultée</dt>
                  <dd>{formatDateTime(source.fetchedAt, locale)}</dd>
                </div>
                <div>
                  <dt>Empreinte</dt>
                  <dd>
                    <code>{source.sha256.slice(0, 12)}…</code>
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <h4>Historique des observations</h4>
              <ol className={styles.timeline}>
                {opportunity.observations.map((observation) => (
                  <li
                    className={styles[`change-${observation.change}`]}
                    key={observation.observationId}
                  >
                    <i aria-hidden="true" />
                    <div>
                      <strong>{observationCopy(observation.change)}</strong>
                      <time dateTime={observation.observedAt}>
                        {formatDateTime(observation.observedAt, locale)}
                      </time>
                    </div>
                    <small>
                      {matchCopy(observation.matchedBy)} ·{' '}
                      {observation.sha256.slice(0, 8)}…
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </details>
      </div>
      <div className={styles.opportunityActions}>
        <span>Découverte {formatDate(opportunity.firstSeenAt, locale)}</span>
        {decision ? (
          <span
            className={`${styles.decisionBadge} ${styles[decision.disposition]}`}
          >
            {dispositionStateCopy(decision.disposition)} ·{' '}
            {qualificationCopy(decision.qualification)}
          </span>
        ) : null}
        <button
          aria-controls={`semantic-analysis-${opportunity.opportunityId}`}
          aria-expanded={analysisOpen}
          className={styles.semanticAction}
          onClick={() => {
            setEditing(undefined);
            setAnalysisOpen((current) => !current);
          }}
          type="button"
        >
          <Icon>manage_search</Icon>
          {analysisOpen ? 'Fermer l’analyse' : 'Analyser le matching'}
        </button>
        <div className={styles.decisionActions}>
          {(['saved', 'ignored', 'archived'] as const).map((disposition) => (
            <button
              className={
                decision?.disposition === disposition
                  ? styles.currentAction
                  : undefined
              }
              key={disposition}
              onClick={() => {
                setAnalysisOpen(false);
                setEditing(disposition);
              }}
              type="button"
            >
              {dispositionCopy(disposition)}
            </button>
          ))}
        </div>
        <button
          aria-busy={starting || undefined}
          disabled={starting}
          onClick={() => void startApplication()}
          type="button"
        >
          {starting ? 'Démarrage…' : 'Démarrer la candidature'}
        </button>
        {startError ? (
          <p className={styles.decisionError} role="alert">
            {startError}
          </p>
        ) : null}
      </div>
      {editing ? (
        <DecisionEditor
          decision={decision}
          initialDisposition={editing}
          key={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={(saved) => {
            onDecisionSaved(saved);
            setEditing(undefined);
          }}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
      {analysisOpen ? (
        <SemanticAnalysisPanel
          Icon={Icon}
          initialSearchProfileId={decision?.searchProfileId}
          onClose={() => setAnalysisOpen(false)}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
    </article>,
  );
}

function ProcessedOpportunities({
  decisionsByOpportunity,
  Icon,
  onDecisionSaved,
  opportunities,
  searchProfiles,
}: {
  decisionsByOpportunity: Map<string, OpportunityDecision>;
  Icon: IconComponent;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunities: DiscoveredJob[];
  searchProfiles: SearchProfile[];
}) {
  const localize = useLocalizer([
    applicationsMessages,
    semanticAnalysisMessages,
  ]);
  const [filter, setFilter] = useState<'all' | 'ignored' | 'archived'>('all');
  const visible = opportunities.filter(
    (opportunity) =>
      filter === 'all' ||
      decisionsByOpportunity.get(opportunity.opportunityId)?.disposition ===
        filter,
  );
  return localize(
    <section className={`${styles.workspace} ${styles.processedWorkspace}`}>
      <header className={styles.processedHeader}>
        <div>
          <Icon>inventory_2</Icon>
          <span>
            <strong>Opportunités traitées</strong>
            <small>
              {opportunities.length}{' '}
              {opportunities.length > 1
                ? 'offres conservées'
                : 'offre conservée'}
            </small>
          </span>
        </div>
        <div
          className={styles.processedFilters}
          role="group"
          aria-label="Filtrer les opportunités traitées"
        >
          {(['all', 'ignored', 'archived'] as const).map((candidate) => (
            <button
              aria-pressed={filter === candidate}
              key={candidate}
              onClick={() => setFilter(candidate)}
              type="button"
            >
              {processedFilterCopy(candidate)}
            </button>
          ))}
        </div>
      </header>
      <div className={styles.processedList}>
        {visible.map((opportunity) => (
          <ProcessedOpportunityRow
            decision={decisionsByOpportunity.get(opportunity.opportunityId)!}
            Icon={Icon}
            key={opportunity.opportunityId}
            onDecisionSaved={onDecisionSaved}
            opportunity={opportunity}
            searchProfiles={searchProfiles}
          />
        ))}
      </div>
    </section>,
  );
}

function ProcessedOpportunityRow({
  Icon,
  decision,
  onDecisionSaved,
  opportunity,
  searchProfiles,
}: {
  Icon: IconComponent;
  decision: OpportunityDecision;
  onDecisionSaved: (decision: OpportunityDecision) => void;
  opportunity: DiscoveredJob;
  searchProfiles: SearchProfile[];
}) {
  const localize = useLocalizer([
    applicationsMessages,
    semanticAnalysisMessages,
  ]);
  const [editing, setEditing] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  return localize(
    <article className={styles.processedRow}>
      <div className={styles.companyMark} aria-hidden="true">
        {initials(opportunity.company ?? opportunity.role ?? 'Offre')}
      </div>
      <div>
        <small>{opportunity.company ?? 'À vérifier'}</small>
        <strong>{opportunity.role ?? 'À vérifier'}</strong>
      </div>
      <span
        className={`${styles.decisionBadge} ${styles[decision.disposition]}`}
      >
        {dispositionStateCopy(decision.disposition)}
      </span>
      <span>{qualificationCopy(decision.qualification)}</span>
      <button
        className={styles.processedEdit}
        onClick={() => {
          setAnalysisOpen(false);
          setEditing((current) => !current);
        }}
        type="button"
      >
        {editing ? 'Fermer' : 'Corriger'}
      </button>
      <button
        aria-controls={`semantic-analysis-${opportunity.opportunityId}`}
        aria-expanded={analysisOpen}
        className={styles.processedAnalyze}
        onClick={() => {
          setEditing(false);
          setAnalysisOpen((current) => !current);
        }}
        type="button"
      >
        {analysisOpen ? 'Fermer l’analyse' : 'Analyser'}
      </button>
      {editing ? (
        <DecisionEditor
          decision={decision}
          initialDisposition={decision.disposition}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            onDecisionSaved(saved);
            setEditing(false);
          }}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
      {analysisOpen ? (
        <SemanticAnalysisPanel
          Icon={Icon}
          initialSearchProfileId={decision.searchProfileId}
          onClose={() => setAnalysisOpen(false)}
          opportunityId={opportunity.opportunityId}
          searchProfiles={searchProfiles}
        />
      ) : null}
    </article>,
  );
}

function DecisionEditor({
  decision,
  initialDisposition,
  onCancel,
  onSaved,
  opportunityId,
  searchProfiles,
}: {
  decision?: OpportunityDecision;
  initialDisposition: OpportunityDecision['disposition'];
  onCancel: () => void;
  onSaved: (decision: OpportunityDecision) => void;
  opportunityId: string;
  searchProfiles: SearchProfile[];
}) {
  const localize = useLocalizer([applicationsMessages]);
  const [disposition, setDisposition] = useState(initialDisposition);
  const [qualification, setQualification] = useState<
    OpportunityDecision['qualification']
  >(decision?.qualification ?? qualificationFor(initialDisposition));
  const [reason, setReason] = useState<OpportunityDecision['reason'] | ''>(
    decision?.reason ?? '',
  );
  const [note, setNote] = useState(decision?.note ?? '');
  const [searchProfileId, setSearchProfileId] = useState(
    decision?.searchProfileId ?? '',
  );
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function changed(action: () => void) {
    action();
    setOperationKey(crypto.randomUUID());
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError('Choisissez une raison avant d’enregistrer.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await saveOpportunityDecision(
        opportunityId,
        {
          searchProfileId: searchProfileId || null,
          disposition,
          qualification,
          reason,
          note: note.trim() || null,
          expectedRevision: decision?.revision ?? 0,
        },
        operationKey,
      );
      if (!response.ok) throw new Error(decisionError(response.status));
      const payload = opportunityDecisionMutationResponseSchema.parse(
        await response.json(),
      );
      onSaved(payload.decision);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'La décision n’a pas pu être enregistrée.',
      );
    } finally {
      setSaving(false);
    }
  }

  return localize(
    <form className={styles.decisionEditor} onSubmit={submit}>
      <header>
        <div>
          <strong>Décision humaine</strong>
          <small>
            {decision ? (
              <>
                Révision {decision.revision} · {decision.history.length}{' '}
                {decision.history.length > 1
                  ? 'décisions conservées'
                  : 'décision conservée'}
              </>
            ) : (
              'Première décision'
            )}
          </small>
        </div>
        <button
          aria-label="Fermer la décision"
          onClick={onCancel}
          type="button"
        >
          ×
        </button>
      </header>
      <div className={styles.decisionFields}>
        <label>
          <span>État</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setDisposition(
                  event.target.value as OpportunityDecision['disposition'],
                ),
              )
            }
            value={disposition}
          >
            <option value="saved">Enregistrée</option>
            <option value="ignored">Ignorée</option>
            <option value="archived">Archivée</option>
          </select>
        </label>
        <label>
          <span>Qualification corrigée</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setQualification(
                  event.target.value as OpportunityDecision['qualification'],
                ),
              )
            }
            value={qualification}
          >
            <option value="priority">Prioritaire</option>
            <option value="interesting">Intéressante</option>
            <option value="exploratory">Exploratoire</option>
            <option value="ignore">À ignorer</option>
          </select>
        </label>
        <label>
          <span>Raison</span>
          <select
            aria-invalid={!reason || undefined}
            disabled={saving}
            onChange={(event) =>
              changed(() =>
                setReason(event.target.value as OpportunityDecision['reason']),
              )
            }
            required
            value={reason}
          >
            <option value="">Choisir une raison</option>
            {decisionReasons.map((candidate) => (
              <option key={candidate} value={candidate}>
                {reasonCopy(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Profil de recherche</span>
          <select
            disabled={saving}
            onChange={(event) =>
              changed(() => setSearchProfileId(event.target.value))
            }
            value={searchProfileId}
          >
            <option value="">Aucun profil associé</option>
            {searchProfiles.map((profile) => (
              <option
                key={profile.searchProfileId}
                value={profile.searchProfileId}
              >
                {profile.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={styles.noteField}>
        <span>
          Note facultative <small>{note.length}/500</small>
        </span>
        <textarea
          disabled={saving}
          maxLength={500}
          onChange={(event) => changed(() => setNote(event.target.value))}
          placeholder="Ajoutez uniquement le contexte utile à vos prochaines décisions."
          rows={2}
          value={note}
        />
      </label>
      {error ? (
        <p className={styles.decisionError} role="alert">
          {error}
        </p>
      ) : null}
      <footer>
        <button disabled={saving} onClick={onCancel} type="button">
          Annuler
        </button>
        <button
          className="co-button"
          disabled={saving || !reason}
          type="submit"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la décision'}
        </button>
      </footer>
    </form>,
  );
}

function Fact({
  Icon,
  icon,
  label,
  value,
}: {
  Icon: IconComponent;
  icon: string;
  label: string;
  value: string;
}) {
  const localize = useLocalizer([applicationsMessages]);
  return localize(
    <div>
      <Icon>{icon}</Icon>
      <span>
        <dt>{label}</dt>
        <dd className={value === 'À vérifier' ? styles.unknown : undefined}>
          {value}
        </dd>
      </span>
    </div>,
  );
}

function ApplicationRow({
  Icon,
  application,
}: {
  Icon: IconComponent;
  application: Application;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([applicationsMessages]);
  const stage = {
    draft: 'Brouillon',
    applied: 'Envoyée',
    interview: 'Entretien',
    offer: 'Offre reçue',
    closed: 'Clôturée',
  }[application.stage];
  return localize(
    <Link
      className={styles.applicationRow}
      href={`/applications/${application.applicationId}`}
    >
      <div className={styles.companyMark} aria-hidden="true">
        {initials(application.company)}
      </div>
      <div>
        <small>{application.company}</small>
        <strong>{application.role}</strong>
      </div>
      <span className={styles.stage}>{stage}</span>
      <time dateTime={application.updatedAt}>
        {formatDate(application.updatedAt, locale)}
      </time>
      <Icon>chevron_right</Icon>
    </Link>,
  );
}

function ImportDialog({
  Icon,
  onClose,
  onImported,
}: {
  Icon: IconComponent;
  onClose: () => void;
  onImported: (opportunity: DiscoveredJob) => void;
}) {
  const localize = useLocalizer([applicationsMessages]);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose, submitting]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const controller = new AbortController();
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await importOpportunity(url, controller.signal);
      if (!response.ok) throw new Error(importError(response.status));
      const imported = opportunityImportResponseSchema.parse(
        await response.json(),
      );
      onImported(imported.opportunity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import impossible.');
    } finally {
      setSubmitting(false);
    }
  }

  return localize(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
      >
        <header>
          <span>
            <Icon>add_link</Icon>
          </span>
          <div>
            <p>Nouvelle opportunité</p>
            <h2 id="import-title">Coller une offre</h2>
          </div>
          <button
            aria-label="Fermer"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <Icon>close</Icon>
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>URL de l’annonce</span>
            <input
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
              type="url"
              value={url}
            />
          </label>
          <p>
            L’annonce sera lue puis enregistrée avec son URL finale, sa date de
            consultation et son empreinte.
          </p>
          {error ? (
            <div className={styles.dialogError} role="alert">
              <Icon>error</Icon>
              {error}
            </div>
          ) : null}
          <footer>
            <button
              className="co-button quiet"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Annuler
            </button>
            <button
              className="co-button"
              disabled={submitting || !url.trim()}
              type="submit"
            >
              {submitting ? 'Lecture de l’offre…' : 'Importer l’offre'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
  );
}

function EmptyState({
  Icon,
  title,
  copy,
  icon,
  action,
  onAction,
}: {
  Icon: IconComponent;
  title: string;
  copy: string;
  icon: string;
  action?: string;
  onAction?: () => void;
}) {
  const localize = useLocalizer([applicationsMessages]);
  return localize(
    <div className={styles.empty}>
      <span>
        <Icon>{icon}</Icon>
      </span>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      {action && onAction ? (
        <button className="co-button quiet" onClick={onAction} type="button">
          {action}
        </button>
      ) : null}
    </div>,
  );
}

function LoadingRows({ label }: { label: string }) {
  const localize = useLocalizer([applicationsMessages]);
  return localize(
    <div
      aria-label={label}
      aria-live="polite"
      className={styles.loading}
      role="status"
    >
      <span />
      <span />
      <span />
    </div>,
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function host(url: string) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function lifecycleCopy(lifecycle: DiscoveredJob['lifecycle']) {
  return {
    open: 'Ouverte',
    changed: 'Modifiée',
    closed: 'Fermée',
    reposted: 'Republiée',
  }[lifecycle];
}

function remoteCopy(remoteMode: DiscoveredJob['remoteMode']) {
  return {
    unknown: 'À vérifier',
    onsite: 'Sur site',
    hybrid: 'Hybride',
    remote: 'Télétravail',
  }[remoteMode];
}

function contractCopy(contractType: DiscoveredJob['contractType']) {
  return {
    unknown: 'À vérifier',
    full_time: 'Temps plein',
    part_time: 'Temps partiel',
    internship: 'Stage',
    contract: 'Contrat',
    temporary: 'Temporaire',
  }[contractType];
}

function salaryCopy(opportunity: DiscoveredJob, locale: string) {
  const { salaryMin, salaryMax, salaryCurrency } = opportunity;
  if (!salaryCurrency || (salaryMin === null && salaryMax === null))
    return 'À vérifier';
  const format = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: salaryCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  if (salaryMin !== null && salaryMax !== null)
    return salaryMin === salaryMax
      ? format(salaryMin)
      : `${format(salaryMin)}${locale === 'fr' ? ' à ' : ' to '}${format(salaryMax)}`;
  if (salaryMin !== null)
    return `${locale === 'fr' ? 'Dès' : 'From'} ${format(salaryMin)}`;
  return `${locale === 'fr' ? 'Jusqu’à' : 'Up to'} ${format(salaryMax!)}`;
}

function atsCopy(sourceKind: DiscoveredJob['sourceKind']) {
  return sourceKind === 'generic_html'
    ? 'À vérifier'
    : sourceKindCopy(sourceKind);
}

function sourceKindCopy(sourceKind: DiscoveredJob['sourceKind']) {
  return {
    generic_html: 'Page web',
    greenhouse: 'Greenhouse',
    ashby: 'Ashby',
  }[sourceKind];
}

function observationCopy(
  change: DiscoveredJob['observations'][number]['change'],
) {
  return {
    first_seen: 'Première observation',
    unchanged: 'Aucun changement détecté',
    changed: 'Contenu de l’offre modifié',
    closed: 'Offre signalée comme fermée',
    reposted: 'Offre republiée',
  }[change];
}

function matchCopy(
  matchedBy: DiscoveredJob['observations'][number]['matchedBy'],
) {
  return {
    new: 'Nouvelle offre',
    exact_source: 'Même source',
    canonical_url: 'Même URL canonique',
    fingerprint: 'Même empreinte',
  }[matchedBy];
}

const decisionReasons: OpportunityDecision['reason'][] = [
  'strong_fit',
  'career_direction',
  'hard_constraint',
  'weak_evidence',
  'compensation',
  'location',
  'company',
  'duplicate',
  'closed',
  'other',
];

function dispositionCopy(disposition: OpportunityDecision['disposition']) {
  return {
    saved: 'Enregistrer',
    ignored: 'Ignorer',
    archived: 'Archiver',
  }[disposition];
}

function qualificationCopy(
  qualification: OpportunityDecision['qualification'],
) {
  return {
    priority: 'Prioritaire',
    interesting: 'Intéressante',
    exploratory: 'Exploratoire',
    ignore: 'À ignorer',
  }[qualification];
}

function dispositionStateCopy(disposition: OpportunityDecision['disposition']) {
  return {
    saved: 'Enregistrée',
    ignored: 'Ignorée',
    archived: 'Archivée',
  }[disposition];
}

function qualificationFor(
  disposition: OpportunityDecision['disposition'],
): OpportunityDecision['qualification'] {
  return disposition === 'ignored' ? 'ignore' : 'interesting';
}

function reasonCopy(reason: OpportunityDecision['reason']) {
  return {
    strong_fit: 'Adéquation forte',
    career_direction: 'Direction de carrière',
    hard_constraint: 'Contrainte obligatoire',
    weak_evidence: 'Preuves insuffisantes',
    compensation: 'Rémunération',
    location: 'Localisation',
    company: 'Entreprise',
    duplicate: 'Doublon',
    closed: 'Offre fermée',
    other: 'Autre raison',
  }[reason];
}

function processedFilterCopy(filter: 'all' | 'ignored' | 'archived') {
  return {
    all: 'Toutes',
    ignored: 'Ignorées',
    archived: 'Archivées',
  }[filter];
}

function decisionError(status: number) {
  if (status === 400) return 'Vérifiez les champs de cette décision.';
  if (status === 401) return 'Connectez-vous pour enregistrer cette décision.';
  if (status === 404) return 'Cette opportunité ou ce profil n’existe plus.';
  if (status === 409)
    return 'Cette décision a changé dans une autre session. Rechargez la page.';
  if (status === 413) return 'La note est trop longue.';
  return 'La décision n’a pas pu être enregistrée.';
}

function promotionError(status: number) {
  if (status === 401) return 'Connectez-vous pour démarrer cette candidature.';
  if (status === 404) return 'Cette opportunité n’existe plus.';
  if (status === 409)
    return 'Impossible de démarrer une candidature pour cette opportunité.';
  return 'Impossible de démarrer la candidature. Réessayez.';
}

function importError(status: number) {
  if (status === 400) return 'Cette URL ne peut pas être consultée.';
  if (status === 413) return 'La page de l’offre est trop volumineuse.';
  if (status === 415)
    return 'Le format de cette page n’est pas pris en charge.';
  if (status === 422)
    return 'Aucune offre exploitable n’a été trouvée à cette URL.';
  if (status === 429) return 'Trop de tentatives. Réessayez dans une minute.';
  if (status === 504) return 'La page distante ne répond pas assez vite.';
  return 'L’offre n’a pas pu être importée. Réessayez.';
}
