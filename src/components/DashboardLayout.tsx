import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  BarChart3,
  Gamepad2,
  Trophy,
  Award,
  GraduationCap,
  Plus,
  Users,
  Settings,
  FolderOpen,
  Eye,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Bot,
  Sparkles,
  MessageCircle,
  Bookmark,
  ShieldCheck,
  BrainCircuit,
  Sun,
  Moon,
  Monitor,
  type LucideIcon,
} from 'lucide-react';

import { useAuth, type UserRole } from '@/lib/auth-context';
import { useTheme } from '@/components/theme/ThemeProvider';
import t, { type TranslationKey } from '@/lib/i18n';
import KazakhOrnament from '@/components/KazakhOrnament';
import UserAvatar from '@/components/UserAvatar';

type NavItemConfig = {
  labelKey?: TranslationKey;
  label?: string;
  path: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'section';
  aliases?: string[];
};

type NavGroupConfig = {
  title: string;
  items: NavItemConfig[];
};

const roleTitleKeys: Record<UserRole, TranslationKey> = {
  student: 'role.student',
  teacher: 'role.teacher',
  parent: 'role.parent',
  admin: 'role.admin',
};

const chatNavItem: NavItemConfig = {
  label: 'Чат',
  path: '/chat',
  icon: MessageCircle,
  matchMode: 'section',
};

