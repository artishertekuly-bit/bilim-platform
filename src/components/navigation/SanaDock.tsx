import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  FileText,
  Home,
  Plus,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

import { cn, limitText, removeNullCharacters } from '@/lib/utils';

export type SanaDockMode = 'auto' | 'main' | 'course';

export type SanaDockMainPaths = {
  home: string;
  courses: string;
  create: string;
  ai: string;
  profile: string;
};

export type SanaDockCoursePaths = {
  back: string;
  overview: string;
  lessons: string;
  tests: string;
  progress: string;
};

export type SanaDockProps = {
  /**
   * auto: course dock is used on /courses/:courseId and /lessons/:lessonId.
   * main: always show the four primary Sana sections.
   * course: always show course navigation.
   */
  mode?: SanaDockMode;
  /**
   * Pass true for the author account to show the central create button.
   */
  showCreate?: boolean;
  /**
   * Optional course id. When omitted, the dock remembers the latest opened course.
   */
  courseId?: string | null;
  /**
   * Course completion from 0 to 100. Displayed as a thin line above the course dock.
   */
  progress?: number | null;
  /**
   * Override routes without changing this component.
   */
  mainPaths?: Partial<SanaDockMainPaths>;
  coursePaths?: Partial<SanaDockCoursePaths>;
  /**
   * fixed is suitable for the application shell; static is useful for previews.
   */
  position?: 'fixed' | 'static';
  className?: string;
  onNavigate?: () => void;
};

type DockItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  aliases?: string[];
  active?: boolean;
  emphasis?: boolean;
};

const ACTIVE_COURSE_STORAGE_KEY = 'sana.activeCourseId';
const MAX_ID_CHARS = 180;
const MAX_PATH_CHARS = 2_000;
const MAX_LABEL_CHARS = 80;

const DEFAULT_MAIN_PATHS: SanaDockMainPaths = {
  home: '/dashboard',
  courses: '/courses',
  create: '/create-course',
  ai: '/ai-tutor',
  profile: '/profile',
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit: number): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanPath(value: unknown, fallback: string): string {
  const path = cleanText(value, MAX_PATH_CHARS);

  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return fallback;
  }

  return path;
}

