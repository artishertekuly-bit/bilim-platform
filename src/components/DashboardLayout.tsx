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
  type LucideIcon,
} from 'lucide-react';

import { useAuth, type UserRole } from '@/lib/auth-context';
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

const roleNavItems: Record<UserRole, NavItemConfig[]> = {
  student: [
    { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
    { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    chatNavItem,
    { labelKey: 'nav.courses', path: '/courses', icon: BookOpen, matchMode: 'section' },
    { labelKey: 'nav.lessons', path: '/lessons', icon: FileText, matchMode: 'section' },
    {
      label: 'Сақталған сабақтар',
      path: '/saved-lessons',
      icon: Bookmark,
      matchMode: 'section',
    },
    { labelKey: 'nav.tests', path: '/tests', icon: ClipboardList, matchMode: 'section' },
    { labelKey: 'nav.ai_practice', path: '/ai-practice', icon: Sparkles, matchMode: 'section' },
    { labelKey: 'nav.ai_tutor', path: '/ai-tutor', icon: Bot, matchMode: 'section' },
    { labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, matchMode: 'section' },
    { labelKey: 'nav.gamification', path: '/games', icon: Gamepad2, matchMode: 'section' },
    { labelKey: 'nav.leaderboard', path: '/leaderboard', icon: Trophy, matchMode: 'section' },
    { labelKey: 'nav.achievements', path: '/achievements', icon: Award, matchMode: 'section' },
  ],
  teacher: [
    { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
    { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    chatNavItem,
    { labelKey: 'nav.my_courses', path: '/my-courses', icon: BookOpen, matchMode: 'section' },
    { labelKey: 'nav.create_course', path: '/create-course', icon: Plus, matchMode: 'section' },
    { labelKey: 'nav.create_test', path: '/create-test', icon: ClipboardList, matchMode: 'section' },
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
    { labelKey: 'nav.students', path: '/students', icon: Users, matchMode: 'section' },
    { labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, matchMode: 'section' },
  ],
  parent: [
    { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
    { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    chatNavItem,
    { labelKey: 'nav.children', path: '/children', icon: Users, matchMode: 'section' },
    { labelKey: 'nav.child_progress', path: '/child-progress', icon: BarChart3, matchMode: 'section' },
    { labelKey: 'nav.child_tests', path: '/child-tests', icon: ClipboardList, matchMode: 'section' },
    { labelKey: 'nav.child_achievements', path: '/child-achievements', icon: Award, matchMode: 'section' },
  ],
  admin: [
    { labelKey: 'nav.profile', path: '/profile', icon: Settings, matchMode: 'exact' },
    { labelKey: 'nav.dashboard', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    chatNavItem,
    { labelKey: 'nav.subjects', path: '/subjects', icon: GraduationCap, matchMode: 'section' },
    { labelKey: 'nav.manage_lessons', path: '/manage-lessons', icon: FileText, matchMode: 'section' },
    { labelKey: 'nav.manage_courses', path: '/manage-courses', icon: BookOpen, matchMode: 'section' },
    { labelKey: 'nav.moderation', path: '/moderation', icon: Eye, matchMode: 'section' },
    { labelKey: 'nav.manage_tests', path: '/manage-tests', icon: ClipboardList, matchMode: 'section' },
    { labelKey: 'nav.cms', path: '/cms', icon: FolderOpen, matchMode: 'section' },
    { labelKey: 'nav.analytics', path: '/admin-analytics', icon: BarChart3, matchMode: 'section' },
    { labelKey: 'nav.users', path: '/manage-users', icon: Users, matchMode: 'section' },
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

  const navItems = useMemo(() => {
    if (!user) return [];
    return roleNavItems[user.role] || [];
  }, [user]);

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
    <div className="flex min-h-screen bg-background">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`
          fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar
          transition-transform duration-200 lg:sticky
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <GraduationCap size={16} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Bilimcorp</span>
          </Link>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 hover:bg-sidebar-accent lg:hidden"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t(roleTitleKeys[user.role])}
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isPathActive(location.pathname, item);
            const label = getNavLabel(item);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
                  ${
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/60'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{label}</span>
                {isActive ? (
                  <ChevronRight size={14} className="ml-auto text-muted-foreground" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex justify-center px-5 py-2">
          <KazakhOrnament variant="divider" />
        </div>

        <div className="border-t border-sidebar-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <UserAvatar
                name={displayName}
                avatarUrl={user.avatarUrl}
                className="h-8 w-8"
                fallbackClassName="bg-accent text-xs font-medium"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded p-1.5 hover:bg-accent"
              title={t('nav.logout')}
              aria-label={t('nav.logout')}
            >
              <LogOut size={15} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-2 mr-3 rounded p-2 hover:bg-accent lg:hidden"
            aria-label={t('common.open_menu')}
          >
            <Menu size={18} />
          </button>

          <h1 className="text-sm font-medium">
            {activeItem ? getNavLabel(activeItem) : t('nav.dashboard')}
          </h1>
        </header>

        <main className="kazakh-ornament-bg flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}