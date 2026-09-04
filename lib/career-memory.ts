import { profileSchema, type Profile } from './schemas';

const provenanceRisk = {
  verified: 0,
  declared: 1,
  inferred: 2,
  unsupported: 3,
} as const;
const sensitivityRisk = { public: 0, private: 1, restricted: 2 } as const;

export function mergeDuplicateClaims(profile: Profile) {
  const claims: Profile['claims'] = [];
  let mergedCount = 0;

  for (const claim of profile.claims) {
    const duplicateIndex = claims.findIndex(
      (candidate) =>
        normalize(candidate.statement) === normalize(claim.statement) &&
        candidate.allowedUses.some((use) => claim.allowedUses.includes(use)),
    );
    if (duplicateIndex < 0) {
      claims.push(claim);
      continue;
    }

    const duplicate = claims[duplicateIndex];
    const allowedUses = duplicate.allowedUses.filter((use) =>
      claim.allowedUses.includes(use),
    );
    claims[duplicateIndex] = {
      ...duplicate,
      kind: duplicate.kind === claim.kind ? duplicate.kind : 'other',
      level:
        provenanceRisk[duplicate.level] >= provenanceRisk[claim.level]
          ? duplicate.level
          : claim.level,
      evidenceIds: [
        ...new Set([...duplicate.evidenceIds, ...claim.evidenceIds]),
      ],
      sensitivity:
        sensitivityRisk[duplicate.sensitivity] >=
        sensitivityRisk[claim.sensitivity]
          ? duplicate.sensitivity
          : claim.sensitivity,
      allowedUses,
    };
    mergedCount += 1;
  }

  return { profile: profileSchema.parse({ ...profile, claims }), mergedCount };
}

export function memoryCoverage(profile: Profile) {
  const categories = [
    ['experience', 'Expériences'],
    ['project', 'Projets'],
    ['skill', 'Compétences'],
    ['result', 'Résultats'],
    ['preference', 'Préférences'],
  ] as const;
  const items = categories.map(([kind, label]) => ({
    kind,
    label,
    present: profile.claims.some((claim) => claim.kind === kind),
  }));
  const notPublishable = profile.claims.filter(
    (claim) => claim.level === 'inferred' || claim.level === 'unsupported',
  ).length;
  return {
    items,
    presentCount: items.filter(({ present }) => present).length,
    totalCount: items.length,
    notPublishable,
  };
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
