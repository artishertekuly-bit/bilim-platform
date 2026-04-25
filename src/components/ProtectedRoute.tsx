import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

function SessionLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 shadow-sm">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-foreground" />
        <p className="text-sm text-muted-foreground">Сессия тексерілуде...</p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const {
    user,
    session,
    isAuthenticated,
    isLoading,
    refreshUser,
  } = useAuth();

  const location = useLocation();

  const [recoveryState, setRecoveryState] = useState<
    'idle' | 'running' | 'done'
  >('idle');

  /**
   * Session ауысса, recovery state қайта басталуы керек.
   * Мысалы Google login-нен кейін жаңа access token келеді.
   */
  useEffect(() => {
    setRecoveryState('idle');
  }, [session?.access_token]);

  /**
   * Кейде persisted session бар, бірақ profile/user role әлі жүктелмей қалады.
   * Бірден login-ге лақтырмай, бір рет refreshUser жасап көреміз.
   */
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
      } catch (error) {
        console.error('[ProtectedRoute] Failed to recover user from session', error);
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

  if (
    isLoading ||
    recoveryState === 'running' ||
    (!!session && !user && recoveryState === 'idle')
  ) {
    return <SessionLoadingScreen />;
  }

  if (!session || !user || !isAuthenticated) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
          },
        }}
      />
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}