const roleNavGroups: Record<UserRole, NavGroupConfig[]> = {
  student: [
    {
      title: 'Негізгі',
      items: [
        { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
        { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
        chatNavItem,
      ],
    },
    {
      title: 'Оқу',
      items: [
        { labelKey: 'nav.courses', path: '/courses', icon: BookOpen, matchMode: 'section' },
        { labelKey: 'nav.lessons', path: '/lessons', icon: FileText, matchMode: 'section' },
        {
          label: 'Сақталған сабақтар',
          path: '/saved-lessons',
          icon: Bookmark,
          matchMode: 'section',
        },
        { labelKey: 'nav.tests', path: '/tests', icon: ClipboardList, matchMode: 'section' },
      ],
    },
    {
      title: 'AI құралдар',
      items: [
        { labelKey: 'nav.ai_practice', path: '/ai-practice', icon: Sparkles, matchMode: 'section' },
        { labelKey: 'nav.ai_tutor', path: '/ai-tutor', icon: Bot, matchMode: 'section' },
        { labelKey: 'nav.ai_tracker', path: '/ai-tracker', icon: BrainCircuit, matchMode: 'section' },
      ],
    },
    {
      title: 'Нәтиже',
      items: [
        { labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, matchMode: 'section' },
        { labelKey: 'nav.gamification', path: '/games', icon: Gamepad2, matchMode: 'section' },
        { labelKey: 'nav.leaderboard', path: '/leaderboard', icon: Trophy, matchMode: 'section' },
        { labelKey: 'nav.achievements', path: '/achievements', icon: Award, matchMode: 'section' },
      ],
    },
  ],

  teacher: [
    {
      title: 'Негізгі',
      items: [
        { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
        { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
        chatNavItem,
      ],
    },
    {
      title: 'Курстар',
      items: [
        { labelKey: 'nav.my_courses', path: '/my-courses', icon: BookOpen, matchMode: 'section' },
        { labelKey: 'nav.create_course', path: '/create-course', icon: Plus, matchMode: 'section' },
        { labelKey: 'nav.create_test', path: '/create-test', icon: ClipboardList, matchMode: 'section' },
      ],
    },
    {
      title: 'AI және емтихан',
      items: [
        {
          labelKey: 'nav.ai_question_builder',
          path: '/ai-question-builder',
          icon: Sparkles,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.ai_exams',
          path: '/ai-exams',
          icon: Bot,
          matchMode: 'section',
          aliases: ['/ai-exams-open'],
        },
        {
          labelKey: 'nav.ai_assistant',
          path: '/ai-assistant',
          icon: BrainCircuit,
          matchMode: 'section',
        },
      ],
    },
    {
      title: 'Бақылау',
      items: [
        { labelKey: 'nav.students', path: '/students', icon: Users, matchMode: 'section' },
        { labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, matchMode: 'section' },
      ],
    },
  ],

  parent: [
    {
      title: 'Негізгі',
      items: [
        { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
        { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
        chatNavItem,
      ],
    },
    {
      title: 'Бала бақылауы',
      items: [
        { labelKey: 'nav.children', path: '/children', icon: Users, matchMode: 'section' },
        { labelKey: 'nav.child_progress', path: '/child-progress', icon: BarChart3, matchMode: 'section' },
        { labelKey: 'nav.child_tests', path: '/child-tests', icon: ClipboardList, matchMode: 'section' },
        { labelKey: 'nav.child_achievements', path: '/child-achievements', icon: Award, matchMode: 'section' },
      ],
    },
  ],

  admin: [
    {
      title: 'Негізгі',
      items: [
        { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
        { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
        chatNavItem,
      ],
    },
    {
      title: 'Контент',
      items: [
        { labelKey: 'nav.subjects', path: '/subjects', icon: GraduationCap, matchMode: 'section' },
        { labelKey: 'nav.manage_lessons', path: '/manage-lessons', icon: FileText, matchMode: 'section' },
        { labelKey: 'nav.manage_courses', path: '/manage-courses', icon: BookOpen, matchMode: 'section' },
        { labelKey: 'nav.manage_tests', path: '/manage-tests', icon: ClipboardList, matchMode: 'section' },
        { labelKey: 'nav.cms', path: '/cms', icon: FolderOpen, matchMode: 'section' },
      ],
    },
    {
      title: 'Басқару',
      items: [
        { labelKey: 'nav.moderation', path: '/moderation', icon: Eye, matchMode: 'section' },
        { labelKey: 'nav.analytics', path: '/admin-analytics', icon: BarChart3, matchMode: 'section' },
        { labelKey: 'nav.users', path: '/manage-users', icon: Users, matchMode: 'section' },
      ],
    },
  ],
};

function getNavLabel(item: NavItemConfig) {
  if (item.label) return item.label;
  if (item.labelKey) return t(item.labelKey);
  return '';
}

function matchesPath(
  pathname: string,
  path: string,
  matchMode: NavItemConfig['matchMode'] = 'section'
) {
  if (matchMode === 'exact') {
    return pathname === path;
  }

  return pathname === path || pathname.startsWith(`${path}/`);
}

function isPathActive(pathname: string, item: NavItemConfig) {
  if (matchesPath(pathname, item.path, item.matchMode)) {
    return true;
  }

  return (item.aliases || []).some((alias) =>
    matchesPath(pathname, alias, item.matchMode)
  );
}

function getDisplayName(user?: {
  fullName?: string | null;
  email?: string | null;
} | null) {
  if (!user) return '';
  if (user.fullName?.trim()) return user.fullName;
  return user.email?.split('@')[0] || 'User';
}

function flattenGroups(groups: NavGroupConfig[]) {
  return groups.flatMap((group) => group.items);
}

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const items = [
    {
      value: 'light' as const,
      label: 'Light',
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: 'Dark',
      icon: Moon,
    },
    {
      value: 'system' as const,
      label: 'System',
      icon: Monitor,
    },
  ];

  return (
    <div
      className="flex items-center rounded-2xl border border-border bg-card/80 p-1 shadow-soft"
      title={`Theme: ${theme} · active ${resolvedTheme}`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = theme === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setTheme(item.value)}
            className={`
              inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground
              transition-all duration-200 ease-soft
              hover:-translate-y-0.5 hover:bg-primary-soft hover:text-primary
              active:translate-y-0 active:scale-[0.98]
              ${
                active
                  ? 'bg-primary-soft text-primary shadow-sm ring-1 ring-primary-muted'
                  : ''
              }
            `}
            aria-label={item.label}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

function SidebarSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroupConfig;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {group.title}
        </p>
      </div>

      {group.items.map((item) => {
        const Icon = item.icon;
        const isActive = isPathActive(pathname, item);
        const label = getNavLabel(item);

        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={`
              group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-sm
              transition-all duration-200 ease-soft
              hover:-translate-y-0.5 hover:shadow-soft
              active:translate-y-0 active:scale-[0.99]
              ${
                isActive
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-soft ring-1 ring-sidebar-border'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
              }
            `}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive ? (
              <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />
            ) : null}

            <span
              className={`
                flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ease-soft
                ${
                  isActive
                    ? 'border-primary-muted bg-card text-primary shadow-sm'
                    : 'border-transparent bg-card/40 text-muted-foreground group-hover:border-primary-muted group-hover:bg-card group-hover:text-primary'
                }
              `}
            >
              <Icon size={16} />
            </span>

            <span className="min-w-0 flex-1 truncate">{label}</span>

            {isActive ? (
              <ChevronRight size={14} className="shrink-0 text-primary" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (!sidebarOpen) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const navGroups = useMemo(() => {
    if (!user) return [];
    return roleNavGroups[user.role] || [];
  }, [user]);

  const navItems = useMemo(() => flattenGroups(navGroups), [navGroups]);

  const activeItem = useMemo(
    () => navItems.find((item) => isPathActive(location.pathname, item)),
    [location.pathname, navItems]
  );

  const displayName = useMemo(() => getDisplayName(user), [user]);

  const handleLogout = async () => {
    setSidebarOpen(false);

    try {
      await logout();
    } catch (error) {
      console.error('[DashboardLayout] Logout failed', error);
    } finally {
      navigate('/', { replace: true });
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/15 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-sidebar-border
          bg-sidebar/95 shadow-soft-lg backdrop-blur-xl
          transition-transform duration-200 ease-soft lg:sticky lg:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-3 rounded-2xl transition-all duration-200 ease-soft hover:-translate-y-0.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap size={18} />
            </div>

            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">
                Bilimcorp
              </span>
              <span className="block truncate text-[10px] font-medium text-muted-foreground">
                Human-centered LMS
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-2xl p-2 text-muted-foreground transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-sidebar-accent hover:text-foreground lg:hidden"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-3xl border border-sidebar-border bg-card/70 p-3 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-secondary-soft text-secondary-foreground">
                <ShieldCheck size={16} />
              </div>

              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Рөл
                </span>
                <span className="block truncate text-sm font-semibold">
                  {t(roleTitleKeys[user.role])}
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {navGroups.map((group) => (
            <SidebarSection
              key={group.title}
              group={group}
              pathname={location.pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="px-5 py-2">
          <div className="flex justify-center opacity-70">
            <KazakhOrnament variant="divider" />
          </div>
        </div>

        <div className="border-t border-sidebar-border px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">
              Тақырып
            </span>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 rounded-3xl border border-sidebar-border bg-card/70 p-2 shadow-soft">
            <Link
              to="/profile"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 transition-all duration-200 ease-soft hover:bg-primary-soft"
            >
              <UserAvatar
                name={displayName}
                avatarUrl={user.avatarUrl}
                className="h-9 w-9"
                fallbackClassName="bg-primary-soft text-xs font-semibold text-primary"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-2xl p-2 text-muted-foreground transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-destructive-soft hover:text-destructive"
              title={t('nav.logout')}
              aria-label={t('nav.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/82 px-4 backdrop-blur-xl lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-2 mr-3 rounded-2xl p-2 text-muted-foreground transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:bg-primary-soft hover:text-primary lg:hidden"
            aria-label={t('common.open_menu')}
          >
            <Menu size={19} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {activeItem ? getNavLabel(activeItem) : t('nav.dashboard')}
            </p>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
              Soft academic workspace
            </p>
          </div>

          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </header>

        <main className="kazakh-ornament-bg flex-1 p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[1480px] animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}