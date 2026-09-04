import { z } from 'zod';
import { httpUrlSchema } from '../http-url';
import { pageSpecSchema, profileSchema } from '../schemas';

export const publishedPayloadSchema = z
  .object({
    profile: profileSchema,
    spec: pageSpecSchema,
    brand: z.object({ logoUrl: httpUrlSchema.optional() }).strict().optional(),
  })
  .strict();

export const publicationInputSchema = z
  .object({
    runId: z.string().uuid(),
    rawToken: z.string().min(64).max(128),
  })
  .strict();

export const publicationSummarySchema = z
  .object({
    publicationId: z.string().uuid(),
    applicationId: z.string().uuid(),
    company: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    publishedAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    status: z.enum(['active', 'expired', 'revoked']),
    version: z.number().int().positive(),
    isCurrent: z.boolean(),
  })
  .strict();

export type PublicationSummary = z.infer<typeof publicationSummarySchema>;

const publicationCursorSchema = publicationSummarySchema.pick({
  publicationId: true,
  publishedAt: true,
});

export function encodePublicationCursor(summary: PublicationSummary) {
  return Buffer.from(
    JSON.stringify({
      publicationId: summary.publicationId,
      publishedAt: summary.publishedAt,
    }),
  ).toString('base64url');
}

export function decodePublicationCursor(raw: string | null) {
  if (raw === null) return undefined;
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const decoded = publicationCursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return decoded.success ? decoded.data : null;
  } catch {
    return null;
  }
}
