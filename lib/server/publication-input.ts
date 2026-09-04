import { z } from 'zod';
import { pageSpecSchema, profileSchema } from '../schemas';

export const publishedPayloadSchema = z
  .object({
    profile: profileSchema,
    spec: pageSpecSchema,
  })
  .strict();

export const publicationInputSchema = z
  .object({
    runId: z.string().uuid(),
    rawToken: z.string().min(64).max(128),
  })
  .strict();
