import type { SearchProfile } from './search-profile';
import type { Profile } from './schemas';

export type PositioningAudit = {
  targets: string[];
  channels: {
    resume: ChannelAudit;
    linkedin: ChannelAudit;
    applications: ChannelAudit;
  };
  coherence: {
    resumeAndLinkedin: number;
    acrossAllChannels: number;
  };
  vagueClaims: Profile['claims'];
  duplicateClaims: Array<{ statement: string; claimIds: string[] }>;
  missingEvidence: Profile['claims'];
  missingTargetTerms: string[];
  suggestions: Array<{ claimId: string; current: string; template: string }>;
};

type ChannelAudit = {
  available: boolean;
  claimIds: string[];
  supported: number;
  explicitTargets: string[];
};

export function auditPositioning(
  profile: Profile,
  searchProfiles: SearchProfile[],
  applicationClaimIds: string[],
): PositioningAudit {
  const evidenceById = new Map(
    profile.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const resumeSources = new Set(
    profile.sources
      .filter(
        ({ kind, title }) =>
          kind === 'document' && /(^|\W)(cv|resume|résumé)(\W|$)/iu.test(title),
      )
      .map(({ id }) => id),
  );
  const linkedinSources = new Set(
    profile.sources
      .filter(({ kind }) => kind === 'linkedin')
      .map(({ id }) => id),
  );
  const claimsForSources = (sourceIds: Set<string>) =>
    profile.claims.filter((claim) =>
      claim.evidenceIds.some((evidenceId) => {
        const evidence = evidenceById.get(evidenceId);
        return evidence ? sourceIds.has(evidence.sourceId) : false;
      }),
    );
  const resumeClaims = claimsForSources(resumeSources);
  const linkedinClaims = claimsForSources(linkedinSources);
  const applicationIds = new Set(applicationClaimIds);
  const applicationClaims = profile.claims.filter(({ id }) =>
    applicationIds.has(id),
  );
  const targets = unique(
    searchProfiles
      .filter(({ active }) => active)
      .flatMap(({ hardConstraints, softPreferences }) => [
        ...hardConstraints.roles,
        ...softPreferences.stacks,
        ...softPreferences.sectors,
      ]),
  );
  const outwardText = normalize(
    [
      profile.headline,
      ...profile.claims.map(({ statement }) => statement),
    ].join(' '),
  );
  const missingEvidence = profile.claims
    .filter(
      ({ evidenceIds, level }) =>
        !evidenceIds.length || level === 'unsupported' || level === 'inferred',
    )
    .sort(
      (left, right) =>
        outwardUses(right.allowedUses) - outwardUses(left.allowedUses),
    );
  const vagueClaims = profile.claims.filter(isVague);
  const duplicateClaims = [
    ...groupBy(profile.claims, ({ statement }) => normalize(statement)),
  ]
    .filter(([, claims]) => claims.length > 1)
    .map(([, claims]) => ({
      statement: claims[0]!.statement,
      claimIds: claims.map(({ id }) => id),
    }));

  return {
    targets,
    channels: {
      resume: channelAudit(Boolean(resumeSources.size), resumeClaims, targets),
      linkedin: channelAudit(
        Boolean(linkedinSources.size),
        linkedinClaims,
        targets,
      ),
      applications: channelAudit(
        Boolean(applicationClaimIds.length),
        applicationClaims,
        targets,
      ),
    },
    coherence: {
      resumeAndLinkedin: intersectionSize(resumeClaims, linkedinClaims),
      acrossAllChannels: intersectionSize(
        resumeClaims.filter((claim) =>
          linkedinClaims.some(({ id }) => id === claim.id),
        ),
        applicationClaims,
      ),
    },
    vagueClaims,
    duplicateClaims,
    missingEvidence,
    missingTargetTerms: targets.filter(
      (target) => !outwardText.includes(normalize(target)),
    ),
    suggestions: vagueClaims.slice(0, 5).map((claim) => ({
      claimId: claim.id,
      current: claim.statement,
      template: `${claim.statement.replace(/[.!?]+$/u, '')} — [scope] · [measured outcome] · [dated source].`,
    })),
  };
}

function channelAudit(
  available: boolean,
  claims: Profile['claims'],
  targets: string[],
): ChannelAudit {
  const text = normalize(claims.map(({ statement }) => statement).join(' '));
  return {
    available,
    claimIds: claims.map(({ id }) => id),
    supported: claims.filter(
      ({ evidenceIds, level }) =>
        evidenceIds.length > 0 && !['inferred', 'unsupported'].includes(level),
    ).length,
    explicitTargets: targets.filter((target) =>
      text.includes(normalize(target)),
    ),
  };
}

function isVague(claim: Profile['claims'][number]) {
  if (claim.kind === 'result' && !/\d/u.test(claim.statement)) return true;
  return /^(worked on|helped|contributed|participated|travaillé|aidé|contribué|participé)\b/iu.test(
    claim.statement.trim(),
  );
}

function outwardUses(uses: Profile['claims'][number]['allowedUses']) {
  return uses.filter((use) =>
    ['application', 'resume', 'linkedin'].includes(use),
  ).length;
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en');
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    groups.set(id, [...(groups.get(id) ?? []), value]);
  }
  return groups;
}

function intersectionSize(left: Profile['claims'], right: Profile['claims']) {
  const rightIds = new Set(right.map(({ id }) => id));
  return left.filter(({ id }) => rightIds.has(id)).length;
}
