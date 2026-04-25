import { useMemo, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

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
      className: 'text-muted-foreground',
    };
  }

  if (score <= 2) {
    return {
      score,
      label: 'Әлсіз',
      className: 'text-destructive',
    };
  }

  if (score <= 4) {
    return {
      score,
      label: 'Орташа',
      className: 'text-amber-600',
    };
  }

  return {
    score,
    label: 'Күшті',
    className: 'text-emerald-600',
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

  const nextPath = searchParams.get('next') || '/dashboard';

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const validationErrors = useMemo(
    () => validatePassword(password, confirmPassword),
    [password, confirmPassword]
  );

  const canSubmit =
    !!password &&
    !!confirmPassword &&
    validationErrors.length === 0 &&
    !isSaving;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-foreground" />
            <p className="text-sm text-muted-foreground">Сессия тексерілуде...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async () => {
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const errors = validatePassword(trimmedPassword, trimmedConfirmPassword);

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
      await updatePassword(trimmedPassword);

      await supabase.auth.updateUser({
        data: {
          password_setup_completed: true,
          password_setup_completed_at: new Date().toISOString(),
        },
      });

      await refreshUser();

      toast({
        title: 'Құпия сөз қойылды',
        description:
          'Енді аккаунтқа Google арқылы да, email/password арқылы да кіре аласыз.',
      });

      navigate(nextPath, { replace: true });
    } catch (error) {
      toast({
        title: 'Құпия сөз қою мүмкін болмады',
        description:
          error instanceof Error ? error.message : 'Белгісіз қате пайда болды.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole size={22} />
          </div>

          <div>
            <CardTitle>Құпия сөз қойыңыз</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Google арқылы кірдіңіз. Аккаунтыңызды толық қолдану үшін платформаға
              бөлек құпия сөз қойыңыз.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <p>
                Бұл құпия сөз Google аккаунтыңызды алмастырмайды. Кейін платформаға
                Google арқылы да, email/password арқылы да кіре аласыз.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Жаңа құпия сөз</Label>

            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Кемінде 8 таңба"
                autoComplete="new-password"
                className="pr-10"
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Күші</span>
              <span className={strength.className}>{strength.label}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Құпия сөзді қайталаңыз</Label>

            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Қайта енгізіңіз"
                autoComplete="new-password"
                className="pr-10"
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={
                  showConfirmPassword ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'
                }
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {validationErrors.length > 0 && (password || confirmPassword) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <p className="font-medium">Талаптар:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {validationErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSaving ? 'Сақталуда...' : 'Құпия сөзді сақтау'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}