import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth, type UserRole } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

type NavItemConfig = {
  label: string;
  path: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'section';
  aliases?: string[];
  tone?: 'default' | 'ai' | 'create';
  keywords?: string[];
};

type QuickAction = NavItemConfig & {
  actionLabel: string;
};

const SIDEBAR_ID = 'dashboard-sidebar';

const roleLabels: Record<UserRole, string> = {
  student: 'Оқушы',
  teacher: 'Мұғалім',
  parent: 'Ата-ана',
  admin: 'Әкімшілік',
};

const roleSubtitles: Record<UserRole, string> = {
  student: 'Оқу кабинеті',
  teacher: 'Мұғалім кабинеті',
  parent: 'Ата-ана бақылауы',
  admin: 'Басқару консолі',
};

const roleNavItems: Record<UserRole, NavItemConfig[]> = {
  student: [
    { label: 'Басты бет', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    { label: 'Курстарым', path: '/courses', icon: BookOpen, matchMode: 'section' },
    { label: 'Сабақтар', path: '/lessons', icon: FileText, matchMode: 'section' },
    { label: 'Тесттер', path: '/tests', icon: ClipboardList, matchMode: 'section' },
    { label: 'Нәтижелер', path: '/analytics', icon: BarChart3, matchMode: 'section' },
    { label: 'ЖИ көмекші', path: '/ai-tutor', icon: Bot, matchMode: 'section', aliases: ['/ai-practice', '/ai-tracker'], tone: 'ai' },
    { label: 'Қосымша', path: '/saved-lessons', icon: Sparkles, matchMode: 'section', aliases: ['/leaderboard', '/games', '/achievements'] },
  ],
  teacher: [
    { label: 'Басты бет', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    { label: 'Курстарым', path: '/my-courses', icon: BookOpen, matchMode: 'section' },
    { label: 'Курс құру', path: '/create-course', icon: Plus, matchMode: 'section', tone: 'create' },
    { label: 'Тесттер', path: '/create-test', icon: ClipboardList, matchMode: 'section' },
    { label: 'Оқушылар', path: '/students', icon: Users, matchMode: 'section' },
    { label: 'Аналитика', path: '/analytics', icon: BarChart3, matchMode: 'section' },
    { label: 'ЖИ құралдары', path: '/ai-question-builder', icon: Bot, matchMode: 'section', aliases: ['/ai-exams', '/ai-assistant'], tone: 'ai' },
  ],
  parent: [
    { label: 'Басты бет', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    { label: 'Балаларым', path: '/children', icon: Users, matchMode: 'section' },
    { label: 'Нәтижелер', path: '/child-progress', icon: BarChart3, matchMode: 'section' },
    { label: 'Хабарламалар', path: '/chat', icon: MessageCircle, matchMode: 'section' },
  ],
  admin: [
    { label: 'Басты бет', path: '/dashboard', icon: LayoutDashboard, matchMode: 'exact' },
    { label: 'Пайдаланушылар', path: '/manage-users', icon: Users, matchMode: 'section' },
    { label: 'Курстар', path: '/manage-courses', icon: BookOpen, matchMode: 'section' },
    { label: 'Өтінімдер', path: '/moderation', icon: ClipboardList, matchMode: 'section' },
    { label: 'Төлемдер/қолжетімділік', path: '/cms', icon: ShieldCheck, matchMode: 'section' },
    { label: 'Аналитика', path: '/admin-analytics', icon: BarChart3, matchMode: 'section' },
    { label: 'Баптаулар', path: '/subjects', icon: Settings, matchMode: 'section' },
  ],
};

const quickActions: Record<UserRole, QuickAction[]> = {
  student: [
    { label: 'Сабаққа өту', actionLabel: 'Сабаққа өту', path: '/lessons', icon: FileText, keywords: ['lesson', 'сабақ'] },
    { label: 'Тест тапсыру', actionLabel: 'Тесттерді ашу', path: '/tests', icon: ClipboardList, keywords: ['test', 'тест'] },
    { label: 'ЖИ көмекші', actionLabel: 'Көмек сұрау', path: '/ai-tutor', icon: Bot, tone: 'ai', keywords: ['ai', 'жи'] },
  ],
  teacher: [
    { label: 'Курс құру', actionLabel: 'Жаңа курс', path: '/create-course', icon: Plus, tone: 'create', keywords: ['course', 'курс'] },
    { label: 'Тест құру', actionLabel: 'Жаңа тест', path: '/create-test', icon: ClipboardList, keywords: ['test', 'тест'] },
    { label: 'Оқушыны табу', actionLabel: 'Оқушылар', path: '/students', icon: Users, keywords: ['student', 'оқушы'] },
    { label: 'ЖИ құралдары', actionLabel: 'ЖИ құралын ашу', path: '/ai-question-builder', icon: Bot, tone: 'ai', keywords: ['ai', 'жи'] },
  ],
  parent: [
    { label: 'Баланы көру', actionLabel: 'Балаларым', path: '/children', icon: Users, keywords: ['бала'] },
    { label: 'Нәтижені тексеру', actionLabel: 'Нәтижелер', path: '/child-progress', icon: BarChart3, keywords: ['progress', 'нәтиже'] },
  ],
  admin: [
    { label: 'Пайдаланушыны табу', actionLabel: 'Пайдаланушылар', path: '/manage-users', icon: Users, keywords: ['user', 'пайдаланушы'] },
    { label: 'Курстарды тексеру', actionLabel: 'Курстар', path: '/manage-courses', icon: BookOpen, keywords: ['course', 'курс'] },
    { label: 'Өтінімдерді қарау', actionLabel: 'Өтінімдер', path: '/moderation', icon: ClipboardList, keywords: ['review', 'өтінім'] },
  ],
};

function isPathActive(pathname: string, item: NavItemConfig) {
  const paths = [item.path, ...(item.aliases || [])];

  return paths.some((path) => {
    if (item.matchMode === 'exact') return pathname === path;
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

function getDisplayName(user: ReturnType<typeof useAuth>['user']) {
  if (!user) return 'Пайдаланушы';
  return user.fullName || user.email?.split('@')[0] || 'Пайдаланушы';
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Тақырыпты ауыстыру"
      className="h-9"
    >
      {isDark ? 'Күндізгі' : 'Түнгі'}
    </Button>
  );
}

function NavigationLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItemConfig;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium outline-none transition-all duration-200 ease-soft',
        'focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-primary-muted bg-primary-soft text-primary shadow-soft'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground hover:shadow-soft',
        collapsed && 'justify-center px-2'
      )}
      aria-current={active ? 'page' : undefined}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" /> : null}
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors',
          active
            ? 'border-primary-muted bg-card text-primary'
            : item.tone === 'ai'
              ? 'border-ai-border bg-ai-soft text-ai-foreground'
              : item.tone === 'create'
                ? 'border-success-muted bg-success-soft text-success-foreground'
                : 'border-border bg-surface-soft text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon size={16} />
      </span>
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && active ? <ChevronRight size={15} className="shrink-0" /> : null}
    </Link>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: QuickAction[];
}) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return items;

    return items.filter((item) => {
      const haystack = [item.label, item.actionLabel, ...(item.keywords || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl rounded-3xl border-border bg-card p-0 shadow-soft-lg">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>Жылдам іздеу</DialogTitle>
          <DialogDescription>
            Ctrl+K немесе Cmd+K арқылы курс, тест, сабақ және ЖИ құралдарына тез өтіңіз.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Мысалы: курс құру, тест, сабақ..."
              className="h-11 rounded-2xl pl-10"
            />
          </div>

          <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface-soft p-5 text-sm text-muted-foreground">
                Сәйкес әрекет табылмады.
              </div>
            ) : (
              filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.path}-${item.label}`}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    onClick={() => {
                      navigate(item.path);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.actionLabel}</span>
                    </span>
                    <ChevronRight size={15} className="text-muted-foreground" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const navItems = useMemo(() => (user ? roleNavItems[user.role] : []), [user]);
  const actions = useMemo(() => (user ? quickActions[user.role] : []), [user]);
  const activeItem = useMemo(
    () => navItems.find((item) => isPathActive(location.pathname, item)),
    [location.pathname, navItems]
  );
  const displayName = useMemo(() => getDisplayName(user), [user]);
  const ActiveIcon = activeItem?.icon;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommand = event.ctrlKey || event.metaKey;

      if (isCommand && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }

      if (event.key === 'Escape') {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-foreground dark:bg-background">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={actions} />

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Мәзірді жабу"
          aria-controls={SIDEBAR_ID}
        />
      ) : null}

      <aside
        id={SIDEBAR_ID}
        className={cn(
          'fixed left-0 top-0 z-50 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar/96 shadow-soft-lg backdrop-blur-xl transition-all duration-200 ease-soft lg:sticky lg:translate-x-0 lg:shadow-none',
          collapsed ? 'lg:w-20' : 'lg:w-72',
          'w-72',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap size={19} />
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight">Bilim Platform</span>
                <span className="block truncate text-[11px] text-muted-foreground">{roleSubtitles[user.role]}</span>
              </span>
            ) : null}
          </Link>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Мәзірді кеңейту' : 'Мәзірді ықшамдау'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Мәзірді жабу"
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="px-3 py-4">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-card/80 px-3 py-2 text-left text-sm text-muted-foreground shadow-soft transition-all hover:border-primary-muted hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              collapsed && 'lg:justify-center lg:px-2'
            )}
            aria-label="Жылдам іздеу"
          >
            <Search size={16} className="shrink-0" />
            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate">Жылдам іздеу</span>
            ) : null}
            {!collapsed ? (
              <span className="rounded-lg border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">Ctrl K</span>
            ) : null}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Бөлімдер">
          {navItems.map((item) => (
            <NavigationLink
              key={item.path}
              item={item}
              active={isPathActive(location.pathname, item)}
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          {!collapsed ? (
            <div className="mb-3 rounded-3xl border border-sidebar-border bg-card/80 p-3 shadow-soft">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={displayName}
                  avatarUrl={user.avatarUrl}
                  className="h-10 w-10"
                  fallbackClassName="bg-primary-soft text-xs font-semibold text-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{roleLabels[user.role]}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className={cn('flex gap-2', collapsed && 'lg:flex-col')}>
            <ThemeToggle />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              aria-label="Шығу"
              className={cn('flex-1', collapsed && 'lg:w-full lg:px-0')}
            >
              <LogOut size={15} />
              {!collapsed ? <span>Шығу</span> : null}
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/88 px-4 backdrop-blur-xl lg:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Мәзірді ашу"
            aria-controls={SIDEBAR_ID}
            aria-expanded={sidebarOpen}
          >
            <Menu size={19} />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {ActiveIcon ? <ActiveIcon size={16} className="shrink-0 text-muted-foreground" /> : null}
              <p className="truncate text-sm font-semibold">{activeItem?.label || 'Басты бет'}</p>
            </div>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{roleSubtitles[user.role]}</p>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => setPaletteOpen(true)}>
            <Search size={15} />
            <span className="hidden sm:inline">Іздеу</span>
          </Button>
        </header>

        <main className="flex-1 bg-[#F8FAFC] p-4 dark:bg-background lg:p-6">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
