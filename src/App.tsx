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

import ProtectedRoute from '@/components/ProtectedRoute';
import { LoadingState } from '@/components/common/DataState';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuth, type UserRole } from '@/lib/auth-context';

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

const AuthorCreateCoursePage = lazy(
  () => import('./pages/TeacherCreateCoursePage'),
);
const AuthorCreateTestPage = lazy(
  () => import('./pages/TeacherCreateTestPage'),
);
const AuthorStudioPage = lazy(() => import('./pages/AdminCmsPage'));
const AuthorUsersPage = lazy(() => import('./pages/AdminUsersPage'));

const AiQuestionBuilderPage = lazy(() => import('./pages/AiQuestionBuilderPage'));
const AiExamsPage = lazy(() => import('./pages/AiExamsPage'));
const AiPracticePage = lazy(() => import('./pages/AiPracticePage'));
const AiTutorPage = lazy(() => import('./pages/AiTutorPage'));
const AiTrackerPage = lazy(() => import('./pages/AiTrackerPage'));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage'));
const AiExamSessionPage = lazy(() => import('./pages/AiExamSessionPage'));
const AiStudentExamsPage = lazy(() => import('./pages/AiStudentExamsPage'));

const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const SetupPasswordPage = lazy(() => import('./pages/SetupPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const UpdatePasswordPage = lazy(() => import('./pages/UpdatePasswordPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * The database still contains the historical roles while Sana is being rebuilt.
 * Only student and admin are active product roles. Teacher and parent remain here
 * temporarily so existing accounts can still reach profile/password recovery.
 */
const ALL_DATABASE_ROLES: UserRole[] = [
  'student',
  'teacher',
  'parent',
  'admin',
];
const ACTIVE_PLATFORM_ROLES: UserRole[] = ['student', 'admin'];
const STUDENT_ROLES: UserRole[] = ['student'];
const AUTHOR_ROLES: UserRole[] = ['admin'];

const DISABLED_SCHOOL_PATHS = [
  '/chat',
  '/leaderboard',
  '/games',
  '/achievements',
  '/children',
  '/child-progress',
  '/child-tests',
  '/child-achievements',
  '/students',
  '/subjects',
  '/moderation',
] as const;

const AUTHOR_ROUTE_ALIASES: ReadonlyArray<{
  path: string;
  destination: string;
}> = [
  { path: '/my-courses', destination: '/courses' },
  { path: '/manage-courses', destination: '/courses' },
  { path: '/manage-lessons', destination: '/lessons' },
  { path: '/manage-tests', destination: '/tests' },
];

type AppRouteConfig = {
  path: string;
  element: ReactNode;
  allowedRoles?: UserRole[];
  enforcePasswordSetup?: boolean;
};

function AppLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm animate-fade-in rounded-[2rem] border border-border bg-card/70 p-6 shadow-soft backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-black text-background">
            s
          </span>
          <span className="text-lg font-black tracking-[-0.05em]">sana</span>
        </div>
        <LoadingState align="center" title="Жүктелуде" text="Бет дайындалып жатыр" />
      </div>
    </div>
  );
}

