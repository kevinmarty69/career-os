import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Real GoTrue sessions and SSR cookies. Administrative confirmation is limited to
// the disposable local instance; delivery/confirmation is tested separately.
export class BrowserSession {
  private readonly cookies = new Map<string, string>();
  userId = '';
  workspaceId = '';

  private client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
    return createServerClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () =>
            [...this.cookies].map(([name, value]) => ({ name, value })),
          setAll: (values) => {
            for (const { name, value } of values) this.cookies.set(name, value);
          },
        },
      },
    );
  }

  async signUp(input: { name: string; email: string; password: string }) {
    const client = this.client();
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    });
    assert.equal(created.error, null, 'Synthetic Supabase identity created');
    const signed = await client.auth.signInWithPassword(input);
    assert.equal(signed.error, null, 'Real Supabase password sign-in');
    this.userId = signed.data.user!.id;
    return Response.json({ user: signed.data.user });
  }

  async signIn(input: { email: string; password: string }) {
    const signed = await this.client().auth.signInWithPassword(input);
    assert.equal(signed.error, null);
    this.userId = signed.data.user!.id;
    return Response.json({ user: signed.data.user });
  }

  async request(path: string, method = 'GET', body?: unknown, headers = {}) {
    const base = process.env.TEST_BASE_URL!;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'GET'
          ? {}
          : { origin: process.env.TEST_REQUEST_ORIGIN ?? base }),
        cookie: [...this.cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join('; '),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0];
      const separator = pair.indexOf('=');
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    if (path === '/api/auth/workspaces' && response.ok && method !== 'GET')
      this.workspaceId = (await response.clone().json()).id;
    return response;
  }
  post(path: string, body: unknown, headers = {}) {
    return this.request(path, 'POST', body, headers);
  }
  get(path: string) {
    return this.request(path);
  }
  put(path: string, body: unknown) {
    return this.request(path, 'PUT', body);
  }
  delete(path: string) {
    return this.request(path, 'DELETE');
  }
}
