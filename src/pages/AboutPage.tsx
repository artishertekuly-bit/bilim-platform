import { Link } from 'react-router-dom';
import KazakhOrnament from '@/components/KazakhOrnament';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  GraduationCap,
  ShieldCheck,
  Users,
  BookOpen,
} from 'lucide-react';

const researchPrinciples = [
  {
    title: 'Адамға бағытталған оқу',
    text: 'Жүйенің орталығында технология емес, оқушының оқу процесі, мұғалімнің рөлі және түсінікті оқу тәжірибесі тұрады.',
    icon: <Users size={18} />,
  },
  {
    title: 'Педагогика бірінші орында',
    text: 'Автоматтандыру оқу логикасын алмастырмауы керек. Алдымен құрылым, содан кейін ғана интеллектуалды қабат.',
    icon: <BookOpen size={18} />,
  },
  {
    title: 'Жауапты AI енгізу',
    text: 'AI тек түсіндірілетін, бақыланатын және педагогикалық тұрғыдан негізделген қолдау қабаты ретінде енгізілуі керек.',
    icon: <ShieldCheck size={18} />,
  },
];

const currentCapabilities = [
  'Рөлге бөлінген платформа архитектурасы: оқушы, мұғалім, ата-ана, әкімші',
  'Курс, модуль, сабақ құрылымы',
  'Тест және сұрақ инфрақұрылымы',
  'Прогресс, рейтинг және аналитиканың базалық қабаттары',
  'Контент құру, өңдеу және модерация ағындары',
];

const designPrinciples = [
  {
    title: 'Айқындық',
    text: 'Интерфейс мүмкіндігінше түсінікті болуы керек. Күрделі жүйе пайдаланушыға күрделі көрінбеуі тиіс.',
  },
  {
    title: 'Құрылым',
    text: 'Оқу жолы бөлшектенбей, нақты кезеңдер мен прогресс логикасына сүйенуі керек.',
  },
  {
    title: 'Ұстамдылық',
    text: 'AI мүмкіндігі бар деп көрсету мен AI шын мәнінде пайдалы болатын жердің арасын нақты ажырату қажет.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden border-b border-border kazakh-ornament-bg">
        <div className="absolute left-4 top-4 opacity-[0.03]" aria-hidden="true">
          <KazakhOrnament />
        </div>
        <div className="absolute bottom-4 right-4 opacity-[0.03]" aria-hidden="true">
          <KazakhOrnament />
        </div>

        <div className="container mx-auto px-6 py-20 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
              <GraduationCap size={14} />
              Bilimcorp
            </div>

            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight leading-[1.1] lg:text-6xl">
              Bilimcorp — білім беруге арналған құрылымды цифрлық платформа
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-muted-foreground lg:text-base">
              Қазіргі кезеңде жоба оқу платформасының негізгі архитектурасын, рөлдік жүйесін және
              педагогикалық негізін құрып жатыр. AI бұл жерде орталық емес, кейін жауапты түрде
              енгізілетін қолдау қабаты ретінде қаралады.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/register">
                  Жобамен танысу
                  <ArrowRight size={16} className="ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Кіру</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Жобаның мәні
          </p>
          <h2 className="text-2xl font-semibold lg:text-3xl">
            Мақсат — технологияны емес, оқу процесін күшейту
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Көп өнімдер не жай контент жеткізумен шектеледі, не AI-ды нақты архитектурасыз уәде
            ретінде көрсетеді. Bilimcorp бұдан бөлек жолды ұстанады: алдымен сенімді оқу
            платформасын құру, содан кейін ғана интеллектуалды қабатты мағыналы түрде енгізу.
          </p>
          <p className="text-sm leading-7 text-muted-foreground">
            Сондықтан негізгі сұрақ — AI-ды қалай көбірек қосу емес, оны оқу жүйесінде нақты қай
            жерде және қандай шектеумен қолдану керек деген сұрақ.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-secondary/20">
        <div className="container mx-auto px-6 py-16 lg:py-20">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Негізгі ұстанымдар
            </p>
            <h2 className="mt-3 text-2xl font-semibold lg:text-3xl">
              Жоба құрылымы зерттеу логикасына сүйенуі керек
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {researchPrinciples.map((item) => (
              <Card key={item.title} className="border-border bg-background">
                <CardHeader className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border">
                    {item.icon}
                  </div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">
                  {item.text}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-2xl">Қазір не бар</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentCapabilities.map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border p-3 text-sm text-muted-foreground"
                >
                  {item}
                </div>
              ))}
              <p className="pt-2 text-sm leading-7 text-muted-foreground">
                Қазіргі негізгі мақсат — платформаның сенімді өзегін қалыптастыру: курс, сабақ,
                тест, прогресс және модерация сияқты базалық бөліктерді орнықты ету.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-2xl">Дизайн ұстанымдары</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {designPrinciples.map((item) => (
                <div key={item.title} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-sm leading-7 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="container mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold lg:text-3xl">
            Жоба әлі қалыптасу кезеңінде, бірақ бағыты нақты
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Бұл беттің мақсаты — артық уәде беру емес, платформаның қазіргі күйін және оның
            негізгі идеясын қысқа әрі нақты көрсету.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">
                Тіркелу
                <ArrowRight size={16} className="ml-2" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">Кіру</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}