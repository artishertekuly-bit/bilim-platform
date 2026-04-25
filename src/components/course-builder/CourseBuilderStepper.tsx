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
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex flex-col gap-1">
          <p className="text-sm font-semibold">Course builder қадамдары</p>
          <p className="text-xs text-muted-foreground">
            Үлкен форманы бөлімдерге бөліп, керек жерге тез өтіңіз.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              disabled={step.disabled}
              onClick={() => scrollToBuilderSection(step.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                step.disabled
                  ? 'cursor-not-allowed bg-muted/40 opacity-60'
                  : 'hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-primary/10 text-primary">
                  {step.icon}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {step.number}. {step.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
