import { z } from 'zod';
import { httpUrlSchema } from './http-url';

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
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    stage: applicationStageSchema.default('draft'),
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
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type Application = z.infer<typeof applicationSchema>;
