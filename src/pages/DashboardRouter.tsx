// Рөлге қарай бастапқы бет (karta §3.1, D32): оқушы — Тьютор, мұғалім — Панель, ата-ана — «Балам», әкімші — басқару.
import { Navigate, useLocation } from 'react-router-dom';

import { homePathFor } from '@/components/bl/nav';
import { BareScreen, ButtonLink, StateCard } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';

export default function DashboardRouter() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div aria-busy="true" className="min-h-[100dvh] bg-bl-bg" />;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: { pathname: location.pathname, search: location.search } }} />;
  }

  if (['student', 'teacher', 'parent', 'admin'].includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return (
    <BareScreen className="justify-center px-4">
      <StateCard mark="×" title="Аккаунт рөлі анықталмады" text="Рөліңіз қате деп ойласаңыз, мектеп әкімшісіне жазыңыз.">
        <ButtonLink to="/settings">Баптауларды ашу</ButtonLink>
      </StateCard>
    </BareScreen>
  );
}
