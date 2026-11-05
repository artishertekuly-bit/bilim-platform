import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bookmark,
  Bot,
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  ListChecks,
  LogOut,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  UserRound,
  WandSparkles,
} from 'lucide-react';

import UserAvatar from '@/components/UserAvatar';
import SanaDock from '@/components/navigation/SanaDock';
import type { SanaLauncherTool } from '@/components/navigation/SanaDockLauncher';
import { useTheme } from '@/components/theme/ThemeProvider';
import VoiceAssistantFloatingTrigger from '@/components/voice/VoiceAssistantFloatingTrigger';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_NAME_CHARS = 160;
const MAX_EMAIL_CHARS = 320;
const MAX_URL_CHARS = 2_000;
const MAX_LABEL_CHARS = 120;

type ThemeValue = 'light' | 'dark' | 'system';

type DockConfig = {
  showCreate: boolean;
  courseTools: SanaLauncherTool[];
  aiTools: SanaLauncherTool[];
  mainPaths: {
    home: string;
    courses: string;
    create?: string;
    ai: string;
    profile: string;
  };
  coursePaths: {
    back: string;
    tests: string;
    progress: string;
  };
};


const STUDENT_COURSE_TOOLS: SanaLauncherTool[] = [
  {
    id: 'course-catalog',
    title: 'Курс таңдау',
    description: 'Қолжетімді курстар каталогы',
    path: '/courses',
    icon: BookOpen,
    badge: 'Каталог',
    featured: true,
  },
  {
    id: 'student-lessons',
    title: 'Барлық сабақтар',
    description: 'Оқу сабақтары мен тақырыптар',
    path: '/lessons',
    icon: FileText,
    badge: 'Сабақтар',
  },
  {
    id: 'saved-lessons',
    title: 'Сақталған сабақтар',
    description: 'Таңдаулы оқу материалдары',
    path: '/saved-lessons',
    icon: Bookmark,
    badge: 'Жинақ',
  },
  {
    id: 'student-tests',
    title: 'Тесттер',
    description: 'Бекіту және бақылау тапсырмалары',
    path: '/tests',
    icon: ClipboardList,
    badge: 'Тексеру',
  },
];

const ADMIN_COURSE_TOOLS: SanaLauncherTool[] = [
  {
    id: 'admin-courses',
    title: 'Курстарды басқару',
    description: 'Барлық курстар каталогы',
    path: '/manage-courses',
    icon: BookOpen,
    badge: 'Курстар',
    featured: true,
  },
  {
    id: 'admin-create-course',
    title: 'Жаңа курс',
    description: 'Жүйелік курс қосу',
    path: '/create-course',
    icon: Sparkles,
    badge: 'Құрастыру',
  },
  {
    id: 'admin-lessons',
    title: 'Сабақтарды басқару',
    description: 'Сабақ материалдары',
    path: '/manage-lessons',
    icon: FileText,
    badge: 'Сабақтар',
  },
  {
    id: 'admin-tests',
    title: 'Тесттерді басқару',
    description: 'Тест қоры мен сұрақтары',
    path: '/manage-tests',
    icon: ClipboardList,
    badge: 'Тесттер',
  },
  {
    id: 'admin-students',
    title: 'Оқушылар',
    description: 'Курстарыңыздағы оқушылар мен үлгерім',
    path: '/students',
    icon: UserRound,
    badge: 'Аудитория',
  },
];

const STUDENT_AI_TOOLS: SanaLauncherTool[] = [
  {
    id: 'tutor',
    title: 'AI Тьютор',
    description: 'Сұрақтар мен тақырыпты түсіндіру',
    path: '/ai-tutor',
    icon: Bot,
    badge: 'Тьютор',
    featured: true,
  },
  {
    id: 'practice',
    title: 'AI Практика',
    description: 'Жеке жаттығулар мен есептер',
    path: '/ai-practice',
    icon: WandSparkles,
    badge: 'Практика',
  },
  {
    id: 'tracker',
    title: 'AI Оқу ізі',
    description: 'Оқу талдауы мен ұсыныстар',
    path: '/ai-tracker',
    icon: BrainCircuit,
    badge: 'Талдау',
  },
  {
    id: 'student-exams',
    title: 'AI Емтихандар',
    description: 'Ашық емтихан сынақтары',
    path: '/ai-exams-open',
    icon: ClipboardCheck,
    badge: 'Сынақ',
  },
];

