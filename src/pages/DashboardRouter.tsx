import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  GraduationCap,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import KazakhOrnament from '@/components/KazakhOrnament';
import { useAuth, type UserRole } from '@/lib/auth-context';
import AdminDashboard from '@/pages/AdminDashboard';
import ParentDashboard from '@/pages/ParentDashboard';
import StudentDashboard from '@/pages/StudentDashboard';
import TeacherDashboard from '@/pages/TeacherDashboard';

const DASHBOARD_BY_ROLE: Record<UserRole, JSX.Element> = {
  student: <StudentDashboard />,
  teacher: <TeacherDashboard />,
  parent: <ParentDashboard />,
  admin: <AdminDashboard />,
};

function DashboardLoadingScreen() {
  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background p-6">
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
        <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-32 rounded-full bg-primary-soft blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-4 h-32 w-32 rounded-full bg-secondary-soft blur-3xl" />

        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
            <Loader2 size={23} className="animate-spin" />
          </div>

          <h1 className="mt-4 text-base font-semibold text-foreground">
            Жеке кабинет жүктелуде
          </h1>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Аккаунт дерегі тексерілуде.
          </p>

          <div className="mt-5">
            <KazakhOrnament variant="divider" className="py-0 opacity-70" />
          </div>
        </div>
      </div>
    </div>
  );
}

function UnknownRoleState() {
  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background p-6">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-destructive-muted bg-destructive-soft/70 p-6 text-center shadow-soft">
        <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-destructive-muted/40 blur-3xl" />

        <div className="relative">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive-muted bg-card text-destructive shadow-inner-soft">
            <AlertTriangle size={23} />
          </div>

          <div className="mt-4 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive-muted bg-destructive-soft px-3 py-1 text-xs font-semibold text-destructive">
              <ShieldCheck size={12} />
              Рөл қатесі
            </span>
          </div>

          <h1 className="mt-4 text-lg font-semibold text-foreground">
            Рөл анықталмады
          </h1>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Аккаунт рөлі дұрыс орнатылмаған. Профильді тексеріңіз немесе әкімшіге хабарласыңыз.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button type="button" variant="outline" asChild>
              <Link to="/">Басты бет</Link>
            </Button>

            <Button type="button" asChild>
              <Link to="/profile">
                <GraduationCap size={15} className="mr-2" />
                Профиль
              </Link>
            </Button>
          </div>
        </div>
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

  return DASHBOARD_BY_ROLE[user.role] ?? <UnknownRoleState />;
}