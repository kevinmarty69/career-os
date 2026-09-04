'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell, Icon } from '@/components/kit-route-page';
import { useI18n } from '@/components/i18n/i18n-provider';
import {
  applicationSchema,
  type Application,
} from '@/lib/application-contract';
import {
  readApplicationRun,
  readApplications,
  readProfile,
  readSearchProfiles,
} from '@/lib/career-api';
import {
  auditPositioning,
  type PositioningAudit,
} from '@/lib/positioning-audit';
import { persistedRunSchema } from '@/lib/run-contract';
import { searchProfileSchema } from '@/lib/search-profile';
import { profileSchema } from '@/lib/schemas';

export function PositioningAuditPage() {
  const { locale } = useI18n();
  const [audit, setAudit] = useState<PositioningAudit>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readProfile(controller.signal),
      readSearchProfiles(controller.signal),
      readApplications(controller.signal),
    ])
      .then(async ([profileResponse, searchResponse, applicationResponse]) => {
        if (
          !profileResponse.ok ||
          !searchResponse.ok ||
          !applicationResponse.ok
        )
          throw new Error();
        const profilePayload = (await profileResponse.json()) as {
          profile?: unknown;
        };
        const searchPayload = (await searchResponse.json()) as {
          searchProfiles?: unknown;
        };
        const applicationPayload = (await applicationResponse.json()) as {
          applications?: unknown;
        };
        const profile = profileSchema.parse(profilePayload.profile);
        const profiles = searchProfileSchema
          .array()
          .parse(searchPayload.searchProfiles ?? []);
        const applications = applicationSchema
          .array()
          .parse(applicationPayload.applications ?? []);
        const usedClaimIds = await readUsedClaimIds(
          applications,
          controller.signal,
        );
        setAudit(auditPositioning(profile, profiles, usedClaimIds));
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, []);

  const copy = locale === 'fr' ? frenchCopy : englishCopy;
  return (
    <AppShell path="/memory/audit">
      <header className="co-page-header">
        <div>
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.intro}</span>
        </div>
        <div className="co-actions">
          <Link className="co-button quiet" href="/memory">
            {copy.memory}
          </Link>
          <Link className="co-button" href="/search-profiles">
            {copy.goals}
          </Link>
        </div>
      </header>
      {state === 'loading' ? (
        <div className="co-note">
          <Icon>hourglass_top</Icon>
          {copy.loading}
        </div>
      ) : null}
      {state === 'error' ? (
        <div className="co-note" role="alert">
          <Icon>cloud_off</Icon>
          {copy.error}
        </div>
      ) : null}
      {audit ? <Audit audit={audit} copy={copy} /> : null}
    </AppShell>
  );
}

