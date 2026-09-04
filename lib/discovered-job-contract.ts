import { z } from 'zod';
import {
  jobPostingExtractionSchema,
  MAX_JOB_DESCRIPTION_CHARS,
} from './job-posting-extractor';
import { httpUrlSchema } from './http-url';

export const jobSourceRecordSchema = z
  .object({
    sourceRecordId: z.string().uuid(),
    requestedUrl: httpUrlSchema,
    finalUrl: httpUrlSchema,
    fetchedAt: z.string().datetime(),
    contentType: z.enum(['text/html', 'text/plain']),
    bytes: z.number().int().nonnegative().max(1_048_576),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    trust: z.literal('untrusted-data'),
  })
  .strict();

export const discoveredJobSchema = z
  .object({
    opportunityId: z.string().uuid(),
    company: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(MAX_JOB_DESCRIPTION_CHARS).optional(),
    sourceUrl: httpUrlSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sources: z.array(jobSourceRecordSchema).min(1).max(100),
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
    provenance: jobSourceRecordSchema.omit({ sourceRecordId: true }),
  })
  .superRefine(({ extraction, provenance }, context) => {
    if (
      new URL(extraction.sourceUrl).href !== new URL(provenance.finalUrl).href
    )
      context.addIssue({
        code: 'custom',
        path: ['extraction', 'sourceUrl'],
        message: 'The extraction URL must match the fetched final URL.',
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
