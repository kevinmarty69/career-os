'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

type Mode = 'sign-in' | 'sign-up' | 'workspace';
type OrganizationChoice = { id: string; name: string };

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [accountName, setAccountName] = useState('Personal');
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);

  async function continueWithWorkspace(name: string) {
    const session = await authClient.getSession();
    if (session.data?.session.activeOrganizationId) {
      router.push('/');
      router.refresh();
      return;
    }
    const organizations = await authClient.organization.list();
    if (organizations.error) throw new Error('WORKSPACE_FAILED');
    setAccountName(name || 'Personal');
    setOrganizations(organizations.data ?? []);
    setMode('workspace');
    setPending(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();

    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error('AUTH_FAILED');
      await continueWithWorkspace(
        mode === 'sign-up' ? name : (result.data?.user.name ?? 'Personal'),
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'WORKSPACE_FAILED'
          ? 'Your account is ready, but the workspace could not be loaded. Sign in to continue.'
          : 'Authentication failed. Check your details and retry.',
      );
      if (cause instanceof Error && cause.message === 'WORKSPACE_FAILED') {
        setMode('sign-in');
      }
      setPending(false);
    }
  }

  async function selectOrganization(organizationId: string) {
    setPending(true);
    setError('');
    const result = await authClient.organization.setActive({ organizationId });
    if (result.error) {
      setError('The workspace could not be selected. Retry.');
      setPending(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('workspace') ?? '').trim();
    const result = await authClient.organization.create({
      name,
      slug: `personal-${crypto.randomUUID()}`,
    });
    if (result.error) {
      setError('The workspace could not be created. Retry.');
      setPending(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <strong>Career OS</strong>
        </div>
        {mode !== 'workspace' ? (
          <div className="auth-tabs" aria-label="Authentication method">
            <button
              aria-pressed={mode === 'sign-in'}
              className={mode === 'sign-in' ? 'active' : ''}
              onClick={() => {
                setMode('sign-in');
                setError('');
              }}
              type="button"
            >
              Sign In
            </button>
            <button
              aria-pressed={mode === 'sign-up'}
              className={mode === 'sign-up' ? 'active' : ''}
              onClick={() => {
                setMode('sign-up');
                setError('');
              }}
              type="button"
            >
              Create Account
            </button>
          </div>
        ) : null}
        <header>
          <h1 id="auth-title">
            {mode === 'sign-in'
              ? 'Welcome back'
              : mode === 'sign-up'
                ? 'Create your account'
                : organizations.length
                  ? 'Choose a workspace'
                  : 'Create your workspace'}
          </h1>
          <p>
            {mode === 'sign-in'
              ? 'Sign in to manage and revoke private application links.'
              : mode === 'sign-up'
                ? 'Your account keeps applications isolated from every other user.'
                : 'Private links are always created inside one active workspace.'}
          </p>
        </header>
        {mode === 'workspace' && organizations.length ? (
          <div className="organization-list">
            {organizations.map((organization) => (
              <button
                disabled={pending}
                key={organization.id}
                onClick={() => void selectOrganization(organization.id)}
                type="button"
              >
                Use {organization.name}
              </button>
            ))}
          </div>
        ) : mode === 'workspace' ? (
          <form onSubmit={createWorkspace}>
            <label>
              Workspace name
              <input
                autoComplete="organization"
                defaultValue={`${accountName}'s workspace`}
                maxLength={80}
                minLength={2}
                name="workspace"
                required
              />
            </label>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button disabled={pending} type="submit">
              {pending ? 'Please wait…' : 'Create Workspace'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            {mode === 'sign-up' ? (
              <label>
                Name
                <input
                  autoComplete="name"
                  minLength={2}
                  name="name"
                  placeholder="Alex Morgan"
                  required
                />
              </label>
            ) : null}
            <label>
              Email
              <input
                autoComplete="email"
                name="email"
                placeholder="alex@example.com"
                required
                spellCheck={false}
                type="email"
              />
            </label>
            <label>
              Password
              <input
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                minLength={12}
                maxLength={128}
                name="password"
                required
                type="password"
              />
              {mode === 'sign-up' ? (
                <span>Use at least 12 characters.</span>
              ) : null}
            </label>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button disabled={pending} type="submit">
              {pending
                ? 'Please wait…'
                : mode === 'sign-in'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>
        )}
        <Link className="auth-back" href="/">
          Back to local workspace
        </Link>
      </section>
    </main>
  );
}
