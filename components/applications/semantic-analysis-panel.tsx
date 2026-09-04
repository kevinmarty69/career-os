'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { readSemanticAnalysis, runSemanticAnalysis } from '@/lib/career-api';
import {
  semanticAnalysisResultSchema,
  type PersistedSemanticAnalysis,
  type SemanticAnalysisResult,
} from '@/lib/semantic-analysis-contract';
import type { SearchProfile } from '@/lib/search-profile';
import { useI18n, useLocalizer } from '@/components/i18n/i18n-provider';
import { applicationsMessages } from '@/lib/i18n/dictionaries/applications';
import { searchProfilesMessages } from '@/lib/i18n/dictionaries/search-profiles';
import { semanticAnalysisMessages } from '@/lib/i18n/dictionaries/semantic-analysis';
import styles from './applications-page.module.css';

type IconComponent = ComponentType<{ children: string }>;
type RequestKind = 'read' | 'run';
type AnalysisItem =
  PersistedSemanticAnalysis['artifact']['analysis']['skills'][number];
type Proof = PersistedSemanticAnalysis['proofIndex'][number];

export function SemanticAnalysisPanel({
  Icon,
  initialSearchProfileId,
  onClose,
  opportunityId,
  searchProfiles,
}: {
  Icon: IconComponent;
  initialSearchProfileId?: string | null;
  onClose: () => void;
  opportunityId: string;
  searchProfiles: SearchProfile[];
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([
    applicationsMessages,
    searchProfilesMessages,
    semanticAnalysisMessages,
  ]);
  const [searchProfileId, setSearchProfileId] = useState(
    initialSearchProfileId ?? '',
  );
  const [result, setResult] = useState<SemanticAnalysisResult>();
  const [loading, setLoading] = useState<RequestKind>();
  const [errorStatus, setErrorStatus] = useState<number>();
  const [lastRequest, setLastRequest] = useState<RequestKind>('run');
  const request = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => request.current?.abort(), []);

  async function submit(kind: RequestKind) {
    if (!searchProfileId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(kind);
    setLastRequest(kind);
    setErrorStatus(undefined);
    try {
      const response = await (kind === 'read'
        ? readSemanticAnalysis(
            opportunityId,
            searchProfileId,
            controller.signal,
          )
        : runSemanticAnalysis(
            opportunityId,
            searchProfileId,
            controller.signal,
          ));
      if (!response.ok) throw new SemanticRequestError(response.status);
      setResult(semanticAnalysisResultSchema.parse(await response.json()));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErrorStatus(error instanceof SemanticRequestError ? error.status : 0);
    } finally {
      if (request.current === controller) setLoading(undefined);
    }
  }

  return localize(
    <section
      aria-label="Analyse sémantique de l’offre"
      aria-busy={Boolean(loading)}
      className={`${styles.semanticPanel} ${styles.decisionEditor}`}
      id={`semantic-analysis-${opportunityId}`}
    >
      <header className={styles.semanticHeader}>
        <div>
          <span className={styles.semanticEyebrow}>Analyse explicable</span>
          <h4>Comparer l’offre à votre mémoire</h4>
          <p>
            Choisissez un profil. L’analyse ne démarre jamais sans votre action.
          </p>
        </div>
        <button aria-label="Fermer l’analyse" onClick={onClose} type="button">
          ×
        </button>
      </header>

      {searchProfiles.length ? (
        <div className={`${styles.semanticControls} ${styles.decisionEditor}`}>
          <label>
            <span>Profil de recherche</span>
            <select
              disabled={Boolean(loading)}
              onChange={(event) => {
                request.current?.abort();
                setSearchProfileId(event.target.value);
                setResult(undefined);
                setErrorStatus(undefined);
              }}
              value={searchProfileId}
            >
              <option value="">Choisir un profil enregistré</option>
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
          <div className={styles.processedFilters}>
            <button
              disabled={!searchProfileId || Boolean(loading)}
              onClick={() => void submit('read')}
              type="button"
            >
              {loading === 'read' ? 'Recherche…' : 'Voir la dernière analyse'}
            </button>
            <button
              className="co-button"
              disabled={!searchProfileId || Boolean(loading)}
              onClick={() => void submit('run')}
              type="button"
            >
              <Icon>auto_awesome</Icon>
              {loading === 'run' ? 'Analyse en cours…' : 'Lancer l’analyse'}
            </button>
          </div>
        </div>
      ) : (
        <div className={`${styles.semanticEmpty} ${styles.empty}`}>
          <Icon>manage_search</Icon>
          <div>
            <strong>Créez d’abord un profil de recherche.</strong>
            <p>
              Les contraintes et préférences du profil cadrent chaque analyse.
            </p>
          </div>
          <Link className="co-button" href="/search-profiles">
            Créer un profil
          </Link>
        </div>
      )}

      {loading ? (
        <div
          aria-live="polite"
          className={styles.semanticLoading}
          role="status"
        >
          <div>
            <strong>
              {loading === 'read'
                ? 'Recherche de l’analyse enregistrée…'
                : 'Analyse locale en cours…'}
            </strong>
            <p>Cette étape peut prendre quelques instants.</p>
          </div>
        </div>
      ) : null}

      {errorStatus !== undefined ? (
        <div className={`${styles.semanticError} ${styles.error}`} role="alert">
          <Icon>error</Icon>
          <div>
            <strong>{semanticErrorTitle(errorStatus)}</strong>
            <p>{semanticErrorCopy(errorStatus)}</p>
          </div>
          <button
            className="co-button"
            disabled={!searchProfileId}
            onClick={() =>
              void submit(errorStatus === 404 ? 'run' : lastRequest)
            }
            type="button"
          >
            {errorStatus === 404 ? 'Lancer l’analyse' : 'Réessayer'}
          </button>
        </div>
      ) : null}

      {!loading && result?.status === 'blocked' ? (
        <BlockedAnalysis Icon={Icon} result={result} />
      ) : null}
      {!loading && result?.status === 'completed' ? (
        <CompletedAnalysis Icon={Icon} locale={locale} result={result} />
      ) : null}
    </section>,
  );
}

function BlockedAnalysis({
  Icon,
  result,
}: {
  Icon: IconComponent;
  result: Extract<SemanticAnalysisResult, { status: 'blocked' }>;
}) {
  const { locale } = useI18n();
  const localize = useLocalizer([semanticAnalysisMessages]);
  const blocked = result.match.evaluation.criteria.filter(
    (criterion) => criterion.blocks,
  );
  return localize(
    <div className={styles.blockedAnalysis}>
      <header>
        <Icon>block</Icon>
        <div>
          <span>Analyse arrêtée avant le modèle</span>
          <strong>Une contrainte dure bloque la recommandation.</strong>
          <p>
            Aucun modèle n’a été appelé. Corrigez le profil ou l’offre si cette
            qualification est inexacte.
          </p>
        </div>
      </header>
      <div className={styles.blockedCriteria}>
        {blocked.map((criterion) => (
          <article key={criterion.criterion}>
            <strong>{criterionCopy(criterion.criterion)}</strong>
            <p>{criterion.explanation}</p>
            <dl>
              <div>
                <dt>Attendu</dt>
                <dd>
                  {criterion.expected
                    .map((value) => valueCopy(value, locale))
                    .join(', ') || 'Non défini'}
                </dd>
              </div>
              <div>
                <dt>Observé</dt>
                <dd>
                  {criterion.observed
                    ? valueCopy(criterion.observed, locale)
                    : 'À vérifier'}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>,
  );
}

function CompletedAnalysis({
  Icon,
  locale,
  result,
}: {
  Icon: IconComponent;
  locale: 'en' | 'fr';
  result: Extract<SemanticAnalysisResult, { status: 'completed' }>;
}) {
  const localize = useLocalizer([semanticAnalysisMessages]);
  const { analysis } = result;
  const { artifact } = analysis;
  const strongReasons = [
    ...artifact.analysis.skills,
    ...artifact.analysis.responsibilities,
  ];
  const proofIndex = new Map(
    analysis.proofIndex.map((proof) => [proof.claimId, proof]),
  );
  return localize(
    <div>
      <header className={styles.analysisSummaryHeader}>
        <div>
          <span>Résultat enregistré</span>
          <strong>
            {recommendationCopy(artifact.decomposition.recommendation)}
          </strong>
        </div>
        <time dateTime={analysis.createdAt}>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(analysis.createdAt))}
        </time>
      </header>
      <dl className={styles.analysisMetrics}>
        <Metric
          label="Score connu"
          value={
            artifact.decomposition.score === null
              ? 'Inconnu'
              : `${artifact.decomposition.score}/100`
          }
        />
        <Metric
          label="Couverture"
          value={`${artifact.decomposition.coveragePercent}% · ${artifact.decomposition.knownFactorCount}/${artifact.decomposition.requirementCount}`}
        />
        <Metric
          label="Confiance"
          value={confidenceCopy(artifact.decomposition.confidence)}
        />
        <Metric
          label="Risques explicatifs"
          value={String(artifact.decomposition.explanatoryRiskCount)}
        />
      </dl>
      <div className={styles.analysisSections}>
        <FactorSection
          Icon={Icon}
          initiallyOpen
          items={strongReasons}
          proofIndex={proofIndex}
          title="Raisons fortes"
        />
        <FactorSection
          Icon={Icon}
          items={artifact.analysis.transfers}
          proofIndex={proofIndex}
          title="Transferts"
        />
        <FactorSection
          Icon={Icon}
          items={artifact.analysis.gaps}
          proofIndex={proofIndex}
          title="Gaps réels"
        />
        <FactorSection
          Icon={Icon}
          items={artifact.analysis.unknowns}
          proofIndex={proofIndex}
          title="Inconnues"
        />
        <FactorSection
          Icon={Icon}
          items={artifact.analysis.risks}
          proofIndex={proofIndex}
          title="Risques"
        />
      </div>
      <footer className={styles.analysisLineage}>
        <Icon>verified_user</Icon>
        <span>
          {locale === 'en'
            ? `Job v${analysis.jobRevision} · search profile v${analysis.searchProfileRevision} · memory v${analysis.livingProfile.revision}`
            : `Offre v${analysis.jobRevision} · profil de recherche v${analysis.searchProfileRevision} · mémoire v${analysis.livingProfile.revision}`}
        </span>
      </footer>
    </div>,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FactorSection({
  Icon,
  initiallyOpen = false,
  items,
  proofIndex,
  title,
}: {
  Icon: IconComponent;
  initiallyOpen?: boolean;
  items: AnalysisItem[];
  proofIndex: ReadonlyMap<string, Proof>;
  title: string;
}) {
  const localize = useLocalizer([semanticAnalysisMessages]);
  return localize(
    <details open={initiallyOpen}>
      <summary>
        <span>{title}</span>
        <small>{items.length}</small>
        <Icon>expand_more</Icon>
      </summary>
      <div className={styles.factorList}>
        {items.length ? (
          items.map((item, index) => (
            <article key={`${item.statement}-${index}`}>
              <header>
                <small>{factorCopy(item.factor)}</small>
                <strong>{item.statement}</strong>
              </header>
              <blockquote>{item.jobExcerpt}</blockquote>
              {item.profileReferences.length ? (
                <details className={styles.evidenceReferences}>
                  <summary>
                    Références de preuve · {item.profileReferences.length}
                  </summary>
                  <ul>
                    {item.profileReferences.map((reference) => {
                      const proof = proofIndex.get(reference.claimId);
                      if (!proof) return null;
                      const evidence = proof.evidence.filter((item) =>
                        reference.evidenceIds.includes(item.evidenceId),
                      );
                      return (
                        <li key={reference.claimId}>
                          <strong>{proof.statement}</strong>
                          {evidence.map((item) => (
                            <span key={item.evidenceId}>
                              {item.label} · {item.sourceTitle}
                              {item.sourceLocator ? (
                                <small>{item.sourceLocator}</small>
                              ) : null}
                            </span>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ) : (
                <p className={styles.noEvidence}>
                  Aucune preuve candidat liée.
                </p>
              )}
            </article>
          ))
        ) : (
          <p className={styles.emptyFactor}>Aucun élément dans cette passe.</p>
        )}
      </div>
    </details>,
  );
}

class SemanticRequestError extends Error {
  constructor(readonly status: number) {
    super(`Semantic request failed with ${status}.`);
  }
}

function semanticErrorTitle(status: number) {
  if (status === 404) return 'Aucune analyse enregistrée';
  if (status === 409) return 'Preuves exactes indisponibles';
  if (status === 502) return 'Réponse du modèle invalide';
  if (status === 503) return 'Modèle local indisponible';
  return 'Analyse indisponible';
}

function semanticErrorCopy(status: number) {
  if (status === 404)
    return 'Aucun résultat n’existe encore pour ce profil et cette offre.';
  if (status === 409)
    return 'L’offre ou la mémoire ne fournit pas encore les sources exactes nécessaires.';
  if (status === 502)
    return 'Le résultat a été refusé car il ne respecte pas le contrat de preuve.';
  if (status === 503)
    return 'Vérifiez la configuration du modèle local, puis relancez cette analyse.';
  return 'La demande n’a pas abouti. Vous pouvez la relancer.';
}

function recommendationCopy(
  recommendation: PersistedSemanticAnalysis['artifact']['decomposition']['recommendation'],
) {
  return {
    priority: 'Prioritaire',
    interesting: 'Intéressante',
    exploratory: 'Exploratoire',
    ignore: 'À ignorer',
  }[recommendation];
}

function confidenceCopy(
  confidence: PersistedSemanticAnalysis['artifact']['decomposition']['confidence'],
) {
  return { low: 'Faible', medium: 'Moyenne', high: 'Élevée' }[confidence];
}

function factorCopy(factor: AnalysisItem['factor']) {
  return {
    strong: 'Fort',
    partial: 'Partiel',
    gap: 'Gap',
    unknown: 'Inconnu',
  }[factor];
}

function criterionCopy(
  criterion: Extract<
    SemanticAnalysisResult,
    { status: 'blocked' }
  >['match']['evaluation']['criteria'][number]['criterion'],
) {
  return {
    availability: 'Disponibilité',
    role: 'Rôle',
    seniority: 'Séniorité',
    location: 'Localisation',
    remoteMode: 'Mode de travail',
    timezone: 'Fuseau horaire',
    language: 'Langue',
    contractType: 'Contrat',
    salary: 'Salaire',
    company: 'Entreprise',
    network: 'Réseau',
  }[criterion];
}

function valueCopy(value: string, locale: 'en' | 'fr') {
  if (locale === 'fr') return value;
  return (
    {
      onsite: 'On-site',
      hybrid: 'Hybrid',
      remote: 'Remote',
      unknown: 'Unknown',
      open: 'Open',
      changed: 'Changed',
      closed: 'Closed',
      reposted: 'Reposted',
      full_time: 'Full time',
      part_time: 'Part time',
      internship: 'Internship',
      contract: 'Contract',
      temporary: 'Temporary',
    }[value] ?? value
  );
}
