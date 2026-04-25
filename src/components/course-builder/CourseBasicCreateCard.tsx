import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CourseAccessTypeCards } from '@/components/course-builder/CourseAccessTypeCards';
import type { CourseAccessType, CourseVisibility, SubjectRow } from '@/lib/app-data-types';
import t from '@/lib/i18n';
import { normalizeMediaUrl } from '@/lib/media-url';
import {
  resolveVisibilityFromAccessType,
  shouldShowCoursePricing,
} from '@/lib/course-creator/course-builder-utils';

type NewCourseForm = {
  title: string;
  description: string;
  subjectId: string;
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  enrollmentOpen: boolean;
  maxStudents: string;
  moduleTitle: string;
  lessonTitle: string;
  lessonBody: string;
  lessonPractice: string;
  lessonVideo: string;
};

export function CourseBasicCreateCard({
  newCourse,
  setNewCourse,
  subjectOptions,
  canCreateCourse,
  creating,
  onCreateCourse,
}: {
  newCourse: NewCourseForm;
  setNewCourse: Dispatch<SetStateAction<NewCourseForm>>;
  subjectOptions: SubjectRow[];
  canCreateCourse: boolean;
  creating: boolean;
  onCreateCourse: () => void;
}) {
  return (
    <Card id="new-course" className="scroll-mt-24">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">
          {t('page.teacher_course_builder.section.new_course')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.course_title')}</Label>
          <Input
            value={newCourse.title}
            onChange={(event) =>
              setNewCourse((previous) => ({ ...previous, title: event.target.value }))
            }
            placeholder={t('page.teacher_course_builder.placeholder.course_title')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.description')}</Label>
          <Textarea
            rows={4}
            value={newCourse.description}
            onChange={(event) =>
              setNewCourse((previous) => ({ ...previous, description: event.target.value }))
            }
            placeholder={t('page.teacher_course_builder.placeholder.description')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('page.teacher_course_builder.field.subject')}</Label>
          <select
            value={newCourse.subjectId}
            onChange={(event) =>
              setNewCourse((previous) => ({ ...previous, subjectId: event.target.value }))
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

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Access параметрлері
          </p>

          <div className="space-y-2">
            <Label>Курс түрі</Label>

            <CourseAccessTypeCards
              value={newCourse.accessType}
              onChange={(nextAccessType) =>
                setNewCourse((previous) => ({
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

          {shouldShowCoursePricing(newCourse.accessType) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Баға</Label>
                <Input
                  type="number"
                  min={0}
                  value={newCourse.price}
                  onChange={(event) =>
                    setNewCourse((previous) => ({ ...previous, price: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Валюта</Label>
                <Input
                  value={newCourse.currency}
                  onChange={(event) =>
                    setNewCourse((previous) => ({
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
              value={newCourse.maxStudents}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, maxStudents: event.target.value }))
              }
              placeholder="Бос қалса — шектеусіз"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Алғашқы құрылым
          </p>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.initial_module')}</Label>
            <Input
              value={newCourse.moduleTitle}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, moduleTitle: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.intro_lesson')}</Label>
            <Input
              value={newCourse.lessonTitle}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, lessonTitle: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.theory')}</Label>
            <Textarea
              rows={4}
              value={newCourse.lessonBody}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, lessonBody: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.practice')}</Label>
            <Textarea
              rows={3}
              value={newCourse.lessonPractice}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, lessonPractice: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('page.teacher_course_builder.field.video_url')}</Label>
            <Input
              value={newCourse.lessonVideo}
              onChange={(event) =>
                setNewCourse((previous) => ({ ...previous, lessonVideo: event.target.value }))
              }
              onBlur={(event) =>
                setNewCourse((previous) => ({
                  ...previous,
                  lessonVideo: normalizeMediaUrl(event.target.value),
                }))
              }
              placeholder="https://youtube.com/..."
            />
          </div>
        </div>

        <Button className="w-full" onClick={onCreateCourse} disabled={!canCreateCourse}>
          {creating
            ? t('page.teacher_course_builder.action.saving')
            : t('page.teacher_course_builder.action.create_course')}
        </Button>
      </CardContent>
    </Card>
  );
}
