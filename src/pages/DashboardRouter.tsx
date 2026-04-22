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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
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
      return <Navigate to="/login" replace />;
  }
}