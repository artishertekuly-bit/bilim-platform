import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

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

  return search.startsWith('?')
    ? search.slice(0, MAX_REDIRECT_CHARS)
    : '';
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

function resolveLoginError(error: unknown): {
  error?: string;
  info?: string;
} {
  const message =
    error instanceof Error
      ? cleanText(error.message)
      : t('auth.login_failed');

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
      role="alert"
      className={cn(
        'mb-4 flex items-start gap-3 rounded-[1.25rem] border px-4 py-3 text-sm leading-5',
        isDanger
          ? 'border-destructive-muted bg-destructive-soft text-destructive'
          : 'border-warning-muted bg-warning-soft text-warning-foreground',
      )}
    >
      {isDanger ? (
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      ) : (
        <Info size={16} className="mt-0.5 shrink-0" />
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
  const authBusy = loading || googleLoading;
  const canSubmit =
    normalizedEmail.length > 0 &&
    normalizedPassword.length > 0 &&
    !authBusy;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const result = await login(normalizedEmail, normalizedPassword);

      if (result.requiresEmailConfirmation) {
        setInfo(
          cleanText(
            result.message ||
              t('auth.email_confirmation_required'),
          ),
        );
        return;
      }

      navigate(redirectTo, { replace: true });
    } catch (loginError: unknown) {
      const resolved = resolveLoginError(loginError);

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
    } catch (googleError: unknown) {
      setError(
        googleError instanceof Error
          ? cleanText(googleError.message)
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
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6 lg:flex lg:items-center lg:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-foreground/[0.045] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-foreground/[0.035] blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2.5rem] border border-border bg-card shadow-soft-lg lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative overflow-hidden bg-foreground p-6 text-background sm:p-9 lg:flex lg:min-h-[43rem] lg:flex-col lg:justify-between lg:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-background/10 blur-3xl"
          />

          <div className="relative">
            <Link
              to="/"
              aria-label="Sana басты беті"
              className="inline-flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-background/20 bg-background/10">
                <Sparkles size={17} />
              </span>
              <span className="text-sm font-black lowercase tracking-[-0.05em] text-background">
                sana
              </span>
            </Link>

            <div className="mt-12 max-w-xl lg:mt-20">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-background/50">
                Оқу және авторлық кеңістік
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-[-0.055em] text-background sm:text-5xl lg:text-6xl">
                Оқу мен идеяға қайта оралыңыз.
              </h1>

              <p className="mt-5 max-w-lg text-sm leading-6 text-background/65 sm:text-base">
                Курстарыңыз, сабақтарыңыз және Sana ЖИ құралдары бір
                аккаунтта сақталады.
              </p>
            </div>
          </div>

          <div className="relative mt-10 rounded-[1.5rem] border border-background/15 bg-background/[0.06] p-5 lg:mt-16">
            <ShieldCheck size={18} className="text-background/75" />
            <p className="mt-5 text-sm font-bold text-background">
              Қауіпсіз кіру
            </p>
            <p className="mt-2 text-xs leading-5 text-background/55">
              Email және Google арқылы кіру қолжетімді.
            </p>
          </div>
        </section>

        <section className="p-5 sm:p-8 lg:flex lg:flex-col lg:justify-center lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              <ShieldCheck size={12} />
              Sana аккаунты
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-[-0.045em]">
              Қайта келдіңіз
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Аккаунтыңызға кіріп, жұмысыңызды жалғастырыңыз.
            </p>

            <div className="mt-7">
              {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
              {info ? <AuthAlert tone="warning">{info}</AuthAlert> : null}

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl"
                onClick={handleGoogleLogin}
                disabled={authBusy}
              >
                {googleLoading ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Ашылуда...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={15} className="mr-2" />
                    Google арқылы кіру
                  </>
                )}
              </Button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">
                  немесе email
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(normalizeEmail(event.target.value))
                    }
                    placeholder="email@example.com"
                    maxLength={MAX_EMAIL_CHARS}
                    required
                    disabled={authBusy}
                    className="h-11 rounded-2xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('auth.password')}</Label>

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
                      maxLength={MAX_PASSWORD_CHARS}
                      required
                      className="h-11 rounded-2xl pr-11"
                      disabled={authBusy}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((previous) => !previous)
                      }
                      className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      aria-label={
                        showPassword
                          ? t('auth.hide_password')
                          : t('auth.show_password')
                      }
                      disabled={authBusy}
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full rounded-2xl"
                  disabled={!canSubmit}
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" />
                      Кіру...
                    </>
                  ) : (
                    <>
                      Кіру
                      <ArrowRight size={15} className="ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Құпиясөзді ұмыттым
                </Link>

                {normalizedEmail ? (
                  <button
                    type="button"
                    onClick={handleVerifyEmailClick}
                    className="text-right font-medium text-foreground transition-colors hover:underline"
                  >
                    Email кодын енгізу
                  </button>
                ) : null}
              </div>
            </div>

            <p className="mt-7 text-center text-sm text-muted-foreground">
              Аккаунтыңыз жоқ па?{' '}
              <Link
                to="/register"
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Тіркелу
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
