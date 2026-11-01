import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { limitText, removeNullCharacters } from '@/lib/utils';

const PENDING_OAUTH_ROLE_KEY = 'bilim.pendingOAuthRole';

const MAX_ROLE_CHARS = 40;
const MAX_ERROR_CHARS = 700;
const MAX_MESSAGE_CHARS = 240;
const SESSION_RETRY_COUNT = 20;
const SESSION_RETRY_DELAY_MS = 200;

type OAuthRole = 'student';

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_MESSAGE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeRoleCandidate(value: unknown): string {
  return cleanText(value, MAX_ROLE_CHARS).toLowerCase();
}

function isPublicOAuthRole(value: unknown): value is OAuthRole {
  return normalizeRoleCandidate(value) === 'student';
}

function getSafeWindow() {
  return typeof window === 'undefined' ? null : window;
}

function getPendingOAuthRole(): OAuthRole | null {
  const safeWindow = getSafeWindow();

  if (!safeWindow) return null;

  const value = safeWindow.localStorage.getItem(PENDING_OAUTH_ROLE_KEY);

  return isPublicOAuthRole(value) ? 'student' : null;
}

function getRoleFromUrl(): OAuthRole | null {
  const safeWindow = getSafeWindow();

  if (!safeWindow) return null;

  const searchParams = new URLSearchParams(safeWindow.location.search);
  const hashParams = new URLSearchParams(safeWindow.location.hash.replace(/^#/, ''));

  const roleFromSearch = searchParams.get('role');
  const roleFromHash = hashParams.get('role');

  if (isPublicOAuthRole(roleFromSearch)) {
    return 'student';
  }

  if (isPublicOAuthRole(roleFromHash)) {
    return 'student';
  }

  return null;
}

function clearPendingOAuthRole() {
  const safeWindow = getSafeWindow();

  if (!safeWindow) return;

  safeWindow.localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOAuthErrorFromUrl() {
  const safeWindow = getSafeWindow();

  if (!safeWindow) return '';

  const searchParams = new URLSearchParams(safeWindow.location.search);
  const hashParams = new URLSearchParams(safeWindow.location.hash.replace(/^#/, ''));

  return cleanText(
    searchParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error') ||
      '',
    MAX_ERROR_CHARS,
  );
}

function isMissingRoleRpcError(message: string) {
  const normalized = cleanText(message, MAX_ERROR_CHARS);

  return (
    /could not find the function/i.test(normalized) ||
    /schema cache/i.test(normalized) ||
    (/not found/i.test(normalized) && /claim_requested_role/i.test(normalized))
  );
}

async function claimRequestedRoleSafe(requestedRole: OAuthRole | null) {
  const { error } = await supabase.rpc('claim_requested_role' as never, {
    p_requested_role: requestedRole ?? null,
  } as never);

  if (!error) return;

  const message = cleanText(error.message, MAX_ERROR_CHARS);

  if (isMissingRoleRpcError(message)) {
    console.warn('claim_requested_role RPC is missing, continuing without role sync');
    return;
  }

  throw new Error(message || 'Рөлді сақтау мүмкін болмады.');
}

function getProviderList(session: Session | null): string[] {
  const authUser = session?.user;

  if (!authUser) return [];

  const providers = authUser.app_metadata?.providers;
  const identities = authUser.identities || [];
  const providerSet = new Set<string>();

  if (Array.isArray(providers)) {
    providers.forEach((provider) => {
      const normalized = cleanText(provider, MAX_ROLE_CHARS).toLowerCase();

      if (normalized) {
        providerSet.add(normalized);
      }
    });
  }

  identities.forEach((identity) => {
    const normalized = cleanText(identity.provider, MAX_ROLE_CHARS).toLowerCase();

    if (normalized) {
      providerSet.add(normalized);
    }
  });

  return Array.from(providerSet);
}

function hasPasswordIdentity(session: Session | null) {
  const authUser = session?.user;

  if (!authUser) return false;

  if (authUser.user_metadata?.password_setup_completed === true) {
    return true;
  }

  return getProviderList(session).includes('email');
}

function hasGoogleIdentity(session: Session | null) {
  if (!session?.user) return false;

  return getProviderList(session).includes('google');
}

function needsPasswordSetup(session: Session | null) {
  if (!session?.user) return false;
  if (hasPasswordIdentity(session)) return false;

  return hasGoogleIdentity(session);
}

function AuthCallbackShell({ children }: { children: ReactNode }) {
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

        const requestedRole: OAuthRole = 'student';

        // Clear any stale or manipulated role value from URL/localStorage.
        getRoleFromUrl();
        getPendingOAuthRole();

        const safeWindow = getSafeWindow();
        const searchParams = new URLSearchParams(safeWindow?.location.search || '');
        const code = cleanText(searchParams.get('code'), 2_000);

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw new Error(cleanText(exchangeError.message, MAX_ERROR_CHARS));
          }

          safeWindow?.history.replaceState(null, document.title, '/auth/callback');
        }

        let currentSession: Session | null = null;

        for (let attempt = 0; attempt < SESSION_RETRY_COUNT; attempt += 1) {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            throw new Error(cleanText(sessionError.message, MAX_ERROR_CHARS));
          }

          if (session?.user) {
            currentSession = session;
            break;
          }

          await sleep(SESSION_RETRY_DELAY_MS);
        }

        if (!currentSession?.user) {
          throw new Error('Google сессиясы табылмады. Қайта кіріп көріңіз.');
        }

        await claimRequestedRoleSafe(requestedRole);
        clearPendingOAuthRole();

        const appUser = await refreshUser();

        if (!appUser) {
          throw new Error('Профильді жүктеу мүмкін болмады.');
        }

        const {
          data: { session: refreshedSession },
          error: refreshedSessionError,
        } = await supabase.auth.getSession();

        if (refreshedSessionError) {
          throw new Error(cleanText(refreshedSessionError.message, MAX_ERROR_CHARS));
        }

        const mustSetupPassword = needsPasswordSetup(
          refreshedSession || currentSession,
        );

        if (!cancelled) {
          navigate(
            mustSetupPassword ? '/setup-password?next=/dashboard' : '/dashboard',
            { replace: true },
          );
        }
      } catch (err) {
        console.error('[AuthCallbackPage]', err);

        if (!cancelled) {
          setError(
            err instanceof Error
              ? cleanText(err.message, MAX_ERROR_CHARS)
              : 'Google арқылы кіруді аяқтау мүмкін болмады.',
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
              OAuth қатесі
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
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xl transition-all duration-300 animate-fade-in"
    />
  );
}
