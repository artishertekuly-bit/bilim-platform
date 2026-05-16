import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  BarChart3,
  BookOpen,
  Bookmark,
  Bot,
  BrainCircuit,
  ClipboardList,
  Eye,
  FileText,
  FolderOpen,
  Gamepad2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useAuth, type UserRole } from '@/lib/auth-context';
import t, { type TranslationKey } from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type NavItemConfig = {
  labelKey?: TranslationKey;
  label?: string;
  path: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'section';
  aliases?: string[];
  tone?: 'default' | 'ai' | 'create';
};

type NavGroupConfig = {
  title: string;
  items: NavItemConfig[];
};

const SIDEBAR_ID = 'dashboard-sidebar';

const MAX_NAME_CHARS = 160;
const MAX_EMAIL_CHARS = 320;
const MAX_URL_CHARS = 2_000;
const MAX_LABEL_CHARS = 120;

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
        {
          labelKey: 'nav.dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          matchMode: 'exact',
        },
        {
          labelKey: 'nav.profile',
          path: '/profile',
          icon: Settings,
          matchMode: 'exact',
        },
        chatNavItem,
      ],
    },
    {
      title: 'Оқу',
      items: [
        {
          labelKey: 'nav.courses',
          path: '/courses',
          icon: BookOpen,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.lessons',
          path: '/lessons',
          icon: FileText,
          matchMode: 'section',
        },
        {
          label: 'Сақталған сабақтар',
          path: '/saved-lessons',
          icon: Bookmark,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.tests',
          path: '/tests',
          icon: ClipboardList,
          matchMode: 'section',
        },
      ],
    },
    {
      title: 'ЖИ құралдар',
      items: [
        {
          labelKey: 'nav.ai_practice',
          path: '/ai-practice',
          icon: Sparkles,
          matchMode: 'section',
          tone: 'ai',
        },
        {
          labelKey: 'nav.ai_tutor',
          path: '/ai-tutor',
          icon: Bot,
          matchMode: 'section',
          tone: 'ai',
        },
        {
          labelKey: 'nav.ai_tracker',
          path: '/ai-tracker',
          icon: BrainCircuit,
          matchMode: 'section',
          tone: 'ai',
        },
      ],
    },
    {
      title: 'Нәтиже',
      items: [
        {
          labelKey: 'nav.analytics',
          path: '/analytics',
          icon: BarChart3,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.gamification',
          path: '/games',
          icon: Gamepad2,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.leaderboard',
          path: '/leaderboard',
          icon: Trophy,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.achievements',
          path: '/achievements',
          icon: Award,
          matchMode: 'section',
        },
      ],
    },
  ],

  teacher: [
    {
      title: 'Негізгі',
      items: [
        {
          labelKey: 'nav.dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          matchMode: 'exact',
        },
        {
          labelKey: 'nav.profile',
          path: '/profile',
          icon: Settings,
          matchMode: 'exact',
        },
        chatNavItem,
      ],
    },
    {
      title: 'Курстар',
      items: [
        {
          labelKey: 'nav.my_courses',
          path: '/my-courses',
          icon: BookOpen,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.create_course',
          path: '/create-course',
          icon: Plus,
          matchMode: 'section',
          tone: 'create',
        },
        {
          labelKey: 'nav.create_test',
          path: '/create-test',
          icon: ClipboardList,
          matchMode: 'section',
          tone: 'create',
        },
      ],
    },
    {
      title: 'ЖИ және емтихан',
      items: [
        {
          labelKey: 'nav.ai_question_builder',
          path: '/ai-question-builder',
          icon: Sparkles,
          matchMode: 'section',
          tone: 'ai',
        },
        {
          labelKey: 'nav.ai_exams',
          path: '/ai-exams',
          icon: Bot,
          matchMode: 'section',
          aliases: ['/ai-exams-open'],
          tone: 'ai',
        },
        {
          labelKey: 'nav.ai_assistant',
          path: '/ai-assistant',
          icon: BrainCircuit,
          matchMode: 'section',
          tone: 'ai',
        },
      ],
    },
    {
      title: 'Бақылау',
      items: [
        {
          labelKey: 'nav.students',
          path: '/students',
          icon: Users,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.analytics',
          path: '/analytics',
          icon: BarChart3,
          matchMode: 'section',
        },
      ],
    },
  ],

  parent: [
    {
      title: 'Негізгі',
      items: [
        {
          labelKey: 'nav.dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          matchMode: 'exact',
        },
        {
          labelKey: 'nav.profile',
          path: '/profile',
          icon: Settings,
          matchMode: 'exact',
        },
        chatNavItem,
      ],
    },
    {
      title: 'Бала бақылауы',
      items: [
        {
          labelKey: 'nav.children',
          path: '/children',
          icon: Users,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.child_progress',
          path: '/child-progress',
          icon: BarChart3,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.child_tests',
          path: '/child-tests',
          icon: ClipboardList,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.child_achievements',
          path: '/child-achievements',
          icon: Award,
          matchMode: 'section',
        },
      ],
    },
  ],

  admin: [
    {
      title: 'Негізгі',
      items: [
        {
          labelKey: 'nav.dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          matchMode: 'exact',
        },
        {
          labelKey: 'nav.profile',
          path: '/profile',
          icon: Settings,
          matchMode: 'exact',
        },
        chatNavItem,
      ],
    },
    {
      title: 'Контент',
      items: [
        {
          labelKey: 'nav.subjects',
          path: '/subjects',
          icon: GraduationCap,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.manage_lessons',
          path: '/manage-lessons',
          icon: FileText,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.manage_courses',
          path: '/manage-courses',
          icon: BookOpen,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.manage_tests',
          path: '/manage-tests',
          icon: ClipboardList,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.cms',
          path: '/cms',
          icon: FolderOpen,
          matchMode: 'section',
        },
      ],
    },
    {
      title: 'Басқару',
      items: [
        {
          labelKey: 'nav.moderation',
          path: '/moderation',
          icon: Eye,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.analytics',
          path: '/admin-analytics',
          icon: BarChart3,
          matchMode: 'section',
        },
        {
          labelKey: 'nav.users',
          path: '/manage-users',
          icon: Users,
          matchMode: 'section',
        },
      ],
    },
  ],
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_LABEL_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeUiLabel(value: unknown, limit = MAX_LABEL_CHARS): string {
  return cleanText(value, limit)
    .replace(/\bAI\b/g, 'ЖИ')
    .replace(/\bAi\b/g, 'ЖИ')
    .replace(/\bDashboard\b/g, 'Кабинет')
    .replace(/\bdashboard\b/g, 'кабинет')
    .trim();
}

