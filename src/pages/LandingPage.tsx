import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle,
  ClipboardList,
  Gamepad2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import t from '@/lib/i18n';

type FeatureItem = {
  icon: LucideIcon;
  title: string;
  desc: string;
  tone: 'primary' | 'secondary' | 'accent' | 'ai';
};

type AudienceItem = {
  title: string;
  points: string[];
  icon: LucideIcon;
};

function getToneClassName(tone: FeatureItem['tone']) {
  const map: Record<FeatureItem['tone'], string> = {
    primary: 'border-primary-muted bg-primary-soft text-primary',
    secondary: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
    accent: 'border-accent-muted bg-accent-soft text-accent-foreground',
    ai: 'border-ai-border bg-ai-soft text-primary',
  };

  return map[tone];
}

function LandingStatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card/85 p-5 text-center shadow-soft backdrop-blur">
      <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{label}</p>
    </div>
  );
}

function FeatureCard({ feature }: { feature: FeatureItem }) {
  const Icon = feature.icon;

  return (
    <Card interactive className="h-full overflow-hidden">
      <CardContent className="p-5">
        <div
          className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border shadow-inner-soft ${getToneClassName(
            feature.tone
          )}`}
        >
          <Icon size={20} />
        </div>

        <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>

        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {feature.desc}
        </p>
      </CardContent>
    </Card>
  );
}

function AudienceCard({ audience }: { audience: AudienceItem }) {
  const Icon = audience.icon;

  return (
    <Card interactive className="h-full overflow-hidden">
      <CardContent className="p-6">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
          <Icon size={20} />
        </div>

        <h3 className="text-base font-semibold text-foreground">{audience.title}</h3>

        <ul className="mt-4 space-y-3">
          {audience.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"
            >
              <CheckCircle
                size={14}
                className="mt-0.5 shrink-0 text-success-foreground"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function LandingPage() {
  const features: FeatureItem[] = [
    {
      icon: BookOpen,
      title: t('landing.feature_courses'),
      desc: t('landing.feature_courses_desc'),
      tone: 'primary',
    },
    {
      icon: ClipboardList,
      title: t('landing.feature_tests'),
      desc: t('landing.feature_tests_desc'),
      tone: 'secondary',
    },
    {
      icon: BarChart3,
      title: t('landing.feature_analytics'),
      desc: t('landing.feature_analytics_desc'),
      tone: 'accent',
    },
    {
      icon: Gamepad2,
      title: t('landing.feature_games'),
      desc: t('landing.feature_games_desc'),
      tone: 'ai',
    },
  ];

  const stats = [
    { value: '10,000+', label: t('landing.stats_students') },
    { value: '500+', label: t('landing.stats_courses') },
    { value: '25,000+', label: t('landing.stats_tests') },
    { value: '10', label: t('landing.stats_subjects') },
  ];

  const audiences: AudienceItem[] = [
    {
      title: t('landing.for_students'),
      points: [
        t('landing.audience.students.point_1'),
        t('landing.audience.students.point_2'),
        t('landing.audience.students.point_3'),
      ],
      icon: GraduationCap,
    },
    {
      title: 'AI және дыбыстық көмекші',
      points: [
        'AI Тьютор және AI Практика арқылы тақырыпты терең меңгеру',
        'AI Емтихандар мен AI Оқу ізі арқылы білім деңгейін талдау',
        'Sana аудио көмекшісі арқылы дауыспен сұхбаттасу',
      ],
      icon: Sparkles,
    },
    {
      title: 'Автор және Админ кеңістігі',
      points: [
        'Курс, модуль, сабақ және тесттерді толық құрастыру',
        'AI Автор көмекшісі және AI Сұрақ генераторы',
        'Платформа аналитикасы мен оқушылар прогресін бақылау',
      ],
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/82 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-2xl transition-all duration-200 ease-soft hover:-translate-y-0.5"
          >
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap size={18} />
              <span className="absolute inset-x-2 bottom-1 h-px bg-primary-foreground/30" />
            </div>

            <div>
              <span className="block text-sm font-semibold tracking-tight">
                Sana
              </span>
              <span className="block text-[10px] font-medium text-muted-foreground">
                Soft Academic LMS
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">{t('nav.login')}</Link>
            </Button>

            <Button size="sm" asChild>
              <Link to="/register">{t('nav.register')}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="kazakh-ornament-bg relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
            <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-secondary-soft blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-accent-soft blur-3xl" />
          </div>

          <div className="absolute left-6 top-8 hidden text-primary/60 lg:block">
            <KazakhOrnament variant="corner" />
          </div>

          <div className="absolute bottom-8 right-6 hidden rotate-180 text-primary/60 lg:block">
            <KazakhOrnament variant="corner" />
          </div>

          <div className="container relative mx-auto px-4 py-24 text-center lg:py-32">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ai-border bg-ai-soft px-3 py-1.5 text-xs font-semibold text-primary shadow-soft">
              <Sparkles size={13} />
              {t('landing.platform_badge')}
            </div>

            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.12] tracking-tight text-foreground lg:text-6xl">
              {t('landing.hero_title')}
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground lg:text-base">
              {t('landing.hero_subtitle')}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/register">
                  {t('landing.start_learning')}
                  <ArrowRight size={16} className="ml-2" />
                </Link>
              </Button>

              <Button variant="outline" size="lg" asChild>
                <Link to="/about">{t('landing.learn_more')}</Link>
              </Button>
            </div>

            <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-border bg-card/80 p-4 shadow-soft backdrop-blur">
              <div className="grid gap-3 text-left sm:grid-cols-3">
                {[
                  'AI Тьютор және Практика',
                  'Курс және сабақ roadmap',
                  'Sana аудио көмекшісі',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2 text-xs font-medium text-muted-foreground shadow-inner-soft"
                  >
                    <CheckCircle
                      size={14}
                      className="shrink-0 text-success-foreground"
                    />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface-soft/60">
          <div className="container mx-auto px-4 py-10">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((stat) => (
                <LandingStatCard
                  key={stat.label}
                  value={stat.value}
                  label={stat.label}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary-muted bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <BookOpen size={13} />
              Platform features
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
              {t('landing.features_title')}
            </h2>

            <KazakhOrnament variant="divider" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-surface-soft/60 py-20">
          <div className="container mx-auto px-4">
            <div className="mb-10 text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-secondary-muted bg-secondary-soft px-3 py-1 text-xs font-semibold text-secondary-foreground">
                <Users size={13} />
                Role-based workspace
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
                Оқушы мен AI мүмкіндіктеріне арналған бірыңғай кеңістік
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {audiences.map((audience) => (
                <AudienceCard key={audience.title} audience={audience} />
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20">
          <div className="ai-soft-panel mx-auto max-w-4xl p-8 text-center lg:p-10">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-3xl border border-ai-border bg-card/80 text-primary shadow-inner-soft">
              <Sparkles size={24} />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
              {t('landing.cta_title')}
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              {t('landing.cta_subtitle')}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/register">
                  {t('landing.start_learning')}
                  <ArrowRight size={16} className="ml-2" />
                </Link>
              </Button>

              <Button variant="outline" size="lg" asChild>
                <Link to="/login">{t('nav.login')}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/50 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap size={14} />
            </div>

            <div>
              <span className="block text-xs font-semibold">Sana</span>
              <span className="block text-[10px] text-muted-foreground">
                Soft Academic LMS
              </span>
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground sm:text-right">
            {t('landing.footer_copy')}
          </p>
        </div>
      </footer>
    </div>
  );
}