import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';

function AuthAlert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success';
  children: ReactNode;
}) {
  const toneClassName = {
    danger: 'border-destructive-muted bg-destructive-soft text-destructive',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    success: 'border-success-muted bg-success-soft text-success-foreground',
  }[tone];

  const Icon =
    tone === 'danger'
      ? AlertTriangle
      : tone === 'warning'
        ? Info
        : CheckCircle2;

  return (
    <div
      className={`mb-3 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm leading-5 ${toneClassName}`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisible,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>

      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="pr-11"
          required
          minLength={6}
          autoComplete="new-password"
          disabled={disabled}
        />

        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          disabled={disabled}
          aria-label={visible ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  const { session, isLoading, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const passwordMismatch =
    password.length > 0 &&
    confirmPassword.length > 0 &&
    password !== confirmPassword;

  const passwordTooShort = password.length > 0 && password.length < 6;

  const canSubmit = useMemo(
    () =>
      password.length >= 6 &&
      confirmPassword.length >= 6 &&
      password === confirmPassword &&
      !loading &&
      Boolean(session),
    [confirmPassword, loading, password, session]
  );

  const formDisabled = loading || isLoading || !session;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await updatePassword(password);

      setInfo('Құпия сөз сәтті жаңартылды.');
      setPassword('');
      setConfirmPassword('');

      window.setTimeout(() => {
        navigate('/profile', { replace: true });
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Құпия сөзді жаңарту мүмкін болмады.'
      );
    } finally {
      setLoading(false);
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
              <GraduationCap size={32} />
            </div>

            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-ai-border bg-ai-soft px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles size={12} />
              Password recovery
            </div>

            <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
              Bilimcorp
            </h1>

            <p className="mx-auto max-w-sm text-sm leading-7 text-muted-foreground">
              Қауіпсіздік үшін жаңа құпия сөз орнатыңыз.
            </p>

            <div className="mt-8 rounded-3xl border border-border bg-card/80 p-4 text-left shadow-soft backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-success-muted bg-success-soft text-success-foreground shadow-inner-soft">
                  <ShieldCheck size={18} />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Қалпына келтіру режимі
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Бұл бет email арқылы келген қалпына келтіру сілтемесімен ғана
                    толық жұмыс істейді.
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
                Password recovery
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft-lg">
            <div className="relative overflow-hidden border-b border-border/70 bg-card/80 px-5 py-5">
              <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-10 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

              <div className="relative">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  <KeyRound size={12} />
                  Password update
                </div>

                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Жаңа құпия сөз
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Email-дағы сілтеме арқылы келсеңіз, жаңа құпия сөзді осында
                  орнатыңыз.
                </p>
              </div>
            </div>

            <div className="p-5">
              {isLoading ? (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2.5 text-sm text-muted-foreground">
                  <Loader2 size={15} className="animate-spin text-primary" />
                  Сессия тексерілуде...
                </div>
              ) : null}

              {!isLoading && !session ? (
                <AuthAlert tone="warning">
                  Бұл бетке email-дағы қалпына келтіру сілтемесі арқылы кіру керек.
                </AuthAlert>
              ) : null}

              {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
              {info ? <AuthAlert tone="success">{info}</AuthAlert> : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField
                  id="password"
                  label="Жаңа құпия сөз"
                  value={password}
                  onChange={setPassword}
                  placeholder="Кемінде 6 таңба"
                  visible={showPassword}
                  onToggleVisible={() => setShowPassword((prev) => !prev)}
                  disabled={formDisabled}
                />

                <PasswordField
                  id="confirmPassword"
                  label="Қайталау"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Құпия сөзді қайталаңыз"
                  visible={showConfirmPassword}
                  onToggleVisible={() =>
                    setShowConfirmPassword((prev) => !prev)
                  }
                  disabled={formDisabled}
                />

                {passwordMismatch ? (
                  <AuthAlert tone="danger">
                    Құпия сөздер сәйкес келмейді.
                  </AuthAlert>
                ) : null}

                {passwordTooShort ? (
                  <AuthAlert tone="danger">
                    Құпия сөз кемінде 6 таңбадан тұруы керек.
                  </AuthAlert>
                ) : null}

                <Button type="submit" className="w-full" disabled={!canSubmit}>
                  {loading ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" />
                      Сақталуда...
                    </>
                  ) : (
                    <>
                      Құпия сөзді жаңарту
                      <ArrowRight size={15} className="ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-5 rounded-3xl border border-ai-border bg-ai-soft/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
                    <ShieldCheck size={16} />
                  </div>

                  <p className="text-xs leading-5 text-muted-foreground">
                    Егер recovery session жоқ болса, алдымен “Құпия сөзді ұмыттым”
                    flow арқылы email сілтемесін қайта жіберу керек.
                  </p>
                </div>
              </div>

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