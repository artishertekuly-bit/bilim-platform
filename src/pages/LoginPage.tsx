import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type LoginLocationState = {
  from?: {
    pathname?: string;
    search?: string;
  };
  info?: string;
};

const MAX_EMAIL_CHARS = 320;
const MAX_PASSWORD_CHARS = 256;
const MAX_ALERT_CHARS = 700;
const MAX_REDIRECT_CHARS = 500;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_ALERT_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeEmail(value: unknown): string {
  return cleanText(value, MAX_EMAIL_CHARS).toLowerCase();
}

function normalizePassword(value: unknown): string {
  return cleanRawText(value).slice(0, MAX_PASSWORD_CHARS);
}

function normalizeSearch(value: unknown): string {
  const search = cleanRawText(value).trim();

  if (!search || search === '?') return '';

  return search.startsWith('?') ? search.slice(0, MAX_REDIRECT_CHARS) : '';
}

function normalizeRedirectPath(pathname?: string, search?: string): string {
  const path = cleanRawText(pathname).trim();

  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path === '/login' ||
    path === '/register' ||
    path === '/forgot-password' ||
    path === '/verify-email'
  ) {
    return '/dashboard';
  }

  return `${limitText(path, MAX_REDIRECT_CHARS)}${normalizeSearch(search)}`;
}

function resolveLoginError(error: unknown): { error?: string; info?: string } {
  const message =
    error instanceof Error ? cleanText(error.message) : t('auth.login_failed');

  if (message.toLowerCase().includes('email not confirmed')) {
    return {
      info: t('auth.email_not_confirmed_info'),
    };
  }

  return {
    error: message || t('auth.login_failed'),
  };
}

function AuthAlert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning';
  children: string;
}) {
  const isDanger = tone === 'danger';
  const message = cleanText(children);

  if (!message) return null;

  return (
    <div
      className={cn(
        'mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm leading-5',
        isDanger
          ? 'border-destructive-muted bg-destructive-soft text-destructive'
          : 'border-warning-muted bg-warning-soft text-warning-foreground',
      )}
    >
      {isDanger ? (
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      ) : (
        <Info size={15} className="mt-0.5 shrink-0" />
      )}

      <span>{message}</span>
    </div>
  );
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const locationState = location.state as LoginLocationState | null;

  const redirectTo = useMemo(
    () =>
      normalizeRedirectPath(
        locationState?.from?.pathname,
        locationState?.from?.search,
      ),
    [locationState],
  );

  const incomingInfo = cleanText(locationState?.info || '');

  useEffect(() => {
    if (incomingInfo) {
      setInfo(incomingInfo);
    }
  }, [incomingInfo]);

  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);
  const canSubmit =
    normalizedEmail.length > 0 && normalizedPassword.length > 0 && !loading;
  const authBusy = loading || googleLoading;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const result = await login(normalizedEmail, normalizedPassword);

      if (result.requiresEmailConfirmation) {
        setInfo(cleanText(result.message || t('auth.email_confirmation_required')));
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const resolved = resolveLoginError(err);

      if (resolved.info) {
        setInfo(resolved.info);
      } else if (resolved.error) {
        setError(resolved.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    setInfo('');

    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? cleanText(err.message)
          : 'Google арқылы кіру мүмкін болмады.',
      );
      setGoogleLoading(false);
    }
  };

  const handleVerifyEmailClick = () => {
    const nextEmail = normalizeEmail(email);

    if (!nextEmail) return;

    navigate('/verify-email', {
      state: {
        email: nextEmail,
        info: 'Email растау кодын енгізіңіз.',
      },
    });
  };

  return (
    <div className="kazakh-ornament-bg grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="relative hidden overflow-hidden border-r border-border bg-card lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
          <div className="absolute right-10 top-20 h-72 w-72 rounded-full bg-secondary-soft blur-3xl" />
          <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-accent-soft blur-3xl" />
        </div>

        <div className="absolute left-8 top-8 text-primary">
          <KazakhOrnament variant="corner" />
        </div>

        <div className="absolute bottom-8 right-8 rotate-180 text-primary">
          <KazakhOrnament variant="corner" />
        </div>

        <div className="relative z-10 flex w-full items-center justify-center px-12">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-primary-muted bg-primary-soft text-primary shadow-soft">
              <GraduationCap size={32} />
            </div>

            <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
              Bilimcorp
            </h1>

            <p className="mx-auto max-w-sm text-sm leading-7 text-muted-foreground">
              {t('landing.hero_subtitle')}
            </p>

            <div className="mt-8 rounded-3xl border border-border bg-card/80 p-4 text-left shadow-soft backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-success-muted bg-success-soft text-success-foreground shadow-inner-soft">
                  <ShieldCheck size={18} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Қауіпсіз кіру
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Email немесе Google арқылы кіріңіз.
                  </p>
                </div>
              </div>
            </div>

            <KazakhOrnament variant="divider" className="mt-8" />
          </div>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap size={18} />
            </div>

            <div>
              <span className="block text-sm font-semibold">Bilimcorp</span>
              <span className="block text-[11px] text-muted-foreground">
                Оқу платформасы
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft-lg">
            <div className="border-b border-border/70 bg-card/80 px-5 py-5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck size={12} />
                Кіру
              </div>

              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {t('auth.login_title')}
              </h2>

              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t('auth.login_hint')}
              </p>
            </div>

            <div className="p-5">
              {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
              {info ? <AuthAlert tone="warning">{info}</AuthAlert> : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">
                    {t('auth.email')}
                  </Label>

                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(normalizeEmail(event.target.value))
                    }
                    placeholder="email@example.com"
                    required
                    disabled={authBusy}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium">
                    {t('auth.password')}
                  </Label>

                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) =>
                        setPassword(normalizePassword(event.target.value))
                      }
                      placeholder="••••••••"
                      required
                      className="pr-11"
                      disabled={authBusy}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((previous) => !previous)}
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                      aria-label={
                        showPassword
                          ? t('auth.hide_password')
                          : t('auth.show_password')
                      }
                      disabled={authBusy}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={!canSubmit || authBusy}
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      {t('auth.login_btn')}
                      <ArrowRight size={15} className="ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">немесе</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={authBusy}
              >
                {googleLoading ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Ашылуда...
                  </>
                ) : (
                  'Google арқылы кіру'
                )}
              </Button>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground transition-colors hover:text-primary hover:underline"
                >
                  Құпия сөзді ұмыттым
                </Link>

                {normalizedEmail ? (
                  <button
                    type="button"
                    onClick={handleVerifyEmailClick}
                    className="text-right font-medium text-foreground transition-colors hover:text-primary hover:underline"
                  >
                    Email кодын енгізу
                  </button>
                ) : null}
              </div>

              <KazakhOrnament variant="divider" className="my-5" />

              <p className="text-center text-sm text-muted-foreground">
                {t('auth.no_account')}{' '}
                <Link
                  to="/register"
                  className="font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                >
                  {t('nav.register')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}