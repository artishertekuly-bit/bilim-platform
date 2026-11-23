import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  ShieldAlert,
  UserRound,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import AdminDashboard from '@/pages/AdminDashboard';
import StudentDashboard from '@/pages/StudentDashboard';

function DashboardLoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xl transition-all duration-300 animate-fade-in"
    />
  );
}

function LegacyParentAccountState() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl animate-fade-in py-8 sm:py-14">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-border bg-card p-6 shadow-soft sm:p-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-foreground/[0.045] blur-3xl"
          />

          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background">
              <ShieldAlert size={19} />
            </div>

            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Ескі аккаунт
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
              Ата-ана кеңістігі жабылды
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Sana енді автор мен оқушыға арналған жеке платформа ретінде
              жұмыс істейді. Бұл аккаунттың деректері өшірілген жоқ.
            </p>

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button type="button" asChild>
                <Link to="/profile">
                  <UserRound size={15} className="mr-2" />
                  Профильді ашу
                </Link>
              </Button>

              <Button type="button" variant="outline" asChild>
                <Link to="/">
                  Басты бет
                  <ArrowRight size={15} className="ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
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

function getRedirectState(pathname: string, search: string) {
  return {
    from: {
      pathname,
      search,
    },
  };
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
        state={getRedirectState(location.pathname, location.search)}
      />
    );
  }

  if (user.role === 'student') {
    return <StudentDashboard />;
  }

  if (user.role === 'teacher') {
    // Мұғалімнің бастапқы беті — Панель (D32, D83).
    return <Navigate to="/teacher" replace />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  if (user.role === 'parent') {
    return <LegacyParentAccountState />;
  }

  return <UnknownRoleState />;
}
