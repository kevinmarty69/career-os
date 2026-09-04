import { z } from 'zod';
import { accessibleAccent } from './accent';
import { httpUrlSchema } from './http-url';

export const applicationCompanySourceSchema = z
  .object({
    url: httpUrlSchema
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password;
      })
      .transform((value) => new URL(value).href),
    origin: z.enum(['job-jsonld', 'api']),
  })
  .strict();

export const applicationCompanySourcesSchema = z
  .array(applicationCompanySourceSchema)
  .max(3)
  .refine(
    (sources) => new Set(sources.map(({ url }) => url)).size === sources.length,
    'Company source URLs must be unique.',
  );

export const applicationStageSchema = z.enum([
  'draft',
  'applied',
  'interview',
  'offer',
  'closed',
]);

export const applicationFieldsSchema = z
  .object({
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    description: z.string().min(1).max(20_000),
    url: httpUrlSchema.optional(),
    logoUrl: httpUrlSchema.optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .transform(accessibleAccent),
    stage: applicationStageSchema.default('draft'),
    companySources: applicationCompanySourcesSchema.optional(),
  })
  .strict();

export const updateApplicationInputSchema = applicationFieldsSchema
  .extend({
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const deleteApplicationInputSchema = z
  .object({
    expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const applicationSchema = applicationFieldsSchema
  .extend({
    applicationId: z.string().uuid(),
    discoveredJobId: z.string().uuid().optional(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type Application = z.infer<typeof applicationSchema>;
