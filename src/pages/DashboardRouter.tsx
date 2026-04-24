import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import StudentDashboard from '@/pages/StudentDashboard';
import TeacherDashboard from '@/pages/TeacherDashboard';
import ParentDashboard from '@/pages/ParentDashboard';
import AdminDashboard from '@/pages/AdminDashboard';

export default function DashboardRouter() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-b-foreground" />
          <p className="text-sm text-muted-foreground">Dashboard жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
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
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold">Рөл анықталмады</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Аккаунт рөлі дұрыс орнатылмаған. Қайта кіріп көріңіз немесе әкімшіге хабарласыңыз.
            </p>
          </div>
        </div>
      );
  }
}