import { z } from 'zod';
import { httpUrlSchema } from './http-url';

export const applicationContactRelationshipSchema = z.enum([
  'hiring_manager',
  'founder_or_technical_leader',
  'internal_recruiter',
  'job_author',
  'team_leader',
]);

export const applicationContactConfidenceSchema = z.enum([
  'verified',
  'likely',
  'uncertain',
]);

export const applicationContactStatusSchema = z.enum([
  'suggested',
  'contacted',
  'accepted',
  'follow_up',
  'replied',
  'closed',
]);

const sourceSupportSchema = z.enum([
  'identity',
  'current_role',
  'hiring_scope',
  'job_authorship',
]);

export const applicationContactSourceSchema = z
  .object({
    url: httpUrlSchema,
    title: z.string().trim().min(1).max(240),
    collectedAt: z.string().datetime({ offset: true }),
    trust: z.enum(['authoritative', 'corroborating', 'weak']),
    supports: z.array(sourceSupportSchema).min(1).max(4),
  })
  .strict();

export const applicationContactDraftSchema = z
  .object({
    rank: z.number().int().min(1).max(3),
    name: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(200),
    profileUrl: httpUrlSchema,
    relationship: applicationContactRelationshipSchema,
    rationale: z.string().trim().min(1).max(1_000),
    sources: z.array(applicationContactSourceSchema).min(1).max(6),
    confidence: applicationContactConfidenceSchema,
    connectionNote: z.string().trim().min(1).max(500),
    acceptedMessage: z.string().trim().min(1).max(2_000),
    followUpMessage: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((contact, context) => {
    if (
      new Set(contact.sources.map(({ url }) => url)).size !==
      contact.sources.length
    )
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Contact source URLs must be unique.',
      });
    const supports = new Set(
      contact.sources.flatMap(({ supports }) => supports),
    );
    if (!supports.has('identity') || !supports.has('current_role'))
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Public sources must support both identity and current role.',
      });
    if (
      contact.confidence === 'verified' &&
      !contact.sources.some(({ trust }) => trust === 'authoritative') &&
      contact.sources.filter(({ trust }) => trust === 'corroborating').length <
        2
    )
      context.addIssue({
        code: 'custom',
        path: ['confidence'],
        message:
          'Verified confidence requires one authoritative or two corroborating sources.',
      });
    if (
      contact.relationship === 'hiring_manager' &&
      !contact.sources.some(
        (source) =>
          source.trust !== 'weak' && source.supports.includes('hiring_scope'),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message:
          'A hiring manager requires non-weak public evidence of hiring scope.',
      });
  });

export const updateApplicationContactInputSchema = z
  .object({
    connectionNote: z.string().trim().min(1).max(500),
    acceptedMessage: z.string().trim().min(1).max(2_000),
    followUpMessage: z.string().trim().min(1).max(2_000).nullable(),
    status: applicationContactStatusSchema,
    followUpAt: z.string().datetime({ offset: true }).nullable(),
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === 'follow_up' && !input.followUpAt)
      context.addIssue({
        code: 'custom',
        path: ['followUpAt'],
        message: 'A planned follow-up requires a date.',
      });
  });

export const applicationContactSchema = applicationContactDraftSchema
  .extend({
    contactId: z.string().uuid(),
    applicationId: z.string().uuid(),
    status: applicationContactStatusSchema,
    followUpAt: z.string().datetime().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const applicationContactListSchema = z
  .object({ contacts: z.array(applicationContactSchema).max(3) })
  .strict();

export const contactResearchInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application-contact-research'),
    applicationId: z.string().uuid(),
    company: z.string().trim().min(1).max(200),
    role: z.string().trim().min(1).max(200),
    publicSources: z
      .array(
        z
          .object({
            url: httpUrlSchema,
            title: z.string().trim().min(1).max(240),
            collectedAt: z.string().datetime({ offset: true }),
            excerpt: z.string().trim().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export const contactResearchOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('application-contact-research-result'),
    contacts: z.array(applicationContactDraftSchema).max(3),
  })
  .strict()
  .superRefine(({ contacts }, context) => {
    const ranks = contacts.map(({ rank }) => rank);
    const profiles = contacts.map(({ profileUrl }) => profileUrl);
    if (new Set(ranks).size !== ranks.length)
      context.addIssue({
        code: 'custom',
        path: ['contacts'],
        message: 'Contact ranks must be unique.',
      });
    if (new Set(profiles).size !== profiles.length)
      context.addIssue({
        code: 'custom',
        path: ['contacts'],
        message: 'Contact profiles must be unique.',
      });
  });

export type ApplicationContactDraft = z.infer<
  typeof applicationContactDraftSchema
>;
export type ApplicationContact = z.infer<typeof applicationContactSchema>;
export type UpdateApplicationContactInput = z.infer<
  typeof updateApplicationContactInputSchema
>;
