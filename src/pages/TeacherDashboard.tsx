import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  LayoutGrid,
  ListChecks,
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
    description:
      'Идеяны курсқа айналдырып, модульдер мен сабақтардың құрылымын бастаңыз.',
    path: '/create-course',
    icon: Plus,
    featured: true,
    wide: true,
  },
  {
    eyebrow: 'Жұмыс кеңістігі',
    title: 'Курстарымды ашу',
    description:
      'Бұрын басталған курстарды өңдеңіз және мазмұнды жалғастырыңыз.',
    path: '/my-courses',
    icon: BookOpen,
  },
  {
    eyebrow: 'Sana ЖИ',
    title: 'Автор көмекшісі',
    description:
      'Сабақ жоспарын, мәтін құрылымын және жаңа идеяларды бірге дайындаңыз.',
    path: '/ai-assistant',
    icon: Bot,
  },
  {
    eyebrow: 'Бағалау',
    title: 'Сұрақ генераторы',
    description:
      'Тақырып бойынша сұрақтар мен жауап нұсқаларын жылдам құрастырыңыз.',
    path: '/ai-question-builder',
    icon: ListChecks,
  },
  {
    eyebrow: 'Тест',
    title: 'Жаңа тест',
    description:
      'Оқушы білімін тексеруге арналған тест пен тапсырмаларды дайындаңыз.',
    path: '/create-test',
    icon: ClipboardCheck,
  },
  {
    eyebrow: 'Аудитория',
    title: 'Оқушылар',
    description:
      'Курстардағы оқушыларды және олардың оқу қозғалысын қараңыз.',
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
        'group relative flex min-h-52 flex-col overflow-hidden rounded-[2rem] border p-5',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-1 hover:shadow-soft-lg active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        action.featured
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:border-foreground/25',
        action.wide && 'md:col-span-2',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full blur-3xl',
          action.featured ? 'bg-background/15' : 'bg-foreground/[0.045]',
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border',
            action.featured
              ? 'border-background/20 bg-background/10'
              : 'border-border bg-background',
          )}
        >
          <Icon size={19} />
        </span>

        <ArrowRight
          size={17}
          className={cn(
            'mt-1 shrink-0 transition-transform duration-200 group-hover:translate-x-1',
            action.featured
              ? 'text-background/60'
              : 'text-muted-foreground',
          )}
        />
      </div>

      <div className="relative mt-auto pt-10">
        <p
          className={cn(
            'text-[10px] font-semibold uppercase tracking-[0.18em]',
            action.featured
              ? 'text-background/45'
              : 'text-muted-foreground',
          )}
        >
          {action.eyebrow}
        </p>

        <h2
          className={cn(
            'mt-2 text-2xl font-black tracking-[-0.04em]',
            action.featured ? 'text-background' : 'text-foreground',
          )}
        >
          {action.title}
        </h2>

        <p
          className={cn(
            'mt-3 max-w-xl text-sm leading-6',
            action.featured
              ? 'text-background/60'
              : 'text-muted-foreground',
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
        'group flex items-center gap-4 rounded-[1.5rem] border border-border bg-card p-4',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-soft-md',
        'active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
        <section className="relative overflow-hidden rounded-[2.5rem] border border-border bg-card px-5 py-7 shadow-soft sm:px-8 sm:py-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-foreground/[0.045] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-14 top-8 h-24 w-24 rounded-full border border-foreground/[0.07]"
          />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                  <Sparkles size={12} />
                  Sana автор кеңістігі
                </span>

                <span className="rounded-full border border-border bg-muted/45 px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                  Автор
                </span>
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                Сәлем, {firstName}.
                <span className="block text-muted-foreground">
                  Идеядан курсқа дейін.
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Курсты құрыңыз, материалды дайындаңыз және оқушымен жұмысты
                бір кеңістіктен басқарыңыз.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                asChild
              >
                <Link to="/my-courses">
                  <LayoutGrid size={15} className="mr-2" />
                  Курстарым
                </Link>
              </Button>

              <Button type="button" className="rounded-full" asChild>
                <Link to="/create-course">
                  <FilePlus2 size={15} className="mr-2" />
                  Жаңа курс
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Автор құралдары
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">
              Қай жерден жалғастырамыз?
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AUTHOR_ACTIONS.map((action) => (
              <AuthorActionCard key={action.path} action={action} />
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <CompactLink
            title="Аналитика"
            description="Курстар мен оқушылардың жалпы көрінісі"
            path="/analytics"
            icon={BarChart3}
          />

          <CompactLink
            title="Профиль"
            description="Авторлық бейнеңіз бен аккаунт баптаулары"
            path="/profile"
            icon={UserRound}
          />
        </section>

        <section className="relative overflow-hidden rounded-[2rem] border border-border bg-muted/40 p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border border-foreground/10"
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                <GraduationCap size={17} />
              </span>

              <div>
                <p className="text-sm font-bold">Sana автор платформасы</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                  Бұл бетте тек авторға қажет негізгі құралдар қалдырылды.
                </p>
              </div>
            </div>

            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/my-courses">
                Жұмысты ашу
                <ArrowRight size={14} className="ml-2" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
