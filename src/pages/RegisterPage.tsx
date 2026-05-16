import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type UserRole } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type RegisterableRole = Exclude<UserRole, 'admin'>;

type RoleOption = {
  value: RegisterableRole;
  label: string;
  hint: string;
};

const MAX_FULL_NAME_CHARS = 180;
const MAX_EMAIL_CHARS = 320;
const MAX_PASSWORD_CHARS = 256;
const MAX_ERROR_CHARS = 700;

const ROLES: RoleOption[] = [
  {
    value: 'student',
    label: t('role.student'),
    hint: 'Оқу',
  },
  {
    value: 'teacher',
    label: t('role.teacher'),
    hint: 'Курс құру',
  },
  {
    value: 'parent',
    label: t('role.parent'),
    hint: 'Бақылау',
  },
];

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_ERROR_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeFullName(value: unknown): string {
  return cleanText(value, MAX_FULL_NAME_CHARS);
}

function normalizeEmail(value: unknown): string {
  return cleanText(value, MAX_EMAIL_CHARS).toLowerCase();
}

function normalizePassword(value: unknown): string {
  return cleanRawText(value).slice(0, MAX_PASSWORD_CHARS);
}

function resolveRegisterError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message);
  }

  return t('auth.register_failed');
}

function AuthErrorAlert({ children }: { children: string }) {
  const message = cleanText(children);

  if (!message) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-2xl border border-destructive-muted bg-destructive-soft px-3 py-2.5 text-sm leading-5 text-destructive">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<RegisterableRole>('student');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizedFullName = normalizeFullName(fullName);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);

  const authBusy = loading || googleLoading;

  const canSubmit = useMemo(
    () =>
      normalizedFullName.length > 0 &&
      normalizedEmail.length > 0 &&
      normalizedPassword.length >= 6 &&
      !authBusy,
    [authBusy, normalizedEmail, normalizedFullName, normalizedPassword],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const result = await register(
        normalizedEmail,
        normalizedPassword,
        normalizedFullName,
        role,
      );

      if (result.requiresEmailConfirmation) {
        navigate('/verify-email', {
          replace: true,
          state: {
            email: normalizedEmail,
            info: cleanText(result.message || 'Email-ға жіберілген кодты енгізіңіз.'),
          },
        });
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(resolveRegisterError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    setError('');

    try {
      await loginWithGoogle(role);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? cleanText(err.message)
          : 'Google арқылы тіркелу мүмкін болмады.',
      );
      setGoogleLoading(false);
    }
  };

  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
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
          <div className="relative overflow-hidden border-b border-border/70 bg-card/80 px-5 py-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-10 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                <UserPlus size={12} />
                Тіркелу
              </div>

              <h2 className="text-center text-xl font-semibold tracking-tight text-foreground">
                {t('auth.register_title')}
              </h2>

              <p className="mt-1 text-center text-sm leading-6 text-muted-foreground">
                {t('auth.register_hint')}
              </p>
            </div>
          </div>

          <div className="p-5">
            {error ? <AuthErrorAlert>{error}</AuthErrorAlert> : null}

            <div className="mb-4 space-y-2">
              <Label className="text-xs font-medium">{t('auth.role')}</Label>

              <div className="grid gap-2 sm:grid-cols-3">
                {ROLES.map((item) => {
                  const active = role === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setRole(item.value)}
                      aria-pressed={active}
                      disabled={authBusy}
                      className={cn(
                        'rounded-2xl border p-3 text-left transition-all duration-200 ease-soft disabled:cursor-not-allowed disabled:opacity-60',
                        active
                          ? 'border-primary-muted bg-primary-soft text-primary shadow-soft'
                          : 'border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft/60 hover:text-primary hover:shadow-soft',
                      )}
                    >
                      <span className="block text-xs font-semibold">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-[10px] leading-4">
                        {item.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleRegister}
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
                  Google арқылы тіркелу
                </>
              )}
            </Button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">немесе</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-medium">
                  {t('auth.full_name')}
                </Label>

                <Input
                  id="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(normalizeFullName(event.target.value))
                  }
                  placeholder={t('auth.full_name_placeholder')}
                  required
                  disabled={authBusy}
                />
              </div>

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
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(normalizePassword(event.target.value))
                    }
                    placeholder="••••••••"
                    required
                    minLength={6}
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

                <p className="rounded-2xl border border-border bg-surface-soft/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                  Кемінде 6 таңба.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {loading ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    {t('auth.register_btn')}
                    <ArrowRight size={15} className="ml-2" />
                  </>
                )}
              </Button>
            </form>

            <KazakhOrnament variant="divider" className="my-5" />

            <p className="text-center text-sm text-muted-foreground">
              {t('auth.has_account')}{' '}
              <Link
                to="/login"
                className="font-semibold text-foreground transition-colors hover:text-primary hover:underline"
              >
                {t('nav.login')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}