import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canSubmit = useMemo(
    () => email.trim().length > 0 && !loading,
    [email, loading]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await requestPasswordReset(email);
      setInfo('Құпия сөзді қалпына келтіру сілтемесі email-ға жіберілді.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Сұрауды жіберу мүмкін болмады.'
      );
    } finally {
      setLoading(false);
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
            Құпиясөзді email арқылы қалпына келтіру.
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

          <h2 className="mb-1 text-xl font-semibold">Құпия сөзді ұмыттым</h2>

          <p className="mb-6 text-sm text-muted-foreground">
            Email-ды енгізіңіз. Қалпына келтіру сілтемесін жібереміз.
          </p>

          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {info ? (
            <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">
              {info}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {loading ? 'Жіберілуде...' : 'Қалпына келтіру сілтемесін жіберу'}
              <ArrowRight size={15} className="ml-2" />
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