const AUTHOR_AI_TOOLS: SanaLauncherTool[] = [
  {
    id: 'assistant',
    title: 'Автор көмекшісі',
    description: 'Курс құрылымы мен мазмұны',
    path: '/ai-assistant',
    icon: Bot,
    badge: 'Ассистент',
    featured: true,
  },
  {
    id: 'question-builder',
    title: 'Сұрақ генераторы',
    description: 'Тест сұрақтарын құрастыру',
    path: '/ai-question-builder',
    icon: ListChecks,
    badge: 'Генератор',
  },
  {
    id: 'ai-exams',
    title: 'AI Емтихандар',
    description: 'Емтихандарды басқару',
    path: '/ai-exams',
    icon: ClipboardCheck,
    badge: 'Емтихан',
  },
];

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_LABEL_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeAvatarUrl(value: unknown): string | undefined {
  const url = cleanText(value, MAX_URL_CHARS);

  return url || undefined;
}

function getDisplayName(user?: {
  fullName?: string | null;
  email?: string | null;
} | null): string {
  const fullName = cleanText(user?.fullName, MAX_NAME_CHARS);
  const emailName = cleanText(user?.email?.split('@')[0], MAX_NAME_CHARS);

  return fullName || emailName || 'Пайдаланушы';
}

function getDisplayEmail(email?: string | null): string {
  return cleanText(email, MAX_EMAIL_CHARS) || '—';
}

function getRoleLabel(role: UserRole): string {
  if (role === 'admin') return 'Админ';
  if (role === 'student') return 'Оқушы';

  return 'Ескі аккаунт';
}

function getPageLabel(pathname: string): string {
  if (pathname === '/dashboard') return 'Басты бет';
  if (pathname === '/profile') return 'Профиль';

  if (
    pathname === '/courses' ||
    pathname === '/my-courses' ||
    pathname === '/manage-courses' ||
    pathname.startsWith('/courses/')
  ) {
    return 'Курстар';
  }

  if (
    pathname === '/lessons' ||
    pathname === '/manage-lessons' ||
    pathname.startsWith('/lessons/')
  ) {
    return 'Сабақтар';
  }

  if (
    pathname === '/tests' ||
    pathname === '/create-test' ||
    pathname === '/manage-tests'
  ) {
    return 'Тесттер';
  }

  if (pathname === '/create-course') return 'Жаңа курс';
  if (pathname.includes('/edit') || pathname.startsWith('/edit-course')) return 'Курсты өңдеу';

  if (
    pathname === '/ai' ||
    pathname.startsWith('/ai-')
  ) {
    return 'ЖИ';
  }

  if (
    pathname === '/analytics' ||
    pathname === '/admin-analytics'
  ) {
    return 'Прогресс';
  }

  if (pathname === '/manage-users') return 'Қолданушылар';
  if (pathname === '/saved-lessons') return 'Сақталғандар';
  if (pathname === '/students') return 'Оқушылар';

  return 'Sana';
}

function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  const items: Array<{
    value: ThemeValue;
    label: string;
    icon: typeof Sun;
  }> = [
    {
      value: 'light',
      label: 'Жарық',
      icon: Sun,
    },
    {
      value: 'dark',
      label: 'Қараңғы',
      icon: Moon,
    },
    {
      value: 'system',
      label: 'Жүйе',
      icon: Monitor,
    },
  ];

  return (
    <div
      className={cn(
        'flex items-center rounded-full border border-border bg-background/80 p-1',
        compact ? 'w-full justify-between' : 'shrink-0',
      )}
      aria-label="Тақырып"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = theme === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setTheme(item.value)}
            aria-label={item.label}
            aria-pressed={active}
            title={item.label}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground',
              'transition-[background-color,color,transform] duration-200',
              'hover:bg-muted hover:text-foreground active:scale-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              active && 'bg-foreground text-background hover:bg-foreground hover:text-background',
            )}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

