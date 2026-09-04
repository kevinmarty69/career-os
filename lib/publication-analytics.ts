import { z } from 'zod';

export const publicationEventSchema = z
  .object({
    type: z.enum(['open', 'section', 'action', 'download']),
    key: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine((event) => event.type === 'open' || event.key, {
    message: 'Tracked interactions require a key.',
  });
