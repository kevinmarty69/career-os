import { z } from 'zod';

export const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(2_048);

export function optionalHttpUrl(value: unknown) {
  const parsed = httpUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
