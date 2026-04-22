import { Card, CardContent } from '@/components/ui/card';
import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: string;
}

export default function StatCard({ label, value, icon, subtitle, trend }: StatCardProps) {
  return (
    <Card className="stat-card border border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
            {icon}
          </div>
          {trend && (
            <span className="text-[11px] font-medium text-muted-foreground">{trend}</span>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
