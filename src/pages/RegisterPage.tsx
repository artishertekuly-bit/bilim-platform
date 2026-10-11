import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { limitText, removeNullCharacters } from '@/lib/utils';

const MAX_FULL_NAME_CHARS = 180;
const MAX_EMAIL_CHARS = 320;
const MAX_PASSWORD_CHARS = 256;
const MAX_ERROR_CHARS = 700;

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

  return 'Тіркелу мүмкін болмады. Қайта көріңіз.';
}

function AuthErrorAlert({ message }: { message: string }) {
  const safeMessage = cleanText(message);

  if (!safeMessage) return null;

  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-2xl bg-destructive-soft px-4 py-3 text-sm leading-5 text-destructive shadow-xs"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{safeMessage}</span>
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
      );

      if (result.requiresEmailConfirmation) {
        navigate('/verify-email', {
          replace: true,
          state: {
            email: normalizedEmail,
            info: cleanText(
              result.message || 'Email-ға жіберілген кодты енгізіңіз.',
            ),
          },
        });
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (registerError: unknown) {
      setError(resolveRegisterError(registerError));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setGoogleLoading(true);
    setError('');

    try {
      await loginWithGoogle('student');
    } catch (googleError: unknown) {
      setError(
        googleError instanceof Error
          ? cleanText(googleError.message)
          : 'Google арқылы тіркелу мүмкін болмады.',
      );
      setGoogleLoading(false);
    }
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

      <div className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl bg-card shadow-sm lg:grid-cols-[1fr_1fr]">
        <section className="relative overflow-hidden bg-foreground p-6 text-background sm:p-9 lg:flex lg:min-h-[40rem] lg:flex-col lg:justify-between lg:p-12">
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
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/10">
                <Sparkles size={17} />
              </span>
              <span className="text-sm font-black lowercase tracking-tight">
                sana
              </span>
            </Link>

            <div className="mt-12 max-w-xl lg:mt-20">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-background/50">
                Оқушы кеңістігі
              </p>

              <h1 className="mt-4 text-3xl font-black tracking-tight text-background sm:text-4xl lg:text-5xl">
                Қосылу
              </h1>

              <p className="mt-4 max-w-lg text-xs leading-relaxed text-background/70 sm:text-sm">
                Курстарды оқыңыз және қажет кезде Sana ЖИ құралдарын пайдаланыңыз.
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:mt-12">
            <div className="rounded-2xl bg-background/[0.06] p-4">
              <BookOpen size={16} className="text-background/75" />
              <p className="mt-3 text-xs font-bold text-background">
                Курстар бір жерде
              </p>
              <p className="mt-1 text-[11px] text-background/60">
                Сабақтар, тесттер және прогресс.
              </p>
            </div>

            <div className="rounded-2xl bg-background/[0.06] p-4">
              <Sparkles size={16} className="text-background/75" />
              <p className="mt-3 text-xs font-bold text-background">
                ЖИ көмекшісі
              </p>
              <p className="mt-1 text-[11px] text-background/60">
                Түсіндіру және жаттығу құралдары.
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:flex lg:flex-col lg:justify-center lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              <UserPlus size={12} />
              Тіркелу
            </div>

            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Жаңа аккаунт
            </h2>

            <div className="mt-6">
              <AuthErrorAlert message={error} />

              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl border-0 bg-muted/40 shadow-xs hover:bg-muted/60"
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
                    Google арқылы жалғастыру
                  </>
                )}
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-muted/40" />
                <span className="text-[11px] text-muted-foreground">
                  немесе email
                </span>
                <div className="h-px flex-1 bg-muted/40" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Аты-жөніңіз</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) =>
                      setFullName(normalizeFullName(event.target.value))
                    }
                    placeholder="Аты-жөніңіз"
                    maxLength={MAX_FULL_NAME_CHARS}
                    required
                    disabled={authBusy}
                    className="h-11 rounded-2xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
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
                  <Label htmlFor="password">Құпиясөз</Label>

                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) =>
                        setPassword(normalizePassword(event.target.value))
                      }
                      placeholder="Кемінде 6 таңба"
                      required
                      minLength={6}
                      maxLength={MAX_PASSWORD_CHARS}
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
                          ? 'Құпиясөзді жасыру'
                          : 'Құпиясөзді көрсету'
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
                      Тіркелуде...
                    </>
                  ) : (
                    <>
                      Аккаунт ашу
                      <ArrowRight size={15} className="ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-7 text-center text-sm text-muted-foreground">
              Аккаунтыңыз бар ма?{' '}
              <Link
                to="/login"
                className="font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Кіру
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
