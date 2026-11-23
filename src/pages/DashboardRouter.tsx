// Рөлге қарай бастапқы бет (karta §3.1, D32): оқушы — аймақтар, мұғалім — Панель, ата-ана — «Балам», әкімші — басқару.
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import AdminHomePage from '@/pages/AdminHomePage';
import StudentHomePage from '@/pages/StudentHomePage';

function DashboardLoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xl transition-all duration-300 animate-fade-in"
    />
  );
}

function UnknownRoleState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-[2rem] border border-destructive-muted bg-card p-7 text-center shadow-soft">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
          <ShieldAlert size={19} />
        </div>

        <h1 className="mt-5 text-xl font-black tracking-[-0.03em]">
          Аккаунт рөлі анықталмады
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Профиль дерегін тексеріңіз немесе аккаунт рөлін база арқылы
          қайта орнатыңыз.
        </p>

        <Button type="button" className="mt-6" asChild>
          <Link to="/profile">Профильді ашу</Link>
        </Button>
      </div>
    </div>
  );
}

export default function DashboardRouter() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <DashboardLoadingScreen />;
  }

  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: location.pathname, search: location.search } }}
      />
    );
  }

  if (user.role === 'student') return <StudentHomePage />;
  if (user.role === 'teacher') return <Navigate to="/teacher" replace />;
  if (user.role === 'parent') return <Navigate to="/parent" replace />;
  if (user.role === 'admin') return <AdminHomePage />;
  return <UnknownRoleState />;
}
