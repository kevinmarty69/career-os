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
    const numericFacts = new Set(
      claims.map((claim) =>
        (claim.statement.match(/\d+(?:[.,]\d+)?/g) ?? [])
          .map((value) => Number(value.replace(',', '.')))
          .join('|'),
      ),
    );
    return (
      numericFacts.size > 1 &&
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
  contexts?: Record<string, string>,
): Profile {
  const group = memoryConflicts(profile).find((claims) =>
    claims.some((claim) => claim.id === selectedId),
  );
  const selected = group?.find((claim) => claim.id === selectedId);
  if (!group || !selected || !selected.evidenceIds.length)
    throw new Error('Choose a version with an attached source.');
  const contextual = contexts
    ? group.map((claim, index) => {
        const context = z
          .string()
          .trim()
          .min(8)
          .max(500)
          .parse(contexts[claim.id]);
        const sources = profile.sources.filter((source) =>
          profile.evidence.some(
            (evidence) =>
              claim.evidenceIds.includes(evidence.id) &&
              evidence.sourceId === source.id,
          ),
        );
        if (!sources.length) throw new Error('Every version needs a source.');
        const sensitivity = [
          claim.sensitivity,
          ...sources.map((source) => source.sensitivity),
        ].includes('restricted')
          ? 'restricted'
          : claim.sensitivity === 'private' ||
              sources.some((source) => source.sensitivity === 'private')
            ? 'private'
            : 'public';
        const allowedUses = claim.allowedUses.filter((use) =>
          sources.every((source) => source.allowedUses.includes(use)),
        );
        return {
          claim,
          context,
          statement: `${claim.statement} — ${context}`,
          sourceId: `${ids.source}:context:${index}`,
          evidenceId: `${ids.evidence}:context:${index}`,
          sensitivity,
          allowedUses,
        };
      })
    : [];
  if (
    contexts &&
    new Set(contextual.map((item) => item.context.toLowerCase())).size !==
      group.length
  )
    throw new Error('Use distinct contexts for the versions.');
  const resolution = resolutionSchema.parse({
    statements: [
      ...group.map((claim) => claim.statement),
      ...contextual.map((item) => item.statement),
    ],
    selected: selected.statement,
    resolvedAt,
  });
  return profileSchema.parse({
    ...profile,
    claims: [
      ...profile.claims.map((claim) =>
        group.some((item) => item.id === claim.id)
          ? {
              ...claim,
              level:
                !contexts && claim.id === selectedId
                  ? 'declared'
                  : 'unsupported',
            }
          : claim,
      ),
      ...contextual.map((item) => ({
        ...item.claim,
        id: `${item.sourceId}:claim`,
        statement: item.statement,
        level: 'declared',
        evidenceIds: [...item.claim.evidenceIds, item.evidenceId],
        sensitivity: item.sensitivity,
        allowedUses: item.allowedUses,
      })),
    ],
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
      ...contextual.map((item) => ({
        id: item.sourceId,
        kind: 'manual',
        title: `Context declared by ${profile.name} · ${resolvedAt.slice(0, 10)}`,
        sensitivity: item.sensitivity,
        allowedUses: item.allowedUses,
        trust: 'untrusted-data',
      })),
    ],
    evidence: [
      ...profile.evidence,
      {
        id: ids.evidence,
        sourceId: ids.source,
        label: 'Human source arbitration',
        excerpt: JSON.stringify(resolution),
      },
      ...contextual.map((item) => ({
        id: item.evidenceId,
        sourceId: item.sourceId,
        label: 'Human source context',
        excerpt: item.statement,
      })),
    ],
  });
}