function Audit({ audit, copy }: { audit: PositioningAudit; copy: AuditCopy }) {
  const channels = [
    ['description', copy.resume, audit.channels.resume],
    ['badge', 'LinkedIn', audit.channels.linkedin],
    ['web', copy.applications, audit.channels.applications],
  ] as const;
  return (
    <div className="co-positioning-audit">
      <section className="co-audit-channels">
        {channels.map(([icon, label, channel]) => (
          <article className="co-panel" key={label}>
            <Icon>{icon}</Icon>
            <span>{label}</span>
            <strong>{channel.available ? channel.claimIds.length : '—'}</strong>
            <small>
              {channel.available
                ? `${channel.supported} ${channel.supported === 1 ? copy.supportedOne : copy.supported} · ${channel.explicitTargets.length}/${audit.targets.length} ${copy.targetTerms}`
                : copy.notImported}
            </small>
          </article>
        ))}
      </section>

      <section className="co-panel co-audit-targets">
        <header>
          <div>
            <h2>{copy.targets}</h2>
            <p>{copy.targetsIntro}</p>
          </div>
          <span>{audit.targets.length}</span>
        </header>
        {audit.targets.length ? (
          <div>
            {audit.targets.map((target) => (
              <span
                className={
                  audit.missingTargetTerms.includes(target) ? 'missing' : ''
                }
                key={target}
              >
                {target}
                <small>
                  {audit.missingTargetTerms.includes(target)
                    ? copy.notExplicit
                    : copy.explicit}
                </small>
              </span>
            ))}
          </div>
        ) : (
          <p>{copy.noTargets}</p>
        )}
      </section>

      <div className="co-audit-grid">
        <section className="co-panel">
          <header>
            <h2>{copy.priority}</h2>
            <span>{audit.missingEvidence.length}</span>
          </header>
          {audit.missingEvidence.length ? (
            audit.missingEvidence.slice(0, 8).map((claim, index) => (
              <article className="co-audit-row" key={claim.id}>
                <b>{index + 1}</b>
                <div>
                  <strong>{claim.statement}</strong>
                  <small>
                    {claim.level} · {claim.allowedUses.join(', ')}
                  </small>
                </div>
                <Link href={`/memory?claim=${encodeURIComponent(claim.id)}`}>
                  {copy.source}
                </Link>
              </article>
            ))
          ) : (
            <p>{copy.noMissingEvidence}</p>
          )}
        </section>

        <section className="co-panel">
          <header>
            <h2>{copy.coherence}</h2>
          </header>
          <dl className="co-audit-coherence">
            <div>
              <dt>{copy.vague}</dt>
              <dd>{audit.vagueClaims.length}</dd>
            </div>
            <div>
              <dt>{copy.duplicates}</dt>
              <dd>{audit.duplicateClaims.length}</dd>
            </div>
            <div>
              <dt>{copy.resume}</dt>
              <dd>{audit.channels.resume.claimIds.length}</dd>
            </div>
            <div>
              <dt>LinkedIn</dt>
              <dd>{audit.channels.linkedin.claimIds.length}</dd>
            </div>
            <div>
              <dt>{copy.usedInApplications}</dt>
              <dd>{audit.channels.applications.claimIds.length}</dd>
            </div>
            <div>
              <dt>{copy.resumeLinkedinOverlap}</dt>
              <dd>{audit.coherence.resumeAndLinkedin}</dd>
            </div>
            <div>
              <dt>{copy.allChannelOverlap}</dt>
              <dd>{audit.coherence.acrossAllChannels}</dd>
            </div>
          </dl>
          <p className="co-audit-boundary">{copy.boundary}</p>
        </section>
      </div>

      <section className="co-panel co-audit-drafts">
        <header>
          <div>
            <h2>{copy.drafts}</h2>
            <p>{copy.draftsIntro}</p>
          </div>
          <span>{audit.suggestions.length}</span>
        </header>
        {audit.suggestions.length ? (
          audit.suggestions.map((suggestion) => (
            <article key={suggestion.claimId}>
              <small>{copy.current}</small>
              <p>{suggestion.current}</p>
              <small>{copy.template}</small>
              <strong>{suggestion.template}</strong>
            </article>
          ))
        ) : (
          <p>{copy.noDrafts}</p>
        )}
        <footer>{copy.manual}</footer>
      </section>
    </div>
  );
}

async function readUsedClaimIds(
  applications: Application[],
  signal: AbortSignal,
) {
  const runs = await Promise.all(
    applications.slice(0, 20).map(async ({ applicationId }) => {
      const response = await readApplicationRun(applicationId, signal);
      if (!response.ok) return undefined;
      const parsed = persistedRunSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : undefined;
    }),
  );
  return [
    ...new Set(
      runs.flatMap(
        (run) =>
          run?.spec?.blocks.flatMap((block) =>
            'claimIds' in block ? block.claimIds : [],
          ) ?? [],
      ),
    ),
  ];
}

