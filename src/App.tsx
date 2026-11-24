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
import { OfflineBanner } from '@/components/bl/SystemScreens';
import { LogoMark } from '@/components/bl/icons';
import { useAppDeepLink } from '@/lib/useAppDeepLink';

const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));

// Жаңа фронтенд: «Bilim — телефон прототипі» канвасы бойынша (src/components/bl).
const WelcomePage = lazy(() => import('./pages/auth/WelcomePage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const OnboardingPage = lazy(() => import('./pages/auth/OnboardingPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })));
const NewPasswordPage = lazy(() => import('./pages/auth/PasswordPages').then((m) => ({ default: m.NewPasswordPage })));
const SettingsPage = lazy(() => import('./pages/account/SettingsPage'));
const AvatarEditPage = lazy(() => import('./pages/account/AvatarEditPage'));
const DashboardRouter = lazy(() => import('./pages/DashboardRouter'));

// Курстар, тесттер, рейтинг, жетістіктер, аналитика және ескі ЖИ емтихан/автор беттері алынды (D19, karta §6.1).
// Кестелер мен деректер өшірілмеді; беттердің файлдары кейін бөлек тазаланады.
const LessonsCatalogPage = lazy(() => import('./pages/lessons/LessonsCatalogPage'));
const LessonViewPage = lazy(() => import('./pages/lessons/LessonViewPage'));
const ChatListPage = lazy(() => import('./pages/chat/ChatListPage'));
const ChatThreadPage = lazy(() => import('./pages/chat/ChatThreadPage'));
const StudentProfilePage = lazy(() => import('./pages/account/StudentProfilePage'));
const NotificationsPage = lazy(() => import('./pages/account/NotificationsPage'));
const JoinClassPage = lazy(() => import('./pages/account/JoinClassPage'));

const AdminSubjectsPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminSubjectsPage })));
const AdminLessonsPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminLessonsPage })));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminUsersPage })));
// Білім басқармасы (D90): платформа иесінің басқармалары және басқарма әкімшісінің беттері.
const OwnerDepartmentsPage = lazy(() => import('./pages/admin/DepartmentPages').then((m) => ({ default: m.OwnerDepartmentsPage })));
const HeadHomePage = lazy(() => import('./pages/admin/DepartmentPages').then((m) => ({ default: m.HeadHomePage })));
const HeadTeachersPage = lazy(() => import('./pages/admin/DepartmentPages').then((m) => ({ default: m.HeadTeachersPage })));
const HeadStudentsPage = lazy(() => import('./pages/admin/DepartmentPages').then((m) => ({ default: m.HeadStudentsPage })));

const NotFound = lazy(() => import('./pages/NotFound'));

// AI Tutor v2 (7-қадам, D86): LightRAG + PersonaRAG. Ескі практика мен трекер алынды (D40).
const TutorPage = lazy(() => import('./pages/TutorPage'));

const TeacherLessonsPage = lazy(() => import('./pages/teacher/TeacherLessonsPage'));
const TeacherLessonEditPage = lazy(() => import('./pages/teacher/TeacherLessonEditPage'));
const TeacherStudentAlertsPage = lazy(() => import('./pages/teacher/TeacherStudentAlertsPage'));
const ParentHomePage = lazy(() => import('./pages/parent/ParentHomePage'));
const ParentLinkPage = lazy(() => import('./pages/parent/ParentLinkPage'));

const ExamHomePage = lazy(() => import('./pages/exam/ExamHomePage'));
const ExamPickerPage = lazy(() => import('./pages/exam/ExamPickerPage'));
const ExamAppealPage = lazy(() => import('./pages/exam/ExamAppealPage'));
const ExamSessionPage = lazy(() => import('./pages/exam/ExamSessionPage'));
const ExamResultPage = lazy(() => import('./pages/exam/ExamResultPage'));
const ExamProfilePage = lazy(() => import('./pages/exam/ExamProfilePage'));

const TeacherHomePage = lazy(() => import('./pages/teacher/TeacherHomePage'));
const TeacherClassPage = lazy(() => import('./pages/teacher/TeacherClassPage'));
const TeacherClassesPage = lazy(() => import('./pages/teacher/TeacherClassesPage'));
const TeacherReviewPage = lazy(() => import('./pages/teacher/TeacherReviewPage'));
const TeacherGradePage = lazy(() => import('./pages/teacher/TeacherGradePage'));

// Ойындар (8-қадам, D42–D55, D89): бөлмелер мен бес ойын.
const GamesHomePage = lazy(() => import('./pages/games/GamesHomePage'));
const GameCreatePage = lazy(() => import('./pages/games/GameCreatePage'));
const GameJoinPage = lazy(() => import('./pages/games/GameJoinPage'));
const GameRoomPage = lazy(() => import('./pages/games/GameRoomPage'));
const TeacherGameHostPage = lazy(() => import('./pages/games/TeacherGameHostPage'));

