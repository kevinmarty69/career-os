import { z } from 'zod';

export function parsePublicationCookie(
  publicationId: string,
  cookieHeader: string | null,
) {
  const id = z.string().uuid().safeParse(publicationId);
  if (!id.success) return;

  const name = `career_share_${id.data}`;
  for (const cookie of cookieHeader?.split(';') ?? []) {
    const separator = cookie.indexOf('=');
    if (separator > 0 && cookie.slice(0, separator).trim() === name)
      return {
        publicationId: id.data,
        token: cookie.slice(separator + 1).trim(),
      };
  }
}
