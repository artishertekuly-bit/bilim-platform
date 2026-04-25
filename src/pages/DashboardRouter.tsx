import { Link, Navigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { useAuth } from '@/lib/auth-context';
import StudentDashboard from '@/pages/StudentDashboard';
import TeacherDashboard from '@/pages/TeacherDashboard';
import ParentDashboard from '@/pages/ParentDashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import { Button } from '@/components/ui/button';

function DashboardLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-primary/10 text-primary">
          <Loader2 size={22} className="animate-spin" />
        </div>

        <h1 className="mt-4 text-base font-semibold">Dashboard жүктелуде...</h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Аккаунт сессиясы және рөл дерегі тексеріліп жатыр.
        </p>
      </div>
    </div>
  );
}

function UnknownRoleState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-destructive/10 text-destructive">
          <AlertTriangle size={22} />
        </div>

        <h1 className="mt-4 text-lg font-semibold">Рөл анықталмады</h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Аккаунт рөлі дұрыс орнатылмаған. Қайта кіріп көріңіз немесе әкімшіге хабарласыңыз.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" asChild>
            <Link to="/">Басты бетке қайту</Link>
          </Button>

          <Button type="button" asChild>
            <Link to="/profile">Профильді ашу</Link>
          </Button>
        </div>
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

  switch (user.role) {
    case 'student':
      return <StudentDashboard />;

    case 'teacher':
      return <TeacherDashboard />;

    case 'parent':
      return <ParentDashboard />;

    case 'admin':
      return <AdminDashboard />;

    default:
      return <UnknownRoleState />;
  }
}