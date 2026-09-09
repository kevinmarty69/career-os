import { z } from 'zod';
import { profileSchema, type Profile } from './schemas';

const resolutionLocator = 'career-os:source-resolution:v1';
const resolutionSchema = z
  .object({
    statements: z.array(z.string().min(1).max(5000)).min(2).max(100),
    selected: z.string().min(1).max(5000),
    resolvedAt: z.iso.datetime(),
  })
  .strict();

/** Conservative, deterministic detection: identical wording with different numeric facts.
 * ponytail: does not infer contradictions between paraphrases; add semantic candidates only with source citations. */
export function memoryConflicts(profile: Profile) {
  const resolved = profile.evidence.flatMap((evidence) => {
    if (
      !profile.sources.some(
        (source) =>
          source.id === evidence.sourceId &&
          source.locator === resolutionLocator,
      )
    )
      return [];
    try {
      const parsed = resolutionSchema.safeParse(JSON.parse(evidence.excerpt));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  const groups = new Map<string, Profile['claims']>();
  for (const claim of profile.claims) {
    if (!/\d/.test(claim.statement)) continue;
    const key = claim.statement
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\d+(?:[.,]\d+)?/g, '#')
      .replace(/\s+/g, ' ')
      .trim();
    if (key.length < 20) continue;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  return [...groups.values()].filter((claims) => {
    const statements = [...new Set(claims.map((claim) => claim.statement))];
    return (
      statements.length > 1 &&
      !resolved.some((item) =>
        statements.every((statement) => item.statements.includes(statement)),
      )
    );
  });
}

export function blockConflictedClaims(profile: Profile): Profile {
  const blocked = new Set(
    memoryConflicts(profile).flatMap((group) => group.map((claim) => claim.id)),
  );
  return blocked.size
    ? {
        ...profile,
        claims: profile.claims.map((claim) =>
          blocked.has(claim.id) ? { ...claim, level: 'unsupported' } : claim,
        ),
      }
    : profile;
}

export function resolveMemoryConflict(
  profile: Profile,
  selectedId: string,
  ids: { source: string; evidence: string },
  resolvedAt: string,
): Profile {
  const group = memoryConflicts(profile).find((claims) =>
    claims.some((claim) => claim.id === selectedId),
  );
  const selected = group?.find((claim) => claim.id === selectedId);
  if (!group || !selected || !selected.evidenceIds.length)
    throw new Error('Choose a version with an attached source.');
  const resolution = resolutionSchema.parse({
    statements: group.map((claim) => claim.statement),
    selected: selected.statement,
    resolvedAt,
  });
  return profileSchema.parse({
    ...profile,
    claims: profile.claims.map((claim) =>
      group.some((item) => item.id === claim.id)
        ? {
            ...claim,
            level: claim.id === selectedId ? 'declared' : 'unsupported',
          }
        : claim,
    ),
    sources: [
      ...profile.sources,
      {
        id: ids.source,
        kind: 'manual',
        title: `Source arbitration · ${resolvedAt.slice(0, 10)}`,
        locator: resolutionLocator,
        sensitivity: 'private',
        allowedUses: ['interview'],
        trust: 'untrusted-data',
      },
    ],
    evidence: [
      ...profile.evidence,
      {
        id: ids.evidence,
        sourceId: ids.source,
        label: 'Human source arbitration',
        excerpt: JSON.stringify(resolution),
      },
    ],
  });
}
