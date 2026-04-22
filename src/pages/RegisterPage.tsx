import { useMemo, useState } from 'react';
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
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roles: { value: UserRole; label: string }[] = [
    { value: 'student', label: t('role.student') },
    { value: 'teacher', label: t('role.teacher') },
    { value: 'parent', label: t('role.parent') },
  ];

  const canSubmit = useMemo(
    () =>
      fullName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      !loading,
    [fullName, email, password, loading]
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const result = await register(email, password, fullName, role);

      if (result.requiresEmailConfirmation) {
        navigate('/login', {
          replace: true,
          state: {
            info: result.message || t('auth.email_confirmation_required'),
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
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground"
                aria-label={
                  showPassword
                    ? t('auth.hide_password')
                    : t('auth.show_password')
                }
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t('auth.role')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={`rounded-md border px-3 py-2.5 text-center text-xs transition-colors ${
                    role === r.value
                      ? 'border-foreground bg-primary text-primary-foreground'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
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