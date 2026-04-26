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
      title: 'Жаңа курс',
      description: 'Курстың бастапқы атауы, пәні және алғашқы сабағы.',
      icon: <Plus size={16} />,
      disabled: false,
    },
    {
      id: 'course-settings',
      number: '2',
      title: 'Параметрлер',
      description: 'Курс түрі, баға, thumbnail және негізгі ақпарат.',
      icon: <Settings size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'modules-lessons',
      number: '3',
      title: 'Модульдер',
      description: 'Модульдер, сабақтар, реттілік және жариялау күйі.',
      icon: <FileText size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'announcements',
      number: '4',
      title: 'Хабарландырулар',
      description: 'Маңызды ақпарат, pin және мерзімді ескерту.',
      icon: <Megaphone size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'materials',
      number: '5',
      title: 'Материалдар',
      description: 'Силлабус, PDF, формулалар, lesson attachments.',
      icon: <LinkIcon size={16} />,
      disabled: !hasSelectedCourse,
    },
    {
      id: 'publish',
      number: '6',
      title: 'Жариялау',
      description: 'Publish, archive және invite code басқару.',
      icon: <CheckCircle2 size={16} />,
      disabled: !hasSelectedCourse,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">
            Course builder қадамдары
          </p>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            Үлкен форманы бөлімдерге бөліп, керек жерге тез өтіңіз. Курс
            таңдалғаннан кейін параметрлер, модульдер, материалдар және жариялау
            блоктары ашылады.
          </p>
        </div>

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
                className={`group rounded-3xl border p-3 text-left transition-all duration-200 ease-soft ${
                  enabled
                    ? 'border-border bg-card shadow-soft hover:-translate-y-0.5 hover:border-primary-muted hover:bg-primary-soft hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]'
                    : 'cursor-not-allowed border-border bg-muted/50 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border shadow-inner-soft transition-all duration-200 ease-soft ${
                      enabled
                        ? 'border-primary-muted bg-primary-soft text-primary group-hover:bg-card'
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

                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {step.description}
                    </p>
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