import { z } from 'zod';
import {
  jobPostingExtractionSchema,
  MAX_JOB_DESCRIPTION_CHARS,
} from './job-posting-extractor';
import { httpUrlSchema } from './http-url';

export const jobSourceKindSchema = z.enum([
  'generic_html',
  'greenhouse',
  'ashby',
]);
export const remoteModeSchema = z.enum([
  'unknown',
  'onsite',
  'hybrid',
  'remote',
]);
export const contractTypeSchema = z.enum([
  'unknown',
  'full_time',
  'part_time',
  'internship',
  'contract',
  'temporary',
]);
export const lifecycleSchema = z.enum([
  'open',
  'changed',
  'closed',
  'reposted',
]);
export const lifecycleSignalSchema = z.enum(['unknown', 'open', 'closed']);
export const observationChangeSchema = z.enum([
  'first_seen',
  'unchanged',
  'changed',
  'closed',
  'reposted',
]);
export const matchMethodSchema = z.enum([
  'new',
  'exact_source',
  'canonical_url',
  'fingerprint',
]);

const nullableText = (maximum: number) =>
  z.string().min(1).max(maximum).nullable();
const nullableMoney = z.number().nonnegative().max(1_000_000_000).nullable();

export const normalizedJobFieldsSchema = z
  .object({
    location: nullableText(300),
    remoteMode: remoteModeSchema,
    contractType: contractTypeSchema,
    salaryMin: nullableMoney,
    salaryMax: nullableMoney,
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    externalId: nullableText(300),
    sourceKind: jobSourceKindSchema,
    lifecycleSignal: lifecycleSignalSchema,
  })
  .superRefine(({ salaryMin, salaryMax, salaryCurrency }, context) => {
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax)
      context.addIssue({
        code: 'custom',
        path: ['salaryMax'],
        message: 'Maximum salary must be greater than or equal to minimum.',
      });
    if (
      (salaryMin !== null || salaryMax !== null) !==
      (salaryCurrency !== null)
    )
      context.addIssue({
        code: 'custom',
        path: ['salaryCurrency'],
        message: 'Salary values and currency must be supplied together.',
      });
  })
  .strict();

export const jobSourceRecordSchema = z
  .object({
    sourceRecordId: z.string().uuid(),
    requestedUrl: httpUrlSchema,
    finalUrl: httpUrlSchema,
    fetchedUrl: httpUrlSchema,
    sourceKind: jobSourceKindSchema,
    externalId: nullableText(300),
    matchedBy: matchMethodSchema,
    fetchedAt: z.string().datetime(),
    contentType: z.enum(['text/html', 'text/plain', 'application/json']),
    bytes: z.number().int().nonnegative().max(1_048_576),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const jobObservationSchema = z
  .object({
    observationId: z.string().uuid(),
    sourceRecordId: z.string().uuid(),
    observedAt: z.string().datetime(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    change: observationChangeSchema,
    lifecycleSignal: lifecycleSignalSchema,
    matchedBy: matchMethodSchema,
    normalized: normalizedJobFieldsSchema,
  })
  .strict();

export const discoveredJobSchema = z
  .object({
    opportunityId: z.string().uuid(),
    company: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(MAX_JOB_DESCRIPTION_CHARS).optional(),
    sourceUrl: httpUrlSchema,
    location: nullableText(300),
    remoteMode: remoteModeSchema,
    contractType: contractTypeSchema,
    salaryMin: nullableMoney,
    salaryMax: nullableMoney,
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    publishedAt: z.string().datetime().nullable(),
    externalId: nullableText(300),
    sourceKind: jobSourceKindSchema,
    lifecycle: lifecycleSchema,
    fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sources: z.array(jobSourceRecordSchema).min(1).max(100),
    observations: z.array(jobObservationSchema).min(1).max(100),
    firstSeenAt: z.string().datetime(),
    lastSeenAt: z.string().datetime(),
  })
  .refine(
    ({ company, role, description }) => Boolean(company || role || description),
    'At least one discovered job field is required.',
  )
  .strict();

export const opportunityImportInputSchema = z
  .object({ url: z.string().min(1).max(2_048) })
  .strict();

export const discoveredJobPersistenceInputSchema = z
  .object({
    extraction: jobPostingExtractionSchema,
    normalized: normalizedJobFieldsSchema,
    provenance: jobSourceRecordSchema.omit({
      sourceRecordId: true,
      matchedBy: true,
      sourceKind: true,
      externalId: true,
    }),
  })
  .superRefine(({ extraction, provenance }, context) => {
    if (
      new URL(extraction.sourceUrl).href !== new URL(provenance.finalUrl).href
    )
      context.addIssue({
        code: 'custom',
        path: ['extraction', 'sourceUrl'],
        message: 'The extraction URL must match the canonical job URL.',
      });
  })
  .strict();

export const opportunityImportResponseSchema = z
  .object({ created: z.boolean(), opportunity: discoveredJobSchema })
  .strict();

export const opportunityListResponseSchema = z
  .object({ opportunities: z.array(discoveredJobSchema).max(100) })
  .strict();

export type DiscoveredJob = z.infer<typeof discoveredJobSchema>;
export type DiscoveredJobPersistenceInput = z.infer<
  typeof discoveredJobPersistenceInputSchema
>;
export type NormalizedJobFields = z.infer<typeof normalizedJobFieldsSchema>;
export type JobSourceKind = z.infer<typeof jobSourceKindSchema>;
