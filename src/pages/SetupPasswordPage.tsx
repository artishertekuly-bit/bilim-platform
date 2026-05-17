import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import KazakhOrnament from '@/components/KazakhOrnament';
import StatusBadge from '@/components/common/StatusBadge';
import { LoadingState } from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type PasswordStrengthTone = 'muted' | 'danger' | 'warning' | 'success';

const MAX_PASSWORD_CHARS = 256;
const MAX_NEXT_PATH_CHARS = 300;
const MAX_ERROR_CHARS = 700;

const BLOCKED_NEXT_PATHS = new Set([
  '/login',
  '/register',
  '/auth/callback',
  '/setup-password',
  '/forgot-password',
  '/update-password',
]);

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_ERROR_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizePassword(value: unknown): string {
  return cleanRawText(value).slice(0, MAX_PASSWORD_CHARS);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function getPasswordStrength(password: string) {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-ZА-Я]/.test(password)) score += 1;
  if (/[a-zа-я]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-zА-Яа-я0-9]/.test(password)) score += 1;

  if (!password) {
    return {
      score: 0,
      label: 'Құпия сөз енгізілмеген',
      tone: 'muted' as PasswordStrengthTone,
    };
  }

  if (score <= 2) {
    return {
      score,
      label: 'Әлсіз',
      tone: 'danger' as PasswordStrengthTone,
    };
  }

  if (score <= 4) {
    return {
      score,
      label: 'Орташа',
      tone: 'warning' as PasswordStrengthTone,
    };
  }

  return {
    score,
    label: 'Күшті',
    tone: 'success' as PasswordStrengthTone,
  };
}

function validatePassword(password: string, confirmPassword: string) {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Құпия сөз кемінде 8 таңбадан тұруы керек.');
  }

  if (!/[A-Za-zА-Яа-я]/.test(password)) {
    errors.push('Құпия сөзде кемінде бір әріп болуы керек.');
  }

  if (!/\d/.test(password)) {
    errors.push('Құпия сөзде кемінде бір сан болуы керек.');
  }

  if (password !== confirmPassword) {
    errors.push('Құпия сөздер сәйкес емес.');
  }

  return errors;
}

function sanitizeNextPath(value: string | null) {
  const nextPath = cleanText(value, MAX_NEXT_PATH_CHARS);

  if (!nextPath) return '/dashboard';
  if (!nextPath.startsWith('/')) return '/dashboard';
  if (nextPath.startsWith('//')) return '/dashboard';
  if (nextPath.includes('\\')) return '/dashboard';

  const pathOnly = nextPath.split('?')[0].split('#')[0];

  if (BLOCKED_NEXT_PATHS.has(pathOnly)) {
    return '/dashboard';
  }

  return nextPath;
}

