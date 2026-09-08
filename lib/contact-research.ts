import { z } from 'zod';
import { httpUrlSchema } from './http-url';
import { applicationContactDraftSchema } from './application-contact';

export const contactResearchRequestSchema = z
  .object({
    urls: z.array(httpUrlSchema).max(3).default([]),
    locale: z.enum(['en', 'fr']).default('en'),
  })
  .strict();

export const contactResearchResponseSchema = z.object({
  research: z
    .object({
      researchId: z.string().uuid(),
      status: z.enum([
        'pending',
        'completed',
        'failed',
        'outcome_unknown',
        'retryable',
      ]),
      drafts: z.array(applicationContactDraftSchema).max(3),
      sourcesRead: z.number().int().min(0).max(6),
      cost: z
        .object({
          amountMicros: z.number().int().nonnegative(),
          basis: z.enum(['usage_estimate', 'reserved_upper_bound']),
        })
        .optional(),
    })
    .nullable(),
});

export const contactExtractionSchema = z
  .object({
    people: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(200),
            role: z.string().trim().min(2).max(200),
            profileUrl: httpUrlSchema,
            sourceIndex: z.number().int().min(0).max(5),
            quote: z.string().trim().min(10).max(1_000),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();

export type ContactResearchSource = {
  url: string;
  title: string;
  collectedAt: string;
  excerpt: string;
  profileUrls: string[];
};

// Only literal identity/employment evidence survives model extraction. Relevance
// is still a suggestion, never proof that this person owns this vacancy.
export function groundContactSuggestions(
  raw: unknown,
  sources: ContactResearchSource[],
  company: string,
  targetRole: string,
  locale: 'en' | 'fr',
) {
  const people = contactExtractionSchema.parse(raw).people;
  const seen = new Set<string>();
  return people
    .map((person) => {
      const source = sources[person.sourceIndex];
      const quote = normalize(person.quote);
      if (
        !source ||
        !normalize(source.excerpt).includes(quote) ||
        ![person.name, person.role, company].every((part) =>
          quote.includes(normalize(part)),
        ) ||
        /\b(former|previously|was|ancien|ancienne|était)\b|\bex[- ]/i.test(
          quote,
        ) ||
        ![source.url, ...source.profileUrls].includes(person.profileUrl) ||
        seen.has(person.profileUrl)
      )
        throw new Error('Unsubstantiated contact');
      seen.add(person.profileUrl);
      const role = normalize(person.role);
      const relationship = /recruit|talent acquisition|recrutement/.test(role)
        ? ('internal_recruiter' as const)
        : /founder|fondateur|fondatrice|chief|cto|ceo/.test(role)
          ? ('founder_or_technical_leader' as const)
          : /head|lead|manager|directeur|directrice|responsable/.test(role)
            ? ('team_leader' as const)
            : undefined;
      // An employee's name alone is not enough to recommend them as a contact.
      if (!relationship) throw new Error('No supported hiring relationship');
      return { person, source, relationship };
    })
    .sort((a, b) => {
      const order = {
        internal_recruiter: 0,
        team_leader: 1,
        founder_or_technical_leader: 2,
      };
      return (
        order[a.relationship] - order[b.relationship] ||
        a.person.name.localeCompare(b.person.name)
      );
    })
    .map(({ person, source, relationship }, index) =>
      applicationContactDraftSchema.parse({
        rank: index + 1,
        name: person.name,
        role: person.role,
        profileUrl: person.profileUrl,
        relationship,
        rationale:
          locale === 'fr'
            ? `Le rôle public « ${person.role} » chez ${company} constitue une piste pour le poste ${targetRole}. Son implication dans ce recrutement reste à confirmer.`
            : `The public role “${person.role}” at ${company} is a lead for the ${targetRole} application. Their involvement in this vacancy remains unconfirmed.`,
        confidence: 'uncertain',
        sources: [
          {
            url: source.url,
            title: source.title,
            collectedAt: source.collectedAt,
            trust: 'weak',
            supports: ['identity', 'current_role'],
            excerpt: person.quote,
          },
        ],
        connectionNote:
          locale === 'fr'
            ? `Bonjour ${person.name}, je m'intéresse au poste ${targetRole} chez ${company}. Seriez-vous la bonne personne pour en échanger ?`
            : `Hi ${person.name}, I'm interested in the ${targetRole} role at ${company}. Would you be the right person to discuss it with?`,
        acceptedMessage:
          locale === 'fr'
            ? `Merci pour la connexion. Je prépare ma candidature au poste ${targetRole}. Pourriez-vous m'indiquer la bonne personne à contacter ?`
            : `Thank you for connecting. I'm preparing my application for ${targetRole}. Could you point me to the right person to contact?`,
        followUpMessage:
          locale === 'fr'
            ? `Bonjour ${person.name}, je reviens vers vous concernant le poste ${targetRole}. Merci pour votre aide si vous pouvez m'orienter.`
            : `Hi ${person.name}, following up about the ${targetRole} role. Thank you for any guidance you can share.`,
      }),
    );
}

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function publicPageLinks(html: string, base: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  )) {
    try {
      const url = new URL(match[1].replaceAll('&amp;', '&'), base);
      if (!httpUrlSchema.safeParse(url.href).success) continue;
      url.hash = '';
      links.add(url.href);
      if (links.size >= 100) break;
    } catch {
      /* Invalid links are not source evidence. */
    }
  }
  return [...links];
}
