import { authenticatedAccount } from '@/lib/server/auth';

export async function GET() {
  try {
    const account = await authenticatedAccount();
    if (!account) return Response.json({ user: null }, { status: 401 });
    return Response.json(
      {
        user: {
          name: String(
            account.user.user_metadata.name ??
              account.user.user_metadata.full_name ??
              '',
          ),
          email: account.user.email ?? '',
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ user: null }, { status: 503 });
  }
}
