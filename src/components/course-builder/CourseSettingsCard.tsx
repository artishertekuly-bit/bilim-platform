import type { Dispatch, SetStateAction } from 'react';

import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CourseAccessType, CourseVisibility, SubjectRow } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import {
  getAccessTypeLabel,
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
  type CourseStatus,
} from '@/lib/course-creator/course-builder-utils';

type CourseEditForm = {
  title: string;
  description: string;
  subjectId: string;
  thumbnailUrl: string;
  status: CourseStatus;
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  enrollmentOpen: boolean;
  maxStudents: string;
};

export function CourseSettingsCard({
  courseEdit,
  setCourseEdit,
  subjectOptions,
  selectedCoursePrice,
  updating,
  onSaveCourse,
}: {
  courseEdit: CourseEditForm;
  setCourseEdit: Dispatch<SetStateAction<CourseEditForm>>;
  subjectOptions: SubjectRow[];
  selectedCoursePrice: string;
  updating: boolean;
  onSaveCourse: () => void;
}) {
  return (
    <Card id="course-settings" className="scroll-mt-24">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Курс параметрлері</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.course_title')}</Label>
          <Input
            value={courseEdit.title}
            onChange={(event) =>
              setCourseEdit((previous) => ({ ...previous, title: event.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.description')}</Label>
          <Textarea
            rows={4}
            value={courseEdit.description}
            onChange={(event) =>
              setCourseEdit((previous) => ({ ...previous, description: event.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.subject')}</Label>
          <select
            value={courseEdit.subjectId}
            onChange={(event) =>
              setCourseEdit((previous) => ({ ...previous, subjectId: event.target.value }))
            }
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">
              {t('page.teacher_course_builder.placeholder.select_subject')}
            </option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name_kk}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.thumbnail')}</Label>
          <Input
            value={courseEdit.thumbnailUrl}
            onChange={(event) =>
              setCourseEdit((previous) => ({ ...previous, thumbnailUrl: event.target.value }))
            }
            placeholder="https://..."
          />
        </div>

        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-semibold">Access және монетизация</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Курс ашық, жабық немесе ақылы режимде жұмыс істейді.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Курс түрі</Label>

            <CourseAccessTypeCards
              value={courseEdit.accessType}
              onChange={(nextAccessType) =>
                setCourseEdit((previous) => ({
                  ...previous,
                  accessType: nextAccessType,
                  visibility: resolveVisibilityFromAccessType(nextAccessType),
                  price:
                    nextAccessType === 'paid'
                      ? Number(previous.price || 0) > 0
                        ? previous.price
                        : '5000'
                      : '0',
                  currency: nextAccessType === 'paid' ? previous.currency || 'KZT' : 'KZT',
                }))
              }
            />
          </div>

          {shouldShowCoursePricing(courseEdit.accessType) ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Баға</Label>
                <Input
                  type="number"
                  min={0}
                  value={courseEdit.price}
                  onChange={(event) =>
                    setCourseEdit((previous) => ({ ...previous, price: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Валюта</Label>
                <Input
                  value={courseEdit.currency}
                  onChange={(event) =>
                    setCourseEdit((previous) => ({
                      ...previous,
                      currency: event.target.value.toUpperCase(),
                    }))
                  }
                  maxLength={3}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Оқушы лимиті</Label>
            <Input
              type="number"
              min={1}
              value={courseEdit.maxStudents}
              onChange={(event) =>
                setCourseEdit((previous) => ({ ...previous, maxStudents: event.target.value }))
              }
              placeholder="Шектеусіз"
            />
          </div>

          <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
            Қазіргі режим:{' '}
            <span className="font-medium text-foreground">
              {getAccessTypeLabel(courseEdit.accessType)}
            </span>
            {shouldShowCoursePricing(courseEdit.accessType) ? (
              <>
                {' '}· Баға:{' '}
                <span className="font-medium text-foreground">{selectedCoursePrice}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onSaveCourse} disabled={updating}>
            {t('page.teacher_course_builder.action.save_course')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