function normalizeAvatarUrl(value: unknown): string | undefined {
  const url = cleanText(value, MAX_URL_CHARS);

  return url || undefined;
}

function getNavLabel(item: NavItemConfig) {
  const label = item.label || (item.labelKey ? t(item.labelKey) : '');

  return normalizeUiLabel(label);
}

function matchesPath(
  pathname: string,
  path: string,
  matchMode: NavItemConfig['matchMode'] = 'section',
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
    matchesPath(pathname, alias, item.matchMode),
  );
}

function getDisplayName(user?: {
  fullName?: string | null;
  email?: string | null;
} | null) {
  if (!user) return '';

  const fullName = cleanText(user.fullName, MAX_NAME_CHARS);
  const emailName = cleanText(user.email?.split('@')[0], MAX_NAME_CHARS);

  return fullName || emailName || 'Пайдаланушы';
}

function getDisplayEmail(email?: string | null) {
  return cleanText(email, MAX_EMAIL_CHARS) || '—';
}

function flattenGroups(groups: NavGroupConfig[]) {
  return groups.flatMap((group) => group.items);
}

function getIconToneClass(item: NavItemConfig, isActive: boolean) {
  if (isActive) {
    if (item.tone === 'ai') {
      return 'border-ai-border bg-ai-soft text-primary';
    }

    if (item.tone === 'create') {
      return 'border-accent-muted bg-accent-soft text-accent-foreground';
    }

    return 'border-primary-muted bg-card text-primary';
  }

  if (item.tone === 'ai') {
    return 'border-ai-border/60 bg-ai-soft/55 text-primary';
  }

  if (item.tone === 'create') {
    return 'border-accent-muted/60 bg-accent-soft/55 text-accent-foreground';
  }

  return 'border-transparent bg-card/40 text-muted-foreground group-hover:border-primary-muted group-hover:bg-card group-hover:text-primary';
}

