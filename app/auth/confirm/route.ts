import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server/supabase';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (tokenHash && (type === 'email' || type === 'signup')) {
    const { error } = await (
      await serverSupabase()
    ).auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error)
      return NextResponse.redirect(
        new URL('/sign-in?workspace=1', request.url),
      );
  }
  return NextResponse.redirect(
    new URL('/sign-in?error=confirmation', request.url),
  );
}