function AccountMenu({
  displayName,
  displayEmail,
  avatarUrl,
  role,
  onLogout,
}: {
  displayName: string;
  displayEmail: string;
  avatarUrl?: string;
  role: UserRole;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Аккаунт мәзірі"
        className={cn(
          'group flex items-center gap-2 rounded-full border border-border bg-card/85 p-1.5 pr-2',
          'shadow-sm backdrop-blur-xl transition-all duration-200',
          'hover:border-foreground/20 hover:bg-card hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
          open && 'border-foreground/20 bg-card shadow-md',
        )}
      >
        <UserAvatar
          name={displayName}
          avatarUrl={avatarUrl}
          className="h-8 w-8"
          fallbackClassName="bg-foreground text-[10px] font-bold text-background"
        />

        <span className="hidden max-w-32 truncate text-xs font-semibold sm:block">
          {displayName}
        </span>

        <ChevronDown
          size={14}
          className={cn(
            'text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(20rem,calc(100vw-2rem))]',
            'overflow-hidden rounded-[1.75rem] border border-border bg-card/95 p-2',
            'shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-2xl',
            'animate-scale-in',
          )}
        >
          <div className="rounded-[1.35rem] bg-muted/45 p-3">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={displayName}
                avatarUrl={avatarUrl}
                className="h-11 w-11"
                fallbackClassName="bg-foreground text-xs font-bold text-background"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{displayName}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {displayEmail}
                </p>
              </div>

              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                {getRoleLabel(role)}
              </span>
            </div>
          </div>

          <div className="mt-2 grid gap-1">
            <Link
              to="/profile"
              role="menuitem"
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background">
                <UserRound size={15} />
              </span>
              Профиль
            </Link>

            {role === 'admin' ? (
              <Link
                to="/ai"
                role="menuitem"
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background">
                  <Bot size={15} />
                </span>
                ЖИ көмекші
              </Link>
            ) : null}
          </div>

          <div className="my-2 h-px bg-border" />

          <div className="px-2 pb-2">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Көрініс
            </p>
            <ThemeControl compact />
          </div>

          <div className="h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className={cn(
              'mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium',
              'text-destructive transition-colors hover:bg-destructive-soft',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-destructive/20 bg-destructive-soft">
              <LogOut size={15} />
            </span>
            {loggingOut ? 'Шығуда...' : 'Шығу'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const displayEmail = useMemo(
    () => getDisplayEmail(user?.email),
    [user?.email],
  );
  const avatarUrl = useMemo(
    () => normalizeAvatarUrl(user?.avatarUrl),
    [user?.avatarUrl],
  );

  const pageLabel = useMemo(
    () => getPageLabel(location.pathname),
    [location.pathname],
  );

  const dockConfig = useMemo<DockConfig | null>(() => {
    if (!user) return null;

    if (user.role === 'student') {
      return {
        showCreate: false,
        courseTools: STUDENT_COURSE_TOOLS,
        aiTools: STUDENT_AI_TOOLS,
        mainPaths: {
          home: '/dashboard',
          courses: '/courses',
          ai: '/ai',
          profile: '/profile',
        },
        coursePaths: {
          back: '/courses',
          tests: '/tests',
          progress: '/analytics',
        },
      };
    }

    if (user.role === 'admin') {
      return {
        showCreate: true,
        courseTools: ADMIN_COURSE_TOOLS,
        aiTools: AUTHOR_AI_TOOLS,
        mainPaths: {
          home: '/dashboard',
          courses: '/manage-courses',
          create: '/create-course',
          ai: '/ai',
          profile: '/profile',
        },
        coursePaths: {
          back: '/manage-courses',
          tests: '/create-test',
          progress: '/admin-analytics',
        },
      };
    }

    return null;
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Local navigation still completes when the remote logout request fails.
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (!user) return null;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-72 bg-gradient-to-b from-muted/55 via-background/25 to-transparent"
      />

      <header
        className={cn(
          'sticky top-0 z-40 border-b border-border/70 bg-background/82',
          'backdrop-blur-2xl supports-[backdrop-filter]:bg-background/72',
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1480px] items-center gap-3 px-4 sm:px-5 lg:px-8">
          <Link
            to="/dashboard"
            aria-label="Sana басты беті"
            className={cn(
              'group flex min-w-0 items-center gap-2.5 rounded-full',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform duration-200 group-hover:scale-105">
              <Sparkles size={16} strokeWidth={2.2} />
            </span>

            <span className="min-w-0">
              <span className="block text-sm font-black lowercase tracking-[-0.05em]">
                sana
              </span>
              <span className="hidden text-[10px] font-medium text-muted-foreground sm:block">
                {getRoleLabel(user.role)}
              </span>
            </span>
          </Link>

          <div className="mx-auto min-w-0 flex-1 px-2 text-center">
            <p className="truncate text-sm font-semibold tracking-[-0.015em]">
              {pageLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden md:block">
              <ThemeControl />
            </div>

            <AccountMenu
              displayName={displayName}
              displayEmail={displayEmail}
              avatarUrl={avatarUrl}
              role={user.role}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      <main
        className={cn(
          'relative z-10 px-4 pt-4 sm:px-5 sm:pt-5 lg:px-8 lg:pt-7',
          dockConfig ? 'pb-28 sm:pb-32' : 'pb-6',
        )}
      >
        <div
          key={location.pathname}
          className="mx-auto w-full max-w-[1480px] animate-page-blur"
        >
          {children}
        </div>
      </main>

      {dockConfig ? (
        <SanaDock
          showCreate={dockConfig.showCreate}
          courseTools={dockConfig.courseTools}
          aiTools={dockConfig.aiTools}
          mainPaths={dockConfig.mainPaths}
          coursePaths={dockConfig.coursePaths}
        />
      ) : null}

      <VoiceAssistantFloatingTrigger />
    </div>
  );
}
