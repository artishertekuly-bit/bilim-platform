import { Suspense, lazy, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, type UserRole } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { LoadingState } from '@/components/common/DataState';
import t from '@/lib/i18n';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const DashboardRouter = lazy(() => import('./pages/DashboardRouter'));

const CourseCatalogPage = lazy(() => import('./pages/CourseCatalogPage'));
const LessonsPage = lazy(() => import('./pages/LessonsPage'));
const LessonDetailPage = lazy(() => import('./pages/LessonDetailPage'));
const TestsPage = lazy(() => import('./pages/TestsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const GamificationPage = lazy(() => import('./pages/GamificationPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));

const TeacherCreateCoursePage = lazy(() => import('./pages/TeacherCreateCoursePage'));
const TeacherCreateTestPage = lazy(() => import('./pages/TeacherCreateTestPage'));
const TeacherStudentsPage = lazy(() => import('./pages/TeacherStudentsPage'));

const ParentChildrenPage = lazy(() => import('./pages/ParentChildrenPage'));

const AdminSubjectsPage = lazy(() => import('./pages/AdminSubjectsPage'));
const AdminModerationPage = lazy(() => import('./pages/AdminModerationPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminCmsPage = lazy(() => import('./pages/AdminCmsPage'));

const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const AiQuestionBuilderPage = lazy(() => import('./pages/AiQuestionBuilderPage'));
const AiExamsPage = lazy(() => import('./pages/AiExamsPage'));
const AiPracticePage = lazy(() => import('./pages/AiPracticePage'));
const AiTutorPage = lazy(() => import('./pages/AiTutorPage'));
const AiExamSessionPage = lazy(() => import('./pages/AiExamSessionPage'));
const AiStudentExamsPage = lazy(() => import('./pages/AiStudentExamsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const parentChildPaths = [
  '/children',
  '/child-progress',
  '/child-tests',
  '/child-achievements',
] as const;

const studentGamificationPaths = ['/games', '/achievements'] as const;

type AppRouteConfig = {
  path: string;
  element: ReactNode;
  allowedRoles?: UserRole[];
};

const publicRoutes: AppRouteConfig[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/about', element: <AboutPage /> },
];

const commonProtectedRoutes: AppRouteConfig[] = [
  { path: '/dashboard', element: <DashboardRouter /> },
  { path: '/profile', element: <ProfileSettingsPage /> },
];

const sharedContentRoutes: AppRouteConfig[] = [
  {
    path: '/courses',
    element: <CourseCatalogPage />,
    allowedRoles: ['student', 'teacher', 'admin'],
  },
  {
    path: '/lessons',
    element: <LessonsPage />,
    allowedRoles: ['student', 'admin'],
  },
  {
    path: '/lessons/:lessonId',
    element: <LessonDetailPage />,
    allowedRoles: ['student', 'admin'],
  },
  {
    path: '/analytics',
    element: <AnalyticsPage />,
    allowedRoles: ['student', 'teacher', 'parent', 'admin'],
  },
];

const studentRoutes: AppRouteConfig[] = [
  { path: '/tests', element: <TestsPage />, allowedRoles: ['student'] },
  { path: '/leaderboard', element: <LeaderboardPage />, allowedRoles: ['student'] },
  ...studentGamificationPaths.map((path) => ({
    path,
    element: <GamificationPage />,
    allowedRoles: ['student'] as UserRole[],
  })),
  { path: '/ai-practice', element: <AiPracticePage />, allowedRoles: ['student'] },
  { path: '/ai-tutor', element: <AiTutorPage />, allowedRoles: ['student'] },
  { path: '/ai-exam/:examId', element: <AiExamSessionPage />, allowedRoles: ['student'] },
  { path: '/ai-exams-open', element: <AiStudentExamsPage />, allowedRoles: ['student'] },
];

const teacherRoutes: AppRouteConfig[] = [
  { path: '/my-courses', element: <CourseCatalogPage />, allowedRoles: ['teacher'] },
  { path: '/create-course', element: <TeacherCreateCoursePage />, allowedRoles: ['teacher'] },
  { path: '/create-test', element: <TeacherCreateTestPage />, allowedRoles: ['teacher'] },
  { path: '/students', element: <TeacherStudentsPage />, allowedRoles: ['teacher'] },
  { path: '/ai-question-builder', element: <AiQuestionBuilderPage />, allowedRoles: ['teacher'] },
  { path: '/ai-exams', element: <AiExamsPage />, allowedRoles: ['teacher'] },
];

const parentRoutes: AppRouteConfig[] = parentChildPaths.map((path) => ({
  path,
  element: <ParentChildrenPage />,
  allowedRoles: ['parent'],
}));

const adminRoutes: AppRouteConfig[] = [
  { path: '/subjects', element: <AdminSubjectsPage />, allowedRoles: ['admin'] },
  { path: '/manage-lessons', element: <LessonsPage />, allowedRoles: ['admin'] },
  { path: '/manage-courses', element: <CourseCatalogPage />, allowedRoles: ['admin'] },
  { path: '/moderation', element: <AdminModerationPage />, allowedRoles: ['admin'] },
  { path: '/manage-tests', element: <AdminModerationPage />, allowedRoles: ['admin'] },
  { path: '/cms', element: <AdminCmsPage />, allowedRoles: ['admin'] },
  { path: '/admin-analytics', element: <AnalyticsPage />, allowedRoles: ['admin'] },
  { path: '/manage-users', element: <AdminUsersPage />, allowedRoles: ['admin'] },
];

const protectedRoutes: AppRouteConfig[] = [
  ...commonProtectedRoutes,
  ...sharedContentRoutes,
  ...studentRoutes,
  ...teacherRoutes,
  ...parentRoutes,
  ...adminRoutes,
];

function GuardedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: UserRole[];
}) {
  return <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>;
}

function renderRoutes(routes: AppRouteConfig[], guarded = false) {
  return routes.map((route) => (
    <Route
      key={route.path}
      path={route.path}
      element={
        guarded ? (
          <GuardedRoute allowedRoles={route.allowedRoles}>{route.element}</GuardedRoute>
        ) : (
          route.element
        )
      }
    />
  ));
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="p-6">
                  <LoadingState text={t('page.app.loading')} />
                </div>
              }
            >
              <Routes>
                {renderRoutes(publicRoutes)}
                {renderRoutes(protectedRoutes, true)}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}