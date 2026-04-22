import { Badge } from '@/components/ui/badge';
import t from '@/lib/i18n';

type CourseStatus = 'draft' | 'review' | 'published' | 'archived';

interface StatusBadgeProps {
  status: CourseStatus;
}

const statusConfig: Record<CourseStatus, { label: string; className: string }> = {
  draft: { label: t('course.status.draft'), className: 'bg-muted text-muted-foreground border-border' },
  review: { label: t('course.status.review'), className: 'bg-warning/10 text-warning border-warning/20' },
  published: { label: t('course.status.published'), className: 'bg-success/10 text-success border-success/20' },
  archived: { label: t('course.status.archived'), className: 'bg-accent text-muted-foreground border-border' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${config.className}`}>
      {config.label}
    </Badge>
  );
}
