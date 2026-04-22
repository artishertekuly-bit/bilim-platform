import { Link } from 'react-router-dom';
import t from '@/lib/i18n';
import KazakhOrnament from '@/components/KazakhOrnament';
import {
  GraduationCap,
  BookOpen,
  ClipboardList,
  BarChart3,
  Gamepad2,
  ArrowRight,
  Users,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const features = [
    {
      icon: <BookOpen size={20} />,
      title: t('landing.feature_courses'),
      desc: t('landing.feature_courses_desc'),
    },
    {
      icon: <ClipboardList size={20} />,
      title: t('landing.feature_tests'),
      desc: t('landing.feature_tests_desc'),
    },
    {
      icon: <BarChart3 size={20} />,
      title: t('landing.feature_analytics'),
      desc: t('landing.feature_analytics_desc'),
    },
    {
      icon: <Gamepad2 size={20} />,
      title: t('landing.feature_games'),
      desc: t('landing.feature_games_desc'),
    },
  ];

  const stats = [
    { value: '10,000+', label: t('landing.stats_students') },
    { value: '500+', label: t('landing.stats_courses') },
    { value: '25,000+', label: t('landing.stats_tests') },
    { value: '10', label: t('landing.stats_subjects') },
  ];

  const audiences = [
    {
      title: t('landing.for_students'),
      points: [
        t('landing.audience.students.point_1'),
        t('landing.audience.students.point_2'),
        t('landing.audience.students.point_3'),
      ],
      icon: <GraduationCap size={20} />,
    },
    {
      title: t('landing.for_teachers'),
      points: [
        t('landing.audience.teachers.point_1'),
        t('landing.audience.teachers.point_2'),
        t('landing.audience.teachers.point_3'),
      ],
      icon: <Users size={20} />,
    },
    {
      title: t('landing.for_parents'),
      points: [
        t('landing.audience.parents.point_1'),
        t('landing.audience.parents.point_2'),
        t('landing.audience.parents.point_3'),
      ],
      icon: <Users size={20} />,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <GraduationCap size={14} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">Bilim</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm" className="text-xs">
                {t('nav.login')}
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="text-xs">
                {t('nav.register')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden kazakh-ornament-bg">
          <div className="absolute left-4 top-4 opacity-[0.03]" aria-hidden="true">
            <KazakhOrnament />
          </div>
          <div className="absolute bottom-4 right-4 opacity-[0.03]" aria-hidden="true">
            <KazakhOrnament />
          </div>
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02]"
            aria-hidden="true"
          >
            <KazakhOrnament className="h-[300px] w-[300px]" />
          </div>

          <div className="container relative z-10 mx-auto px-4 py-24 text-center lg:py-32">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
              <GraduationCap size={13} />
              {t('landing.platform_badge')}
            </div>

            <h1 className="mx-auto mb-4 max-w-2xl text-4xl font-bold leading-[1.15] tracking-tight lg:text-5xl">
              {t('landing.hero_title')}
            </h1>

            <p className="mx-auto mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t('landing.hero_subtitle')}
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg">
                  {t('landing.start_learning')}
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <Link to="/about">
                <Button variant="outline" size="lg">
                  {t('landing.learn_more')}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-secondary/30">
          <div className="container mx-auto px-4 py-10">
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-3xl font-bold tracking-tight">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-2xl font-bold">{t('landing.features_title')}</h2>
            <KazakhOrnament variant="divider" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-border p-5 transition-shadow hover:shadow-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                  {f.icon}
                </div>
                <h3 className="mb-1 text-sm font-semibold">{f.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-secondary/30 py-20">
          <div className="container mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-3">
              {audiences.map((a) => (
                <div key={a.title} className="rounded-lg border border-border bg-background p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                    {a.icon}
                  </div>
                  <h3 className="mb-3 font-semibold">{a.title}</h3>
                  <ul className="space-y-2">
                    {a.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle size={13} className="mt-0.5 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20 text-center">
          <h2 className="mb-3 text-2xl font-bold">{t('landing.cta_title')}</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            {t('landing.cta_subtitle')}
          </p>
          <Link to="/register">
            <Button size="lg">
              {t('landing.start_learning')}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <GraduationCap size={12} className="text-primary-foreground" />
            </div>
            <span className="text-xs font-medium">Bilim</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('landing.footer_copy')}</p>
        </div>
      </footer>
    </div>
  );
}