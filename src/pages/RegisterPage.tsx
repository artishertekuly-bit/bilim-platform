import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type UserRole } from '@/lib/auth-context';
import t from '@/lib/i18n';
import KazakhOrnament from '@/components/KazakhOrnament';
import { GraduationCap, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function resolveRegisterError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return t('auth.register_failed');
}

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const roles: { value: UserRole; label: string }[] = [
    { value: 'student', label: t('role.student') },
    { value: 'teacher', label: t('role.teacher') },
    { value: 'parent', label: t('role.parent') },
  ];

  const authBusy = loading || googleLoading;

  const canSubmit = useMemo(
    () =>
      fullName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      !authBusy,
    [fullName, email, password, authBusy]
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const result = await register(email, password, fullName, role);

      if (result.requiresEmailConfirmation) {
        navigate('/verify-email', {
          replace: true,
          state: {
            email: email.trim(),
            info: result.message || 'Email-ға жіберілген кодты енгізіңіз.',
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
          ? err.message
          : 'Google арқылы тіркелу мүмкін болмады.'
      );
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 kazakh-ornament-bg">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <GraduationCap size={16} className="text-primary-foreground" />
          </div>
          <span className="font-semibold">Bilim</span>
        </div>

        <h2 className="mb-1 text-center text-xl font-semibold">
          {t('auth.register_title')}
        </h2>

        <p className="mb-6 text-center text-sm text-muted-foreground">
          {t('auth.register_hint')}
        </p>

        {error ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mb-4 space-y-1.5">
          <Label className="text-xs font-medium">{t('auth.role')}</Label>

          <div className="grid grid-cols-3 gap-2">
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                aria-pressed={role === r.value}
                disabled={authBusy}
                className={`rounded-md border px-3 py-2.5 text-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  role === r.value
                    ? 'border-foreground bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Google арқылы тіркелсеңіз де, осы таңдалған рөл қолданылады.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleRegister}
          disabled={authBusy}
        >
          {googleLoading ? 'Google ашылуда...' : 'Google арқылы тіркелу'}
        </Button>

        <div className="my-4 flex items-center gap-3">
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
              onChange={(e) => setFullName(e.target.value)}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
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

            <p className="text-[11px] text-muted-foreground">
              Құпия сөз кемінде 6 таңбадан тұруы керек.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading ? t('common.loading') : t('auth.register_btn')}
            <ArrowRight size={15} className="ml-2" />
          </Button>
        </form>

        <KazakhOrnament variant="divider" className="my-4" />

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.has_account')}{' '}
          <Link to="/login" className="font-medium text-foreground hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}