function getStrengthToneClassName(tone: PasswordStrengthTone) {
  const map: Record<PasswordStrengthTone, string> = {
    muted: 'border-border bg-muted text-muted-foreground',
    danger: 'border-destructive-muted bg-destructive-soft text-destructive',
    warning: 'border-warning-muted bg-warning-soft text-warning-foreground',
    success: 'border-success-muted bg-success-soft text-success-foreground',
  };

  return map[tone];
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
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(normalizePassword(event.target.value))}
          placeholder={placeholder}
          autoComplete="new-password"
          className="pr-11"
          minLength={8}
          maxLength={MAX_PASSWORD_CHARS}
          disabled={disabled}
        />

        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          aria-label={visible ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'}
          disabled={disabled}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function RequirementItem({
  ok,
  children,
}: {
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium',
        ok
          ? 'border-success-muted bg-success-soft text-success-foreground'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{children}</span>
    </div>
  );
}

export default function SetupPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, session, isLoading, updatePassword, refreshUser } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')),
    [searchParams],
  );

  const normalizedPassword = normalizePassword(password);
  const normalizedConfirmPassword = normalizePassword(confirmPassword);

  const strength = useMemo(
    () => getPasswordStrength(normalizedPassword),
    [normalizedPassword],
  );

  const validationErrors = useMemo(
    () => validatePassword(normalizedPassword, normalizedConfirmPassword),
    [normalizedPassword, normalizedConfirmPassword],
  );

  const passwordHasMinLength = normalizedPassword.length >= 8;
  const passwordHasLetter = /[A-Za-zА-Яа-я]/.test(normalizedPassword);
  const passwordHasNumber = /\d/.test(normalizedPassword);
  const passwordsMatch =
    normalizedConfirmPassword.length > 0 &&
    normalizedPassword === normalizedConfirmPassword;

  const canSubmit =
    Boolean(normalizedPassword) &&
    Boolean(normalizedConfirmPassword) &&
    validationErrors.length === 0 &&
    !isSaving;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validatePassword(normalizedPassword, normalizedConfirmPassword);

    if (errors.length > 0) {
      toast({
        title: 'Құпия сөз талапқа сай емес',
        description: errors[0],
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      await updatePassword(normalizedPassword);

      const { error } = await supabase.auth.updateUser({
        data: {
          password_setup_completed: true,
          password_setup_completed_at: new Date().toISOString(),
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      await refreshUser();

      toast({
        title: 'Құпия сөз қойылды',
        description: 'Енді аккаунтқа Google немесе email арқылы кіре аласыз.',
      });

      navigate(nextPath, { replace: true });
    } catch (error) {
      toast({
        title: 'Құпия сөз қою мүмкін болмады',
        description: getErrorMessage(error, 'Белгісіз қате пайда болды.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <LoadingState
            align="center"
            title="Сессия тексерілуде"
            text="Аккаунт дерегі және кіру күйі тексеріліп жатыр."
          />
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <GraduationCap size={18} />
          </div>
          <div>
            <span className="block text-sm font-semibold">Bilimcorp</span>
            <span className="block text-[11px] text-muted-foreground">
              Қауіпсіздік
            </span>
          </div>
        </div>

        <Card className="overflow-hidden shadow-soft-lg">
          <CardHeader className="relative overflow-hidden border-b border-border/70 bg-card/80 pb-5">
            <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-8 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

            <div className="relative">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
                <LockKeyhole size={22} />
              </div>

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ai-border bg-ai-soft px-3 py-1 text-xs font-semibold text-primary">
                <ShieldCheck size={12} />
                Аккаунт қауіпсіздігі
              </div>

              <CardTitle className="text-xl">Құпия сөз қойыңыз</CardTitle>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Аккаунтқа бөлек құпия сөз орнатыңыз.
              </p>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-5">
            <div className="rounded-3xl border border-ai-border bg-ai-soft/80 p-4 shadow-inner-soft">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
                  <ShieldCheck size={16} />
                </div>

                <p className="text-xs leading-5 text-muted-foreground">
                  Google арқылы кіру сақталады. Құпия сөз email арқылы кіруге
                  де мүмкіндік береді.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <PasswordField
                id="newPassword"
                label="Жаңа құпия сөз"
                value={password}
                onChange={setPassword}
                placeholder="Кемінде 8 таңба"
                visible={showPassword}
                onToggleVisible={() => setShowPassword((previous) => !previous)}
                disabled={isSaving}
              />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2 shadow-inner-soft">
                <span className="text-xs text-muted-foreground">Құпия сөз күші</span>

                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                    getStrengthToneClassName(strength.tone),
                  )}
                >
                  {strength.label}
                </span>
              </div>

              <PasswordField
                id="confirmPassword"
                label="Құпия сөзді қайталаңыз"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Қайта енгізіңіз"
                visible={showConfirmPassword}
                onToggleVisible={() =>
                  setShowConfirmPassword((previous) => !previous)
                }
                disabled={isSaving}
              />

              <div className="grid gap-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft sm:grid-cols-2">
                <RequirementItem ok={passwordHasMinLength}>
                  Кемінде 8 таңба
                </RequirementItem>
                <RequirementItem ok={passwordHasLetter}>
                  Кемінде 1 әріп
                </RequirementItem>
                <RequirementItem ok={passwordHasNumber}>
                  Кемінде 1 сан
                </RequirementItem>
                <RequirementItem ok={passwordsMatch}>
                  Құпия сөздер сәйкес
                </RequirementItem>
              </div>

              {validationErrors.length > 0 && (password || confirmPassword) ? (
                <div className="rounded-3xl border border-warning-muted bg-warning-soft/75 p-4 text-xs leading-5 text-warning-foreground">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <AlertTriangle size={14} />
                    Талаптар
                  </div>

                  <div className="space-y-1">
                    {validationErrors.map((item) => (
                      <p key={item}>• {item}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <StatusBadge tone="success">
                  <CheckCircle2 size={12} />
                  Құпия сөз талапқа сай
                </StatusBadge>
              )}

              <Button className="w-full" type="submit" disabled={!canSubmit}>
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Сақталуда...
                  </>
                ) : (
                  <>
                    <KeyRound size={15} className="mr-2" />
                    Құпия сөзді сақтау
                  </>
                )}
              </Button>
            </form>

            <KazakhOrnament variant="divider" className="my-1" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
