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
const TeacherEditCoursePage = lazy(() => import('./pages/TeacherEditCoursePage'));
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

const ALL_ROLES: UserRole[] = ['student', 'teacher', 'parent', 'admin'];
const STUDENT_ROLES: UserRole[] = ['student'];
const TEACHER_ROLES: UserRole[] = ['teacher'];
const PARENT_ROLES: UserRole[] = ['parent'];
const ADMIN_ROLES: UserRole[] = ['admin'];
const AUTHOR_ROLES: UserRole[] = ['teacher', 'admin'];

const LEARNING_CONTENT_ROLES: UserRole[] = ['student', 'teacher', 'admin'];
const ANALYTICS_ROLES: UserRole[] = ['student', 'teacher', 'parent', 'admin'];

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
  enforcePasswordSetup?: boolean;
};

/**
 * Бет немесе сессия жүктелгенде ешқандай «Жүктелуде / Сессия жүктелу» блогын көрсетпей,
 * тек жұмсақ бұлдыр (размытый) экранмен тегіс өтеді.
 */
function AppLoadingScreen() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-50 bg-background/60 backdrop-blur-xl transition-all duration-300 animate-fade-in"
    />
  );
}

/**
 * Бір парақшадан екінші парақшаға өткенде экранды жұмсақ размытый (blur) етіп
 * келесі бетке плавно ауыстыратын қабат.
 */
function RouteBlurTransitionVeil() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  // Негізгі беттерді фонда алдын ала жүктеу (парақша ауысқанда кідіріс болмауы үшін)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('./pages/DashboardRouter');
      void import('./pages/CourseCatalogPage');
      void import('./pages/CourseDetailPage');
      void import('./pages/LessonsPage');
      void import('./pages/LessonDetailPage');
      void import('./pages/TestsPage');
      void import('./pages/AnalyticsPage');
      void import('./pages/ProfileSettingsPage');
      void import('./pages/AiTutorPage');
      void import('./pages/AiPracticePage');
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      key={pathname}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 bg-background/20 animate-blur-veil"
    />
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

  if (!authUser) {
    return false;
  }

  if (hasPasswordIdentity(session)) {
    return false;
  }

  return getSessionProviders(session).has('google');
}

function normalizeNextPath(next = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/dashboard';
  }

  if (next.startsWith('/setup-password')) {
    return '/dashboard';
  }

  return next;
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


function AiEntryPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'student') {
    return <Navigate to="/ai-tutor" replace />;
  }

  if (AUTHOR_ROLES.includes(user.role)) {
    return <Navigate to="/ai-assistant" replace />;
  }

  return <Navigate to="/dashboard" replace />;
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
  {
    path: '/ai',
    element: <AiEntryPage />,
    allowedRoles: LEARNING_CONTENT_ROLES,
  },
  { path: '/profile', element: <ProfileSettingsPage />, allowedRoles: ALL_ROLES },
  {
    path: '/setup-password',
    element: <SetupPasswordPage />,
    allowedRoles: ALL_ROLES,
    enforcePasswordSetup: false,
  },
  {
    path: '/chat',
    element: <ChatPage />,
    allowedRoles: ALL_ROLES,
  },
];

const sharedContentRoutes: AppRouteConfig[] = [
  {
    path: '/courses',
    element: <CourseCatalogPage />,
    allowedRoles: LEARNING_CONTENT_ROLES,
  },
  {
    path: '/courses/:courseId',
    element: <CourseDetailPage />,
    allowedRoles: LEARNING_CONTENT_ROLES,
  },
  {
    path: '/lessons',
    element: <LessonsPage />,
    allowedRoles: ['student', 'admin'],
  },
  {
    path: '/lessons/:lessonId',
    element: <LessonDetailPage />,
    allowedRoles: LEARNING_CONTENT_ROLES,
  },
  {
    path: '/analytics',
    element: <AnalyticsPage />,
    allowedRoles: ANALYTICS_ROLES,
  },
];

const studentRoutes: AppRouteConfig[] = [
  {
    path: '/saved-lessons',
    element: <SavedLessonsPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/tests',
    element: <TestsPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/leaderboard',
    element: <LeaderboardPage />,
    allowedRoles: STUDENT_ROLES,
  },
  ...studentGamificationPaths.map((path): AppRouteConfig => ({
    path,
    element: <GamificationPage />,
    allowedRoles: STUDENT_ROLES,
  })),
  {
    path: '/ai-practice',
    element: <AiPracticePage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/ai-tutor',
    element: <AiTutorPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/ai-tracker',
    element: <AiTrackerPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/ai-exam/:examId',
    element: <AiExamSessionPage />,
    allowedRoles: STUDENT_ROLES,
  },
  {
    path: '/ai-exams-open',
    element: <AiStudentExamsPage />,
    allowedRoles: STUDENT_ROLES,
  },
];

const authorRoutes: AppRouteConfig[] = [
  {
    path: '/my-courses',
    element: <CourseCatalogPage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/create-course',
    element: <TeacherCreateCoursePage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/teacher/courses/:courseId/edit',
    element: <TeacherEditCoursePage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/edit-course/:courseId',
    element: <TeacherEditCoursePage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/edit-course',
    element: <TeacherEditCoursePage />,
    allowedRoles: AUTHOR_ROLES,
  },
  {
    path: '/create-test',
    element: <TeacherCreateTestPage />,
    allowedRoles: AUTHOR_ROLES,
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

const teacherOnlyRoutes: AppRouteConfig[] = [
  {
    path: '/students',
    element: <TeacherStudentsPage />,
    allowedRoles: TEACHER_ROLES,
  },
];

const parentRoutes: AppRouteConfig[] = parentChildPaths.map(
  (path): AppRouteConfig => ({
    path,
    element: <ParentChildrenPage />,
    allowedRoles: PARENT_ROLES,
  }),
);

const adminRoutes: AppRouteConfig[] = [
  {
    path: '/subjects',
    element: <AdminSubjectsPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/manage-lessons',
    element: <LessonsPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/manage-courses',
    element: <CourseCatalogPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/moderation',
    element: <AdminModerationPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/manage-tests',
    element: <AdminModerationPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/cms',
    element: <AdminCmsPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/admin-analytics',
    element: <AnalyticsPage />,
    allowedRoles: ADMIN_ROLES,
  },
  {
    path: '/manage-users',
    element: <AdminUsersPage />,
    allowedRoles: ADMIN_ROLES,
  },
];

const protectedRoutes: AppRouteConfig[] = [
  ...commonProtectedRoutes,
  ...sharedContentRoutes,
  ...studentRoutes,
  ...authorRoutes,
  ...teacherOnlyRoutes,
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
            <RouteBlurTransitionVeil />

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