// Simulation Lab (D92): code-only registry of interactive models; three.js loads only inside a 3D scene.
const LabHomePage = lazy(() => import('./modules/simulation-lab/components/LabPages').then((m) => ({ default: m.LabHomePage })));
const LabSimulationPage = lazy(() => import('./modules/simulation-lab/components/LabPages').then((m) => ({ default: m.LabSimulationPage })));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Бес рөл (karta §2, D90): оқушы, мұғалім (D25, D83), ата-ана (D26, D85), басқарма әкімшісі (head) және платформа иесі (admin).
const ACCOUNT_ROLES: UserRole[] = ['student', 'teacher', 'parent', 'head', 'admin'];
const CHAT_ROLES: UserRole[] = ['student', 'teacher', 'parent'];
const STUDENT_ROLES: UserRole[] = ['student'];
const TEACHER_ROLES: UserRole[] = ['teacher'];
const PARENT_ROLES: UserRole[] = ['parent'];
const ADMIN_ROLES: UserRole[] = ['admin'];
const HEAD_ROLES: UserRole[] = ['head'];
const MODERATOR_ROLES: UserRole[] = ['admin', 'head'];

const LEARNING_CONTENT_ROLES: UserRole[] = ['student', 'admin'];
// D93: емтихан тақырыбын оқушы да, мұғалім де жазады; мұғалім бастаған генерация банкті оқушыларға толтырады.
const EXAM_ROLES: UserRole[] = ['student', 'teacher', 'admin'];
const GAME_ROLES: UserRole[] = ['student', 'teacher'];
const LESSON_READER_ROLES: UserRole[] = ['student', 'teacher', 'head', 'admin'];

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
    <div aria-busy="true" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-bl-bg">
      <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-bl-ink text-white">
        <LogoMark size={24} />
      </span>
      <span className="sr-only">Жүктелуде…</span>
    </div>
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
      void import('./pages/TutorPage');
      void import('./pages/exam/ExamHomePage');
      void import('./pages/games/GamesHomePage');
      void import('./pages/lessons/LessonsCatalogPage');
      void import('./pages/account/StudentProfilePage');
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
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

  return <WelcomePage />;
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
  { path: '/verify-email', element: <RegisterPage initialStep="code" /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/update-password', element: <NewPasswordPage mode="recovery" /> },
  { path: '/about', element: <Navigate to="/" replace /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  // Dev-only harness for Playwright: the same simulation without the app shell, sign-in or saving.
  ...(import.meta.env.DEV ? [{ path: '/dev/lab/:slug', element: <LabSimulationPage harness /> }] : []),
];

const commonProtectedRoutes: AppRouteConfig[] = [
  { path: '/dashboard', element: <DashboardRouter /> },
  {
    path: '/ai',
    element: <AiEntryPage />,
    allowedRoles: LEARNING_CONTENT_ROLES,
  },
  { path: '/profile', element: <StudentProfilePage />, allowedRoles: ACCOUNT_ROLES },
  { path: '/notifications', element: <NotificationsPage />, allowedRoles: ACCOUNT_ROLES },
  { path: '/settings', element: <SettingsPage />, allowedRoles: ACCOUNT_ROLES },
  { path: '/settings/avatar', element: <AvatarEditPage />, allowedRoles: ACCOUNT_ROLES },
  { path: '/settings/password', element: <NewPasswordPage mode="change" />, allowedRoles: ACCOUNT_ROLES },
  { path: '/onboarding', element: <OnboardingPage />, allowedRoles: STUDENT_ROLES },
  {
    path: '/setup-password',
    element: <NewPasswordPage mode="setup" />,
    allowedRoles: ACCOUNT_ROLES,
    enforcePasswordSetup: false,
  },
  {
    // Чат тек мұғалім ↔ сынып оқушысы және мұғалім ↔ оның ата-анасы (api §5.3, D24, D28).
    path: '/chat',
    element: <ChatListPage />,
    allowedRoles: CHAT_ROLES,
  },
  { path: '/chat/:threadId', element: <ChatThreadPage />, allowedRoles: CHAT_ROLES },
];

// Examiner v2 (api-kelisimderi.md §3): деңгей таңдау → сессия → нәтиже, профиль.
const examRoutes: AppRouteConfig[] = [
  { path: '/exam', element: <ExamHomePage />, allowedRoles: EXAM_ROLES },
  { path: '/exam/picker', element: <ExamPickerPage />, allowedRoles: EXAM_ROLES },
  { path: '/exam/session/:sessionId', element: <ExamSessionPage />, allowedRoles: EXAM_ROLES },
  { path: '/exam/result/:sessionId', element: <ExamResultPage />, allowedRoles: EXAM_ROLES },
  { path: '/exam/result/:sessionId/appeal', element: <ExamAppealPage />, allowedRoles: STUDENT_ROLES },
  { path: '/exam/profile', element: <ExamProfilePage />, allowedRoles: LEARNING_CONTENT_ROLES },
];

// 6-қадам (D25, D33, D83): мұғалім панелі және оқушының сыныпқа қосылуы.
const classRoutes: AppRouteConfig[] = [
  { path: '/teacher', element: <TeacherHomePage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/classes', element: <TeacherClassesPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/classes/:classId', element: <TeacherClassPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/review', element: <TeacherReviewPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/grades/:gradeId', element: <TeacherGradePage />, allowedRoles: TEACHER_ROLES },
  { path: '/classes', element: <JoinClassPage />, allowedRoles: STUDENT_ROLES },
  { path: '/teacher/students/:studentId', element: <TeacherStudentAlertsPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/lessons', element: <TeacherLessonsPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/lessons/new', element: <TeacherLessonEditPage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/lessons/:lessonId/edit', element: <TeacherLessonEditPage />, allowedRoles: TEACHER_ROLES },
  { path: '/parent', element: <ParentHomePage />, allowedRoles: PARENT_ROLES },
  { path: '/parent/link', element: <ParentLinkPage />, allowedRoles: PARENT_ROLES },
];

// Дербес сабақтар (D19–D21, api §5.1): каталогты оқушы көреді, сабақты мұғалім мен әкімші де ашады.
const sharedContentRoutes: AppRouteConfig[] = [
  { path: '/lessons', element: <LessonsCatalogPage />, allowedRoles: STUDENT_ROLES },
  { path: '/lessons/:lessonId', element: <LessonViewPage />, allowedRoles: LESSON_READER_ROLES },
  { path: '/saved-lessons', element: <Navigate to="/lessons?tab=saved" replace />, allowedRoles: STUDENT_ROLES },
  { path: '/lab', element: <LabHomePage />, allowedRoles: LESSON_READER_ROLES },
  { path: '/lab/:slug', element: <LabSimulationPage />, allowedRoles: LESSON_READER_ROLES },
];

// Tutor — оқушының ортасы (personarag §1, api §4). Жаттығу Examiner-де, бейресми прогресс — тьютордан
// «Не үйрендік?» деп сұрағанда (D40), сондықтан ескі сілтемелер сол жаққа бағытталады.
const studentRoutes: AppRouteConfig[] = [
  { path: '/ai-tutor', element: <TutorPage />, allowedRoles: STUDENT_ROLES },
  { path: '/ai-practice', element: <Navigate to="/exam" replace />, allowedRoles: STUDENT_ROLES },
  { path: '/ai-tracker', element: <Navigate to="/ai-tutor" replace />, allowedRoles: STUDENT_ROLES },
];

// Ойындар (geimifikatsiya §5): бөлмені оқушы да, мұғалім де ашады, ойнайтын — оқушы (D46).
const gameRoutes: AppRouteConfig[] = [
  { path: '/games', element: <GamesHomePage />, allowedRoles: GAME_ROLES },
  { path: '/games/new', element: <GameCreatePage />, allowedRoles: STUDENT_ROLES },
  { path: '/games/new/:gameType', element: <GameCreatePage />, allowedRoles: GAME_ROLES },
  { path: '/teacher/games', element: <GameCreatePage />, allowedRoles: TEACHER_ROLES },
  { path: '/teacher/games/:roomId', element: <TeacherGameHostPage />, allowedRoles: TEACHER_ROLES },
  { path: '/games/join', element: <GameJoinPage />, allowedRoles: STUDENT_ROLES },
  { path: '/games/rooms/:roomId', element: <GameRoomPage />, allowedRoles: GAME_ROLES },
];

const adminRoutes: AppRouteConfig[] = [
  { path: '/subjects', element: <AdminSubjectsPage />, allowedRoles: ADMIN_ROLES },
  { path: '/manage-lessons', element: <AdminLessonsPage />, allowedRoles: MODERATOR_ROLES },
  { path: '/moderation', element: <Navigate to="/manage-lessons" replace />, allowedRoles: MODERATOR_ROLES },
  { path: '/departments', element: <OwnerDepartmentsPage />, allowedRoles: ADMIN_ROLES },
  { path: '/department', element: <HeadHomePage />, allowedRoles: HEAD_ROLES },
  { path: '/department/teachers', element: <HeadTeachersPage />, allowedRoles: HEAD_ROLES },
  { path: '/department/students', element: <HeadStudentsPage />, allowedRoles: HEAD_ROLES },
  { path: '/cms', element: <Navigate to="/manage-users" replace />, allowedRoles: ADMIN_ROLES },
  { path: '/manage-users', element: <AdminUsersPage />, allowedRoles: ADMIN_ROLES },
];

const protectedRoutes: AppRouteConfig[] = [
  ...commonProtectedRoutes,
  ...examRoutes,
  ...classRoutes,
  ...sharedContentRoutes,
  ...studentRoutes,
  ...gameRoutes,
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

function DeepLinkHandler() {
  useAppDeepLink();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <DeepLinkHandler />
            <Toaster />
            <Sonner />
            <OfflineBanner />
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