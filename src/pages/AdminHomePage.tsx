// Әкімшінің бастапқы беті (karta §5): пайдаланушылар мен рөлдер, пәндер, сабақ модерациясы.
// Курс, тест және ЖИ сұрақ құрастырушы алынды (D19). Әкімші оқушы нәтижесін көрмейді (ortaq §9).
import { BookOpen, FileText, LayoutTemplate, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

const TOOLS = [
  { to: '/manage-users', title: 'Пайдаланушылар мен рөлдер', text: 'Мұғалім мен ата-ана рөлін беру', icon: Users },
  { to: '/manage-lessons', title: 'Сабақ модерациясы', text: 'Жарияланған сабақты жасыру не қайта ашу', icon: FileText },
  { to: '/subjects', title: 'Пәндер', text: 'Пәндер тізімі', icon: BookOpen },
  { to: '/cms', title: 'Мазмұн', text: 'Платформа мәтіндері', icon: LayoutTemplate },
  { to: '/profile', title: 'Профиль', text: 'Аккаунт баптаулары', icon: UserRound },
];

export default function AdminHomePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader eyebrow={<><ShieldCheck size={13} /> Әкімші</>} icon={<ShieldCheck size={20} />} title="Басқару" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ to, title, text, icon: Icon }) => (
            <Link key={to} to={to} className="group">
              <Card className="h-full border-border bg-card transition-colors group-hover:border-foreground/30">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-background">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{text}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
