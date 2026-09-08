'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { browserSupabase } from '@/lib/auth-client';
import {
  LocaleSwitch,
  useI18n,
  useTranslations,
} from '@/components/i18n/i18n-provider';
import { authMessages } from '@/lib/i18n/dictionaries/auth';
import { HostingOptions } from '@/components/onboarding/hosting-options';

type Mode = 'sign-in' | 'sign-up' | 'workspace';
type OrganizationChoice = { id: string; name: string };

export function AuthForm() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations([authMessages]);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordLogin, setPasswordLogin] = useState(false);
  const [accountName, setAccountName] = useState('Personal');
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('workspace')) return;
    let active = true;
    void fetch('/api/auth/workspaces', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const workspaces = await response.json();
        if (active) {
          setOrganizations(workspaces);
          setMode('workspace');
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function continueWithWorkspace(name: string) {
    const response = await fetch('/api/auth/workspaces', { cache: 'no-store' });
    if (!response.ok) throw new Error('WORKSPACE_FAILED');
    setAccountName(name || 'Personal');
    setOrganizations(await response.json());
    setMode('workspace');
    setPending(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();

    try {
      if (!passwordLogin) {
        const result = await browserSupabase().auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: mode === 'sign-up',
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            ...(mode === 'sign-up' ? { data: { name } } : {}),
          },
        });
        if (result.error) throw new Error('AUTH_FAILED');
        setNotice(
          locale === 'fr'
            ? 'Si cette adresse est autorisée, un lien de connexion vous a été envoyé. Vérifiez votre boîte mail.'
            : 'If this address is eligible, a sign-in link has been sent. Check your email.',
        );
        setPending(false);
        return;
      }
      const result =
        mode === 'sign-up'
          ? await browserSupabase().auth.signUp({
              email,
              password,
              options: {
                data: { name },
                emailRedirectTo: `${window.location.origin}/auth/callback`,
              },
            })
          : await browserSupabase().auth.signInWithPassword({
              email,
              password,
            });
      if (result.error) throw new Error('AUTH_FAILED');
      if (!result.data.session) {
        setNotice(
          locale === 'fr'
            ? 'Vérifiez votre boîte mail pour confirmer votre compte, puis connectez-vous.'
            : 'Check your email to confirm your account, then sign in.',
        );
        setMode('sign-in');
        setPending(false);
        return;
      }
      await continueWithWorkspace(
        mode === 'sign-up'
          ? name
          : String(result.data.user?.user_metadata.name ?? 'Personal'),
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'WORKSPACE_FAILED'
          ? t('auth.your.account.is.ready.but.the.workspace.could.not')
          : t('auth.authentication.failed.check.your.details.and.retry'),
      );
      if (cause instanceof Error && cause.message === 'WORKSPACE_FAILED') {
        setMode('sign-in');
      }
      setPending(false);
    }
  }

  async function selectOrganization(organizationId: string) {
    if (pending) return;
    setPending(true);
    setError('');
    const result = await fetch('/api/auth/workspaces', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: organizationId }),
    }).catch(() => null);
    if (!result?.ok) {
      setError(t('auth.the.workspace.could.not.be.selected.retry'));
      setPending(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const name = String(form.get('workspace') ?? '').trim();
    const result = await fetch('/api/auth/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!result?.ok) {
      setError(t('auth.the.workspace.could.not.be.created.retry'));
      setPending(false);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-shell auth-handoff">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <Image
              src="/brand/symbol/careeros-symbol-inverse.svg"
              width={18}
              height={18}
              alt=""
            />
          </span>
          <strong>Career OS</strong>
          <LocaleSwitch compact />
        </div>
        {mode !== 'workspace' ? (
          <div
            className="auth-tabs"
            aria-label={t('auth.authentication.method')}
          >
            <button
              disabled={pending}
              aria-pressed={mode === 'sign-in'}
              className={mode === 'sign-in' ? 'active' : ''}
              onClick={() => {
                setMode('sign-in');
                setError('');
                setNotice('');
              }}
              type="button"
            >
              {t('auth.sign.in')}{' '}
            </button>
            <button
              disabled={pending}
              aria-pressed={mode === 'sign-up'}
              className={mode === 'sign-up' ? 'active' : ''}
              onClick={() => {
                setMode('sign-up');
                setError('');
                setNotice('');
              }}
              type="button"
            >
              {t('auth.create.account')}{' '}
            </button>
          </div>
        ) : null}
        <header>
          <h1 id="auth-title">
            {mode === 'sign-in'
              ? t('auth.welcome.back')
              : mode === 'sign-up'
                ? t('auth.create.your.account')
                : organizations.length
                  ? t('auth.choose.a.workspace')
                  : t('auth.create.your.workspace')}
          </h1>
          <p>
            {mode === 'sign-in'
              ? t('auth.sign.in.to.manage.and.revoke.private.application.links')
              : mode === 'sign-up'
                ? t(
                    'auth.your.account.keeps.applications.isolated.from.every.other.user',
                  )
                : t(
                    'auth.private.links.are.always.created.inside.one.active.workspace',
                  )}
          </p>
        </header>
        {notice ? <p role="status">{notice}</p> : null}
        {mode === 'workspace' && error ? (
          <p role="alert" className="auth-error">
            {error}
          </p>
        ) : null}
        {mode === 'workspace' && organizations.length ? (
          <div className="organization-list">
            {organizations.map((organization) => (
              <button
                disabled={pending}
                key={organization.id}
                onClick={() => void selectOrganization(organization.id)}
                type="button"
              >
                {locale === 'fr' ? 'Utiliser' : 'Use'} {organization.name}
              </button>
            ))}
          </div>
        ) : mode === 'workspace' ? (
          <form onSubmit={createWorkspace}>
            <label>
              {t('auth.workspace.name')}{' '}
              <input
                disabled={pending}
                autoComplete="organization"
                defaultValue={
                  locale === 'fr'
                    ? `Espace de ${accountName}`
                    : `${accountName}'s workspace`
                }
                maxLength={80}
                minLength={2}
                name="workspace"
                required
              />
            </label>
            <button disabled={pending} type="submit">
              {pending ? t('auth.please.wait') : t('auth.create.workspace')}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            {mode === 'sign-up' ? (
              <label>
                {t('auth.name')}{' '}
                <input
                  disabled={pending}
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
                disabled={pending}
                autoComplete="email"
                name="email"
                placeholder="alex@example.com"
                required
                spellCheck={false}
                type="email"
              />
            </label>
            {passwordLogin ? (
              <label>
                {t('auth.password')}{' '}
                <input
                  disabled={pending}
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
                  <span>{t('auth.use.at.least.12.characters')}</span>
                ) : null}
              </label>
            ) : (
              <p className="auth-method-hint">
                {locale === 'fr'
                  ? 'Un lien de connexion par email. Aucun mot de passe à retenir.'
                  : 'An email sign-in link. No password to remember.'}
              </p>
            )}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button disabled={pending} type="submit">
              {pending
                ? t('auth.please.wait')
                : !passwordLogin
                  ? locale === 'fr'
                    ? 'Recevoir mon lien'
                    : 'Send my sign-in link'
                  : mode === 'sign-in'
                    ? t('auth.sign.in')
                    : t('auth.create.account')}
            </button>
            <button
              type="button"
              className="auth-method-toggle"
              disabled={pending}
              onClick={() => {
                setPasswordLogin(!passwordLogin);
                setError('');
                setNotice('');
              }}
            >
              {passwordLogin
                ? locale === 'fr'
                  ? 'Utiliser un lien de connexion'
                  : 'Use an email sign-in link'
                : locale === 'fr'
                  ? 'Utiliser un mot de passe'
                  : 'Use a password'}
            </button>
          </form>
        )}
        <Link className="auth-back" href="/">
          {t('auth.back.to.local.workspace')}{' '}
        </Link>
      </section>
      {mode !== 'workspace' && <HostingOptions />}
    </main>
  );
}
