import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { AccessDeniedScreen } from '@/components/bl/SystemScreens';
import { useAuth, type UserRole } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

type RecoveryState = 'idle' | 'running' | 'done';

/**
 * Сессия немесе бет жүктелу кезінде ешқандай мәтіндік блок ("Сессия тексерілуде")
 * көрсетпей, тек тегіс бұлдыр (размытый) экран береді.
 */
function SessionLoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xl transition-all duration-300 animate-fade-in"
    />
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

  // Егер user кэште немесе жадыда бар болса, парақшаны үзбей бірден көрсету
  if (user && session) {
    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
      return <AccessDeniedScreen />;
    }
    return <>{children}</>;
  }

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
    return <AccessDeniedScreen />;
  }

  return <>{children}</>;
}