const englishCopy = {
  eyebrow: 'Positioning audit',
  title: 'Align your evidence before editing your profile.',
  intro:
    'A factual cross-check of imported resume and LinkedIn evidence, saved goals, and claims already used in applications.',
  memory: 'Open career memory',
  goals: 'Edit search goals',
  loading: 'Reading your persisted workspace…',
  error: 'The audit could not read your workspace.',
  resume: 'Resume',
  applications: 'Application pages',
  supported: 'supported claims',
  supportedOne: 'supported claim',
  targetTerms: 'target terms',
  notImported: 'No matching source imported',
  targets: 'Terms from active search goals',
  targetsIntro:
    'This checks explicit wording only. A missing term is not a capability gap.',
  explicit: 'explicitly named',
  notExplicit: 'not explicitly named',
  noTargets: 'No active role, stack, or sector target is configured.',
  priority: 'Evidence to document first',
  source: 'Open',
  noMissingEvidence: 'Every outward-facing claim has linked evidence.',
  coherence: 'Cross-channel reading',
  vague: 'Vague result claims',
  duplicates: 'Exact duplicates',
  usedInApplications: 'Used in application pages',
  resumeLinkedinOverlap: 'Shared by resume and LinkedIn',
  allChannelOverlap: 'Shared across all three channels',
  boundary:
    'Counts come from imported source provenance and persisted page claim IDs. Career OS does not infer recruiter intent or response causality.',
  drafts: 'Wording drafts',
  draftsIntro:
    'Placeholders make the missing scope, result, and source explicit. Nothing is applied automatically.',
  current: 'Current claim',
  template: 'Draft to complete',
  noDrafts: 'No vague result claim was detected.',
  manual: 'Human validation required before any wording is saved or published.',
} as const;

type AuditCopy = { [Key in keyof typeof englishCopy]: string };

const frenchCopy: AuditCopy = {
  eyebrow: 'Audit de positionnement',
  title: 'Alignez vos preuves avant de modifier votre profil.',
  intro:
    'Une lecture factuelle des preuves CV et LinkedIn importées, des objectifs enregistrés et des affirmations déjà utilisées dans les candidatures.',
  memory: 'Ouvrir la mémoire',
  goals: 'Modifier les objectifs',
  loading: 'Lecture de votre workspace persistant…',
  error: 'L’audit ne peut pas lire votre workspace.',
  resume: 'CV',
  applications: 'Pages de candidature',
  supported: 'affirmations soutenues',
  supportedOne: 'affirmation soutenue',
  targetTerms: 'termes cibles',
  notImported: 'Aucune source correspondante importée',
  targets: 'Termes des objectifs actifs',
  targetsIntro:
    'Ce contrôle porte uniquement sur les formulations explicites. Un terme absent n’est pas une lacune de compétence.',
  explicit: 'nommé explicitement',
  notExplicit: 'non nommé explicitement',
  noTargets: 'Aucun rôle, stack ou secteur cible actif n’est configuré.',
  priority: 'Preuves à documenter en priorité',
  source: 'Ouvrir',
  noMissingEvidence: 'Chaque affirmation publiable possède une preuve reliée.',
  coherence: 'Lecture croisée des canaux',
  vague: 'Résultats vagues',
  duplicates: 'Doublons exacts',
  usedInApplications: 'Utilisées dans les pages',
  resumeLinkedinOverlap: 'Communes au CV et à LinkedIn',
  allChannelOverlap: 'Communes aux trois canaux',
  boundary:
    'Les comptes proviennent des sources importées et des identifiants réellement persistés dans les pages. Career OS ne déduit ni intention recruteur ni causalité de réponse.',
  drafts: 'Brouillons de formulation',
  draftsIntro:
    'Les placeholders rendent visibles le périmètre, le résultat et la source manquants. Rien n’est appliqué automatiquement.',
  current: 'Affirmation actuelle',
  template: 'Brouillon à compléter',
  noDrafts: 'Aucun résultat vague détecté.',
  manual:
    'Validation humaine requise avant tout enregistrement ou publication.',
};
