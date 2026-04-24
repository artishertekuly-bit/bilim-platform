import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type VerifyLocationState = {
  email?: string;
  info?: string;
};

export default function VerifyEmailPage() {
  const { verifyEmailOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as VerifyLocationState | null;

  const [email, setEmail] = useState(state?.email || '');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    state?.info || 'Email-ға жіберілген 6 таңбалы кодты енгізіңіз.'
  );

  const busy = loading || resending;

  const canVerify = useMemo(
    () =>
      email.trim().length > 0 &&
      token.trim().length === 6 &&
      !busy,
    [email, token, busy]
  );

  const canResend = useMemo(
    () => email.trim().length > 0 && !busy,
    [email, busy]
  );

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canVerify) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await verifyEmailOtp(email, token);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Кодты растау мүмкін болмады.'
      );
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
      await resendSignupOtp(email);
      setToken('');
      setInfo('Жаңа растау коды email-ға қайта жіберілді.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Кодты қайта жіберу мүмкін болмады.'
      );
    } finally {
      setResending(false);
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

          <h1 className="mb-3 text-3xl font-bold text-primary-foreground">
            Bilim
          </h1>

          <p className="mx-auto max-w-sm text-sm leading-relaxed text-primary-foreground/70">
            Email растауын OTP код арқылы аяқтаңыз.
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

          <h2 className="mb-1 text-xl font-semibold">Email растау</h2>

          <p className="mb-6 text-sm text-muted-foreground">
            Тіркелуді аяқтау үшін email-ға келген кодты енгізіңіз.
          </p>

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

          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>

              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token">6 таңбалы код</Label>

              <Input
                id="token"
                inputMode="numeric"
                value={token}
                onChange={(e) =>
                  setToken(e.target.value.replace(/[^\d]/g, '').slice(0, 6))
                }
                placeholder="123456"
                required
                disabled={busy}
              />

              {token.length > 0 && token.length < 6 ? (
                <p className="text-xs text-muted-foreground">
                  Код 6 таңбадан тұруы керек.
                </p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={!canVerify}>
              {loading ? 'Тексерілуде...' : 'Кодты растау'}
              <ArrowRight size={15} className="ml-2" />
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!canResend}
              onClick={handleResend}
            >
              {resending ? 'Қайта жіберілуде...' : 'Кодты қайта жіберу'}
            </Button>
          </form>

          <KazakhOrnament variant="divider" className="my-4" />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-foreground hover:underline">
              Кіру бетіне оралу
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}