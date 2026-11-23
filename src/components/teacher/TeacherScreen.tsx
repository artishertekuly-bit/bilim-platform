// Мұғалім аймағының қаңқасы (karta §4.1, D31): прототиптегі қабық — «Панель · Растау · Сабақтар · Чат»,
// ноутбукта сол жақтағы мәзір. Ішкі бетте `back` беріледі және төменгі мәзір жасырылады.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import Avatar from '@/components/bl/Avatar';
import { Page, PageTitle, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';

export default function TeacherScreen({
  title,
  subtitle,
  back,
  backLabel,
  right,
  wide,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  backLabel?: string;
  right?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (back) {
    return (
      <AppShell nav={false}>
        <TopBar back={back} backLabel={backLabel ?? 'Артқа'} title={title} right={right} />
        <Page wide={wide} className="pt-2">
          {children}
        </Page>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Page wide={wide}>
        <PageTitle
          title={title}
          subtitle={subtitle}
          right={
            right ?? (
              <Link to="/settings" aria-label="Баптаулар" className="flex-none rounded-full no-underline">
                <Avatar name={user?.fullName} url={user?.avatarUrl} size="sm" />
              </Link>
            )
          }
        />
        {children}
      </Page>
    </AppShell>
  );
}
