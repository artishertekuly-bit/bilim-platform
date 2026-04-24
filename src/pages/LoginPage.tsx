import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import KazakhOrnament from '@/components/KazakhOrnament';
import { GraduationCap, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function resolveLoginError(error: unknown): { error?: string; info?: string } {
  const message = error instanceof Error ? error.message : t('auth.login_failed');

  if (message.toLowerCase().includes('email not confirmed')) {
    return {
      info: t('auth.email_not_confirmed_info'),
    };
  }

  return {
    error: message || t('auth.login_failed'),
  };
}

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
  info?: string;
};

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

  const redirectTo = useMemo(() => {
    const state = location.state as LoginLocationState | null;
    const fromPath = state?.from?.pathname;

    if (!fromPath || fromPath === '/login' || fromPath === '/register') {
      return '/dashboard';
    }

    return fromPath;
  }, [location.state]);

  const incomingInfo = (location.state as LoginLocationState | null)?.info || '';

  useEffect(() => {
    if (incomingInfo) {
      setInfo(incomingInfo);
    }
  }, [incomingInfo]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;
  const authBusy = loading || googleLoading;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const result = await login(email, password);

      if (result.requiresEmailConfirmation) {
        setInfo(result.message || t('auth.email_confirmation_required'));
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
          ? err.message
          : 'Google арқылы кіру мүмкін болмады.'
      );
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex kazakh-ornament-bg">
      <div className="relative hidden items-center justify-center overflow-hidden bg-primary lg:flex lg:w-1/2">
        <div className="absolute left-8 top-8">
          <KazakhOrnament variant="corner" className="text-primary-foreground" />
        </div>

        <div className="absolute bottom-8 right-8 rotate-180">
          <KazakhOrnament variant="corner" className="text-primary-foreground" />
        </div>

        <div className="relative z-10 px-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/10">
            <GraduationCap size={32} className="text-primary-foreground" />
          </div>

          <h1 className="mb-3 text-3xl font-bold text-primary-foreground">Bilim</h1>

          <p className="mx-auto max-w-sm text-sm leading-relaxed text-primary-foreground/70">
            {t('landing.hero_subtitle')}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <GraduationCap size={16} className="text-primary-foreground" />
            </div>
            <span className="font-semibold">Bilim</span>
          </div>

          <h2 className="mb-1 text-xl font-semibold">{t('auth.login_title')}</h2>
          <p className="mb-6 text-sm text-muted-foreground">{t('auth.login_hint')}</p>

          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {info ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
              {info}
            </p>
          ) : null}

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
                onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10"
                  disabled={authBusy}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground disabled:opacity-50"
                  aria-label={
                    showPassword ? t('auth.hide_password') : t('auth.show_password')
                  }
                  disabled={authBusy}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit || authBusy}>
              {loading ? t('common.loading') : t('auth.login_btn')}
              <ArrowRight size={15} className="ml-2" />
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
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
            {googleLoading ? 'Google ашылуда...' : 'Google арқылы кіру'}
          </Button>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <Link to="/forgot-password" className="text-muted-foreground hover:underline">
              Құпия сөзді ұмыттым
            </Link>

            {email.trim() ? (
              <button
                type="button"
                onClick={() =>
                  navigate('/verify-email', {
                    state: {
                      email: email.trim(),
                      info: 'Email растау кодын енгізіңіз.',
                    },
                  })
                }
                className="text-right text-foreground hover:underline"
              >
                Email кодын енгізу
              </button>
            ) : null}
          </div>

          <KazakhOrnament variant="divider" className="my-4" />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('auth.no_account')}{' '}
            <Link to="/register" className="font-medium text-foreground hover:underline">
              {t('nav.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}