function getSessionProviders(session: Session | null): Set<string> {
  const authUser = session?.user;
  const providers = new Set<string>();

  if (!authUser) {
    return providers;
  }

  const metadataProviders = authUser.app_metadata?.providers;

  if (Array.isArray(metadataProviders)) {
    metadataProviders.forEach((provider) => {
      if (typeof provider === 'string' && provider.trim()) {
        providers.add(provider.trim());
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

function hasPasswordIdentity(session: Session | null): boolean {
  const authUser = session?.user;

  if (!authUser) {
    return false;
  }

  if (authUser.user_metadata?.password_setup_completed === true) {
    return true;
  }

  return getSessionProviders(session).has('email');
}

function needsPasswordSetup(session: Session | null): boolean {
  const authUser = session?.user;

  if (!authUser || hasPasswordIdentity(session)) {
    return false;
  }

  return getSessionProviders(session).has('google');
}

function normalizeNextPath(next = '/dashboard'): string {
  const normalized = next.trim();

  if (
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.startsWith('/setup-password') ||
    normalized.startsWith('/login') ||
    normalized.startsWith('/register') ||
    normalized.startsWith('/auth/callback')
  ) {
    return '/dashboard';
  }

  return normalized;
}

function buildSetupPasswordRedirect(next = '/dashboard'): string {
  return `/setup-password?next=${encodeURIComponent(normalizeNextPath(next))}`;
}

function getCurrentPathWithSearch(pathname: string, search: string): string {
  return normalizeNextPath(`${pathname}${search || ''}`);
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
    return (
      <Navigate
        to={buildSetupPasswordRedirect(
          getCurrentPathWithSearch(location.pathname, location.search),
        )}
        replace
      />
    );
  }

  return <>{children}</>;
}

function RouterScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
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

const accountRoutes: AppRouteConfig[] = [
  {
    path: '/dashboard',
    element: <DashboardRouter />,
    allowedRoles: ALL_DATABASE_ROLES,
  },
  {
    path: '/profile',
    element: <ProfileSettingsPage />,
    allowedRoles: ALL_DATABASE_ROLES,
  },
  {
    path: '/setup-password',
    element: <SetupPasswordPage />,
    allowedRoles: ALL_DATABASE_ROLES,
    enforcePasswordSetup: false,
  },
];

const learningRoutes: AppRouteConfig[] = [
  {
    path: '/courses',
    element: <CourseCatalogPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/courses/:courseId',
    element: <CourseDetailPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/lessons',
    element: <LessonsPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/lessons/:lessonId',
    element: <LessonDetailPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/saved-lessons',
    element: <SavedLessonsPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/tests',
    element: <TestsPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/analytics',
    element: <AnalyticsPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
];

const aiRoutes: AppRouteConfig[] = [
  {
    path: '/ai',
    element: <Navigate to="/ai-tutor" replace />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-tutor',
    element: <AiTutorPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-practice',
    element: <AiPracticePage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-tracker',
    element: <AiTrackerPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-exam/:examId',
    element: <AiExamSessionPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-exams-open',
    element: <AiStudentExamsPage />,
    allowedRoles: ACTIVE_PLATFORM_ROLES,
  },
  {
    path: '/ai-question-builder',
    element: <AiQuestionBuilderPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/ai-exams',
    element: <AiExamsPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/ai-assistant',
    element: <AiAssistantPage />,
    allowedRoles: AUTHOR_ROLES,
  },
];

const authorRoutes: AppRouteConfig[] = [
  {
    path: '/cms',
    element: <AuthorStudioPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/create-course',
    element: <AuthorCreateCoursePage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/create-test',
    element: <AuthorCreateTestPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/admin-analytics',
    element: <AnalyticsPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/manage-users',
    element: <AuthorUsersPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  ...AUTHOR_ROUTE_ALIASES.map(
    ({ path, destination }): AppRouteConfig => ({
      path,
      element: <Navigate to={destination} replace />,
      allowedRoles: AUTHOR_ROLES,
    }),
  ),
];

const disabledLegacyRoutes: AppRouteConfig[] = DISABLED_SCHOOL_PATHS.map(
  (path): AppRouteConfig => ({
    path,
    element: <Navigate to="/dashboard" replace />,
    allowedRoles: ALL_DATABASE_ROLES,
  }),
);

const protectedRoutes: AppRouteConfig[] = [
  ...accountRoutes,
  ...learningRoutes,
  ...aiRoutes,
  ...authorRoutes,
  ...disabledLegacyRoutes,
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
  return routes.map((route) => (
    <Route
      key={route.path}
      path={route.path}
      element={
        guarded ? (
          <GuardedRoute
            allowedRoles={route.allowedRoles}
            enforcePasswordSetup={route.enforcePasswordSetup ?? true}
          >
            {route.element}
          </GuardedRoute>
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
