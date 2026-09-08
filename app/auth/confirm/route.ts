import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/server/supabase';
import { authRedirectUrl } from '@/lib/server/http';

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (tokenHash && (type === 'email' || type === 'signup')) {
    const { error } = await (
      await serverSupabase()
    ).auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(authRedirectUrl('workspace'));
  }
  return NextResponse.redirect(authRedirectUrl('confirmation'));
}
