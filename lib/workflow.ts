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
  const selected = profile.claims
    .filter(
      (claim) =>
        claim.allowedUses.includes('application') &&
        claim.sensitivity !== 'restricted',
    )
    .slice(0, 3);

  if (selected.length === 0)
    throw new Error('At least one publishable claim is required.');

  return {
    thesis: `${profile.headline} applied to ${opportunity.role} at ${opportunity.company}.`,
    selectedClaimIds: selected.map((claim) => claim.id),
    gaps: opportunity.description.trim()
      ? []
      : ['The role description is missing.'],
  };
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
    if (claim.level === 'verified' && claim.evidenceIds.length === 0)
      return [`${claim.id} has no evidence.`];
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
