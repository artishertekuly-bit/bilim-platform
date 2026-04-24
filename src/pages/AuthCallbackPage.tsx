import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type UserRole } from '@/lib/auth-context';

const PENDING_OAUTH_ROLE_KEY = 'bilim.pendingOAuthRole';

function isUserRole(value: unknown): value is Exclude<UserRole, 'admin'> {
  return value === 'student' || value === 'teacher' || value === 'parent';
}

function getPendingOAuthRole(): Exclude<UserRole, 'admin'> | null {
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

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const finishOAuth = async () => {
      try {
        const oauthError = getOAuthErrorFromUrl();

        if (oauthError) {
          throw new Error(oauthError);
        }

        /*
          Role-ды exchangeCodeForSession алдында оқимыз.
          Себебі төменде URL-ды /auth/callback деп тазалаймыз.
        */
        const requestedRole = getRoleFromUrl() || getPendingOAuthRole();

        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw new Error(exchangeError.message);
          }

          window.history.replaceState(null, '', '/auth/callback');
        }

        let session = null;

        for (let attempt = 0; attempt < 15; attempt += 1) {
          const {
            data: { session: currentSession },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            throw new Error(sessionError.message);
          }

          if (currentSession) {
            session = currentSession;
            break;
          }

          await sleep(200);
        }

        if (!session) {
          throw new Error('Google сессиясы табылмады. Қайта кіріп көріңіз.');
        }

        const { error: roleError } = await supabase.rpc(
          'claim_requested_role' as never,
          {
            p_requested_role: requestedRole ?? null,
          } as never
        );

        if (roleError) {
          throw new Error(roleError.message);
        }

        clearPendingOAuthRole();

        await refreshUser();

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
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border bg-card p-6 shadow-sm">
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-foreground" />

        <p className="text-sm text-muted-foreground">
          Google арқылы кіру аяқталуда...
        </p>
      </div>
    </div>
  );
}