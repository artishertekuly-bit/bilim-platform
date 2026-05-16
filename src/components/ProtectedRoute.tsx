import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { useAuth, type UserRole } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

type RecoveryState = 'idle' | 'running' | 'done';

function SessionLoadingScreen() {
  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background p-6">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
        <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-primary-soft blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-4 h-36 w-36 rounded-full bg-secondary-soft blur-3xl" />

        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
            <Loader2 size={23} className="animate-spin" />
          </div>

          <div className="mt-4 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck size={12} />
              Сессия
            </span>
          </div>

          <h1 className="mt-4 text-base font-semibold text-foreground">
            Сессия тексерілуде
          </h1>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Аккаунт дерегі жүктелуде.
          </p>

          <div className="mt-5">
            <KazakhOrnament variant="divider" className="py-0 opacity-70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildRedirectState(pathname: string, search: string) {
  return {
    from: {
      pathname,
      search,
    },
  };
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, session, isAuthenticated, isLoading, refreshUser } = useAuth();
  const location = useLocation();

  const [recoveryState, setRecoveryState] = useState<RecoveryState>('idle');

  const redirectState = useMemo(
    () => buildRedirectState(location.pathname, location.search),
    [location.pathname, location.search],
  );

  useEffect(() => {
    setRecoveryState('idle');
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading) return;
    if (!session) return;
    if (user) return;
    if (recoveryState !== 'idle') return;

    let cancelled = false;

    const recoverUser = async () => {
      setRecoveryState('running');

      try {
        await refreshUser();
      } catch {
        // Recovery failure is handled by redirect after this attempt.
      } finally {
        if (!cancelled) {
          setRecoveryState('done');
        }
      }
    };

    void recoverUser();

    return () => {
      cancelled = true;
    };
  }, [isLoading, recoveryState, refreshUser, session, user]);

  const shouldShowLoading =
    isLoading ||
    recoveryState === 'running' ||
    Boolean(session && !user && recoveryState === 'idle');

  if (shouldShowLoading) {
    return <SessionLoadingScreen />;
  }

  if (!session || !user || !isAuthenticated) {
    return <Navigate to="/login" replace state={redirectState} />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}