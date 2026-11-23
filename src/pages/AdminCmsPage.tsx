import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  GraduationCap,
  LayoutGrid,
  Users,
  type LucideIcon,
} from 'lucide-react';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

type CmsItemTone = 'primary' | 'accent' | 'secondary' | 'warning' | 'muted';

type CmsItem = {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  tone: CmsItemTone;
};

const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 260;

// Курс пен тест басқару алынды (D19).
const ALLOWED_CMS_PATHS = new Set(['/subjects', '/manage-lessons', '/manage-users']);

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_TITLE_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function normalizeUiText(value: unknown, limit = MAX_DESCRIPTION_CHARS): string {
  return cleanText(value, limit).replace(/\bAI\b/g, 'ЖИ');
}

function cleanInternalPath(value: unknown): string {
  const path = cleanText(value, 120);

  return ALLOWED_CMS_PATHS.has(path) ? path : '/cms';
}

function getToneClassName(tone: CmsItemTone) {
  const toneMap: Record<CmsItemTone, { card: string; icon: string }> = {
    primary: {
      card: 'hover:border-primary-muted hover:bg-primary-soft/50',
      icon: 'border-primary-muted bg-primary-soft text-primary',
    },
    accent: {
      card: 'hover:border-accent-muted hover:bg-accent-soft/50',
      icon: 'border-accent-muted bg-accent-soft text-accent-foreground',
    },
    secondary: {
      card: 'hover:border-secondary-muted hover:bg-secondary-soft/50',
      icon: 'border-secondary-muted bg-secondary-soft text-secondary-foreground',
    },
    warning: {
      card: 'hover:border-warning-muted hover:bg-warning-soft/50',
      icon: 'border-warning-muted bg-warning-soft text-warning-foreground',
    },
    muted: {
      card: 'hover:border-border hover:bg-muted/45',
      icon: 'border-border bg-muted text-muted-foreground',
    },
  };

  return toneMap[tone];
}

function getCmsItems(): CmsItem[] {
  const items: CmsItem[] = [
    {
      title: t('nav.subjects'),
      description: t('page.admin_cms.item.subjects'),
      path: '/subjects',
      icon: GraduationCap,
      tone: 'primary',
    },
    {
      title: t('nav.moderation'),
      description: 'Мұғалімдер жариялаған сабақтарды жасыру не қайта ашу',
      path: '/manage-lessons',
      icon: FileText,
      tone: 'accent',
    },
    {
      title: t('nav.users'),
      description: t('page.admin_cms.item.users'),
      path: '/manage-users',
      icon: Users,
      tone: 'muted',
    },
  ];

  return items.map(
    (item): CmsItem => ({
      title: normalizeUiText(item.title, MAX_TITLE_CHARS) || 'Бөлім',
      description: normalizeUiText(item.description, MAX_DESCRIPTION_CHARS),
      path: cleanInternalPath(item.path),
      icon: item.icon,
      tone: item.tone,
    }),
  );
}

function CmsNavigationCard({ item }: { item: CmsItem }) {
  const Icon = item.icon;
  const toneClassName = getToneClassName(item.tone);

  return (
    <Link to={item.path} className="group block h-full">
      <Card
        className={cn(
          'h-full overflow-hidden border-border bg-card transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
          toneClassName.card,
        )}
      >
        <CardHeader className="space-y-3 pb-3">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-2xl border shadow-inner-soft',
              toneClassName.icon,
            )}
          >
            <Icon size={18} />
          </div>

          <CardTitle className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span className="line-clamp-2">{item.title}</span>
            <ArrowRight
              size={14}
              className="shrink-0 text-muted-foreground transition-transform duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </CardTitle>
        </CardHeader>

        {item.description ? (
          <CardContent className="pt-0 text-xs leading-5 text-muted-foreground">
            <p className="line-clamp-3">{item.description}</p>
          </CardContent>
        ) : null}
      </Card>
    </Link>
  );
}

export default function AdminCmsPage() {
  const items = getCmsItems();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <LayoutGrid size={13} />
              Басқару
            </>
          }
          icon={<LayoutGrid size={20} />}
          title={normalizeUiText(t('page.admin_cms.title'), MAX_TITLE_CHARS)}
          actions={<StatusBadge tone="muted">{items.length}</StatusBadge>}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CmsNavigationCard key={item.path} item={item} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
