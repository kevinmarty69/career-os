import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server/supabase';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await (
      await serverSupabase()
    ).auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL('/sign-in?workspace=1', request.url),
      );
  }
  return NextResponse.redirect(new URL('/sign-in?error=callback', request.url));
}
