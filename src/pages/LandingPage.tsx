import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle,
  ClipboardList,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const features = [
    {
      icon: BookOpen,
      title: 'Курстар мен сабақтар',
      desc: 'Құрылымдалған сабақтар, видеолар және тақырыптық конспекттер.',
      badge: 'Каталог',
    },
    {
      icon: ClipboardList,
      title: 'Интерактивті тесттер',
      desc: 'Әр тақырыпты лезде тексеру және жедел нәтиже алу жүйесі.',
      badge: 'Сынақ',
    },
    {
      icon: Bot,
      title: 'AI Тьютор және Көмекші',
      desc: 'Күрделі есептер мен тақырыптарды түсіндіретін ақылды ассистент.',
      badge: 'AI Sana',
    },
    {
      icon: BarChart3,
      title: 'Нақты прогресс',
      desc: 'Пәндер мен тақырыптар бойынша үлгерімді анық көрсететін динамика.',
      badge: 'Нәтиже',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Mobile-Friendly Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-full transition-transform active:scale-95"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <span className="block text-sm font-black lowercase tracking-tight">sana</span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs font-semibold" asChild>
              <Link to="/login">Кіру</Link>
            </Button>
            <Button size="sm" className="h-8 rounded-full text-xs font-semibold" asChild>
              <Link to="/register">Тіркелу</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-16">
        {/* Hero Section */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur-md">
            <Sparkles size={12} className="text-foreground" />
            <span>Заманауи білім беру платформасы</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl sm:leading-tight">
            Оқуды жеңіл әрі тиімді жалғастырыңыз
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Барлық курстар, тесттер және интеллектуалды AI көмекшісі бір қосымшада.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button size="lg" className="h-11 rounded-full text-sm font-semibold shadow-md active:scale-95" asChild>
              <Link to="/register">
                Оқуды бастау
                <ArrowRight size={15} className="ml-2" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-11 rounded-full text-sm font-semibold active:scale-95" asChild>
              <Link to="/login">Аккаунтқа кіру</Link>
            </Button>
          </div>
        </div>

        {/* Clean, Non-bloated Feature Cards */}
        <div className="mt-12 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group relative rounded-2xl border border-border/80 bg-card/80 p-4 shadow-xs transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-bold text-foreground">
                        {item.title}
                      </h3>
                      <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {item.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Compact Highlights */}
        <div className="mt-10 rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div>
              <p className="text-xl font-black text-foreground">100%</p>
              <p className="text-[11px] text-muted-foreground">Қазақ тілінде</p>
            </div>
            <div>
              <p className="text-xl font-black text-foreground">24/7</p>
              <p className="text-[11px] text-muted-foreground">AI көмекші</p>
            </div>
            <div>
              <p className="text-xl font-black text-foreground">Мобильді</p>
              <p className="text-[11px] text-muted-foreground">Кез келген құрылғыда</p>
            </div>
            <div>
              <p className="text-xl font-black text-foreground">Тегін</p>
              <p className="text-[11px] text-muted-foreground">Бастапқы оқу</p>
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Sana Bilim. Барлық құқықтар қорғалған.</p>
      </footer>
    </div>
  );
}
