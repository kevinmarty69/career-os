import { parsePublicationCookie } from '@/lib/publication-cookie';
import { safeFetchImage } from '@/lib/server/safe-http';
import { readPublication } from '@/lib/server/publications';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  const capability = parsePublicationCookie(
    (await context.params).publicationId,
    request.headers.get('cookie'),
  );
  if (!capability?.token) return unavailable();
  try {
    const publication = await readPublication(
      capability.publicationId,
      capability.token,
    );
    const logoUrl =
      publication?.brand?.logoUrl ?? publication?.spec.company.logoUrl;
    if (!logoUrl) return unavailable();
    const logo = await safeFetchImage(logoUrl);
    const body = new ArrayBuffer(logo.body.byteLength);
    new Uint8Array(body).set(logo.body);
    return new Response(body, {
      headers: {
        'cache-control': 'private, no-store',
        'content-length': String(logo.bytes),
        'content-security-policy': "default-src 'none'; sandbox",
        'content-type': logo.contentType,
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return new Response('Company logo unavailable.', {
    status: 404,
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
