import type { ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';

export function BuilderStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-primary-soft text-primary">
            {icon}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {label}
            </p>
            <p className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}