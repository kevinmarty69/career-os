import { z } from 'zod';

export const httpUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'URL credentials are not allowed.');

export function optionalHttpUrl(value: unknown) {
  const parsed = httpUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
