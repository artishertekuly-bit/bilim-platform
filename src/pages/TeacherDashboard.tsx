import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  FilePlus2,
  LayoutGrid,
  ListChecks,
  Mic,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const MAX_NAME_CHARS = 180;

function cleanText(value: unknown, limit = MAX_NAME_CHARS): string {
  return limitText(
    removeNullCharacters(String(value ?? ''))
      .replace(/\s+/g, ' ')
      .trim(),
    limit,
  );
}

function getFirstName(value: unknown): string {
  const fullName = cleanText(value);
  return fullName.split(' ')[0] || 'Автор';
}

type AuthorAction = {
  eyebrow: string;
  title: string;
  description: string;
  path: string;
  icon: typeof BookOpen;
  featured?: boolean;
  wide?: boolean;
};

const AUTHOR_ACTIONS: AuthorAction[] = [
  {
    eyebrow: 'Жаңа жоба',
    title: 'Курс құру',
    description: 'Жаңа оқу курсын бастау',
    path: '/create-course',
    icon: Plus,
    featured: true,
    wide: true,
  },
  {
    eyebrow: 'Курстар',
    title: 'Курстарымды ашу',
    description: 'Авторлық курстарды басқару',
    path: '/my-courses',
    icon: BookOpen,
  },
  {
    eyebrow: 'Дауыс AI',
    title: 'Дауыстық көмекші',
    description: 'Groq Whisper және сөйлесу',
    path: '/ai-voice',
    icon: Mic,
  },
  {
    eyebrow: 'Sana AI',
    title: 'Автор көмекшісі',
    description: 'Сабақ жоспары мен құрылымы',
    path: '/ai-assistant',
    icon: Bot,
  },
  {
    eyebrow: 'Бағалау',
    title: 'Сұрақ генераторы',
    description: 'Сұрақтар мен нұсқалар құрастыру',
    path: '/ai-question-builder',
    icon: ListChecks,
  },
  {
    eyebrow: 'Тест',
    title: 'Жаңа тест',
    description: 'Тест тапсырмаларын дайындау',
    path: '/create-test',
    icon: ClipboardCheck,
  },
  {
    eyebrow: 'Аудитория',
    title: 'Оқушылар',
    description: 'Оқушылар мен нәтижелер',
    path: '/students',
    icon: Users,
  },
];

function AuthorActionCard({
  action,
}: {
  action: AuthorAction;
}) {
  const Icon = action.icon;

  return (
    <Link
      to={action.path}
      className={cn(
        'group relative flex min-h-40 flex-col overflow-hidden rounded-2xl p-5 shadow-xs',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        action.featured
          ? 'bg-foreground text-background'
          : 'bg-card text-foreground hover:bg-card/90',
        action.wide && 'md:col-span-2',
      )}
    >
      <div className="relative flex items-start justify-between gap-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            action.featured
              ? 'bg-background/15 text-background'
              : 'bg-muted/60 text-foreground',
          )}
        >
          <Icon size={18} />
        </span>

        <ArrowRight
          size={16}
          className={cn(
            'transition-transform duration-200 group-hover:translate-x-1',
            action.featured ? 'text-background/60' : 'text-muted-foreground',
          )}
        />
      </div>

      <div className="relative mt-auto pt-6">
        <p
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wider',
            action.featured ? 'text-background/50' : 'text-muted-foreground',
          )}
        >
          {action.eyebrow}
        </p>

        <h2
          className={cn(
            'mt-1 text-xl font-bold tracking-tight',
            action.featured ? 'text-background' : 'text-foreground',
          )}
        >
          {action.title}
        </h2>

        <p
          className={cn(
            'mt-1 text-xs leading-5',
            action.featured ? 'text-background/70' : 'text-muted-foreground',
          )}
        >
          {action.description}
        </p>
      </div>
    </Link>
  );
}

function CompactLink({
  title,
  description,
  path,
  icon: Icon,
}: {
  title: string;
  description: string;
  path: string;
  icon: typeof BookOpen;
}) {
  return (
    <Link
      to={path}
      className={cn(
        'group flex items-center gap-3.5 rounded-2xl bg-card p-4 shadow-xs',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground">
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>

      <ArrowRight
        size={15}
        className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1"
      />
    </Link>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const firstName = getFirstName(user?.fullName);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-card px-5 py-6 shadow-xs sm:px-7 sm:py-8">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted/70 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Автор кеңістігі
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Сәлем, {firstName}
              </h1>

              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                Курстар, бағалау тесттері және оқушылар үлгерімі.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                asChild
              >
                <Link to="/my-courses">
                  <LayoutGrid size={14} className="mr-1.5" />
                  Курстарым
                </Link>
              </Button>

              <Button type="button" size="sm" className="rounded-xl" asChild>
                <Link to="/create-course">
                  <FilePlus2 size={14} className="mr-1.5" />
                  Жаңа курс
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-foreground">
            Құралдар
          </h2>

          <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
            {AUTHOR_ACTIONS.map((action) => (
              <AuthorActionCard key={action.path} action={action} />
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <CompactLink
            title="Аналитика"
            description="Курстар мен оқушылар нәтижелері"
            path="/analytics"
            icon={BarChart3}
          />

          <CompactLink
            title="Профиль"
            description="Аккаунт баптаулары"
            path="/profile"
            icon={UserRound}
          />
        </section>
      </div>
    </DashboardLayout>
  );
}
