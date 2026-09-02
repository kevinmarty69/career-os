import {
  pageSpecSchema,
  profileSchema,
  type PageSpec,
  type Profile,
  type Review,
} from './schemas';

export type Opportunity = {
  company: string;
  role: string;
  description: string;
  url?: string;
  accent: string;
};

export type Strategy = {
  thesis: string;
  selectedClaimIds: string[];
  gaps: string[];
  matches: Array<{
    requirement: string;
    claimId?: string;
    evidenceIds: string[];
    gap?: string;
  }>;
};

export type WorkflowEvent = {
  actor:
    | 'system'
    | 'company-researcher'
    | 'recruiter-strategist'
    | 'page-composer'
    | 'recruiter'
    | 'hiring-manager'
    | 'fact-checker';
  action: string;
  artifact?: string;
  costMicros: number;
};

export const agentRoles = [
  {
    name: 'Evidence Archivist',
    input: 'one source',
    output: 'claim candidates',
    authority: 'cannot verify or publish',
  },
  {
    name: 'Company Researcher',
    input: 'offer + allow-listed URLs',
    output: 'sourced brief',
    authority: 'read-only Career Memory',
  },
  {
    name: 'Recruiter Strategist',
    input: 'offer + eligible claim summaries',
    output: 'strategy',
    authority: 'selects, never invents claims',
  },
  {
    name: 'Hiring Manager',
    input: 'strategy + PageSpec + evidence',
    output: 'review issues',
    authority: 'can fail sections only',
  },
  {
    name: 'Page Composer',
    input: 'strategy + failed sections',
    output: 'strict PageSpec',
    authority: 'maximum three versions',
  },
  {
    name: 'Fact Checker',
    input: 'PageSpec + provenance',
    output: 'factual issues',
    authority: 'can block publication',
  },
] as const;

export function buildStrategy(
  profileInput: Profile,
  opportunity: Opportunity,
): Strategy {
  const profile = profileSchema.parse(profileInput);
  const eligible = profile.claims.filter(
    (claim) =>
      claim.allowedUses.includes('application') &&
      claim.sensitivity !== 'restricted' &&
      claim.evidenceIds.some((id) => {
        const evidence = profile.evidence.find((item) => item.id === id);
        const source = profile.sources.find(
          (item) => item.id === evidence?.sourceId,
        );
        return (
          source?.sensitivity !== 'restricted' &&
          source?.allowedUses.includes('application')
        );
      }),
  );
  const requirements = sentences(
    `${opportunity.role}. ${opportunity.description}`,
  );
  const matches = requirements.map((requirement) => {
    const requirementWords = keywords(requirement);
    const claim = eligible
      .map((candidate) => ({
        candidate,
        score: overlap(
          requirementWords,
          keywords(
            [
              candidate.statement,
              ...candidate.evidenceIds.map(
                (id) =>
                  profile.evidence.find((item) => item.id === id)?.excerpt,
              ),
            ].join(' '),
          ),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .find(({ score }) => score > 0)?.candidate;
    return claim
      ? { requirement, claimId: claim.id, evidenceIds: claim.evidenceIds }
      : {
          requirement,
          evidenceIds: [],
          gap: `No eligible evidence supports: ${requirement}`,
        };
  });
  const selectedClaimIds = [
    ...new Set(
      matches.flatMap((match) => (match.claimId ? [match.claimId] : [])),
    ),
  ];

  if (selectedClaimIds.length === 0)
    throw new Error('The opportunity is not supported by eligible evidence.');

  return {
    thesis: `${profile.headline} applied to ${opportunity.role} at ${opportunity.company}.`,
    selectedClaimIds,
    gaps: matches.flatMap((match) => (match.gap ? [match.gap] : [])),
    matches,
  };
}

const ignoredWords = new Set([
  'and',
  'at',
  'build',
  'customer',
  'facing',
  'for',
  'in',
  'of',
  'role',
  'senior',
  'small',
  'team',
  'the',
  'to',
  'with',
]);

function sentences(value: string) {
  return value
    .split(/[.!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function keywords(value: string) {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length > 2 && !ignoredWords.has(word))
      .map((word) =>
        word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word,
      ) ?? [],
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  return [...left].filter((word) => right.has(word)).length;
}

export function buildPageSpec(
  profile: Profile,
  opportunity: Opportunity,
  strategy: Strategy,
): PageSpec {
  const verifiedIds = strategy.selectedClaimIds.filter(
    (id) =>
      profile.claims.find((claim) => claim.id === id)?.level === 'verified',
  );

  return pageSpecSchema.parse({
    version: 1,
    company: {
      name: opportunity.company,
      role: opportunity.role,
      accent: safeAccent(opportunity.accent),
    },
    hero: {
      eyebrow: 'Private, evidence-backed application',
      title: `${profile.name} × ${opportunity.company}`,
      thesis: strategy.thesis,
    },
    blocks: [
      {
        type: 'fit',
        title: 'Why this role fits',
        claimIds: strategy.selectedClaimIds,
      },
      ...(verifiedIds.length
        ? [
            {
              type: 'evidence' as const,
              title: 'Verified work',
              claimIds: verifiedIds,
            },
          ]
        : [
            {
              type: 'gap' as const,
              title: 'Evidence status',
              text: 'No selected claim is verified yet.',
            },
          ]),
      ...(strategy.gaps.length
        ? [
            {
              type: 'gap' as const,
              title: 'Open questions',
              text: strategy.gaps.join(' '),
            },
          ]
        : []),
    ],
  });
}

export function runReviews(profile: Profile, spec: PageSpec): Review[] {
  const publishedClaims = spec.blocks.flatMap((block) =>
    'claimIds' in block ? block.claimIds : [],
  );
  const uniqueClaims = [...new Set(publishedClaims)].map((id) =>
    profile.claims.find((claim) => claim.id === id),
  );
  const factualProblems = uniqueClaims.flatMap((claim) => {
    if (!claim) return ['PageSpec references an unknown claim.'];
    const eligibleEvidence = claim.evidenceIds.some((id) => {
      const evidence = profile.evidence.find((item) => item.id === id);
      const source = profile.sources.find(
        (item) => item.id === evidence?.sourceId,
      );
      return (
        source?.sensitivity !== 'restricted' &&
        source?.allowedUses.includes('application')
      );
    });
    if (
      claim.sensitivity === 'restricted' ||
      !claim.allowedUses.includes('application') ||
      !eligibleEvidence
    )
      return [`${claim.id} has no eligible supporting evidence.`];
    return [];
  });

  return [
    {
      reviewer: 'recruiter',
      passed: spec.hero.title.length <= 80 && spec.blocks.length <= 4,
      findings:
        spec.hero.title.length <= 80
          ? []
          : ['The headline is too long to scan quickly.'],
    },
    {
      reviewer: 'hiring-manager',
      passed: publishedClaims.length > 0,
      findings:
        publishedClaims.length > 0
          ? []
          : ['No relevant work is mapped to the role.'],
    },
    {
      reviewer: 'factuality',
      passed: factualProblems.length === 0,
      findings: factualProblems,
    },
  ];
}

export function canPublish(approved: boolean, reviews: Review[]) {
  return (
    approved && reviews.length === 3 && reviews.every((review) => review.passed)
  );
}

function safeAccent(candidate: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) return '#21504b';
  const [red, green, blue] = candidate
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const contrast =
    1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05);
  return contrast >= 4.5 ? candidate : '#21504b';
}
