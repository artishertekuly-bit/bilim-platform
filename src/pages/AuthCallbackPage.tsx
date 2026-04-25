import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

async function claimRequestedRoleSafe(requestedRole: Exclude<UserRole, 'admin'> | null) {
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

        let hasSession = false;

        for (let attempt = 0; attempt < 20; attempt += 1) {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            throw new Error(sessionError.message);
          }

          if (session?.user) {
            hasSession = true;
            break;
          }

          await sleep(200);
        }

        if (!hasSession) {
          throw new Error('Google сессиясы табылмады. Қайта кіріп көріңіз.');
        }

        setMessage('Профиль дайындалуда...');

        await claimRequestedRoleSafe(requestedRole);
        clearPendingOAuthRole();

        const appUser = await refreshUser();

        if (!appUser) {
          throw new Error('Профильді жүктеу мүмкін болмады.');
        }

        if (!cancelled) {
          navigate('/dashboard', { replace: true });
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
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Google арқылы кіру қатесі</h1>

          <p className="mt-2 text-sm text-red-600">{error}</p>

          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Кіру бетіне оралу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-foreground" />

        <div className="text-center">
          <p className="text-sm font-medium">Авторизация</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}