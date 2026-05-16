import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Info,
  KeyRound,
  Loader2,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type VerifyLocationState = {
  email?: string;
  info?: string;
};

const MAX_EMAIL_CHARS = 320;
const MAX_TOKEN_CHARS = 6;
const MAX_ALERT_CHARS = 700;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_ALERT_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeEmail(value: unknown): string {
  return cleanText(value, MAX_EMAIL_CHARS).toLowerCase();
}

function normalizeToken(value: unknown): string {
  return cleanRawText(value).replace(/[^\d]/g, '').slice(0, MAX_TOKEN_CHARS);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message);
  }

  return fallback;
}

function AuthAlert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success';
  children: string;
}) {
  const message = cleanText(children);

  if (!message) return null;

  const Icon =
    tone === 'danger'
      ? AlertTriangle
      : tone === 'warning'
        ? Info
        : CheckCircle2;

  return (
    <div
      className={cn(
        'mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm leading-5',
        tone === 'danger' &&
          'border-destructive-muted bg-destructive-soft text-destructive',
        tone === 'warning' &&
          'border-warning-muted bg-warning-soft text-warning-foreground',
        tone === 'success' &&
          'border-success-muted bg-success-soft text-success-foreground',
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function VerifyEmailPage() {
  const { verifyEmailOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as VerifyLocationState | null;

  const [email, setEmail] = useState(() => normalizeEmail(state?.email || ''));
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(() =>
    cleanText(state?.info || 'Email-ға жіберілген 6 таңбалы кодты енгізіңіз.'),
  );

  const busy = loading || resending;
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = normalizeToken(token);

  const canVerify = useMemo(
    () => normalizedEmail.length > 0 && normalizedToken.length === 6 && !busy,
    [busy, normalizedEmail, normalizedToken],
  );

  const canResend = useMemo(
    () => normalizedEmail.length > 0 && !busy,
    [busy, normalizedEmail],
  );

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canVerify) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await verifyEmailOtp(normalizedEmail, normalizedToken);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Кодты растау мүмкін болмады.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;

    setResending(true);
    setError('');
    setInfo('');

    try {
      await resendSignupOtp(normalizedEmail);
      setToken('');
      setInfo('Жаңа код email-ға жіберілді.');
    } catch (err) {
      setError(getErrorMessage(err, 'Кодты қайта жіберу мүмкін болмады.'));
    } finally {
      setResending(false);
    }
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
              <MailCheck size={32} />
            </div>

            <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
              Bilimcorp
            </h1>

            <p className="mx-auto max-w-sm text-sm leading-7 text-muted-foreground">
              Тіркелуді аяқтау үшін email кодын растаңыз.
            </p>

            <div className="mt-8 rounded-3xl border border-border bg-card/80 p-4 text-left shadow-soft backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-success-muted bg-success-soft text-success-foreground shadow-inner-soft">
                  <ShieldCheck size={18} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Қауіпсіз растау
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Код 6 таңбадан тұрады.
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
                Email растау
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft-lg">
            <div className="relative overflow-hidden border-b border-border/70 bg-card/80 px-5 py-5">
              <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-10 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

              <div className="relative">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  <MailCheck size={12} />
                  Растау
                </div>

                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Email растау
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Email-ға келген кодты енгізіңіз.
                </p>
              </div>
            </div>

            <div className="p-5">
              {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
              {info ? <AuthAlert tone="warning">{info}</AuthAlert> : null}

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">
                    Email
                  </Label>

                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(normalizeEmail(event.target.value))}
                    placeholder="email@example.com"
                    required
                    disabled={busy}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="token" className="text-xs font-medium">
                    6 таңбалы код
                  </Label>

                  <div className="relative">
                    <Input
                      id="token"
                      inputMode="numeric"
                      value={token}
                      onChange={(event) => setToken(normalizeToken(event.target.value))}
                      placeholder="123456"
                      required
                      disabled={busy}
                      className="pr-11 text-center text-lg font-semibold tracking-[0.35em]"
                    />

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
                      <KeyRound size={16} />
                    </div>
                  </div>

                  {normalizedToken.length > 0 && normalizedToken.length < 6 ? (
                    <p className="rounded-2xl border border-warning-muted bg-warning-soft px-3 py-2 text-xs leading-5 text-warning-foreground">
                      Код 6 таңбадан тұруы керек.
                    </p>
                  ) : null}
                </div>

                <Button type="submit" className="w-full" disabled={!canVerify}>
                  {loading ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" />
                      Тексерілуде...
                    </>
                  ) : (
                    <>
                      Кодты растау
                      <ArrowRight size={15} className="ml-2" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={!canResend}
                  onClick={handleResend}
                >
                  {resending ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" />
                      Жіберілуде...
                    </>
                  ) : (
                    'Кодты қайта жіберу'
                  )}
                </Button>
              </form>

              <KazakhOrnament variant="divider" className="my-5" />

              <p className="text-center text-sm text-muted-foreground">
                <Link
                  to="/login"
                  className="font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                >
                  Кіру бетіне оралу
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}