function cleanCourseId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS).replace(/[/?#]/g, '');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractCourseId(pathname: string): string {
  const match = pathname.match(/^\/courses\/([^/?#]+)/);

  if (!match?.[1]) {
    return '';
  }

  return cleanCourseId(safeDecode(match[1]));
}

function readRememberedCourseId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return cleanCourseId(window.sessionStorage.getItem(ACTIVE_COURSE_STORAGE_KEY));
  } catch {
    return '';
  }
}

function rememberCourseId(courseId: string) {
  if (!courseId || typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(ACTIVE_COURSE_STORAGE_KEY, courseId);
  } catch {
    // Storage failure must not affect navigation.
  }
}

function normalizeProgress(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function isSectionActive(pathname: string, path: string, exact = false): boolean {
  const basePath = path.split(/[?#]/)[0] || '/';

  if (exact) {
    return pathname === basePath;
  }

  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function isItemActive(pathname: string, item: DockItem): boolean {
  if (typeof item.active === 'boolean') {
    return item.active;
  }

  if (isSectionActive(pathname, item.path, item.exact)) {
    return true;
  }

  return (item.aliases || []).some((alias) =>
    isSectionActive(pathname, alias, false),
  );
}

function buildCoursePaths(
  courseId: string,
  overrides?: Partial<SanaDockCoursePaths>,
): SanaDockCoursePaths {
  const encodedCourseId = courseId ? encodeURIComponent(courseId) : '';
  const overviewFallback = encodedCourseId
    ? `/courses/${encodedCourseId}`
    : '/courses';

  const defaults: SanaDockCoursePaths = {
    back: '/courses',
    overview: overviewFallback,
    lessons: encodedCourseId ? `${overviewFallback}#lessons` : '/lessons',
    tests: encodedCourseId
      ? `/tests?courseId=${encodedCourseId}`
      : '/tests',
    progress: encodedCourseId
      ? `/analytics?courseId=${encodedCourseId}`
      : '/analytics',
  };

  return {
    back: cleanPath(overrides?.back, defaults.back),
    overview: cleanPath(overrides?.overview, defaults.overview),
    lessons: cleanPath(overrides?.lessons, defaults.lessons),
    tests: cleanPath(overrides?.tests, defaults.tests),
    progress: cleanPath(overrides?.progress, defaults.progress),
  };
}

function DockLink({
  item,
  active,
  onNavigate,
}: {
  item: DockItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const label = cleanText(item.label, MAX_LABEL_CHARS);

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cn(
        'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border outline-none',
        'transition-[transform,background-color,color,border-color,box-shadow] duration-200 ease-out',
        'hover:-translate-y-1 hover:scale-110 focus-visible:-translate-y-1 focus-visible:scale-110',
        'focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        'motion-reduce:transform-none motion-reduce:transition-none sm:h-12 sm:w-12',
        active
          ? 'border-black bg-black text-white shadow-lg dark:border-white dark:bg-white dark:text-black'
          : item.emphasis
            ? 'border-black bg-black text-white shadow-md hover:shadow-lg dark:border-white dark:bg-white dark:text-black'
            : 'border-black/10 bg-white/90 text-black shadow-sm hover:border-black/20 hover:bg-white hover:shadow-md dark:border-white/15 dark:bg-black/85 dark:text-white dark:hover:border-white/30 dark:hover:bg-black',
      )}
    >
      <Icon
        size={19}
        strokeWidth={active || item.emphasis ? 2.25 : 2}
        aria-hidden="true"
      />

      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-10 left-1/2 z-20 -translate-x-1/2 translate-y-1',
          'whitespace-nowrap rounded-full bg-black px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg',
          'opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100',
          'group-focus-visible:translate-y-0 group-focus-visible:opacity-100',
          'dark:bg-white dark:text-black',
        )}
      >
        {label}
      </span>

      {active ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-black dark:bg-white"
        />
      ) : null}
    </Link>
  );
}

export default function SanaDock({
  mode = 'auto',
  showCreate = false,
  courseId,
  progress,
  mainPaths,
  coursePaths,
  position = 'fixed',
  className,
  onNavigate,
}: SanaDockProps) {
  const location = useLocation();

  const pathCourseId = useMemo(
    () => extractCourseId(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    if (pathCourseId) {
      rememberCourseId(pathCourseId);
    }
  }, [pathCourseId]);

  const resolvedCourseId =
    cleanCourseId(courseId) ||
    pathCourseId ||
    readRememberedCourseId();

  const isCourseLocation =
    /^\/courses\/[^/]+/.test(location.pathname) ||
    /^\/lessons\/[^/]+/.test(location.pathname);

  const resolvedMode: Exclude<SanaDockMode, 'auto'> =
    mode === 'auto' ? (isCourseLocation ? 'course' : 'main') : mode;

  const resolvedMainPaths: SanaDockMainPaths = {
    home: cleanPath(mainPaths?.home, DEFAULT_MAIN_PATHS.home),
    courses: cleanPath(mainPaths?.courses, DEFAULT_MAIN_PATHS.courses),
    create: cleanPath(mainPaths?.create, DEFAULT_MAIN_PATHS.create),
    ai: cleanPath(mainPaths?.ai, DEFAULT_MAIN_PATHS.ai),
    profile: cleanPath(mainPaths?.profile, DEFAULT_MAIN_PATHS.profile),
  };

  const resolvedCoursePaths = buildCoursePaths(
    resolvedCourseId,
    coursePaths,
  );

  const mainItems: DockItem[] = [
    {
      key: 'home',
      label: 'Басты бет',
      path: resolvedMainPaths.home,
      icon: Home,
      exact: true,
    },
    {
      key: 'courses',
      label: 'Курстар',
      path: resolvedMainPaths.courses,
      icon: BookOpen,
      aliases: ['/saved-lessons'],
    },
    ...(showCreate
      ? [
          {
            key: 'create',
            label: 'Жаңа курс',
            path: resolvedMainPaths.create,
            icon: Plus,
            aliases: ['/create-test'],
            emphasis: true,
          } satisfies DockItem,
        ]
      : []),
    {
      key: 'ai',
      label: 'ЖИ',
      path: resolvedMainPaths.ai,
      icon: Bot,
      aliases: [
        '/ai-practice',
        '/ai-tutor',
        '/ai-tracker',
        '/ai-assistant',
        '/ai-question-builder',
        '/ai-exams',
        '/ai-exams-open',
        '/ai-exam',
      ],
    },
    {
      key: 'profile',
      label: 'Профиль',
      path: resolvedMainPaths.profile,
      icon: UserRound,
      exact: true,
    },
  ];

  const courseItems: DockItem[] = [
    {
      key: 'back',
      label: 'Курстарға қайту',
      path: resolvedCoursePaths.back,
      icon: ArrowLeft,
      active: false,
    },
    {
      key: 'overview',
      label: 'Курс',
      path: resolvedCoursePaths.overview,
      icon: BookOpen,
      active: /^\/courses\/[^/]+/.test(location.pathname),
    },
    {
      key: 'lessons',
      label: 'Сабақтар',
      path: resolvedCoursePaths.lessons,
      icon: FileText,
      active:
        /^\/lessons\/[^/]+/.test(location.pathname) ||
        location.hash === '#lessons',
    },
    {
      key: 'tests',
      label: 'Тест',
      path: resolvedCoursePaths.tests,
      icon: ClipboardList,
      active:
        location.pathname === '/tests' ||
        location.hash === '#tests',
    },
    {
      key: 'progress',
      label: 'Прогресс',
      path: resolvedCoursePaths.progress,
      icon: BarChart3,
      active:
        location.pathname === '/analytics' ||
        location.hash === '#progress',
    },
  ];

  const items = resolvedMode === 'course' ? courseItems : mainItems;
  const normalizedProgress = normalizeProgress(progress);

  const wrapperClassName =
    position === 'fixed'
      ? 'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3'
      : 'flex w-full justify-center px-3';

  const wrapperStyle: CSSProperties | undefined =
    position === 'fixed'
      ? {
          bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }
      : undefined;

  return (
    <div
      className={cn(wrapperClassName, className)}
      style={wrapperStyle}
      data-sana-dock-mode={resolvedMode}
    >
      <nav
        aria-label={
          resolvedMode === 'course'
            ? 'Курс навигациясы'
            : 'Негізгі навигация'
        }
        className={cn(
          'pointer-events-auto relative max-w-full rounded-full border border-black/10 bg-white/80 p-1.5',
          'shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl',
          'dark:border-white/15 dark:bg-black/75 dark:shadow-[0_16px_48px_rgba(0,0,0,0.5)]',
        )}
      >
        {resolvedMode === 'course' && normalizedProgress !== null ? (
          <div
            className="absolute inset-x-5 top-0 h-px overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
            aria-label={`Курс прогресі: ${normalizedProgress}%`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={normalizedProgress}
          >
            <div
              className="h-full rounded-full bg-black transition-[width] duration-500 ease-out dark:bg-white"
              style={{ width: `${normalizedProgress}%` }}
            />
          </div>
        ) : null}

        <div
          key={resolvedMode}
          className="flex items-center gap-1 animate-scale-in sm:gap-1.5"
        >
          {items.map((item) => (
            <DockLink
              key={item.key}
              item={item}
              active={isItemActive(location.pathname, item)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
