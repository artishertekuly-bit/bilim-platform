import {
  CheckCircle2,
  FileText,
  Link as LinkIcon,
  Megaphone,
  Plus,
  Settings,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { scrollToBuilderSection } from '@/lib/course-creator/course-builder-utils';

export function CourseBuilderStepper({
  hasSelectedCourse,
}: {
  hasSelectedCourse: boolean;
}) {
  const steps = [
    {
      id: 'new-course',
      number: '1',
      title: 'Курс',
      icon: <Plus size={16} />,
      disabled: false,
    },
    {
      id: 'course-settings',
      number: '2',
      title: 'Баптаулар',
      icon: <Settings size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'modules-lessons',
      number: '3',
      title: 'Сабақтар',
      icon: <FileText size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'announcements',
      number: '4',
      title: 'Хабарландыру',
      icon: <Megaphone size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'materials',
      number: '5',
      title: 'Материал',
      icon: <LinkIcon size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'publish',
      number: '6',
      title: 'Жариялау',
      icon: <CheckCircle2 size={16} />,
      disabled: !hasSelectedCourse,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {steps.map((step) => {
            const enabled = !step.disabled;

            return (
              <button
                key={step.id}
                type="button"
                disabled={step.disabled}
                onClick={() => scrollToBuilderSection(step.id)}
                aria-disabled={step.disabled}
                className={`rounded-3xl border p-3 text-left transition-colors active:scale-[0.99] ${
                  enabled
                    ? 'border-border bg-card hover:border-primary-muted hover:bg-primary-soft/40'
                    : 'cursor-not-allowed border-border bg-muted/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
                      enabled
                        ? 'border-primary-muted bg-primary-soft text-primary'
                        : 'border-border bg-card/70 text-muted-foreground'
                    }`}
                  >
                    {step.icon}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                          enabled
                            ? 'bg-card text-primary ring-1 ring-primary-muted'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {step.number}
                      </span>

                      <p
                        className={`truncate text-xs font-semibold ${
                          enabled ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}