function getThemeLabel(value: string) {
  if (value === 'light') return 'Жарық';
  if (value === 'dark') return 'Қараңғы';
  if (value === 'system') return 'Жүйе';

  return 'Жүйе';
}

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const items = [
    {
      value: 'light' as const,
      label: 'Жарық',
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: 'Қараңғы',
      icon: Moon,
    },
    {
      value: 'system' as const,
      label: 'Жүйе',
      icon: Monitor,
    },
  ];

  return (
    <div
      className="flex items-center rounded-2xl border border-border bg-card p-1"
      title={`Тақырып: ${getThemeLabel(theme)} · белсенді ${getThemeLabel(resolvedTheme)}`}
      aria-label="Тақырып ауыстыру"
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
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors',
              'hover:bg-primary-soft hover:text-primary',
              active && 'bg-primary-soft text-primary ring-1 ring-primary-muted',
            )}
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {normalizeUiLabel(group.title)}
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
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-border'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/75 hover:text-foreground',
            )}
          >
            {isActive ? (
              <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />
            ) : null}

            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors',
                getIconToneClass(item, isActive),
              )}
            >
              <Icon size={16} />
            </span>

            <span className="min-w-0 flex-1 truncate">{label}</span>

            {item.tone === 'ai' && !isActive ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
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
    if (!sidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;

    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    }

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
    [location.pathname, navItems],
  );

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const displayEmail = useMemo(() => getDisplayEmail(user?.email), [user?.email]);
  const avatarUrl = useMemo(() => normalizeAvatarUrl(user?.avatarUrl), [user?.avatarUrl]);

  const activeLabel = activeItem ? getNavLabel(activeItem) : normalizeUiLabel(t('nav.dashboard'));
  const ActiveIcon = activeItem?.icon;

  const handleLogout = async () => {
    setSidebarOpen(false);

    try {
      await logout();
    } catch {
      // Logout failure should not leave the user trapped in the layout.
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label={t('common.close')}
          aria-controls={SIDEBAR_ID}
        />
      ) : null}

      <aside
        id={SIDEBAR_ID}
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-sidebar-border bg-sidebar',
          'transition-transform duration-200 ease-soft',
          'lg:sticky lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link
            to="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex min-w-0 items-center gap-3 rounded-2xl"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <GraduationCap size={18} />
            </div>

            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">
                Bilimcorp
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:hidden"
            aria-label={t('common.close')}
            aria-controls={SIDEBAR_ID}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-3xl border border-sidebar-border bg-card/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                <ShieldCheck size={16} />
              </div>

              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Рөл
                </span>
                <span className="block truncate text-sm font-semibold">
                  {t(roleTitleKeys[user.role])}
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav
          className="flex-1 overflow-y-auto px-3 pb-3"
          aria-label="Навигация"
        >
          {navGroups.map((group) => (
            <SidebarSection
              key={group.title}
              group={group}
              pathname={location.pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-muted-foreground">
              Тақырып
            </span>
            <ThemeToggle />
          </div>

          <div className="flex items-center gap-2 rounded-3xl border border-sidebar-border bg-card/70 p-2">
            <Link
              to="/profile"
              onClick={() => setSidebarOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-primary-soft"
            >
              <UserAvatar
                name={displayName}
                avatarUrl={avatarUrl}
                className="h-9 w-9"
                fallbackClassName="bg-primary-soft text-xs font-semibold text-primary"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {displayEmail}
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
              title={t('nav.logout')}
              aria-label={t('nav.logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-2 mr-3 rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary lg:hidden"
            aria-label={t('common.open_menu')}
            aria-controls={SIDEBAR_ID}
            aria-expanded={sidebarOpen}
          >
            <Menu size={19} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {ActiveIcon ? (
                <ActiveIcon
                  size={15}
                  className="shrink-0 text-muted-foreground"
                />
              ) : null}
              <p className="truncate text-sm font-semibold">{activeLabel}</p>
            </div>
          </div>

          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 bg-background p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[1480px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}