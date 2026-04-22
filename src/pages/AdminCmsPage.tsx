import DashboardLayout from '@/components/DashboardLayout';
import { Link } from 'react-router-dom';
import t from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  GraduationCap,
  BookOpen,
  FileText,
  ClipboardList,
  Eye,
  Users,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

type CmsItem = {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
};

export default function AdminCmsPage() {
  const items: CmsItem[] = [
    {
      title: t('nav.subjects'),
      description: t('page.admin_cms.item.subjects'),
      path: '/subjects',
      icon: GraduationCap,
    },
    {
      title: t('nav.manage_courses'),
      description: t('page.admin_cms.item.courses'),
      path: '/manage-courses',
      icon: BookOpen,
    },
    {
      title: t('nav.manage_lessons'),
      description: t('page.admin_cms.item.lessons'),
      path: '/manage-lessons',
      icon: FileText,
    },
    {
      title: t('nav.manage_tests'),
      description: t('page.admin_cms.item.tests'),
      path: '/manage-tests',
      icon: ClipboardList,
    },
    {
      title: t('nav.moderation'),
      description: t('page.admin_cms.item.moderation'),
      path: '/moderation',
      icon: Eye,
    },
    {
      title: t('nav.users'),
      description: t('page.admin_cms.item.users'),
      path: '/manage-users',
      icon: Users,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('page.admin_cms.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.admin_cms.subtitle')}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link to={item.path} key={item.path} className="group block h-full">
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardHeader className="space-y-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                      <Icon size={18} />
                    </div>

                    <CardTitle className="flex items-center justify-between gap-3 text-sm font-semibold">
                      <span>{item.title}</span>
                      <ArrowRight
                        size={14}
                        className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}