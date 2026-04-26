import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type UserRole } from '@/lib/auth-context';

const PENDING_OAUTH_ROLE_KEY = 'bilim.pendingOAuthRole';

function isUserRole(value: unknown): value is Exclude<UserRole, 'admin'> {
  return value === 'student' || value === 'teacher' || value === 'parent';
}

function getPendingOAuthRole(): Exclude<UserRole, 'admin'> | null {
  if (typeof window === 'undefined') return null;

  const value = window.localStorage.getItem(PENDING_OAUTH_ROLE_KEY);
  return isUserRole(value) ? value : null;
}

function getRoleFromUrl(): Exclude<UserRole, 'admin'> | null {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const roleFromSearch = searchParams.get('role');
  const roleFromHash = hashParams.get('role');

  if (isUserRole(roleFromSearch)) return roleFromSearch;
  if (isUserRole(roleFromHash)) return roleFromHash;

  return null;
}

function clearPendingOAuthRole() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOAuthErrorFromUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return (
    searchParams.get('error_description') ||
    searchParams.get('error') ||
    hashParams.get('error_description') ||
    hashParams.get('error') ||
    ''
  );
}

function isMissingRoleRpcError(message: string) {
  return (
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message) ||
    (/not found/i.test(message) && /claim_requested_role/i.test(message))
  );
}

async function claimRequestedRoleSafe(
  requestedRole: Exclude<UserRole, 'admin'> | null
) {
  const { error } = await supabase.rpc('claim_requested_role' as never, {
    p_requested_role: requestedRole ?? null,
  } as never);

  if (!error) return;

  const message = error.message || '';

  if (isMissingRoleRpcError(message)) {
    console.warn('claim_requested_role RPC is missing, continuing without role sync');
    return;
  }

  throw new Error(message);
}

function hasPasswordIdentity(session: Session | null) {
  const authUser = session?.user;

  if (!authUser) return false;

  if (authUser.user_metadata?.password_setup_completed === true) {
    return true;
  }

  const providers = authUser.app_metadata?.providers;
  const identities = authUser.identities || [];

  return (
    (Array.isArray(providers) && providers.includes('email')) ||
    identities.some((identity) => identity.provider === 'email')
  );
}

function hasGoogleIdentity(session: Session | null) {
  const authUser = session?.user;

  if (!authUser) return false;

  const providers = authUser.app_metadata?.providers;
  const identities = authUser.identities || [];

  return (
    (Array.isArray(providers) && providers.includes('google')) ||
    identities.some((identity) => identity.provider === 'google')
  );
}

function needsPasswordSetup(session: Session | null) {
  if (!session?.user) return false;
  if (hasPasswordIdentity(session)) return false;

  return hasGoogleIdentity(session);
}

function AuthCallbackShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-24 h-72 w-72 rounded-full bg-secondary-soft blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-accent-soft blur-3xl" />

      <div className="absolute left-8 top-8 hidden text-primary/60 lg:block">
        <KazakhOrnament variant="corner" />
      </div>

      <div className="absolute bottom-8 right-8 hidden rotate-180 text-primary/60 lg:block">
        <KazakhOrnament variant="corner" />
      </div>

      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const processedRef = useRef(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('Google арқылы кіру аяқталуда...');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    let cancelled = false;

    const finishOAuth = async () => {
      try {
        const oauthError = getOAuthErrorFromUrl();

        if (oauthError) {
          throw new Error(oauthError);
        }

        const requestedRole = getRoleFromUrl() || getPendingOAuthRole();

        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');

        if (code) {
          setMessage('Google сессиясы сақталуда...');

          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw new Error(exchangeError.message);
          }

          window.history.replaceState(null, document.title, '/auth/callback');
        }

        setMessage('Сессия тексерілуде...');

        let currentSession: Session | null = null;

        for (let attempt = 0; attempt < 20; attempt += 1) {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            throw new Error(sessionError.message);
          }

          if (session?.user) {
            currentSession = session;
            break;
          }

          await sleep(200);
        }

        if (!currentSession?.user) {
          throw new Error('Google сессиясы табылмады. Қайта кіріп көріңіз.');
        }

        setMessage('Профиль дайындалуда...');

        await claimRequestedRoleSafe(requestedRole);
        clearPendingOAuthRole();

        const appUser = await refreshUser();

        if (!appUser) {
          throw new Error('Профильді жүктеу мүмкін болмады.');
        }

        const {
          data: { session: refreshedSession },
        } = await supabase.auth.getSession();

        const mustSetupPassword = needsPasswordSetup(
          refreshedSession || currentSession
        );

        if (!cancelled) {
          navigate(
            mustSetupPassword ? '/setup-password?next=/dashboard' : '/dashboard',
            { replace: true }
          );
        }
      } catch (err) {
        console.error('[AuthCallbackPage]', err);

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Google арқылы кіруді аяқтау мүмкін болмады.'
          );
        }
      }
    };

    void finishOAuth();

    return () => {
      cancelled = true;
    };
  }, [navigate, refreshUser]);

  if (error) {
    return (
      <AuthCallbackShell>
        <div className="overflow-hidden rounded-3xl border border-destructive-muted bg-card shadow-soft-lg">
          <div className="border-b border-destructive-muted/70 bg-destructive-soft/80 px-5 py-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive-muted bg-card text-destructive shadow-inner-soft">
              <AlertTriangle size={22} />
            </div>

            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-destructive-muted bg-destructive-soft px-3 py-1 text-xs font-semibold text-destructive">
              <AlertTriangle size={12} />
              OAuth error
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Google арқылы кіру қатесі
            </h1>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Авторизацияны аяқтау мүмкін болмады.
            </p>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-3xl border border-destructive-muted bg-destructive-soft/75 p-4 text-sm leading-6 text-destructive">
              {error}
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              Кіру бетіне оралу
              <ArrowRight size={15} className="ml-2" />
            </Button>
          </div>
        </div>
      </AuthCallbackShell>
    );
  }

  return (
    <AuthCallbackShell>
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft-lg">
        <div className="relative overflow-hidden border-b border-border/70 bg-card/80 px-5 py-5 text-center">
          <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

          <div className="relative">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              <Loader2 size={26} className="animate-spin" />
            </div>

            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ai-border bg-ai-soft px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles size={12} />
              Google OAuth
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Авторизация
            </h1>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {message}
            </p>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-3xl border border-ai-border bg-ai-soft/80 p-4 shadow-inner-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-ai-border bg-card text-primary shadow-inner-soft">
                <ShieldCheck size={18} />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground">
                  Сессия қауіпсіз тексеріліп жатыр
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Google жауап беріп болған соң, профиль, рөл және password setup
                  күйі тексеріледі.
                </p>
              </div>
            </div>
          </div>

          <KazakhOrnament variant="divider" className="my-5" />

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <GraduationCap size={13} />
            Bilimcorp Soft Academic LMS
          </div>
        </div>
      </div>
    </AuthCallbackShell>
  );
}