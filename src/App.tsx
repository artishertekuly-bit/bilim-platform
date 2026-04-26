import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';

import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth, type UserRole } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { LoadingState } from '@/components/common/DataState';
import t from '@/lib/i18n';

const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const DashboardRouter = lazy(() => import('./pages/DashboardRouter'));

const CourseCatalogPage = lazy(() => import('./pages/CourseCatalogPage'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));
const LessonsPage = lazy(() => import('./pages/LessonsPage'));
const LessonDetailPage = lazy(() => import('./pages/LessonDetailPage'));
const SavedLessonsPage = lazy(() => import('./pages/SavedLessonsPage'));
const TestsPage = lazy(() => import('./pages/TestsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const GamificationPage = lazy(() => import('./pages/GamificationPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));

const TeacherCreateCoursePage = lazy(() => import('./pages/TeacherCreateCoursePage'));
const TeacherCreateTestPage = lazy(() => import('./pages/TeacherCreateTestPage'));
const TeacherStudentsPage = lazy(() => import('./pages/TeacherStudentsPage'));

const ParentChildrenPage = lazy(() => import('./pages/ParentChildrenPage'));

const AdminSubjectsPage = lazy(() => import('./pages/AdminSubjectsPage'));
const AdminModerationPage = lazy(() => import('./pages/AdminModerationPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminCmsPage = lazy(() => import('./pages/AdminCmsPage'));

const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const SetupPasswordPage = lazy(() => import('./pages/SetupPasswordPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const AiQuestionBuilderPage = lazy(() => import('./pages/AiQuestionBuilderPage'));
const AiExamsPage = lazy(() => import('./pages/AiExamsPage'));
const AiPracticePage = lazy(() => import('./pages/AiPracticePage'));
const AiTutorPage = lazy(() => import('./pages/AiTutorPage'));
const AiTrackerPage = lazy(() => import('./pages/AiTrackerPage'));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage'));
const AiExamSessionPage = lazy(() => import('./pages/AiExamSessionPage'));
const AiStudentExamsPage = lazy(() => import('./pages/AiStudentExamsPage'));

const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const UpdatePasswordPage = lazy(() => import('./pages/UpdatePasswordPage'));

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

function AppLoadingScreen() {
  return (
    <div className="kazakh-ornament-bg flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md animate-fade-in">
        <LoadingState
          align="center"
          title="Bilimcorp жүктелуде"
          text={t('page.app.loading')}
        />
      </div>
    </div>
  );
}

function getSessionProviders(session: Session | null) {
  const authUser = session?.user;
  const providers = new Set<string>();

  if (!authUser) {
    return providers;
  }

  const metadataProviders = authUser.app_metadata?.providers;

  if (Array.isArray(metadataProviders)) {
    metadataProviders.forEach((provider) => {
      if (typeof provider === 'string') {
        providers.add(provider);
      }
    });
  }

  (authUser.identities || []).forEach((identity) => {
    if (identity.provider) {
      providers.add(identity.provider);
    }
  });

  return providers;
}

function hasPasswordIdentity(session: Session | null) {
  const authUser = session?.user;

  if (!authUser) {
    return false;
  }

  if (authUser.user_metadata?.password_setup_completed === true) {
    return true;
  }

  return getSessionProviders(session).has('email');
}

function needsPasswordSetup(session: Session | null) {
  const authUser = session?.user;

  if (!authUser) {
    return false;
  }

  if (hasPasswordIdentity(session)) {
    return false;
  }

  return getSessionProviders(session).has('google');
}

function buildSetupPasswordRedirect(next = '/dashboard') {
  return `/setup-password?next=${encodeURIComponent(next || '/dashboard')}`;
}

function RootEntryPage() {
  const { user, session, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (session && user) {
    if (needsPasswordSetup(session)) {
      return <Navigate to={buildSetupPasswordRedirect('/dashboard')} replace />;
    }

    return <Navigate to="/dashboard" replace />;
  }

  return <LandingPage />;
}

function PublicAuthPage({ children }: { children: ReactNode }) {
  const { user, session, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (session && user) {
    if (needsPasswordSetup(session)) {
      return <Navigate to={buildSetupPasswordRedirect('/dashboard')} replace />;
    }

    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function PasswordSetupGate({ children }: { children: ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (needsPasswordSetup(session) && location.pathname !== '/setup-password') {
    const next = `${location.pathname}${location.search}` || '/dashboard';

    return <Navigate to={buildSetupPasswordRedirect(next)} replace />;
  }

  return <>{children}</>;
}

function RouterScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const publicRoutes: AppRouteConfig[] = [
  { path: '/', element: <RootEntryPage /> },
  {
    path: '/login',
    element: (
      <PublicAuthPage>
        <LoginPage />
      </PublicAuthPage>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicAuthPage>
        <RegisterPage />
      </PublicAuthPage>
    ),
  },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/update-password', element: <UpdatePasswordPage /> },
  { path: '/about', element: <AboutPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
];

const commonProtectedRoutes: AppRouteConfig[] = [
  { path: '/dashboard', element: <DashboardRouter /> },
  { path: '/profile', element: <ProfileSettingsPage /> },
  {
    path: '/setup-password',
    element: <SetupPasswordPage />,
    allowedRoles: ['student', 'teacher', 'parent', 'admin'],
  },
  {
    path: '/chat',
    element: <ChatPage />,
    allowedRoles: ['student', 'teacher', 'parent', 'admin'],
  },
];

const sharedContentRoutes: AppRouteConfig[] = [
  {
    path: '/courses',
    element: <CourseCatalogPage />,
    allowedRoles: ['student', 'teacher', 'admin'],
  },
  {
    path: '/courses/:courseId',
    element: <CourseDetailPage />,
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
  {
    path: '/saved-lessons',
    element: <SavedLessonsPage />,
    allowedRoles: ['student'],
  },
  { path: '/tests', element: <TestsPage />, allowedRoles: ['student'] },
  { path: '/leaderboard', element: <LeaderboardPage />, allowedRoles: ['student'] },
  ...studentGamificationPaths.map((path) => ({
    path,
    element: <GamificationPage />,
    allowedRoles: ['student'] as UserRole[],
  })),
  { path: '/ai-practice', element: <AiPracticePage />, allowedRoles: ['student'] },
  { path: '/ai-tutor', element: <AiTutorPage />, allowedRoles: ['student'] },
  { path: '/ai-tracker', element: <AiTrackerPage />, allowedRoles: ['student'] },
  {
    path: '/ai-exam/:examId',
    element: <AiExamSessionPage />,
    allowedRoles: ['student'],
  },
  {
    path: '/ai-exams-open',
    element: <AiStudentExamsPage />,
    allowedRoles: ['student'],
  },
];

const teacherRoutes: AppRouteConfig[] = [
  { path: '/my-courses', element: <CourseCatalogPage />, allowedRoles: ['teacher'] },
  {
    path: '/create-course',
    element: <TeacherCreateCoursePage />,
    allowedRoles: ['teacher'],
  },
  {
    path: '/create-test',
    element: <TeacherCreateTestPage />,
    allowedRoles: ['teacher'],
  },
  { path: '/students', element: <TeacherStudentsPage />, allowedRoles: ['teacher'] },
  {
    path: '/ai-question-builder',
    element: <AiQuestionBuilderPage />,
    allowedRoles: ['teacher'],
  },
  { path: '/ai-exams', element: <AiExamsPage />, allowedRoles: ['teacher'] },
  {
    path: '/ai-assistant',
    element: <AiAssistantPage />,
    allowedRoles: ['teacher'],
  },
];

const parentRoutes: AppRouteConfig[] = parentChildPaths.map((path) => ({
  path,
  element: <ParentChildrenPage />,
  allowedRoles: ['parent'],
}));

const adminRoutes: AppRouteConfig[] = [
  { path: '/subjects', element: <AdminSubjectsPage />, allowedRoles: ['admin'] },
  { path: '/manage-lessons', element: <LessonsPage />, allowedRoles: ['admin'] },
  {
    path: '/manage-courses',
    element: <CourseCatalogPage />,
    allowedRoles: ['admin'],
  },
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
  enforcePasswordSetup = true,
}: {
  children: ReactNode;
  allowedRoles?: UserRole[];
  enforcePasswordSetup?: boolean;
}) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      {enforcePasswordSetup ? (
        <PasswordSetupGate>{children}</PasswordSetupGate>
      ) : (
        children
      )}
    </ProtectedRoute>
  );
}

function renderRoutes(routes: AppRouteConfig[], guarded = false) {
  return routes.map((route) => {
    const isSetupPasswordRoute = route.path === '/setup-password';

    return (
      <Route
        key={route.path}
        path={route.path}
        element={
          guarded ? (
            <GuardedRoute
              allowedRoles={route.allowedRoles}
              enforcePasswordSetup={!isSetupPasswordRoute}
            >
              {route.element}
            </GuardedRoute>
          ) : (
            route.element
          )
        }
      />
    );
  });
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <RouterScrollReset />

            <Suspense fallback={<AppLoadingScreen />}>
              <Routes>
                {renderRoutes(publicRoutes)}
                {renderRoutes(protectedRoutes, true)}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}