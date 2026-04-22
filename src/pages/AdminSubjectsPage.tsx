import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/DashboardLayout';
import t from '@/lib/i18n';
import { createSubject } from '@/lib/app-data';
import { platformKeys, useSubjects } from '@/hooks/use-platform-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/DataState';

const cyrillicMap: Record<string, string> = {
  а: 'a',
  ә: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ғ: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  қ: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  ң: 'n',
  о: 'o',
  ө: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ұ: 'u',
  ү: 'u',
  ф: 'f',
  х: 'h',
  һ: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: '',
  ы: 'y',
  і: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function transliterate(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => cyrillicMap[char] ?? char)
    .join('');
}

function normalizeSlug(value: string) {
  return transliterate(value)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeSortOrder(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export default function AdminSubjectsPage() {
  const { data, isLoading, error } = useSubjects();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [nameKk, setNameKk] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const sortedSubjects = useMemo(
    () =>
      [...(data || [])].sort((a, b) => {
        const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.name_kk || '').localeCompare(b.name_kk || '', 'kk');
      }),
    [data]
  );

  const resolvedSlug = useMemo(
    () => normalizeSlug(slug || nameKk || nameRu),
    [slug, nameKk, nameRu]
  );

  const slugExists = useMemo(
    () => sortedSubjects.some((subject) => subject.slug === resolvedSlug),
    [sortedSubjects, resolvedSlug]
  );

  const canSubmit =
    !!nameKk.trim() && !!resolvedSlug && !slugExists && !isLoading;

  const resetForm = () => {
    setNameKk('');
    setNameRu('');
    setSlug('');
    setSortOrder('0');
  };

  const mutation = useMutation({
    mutationFn: () =>
      createSubject({
        nameKk: nameKk.trim(),
        nameRu: nameRu.trim(),
        slug: resolvedSlug,
        sortOrder: normalizeSortOrder(sortOrder),
      }),
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: platformKeys.subjects });
      toast({ title: t('page.admin_subjects.toast.create_title') });
    },
    onError: () =>
      toast({
        title: t('page.admin_subjects.toast.error_title'),
        description: t('page.admin_subjects.toast.error_text'),
        variant: 'destructive',
      }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('page.admin_subjects.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.admin_subjects.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                {t('page.admin_subjects.section.new_subject')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('page.admin_subjects.field.name_kk')}</Label>
                <Input
                  value={nameKk}
                  onChange={(e) => setNameKk(e.target.value)}
                  placeholder={t('page.admin_subjects.placeholder.name_kk')}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('page.admin_subjects.field.name_ru')}</Label>
                <Input
                  value={nameRu}
                  onChange={(e) => setNameRu(e.target.value)}
                  placeholder={t('page.admin_subjects.placeholder.name_ru')}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('page.admin_subjects.field.slug')}</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  onBlur={(e) =>
                    setSlug(normalizeSlug(e.target.value || nameKk || nameRu))
                  }
                  placeholder={t('page.admin_subjects.placeholder.slug')}
                />
                <p className="text-[11px] text-muted-foreground">
                  Slug: {resolvedSlug || '—'}
                </p>
                {slugExists ? (
                  <p className="text-[11px] text-destructive">
                    Бұл slug бұрыннан бар.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label>{t('page.admin_subjects.field.sort_order')}</Label>
                <Input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  type="number"
                />
              </div>

              <Button
                onClick={() => mutation.mutate()}
                disabled={!canSubmit || mutation.isPending}
              >
                {mutation.isPending
                  ? t('page.admin_subjects.action.saving')
                  : t('page.admin_subjects.action.create')}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                {t('page.admin_subjects.section.all_subjects')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {isLoading ? (
                <LoadingState text={t('page.admin_subjects.loading')} />
              ) : error ? (
                <ErrorState text={t('page.admin_subjects.error')} />
              ) : !sortedSubjects || sortedSubjects.length === 0 ? (
                <EmptyState
                  title={t('page.admin_subjects.empty.title')}
                  text={t('page.admin_subjects.empty.text')}
                />
              ) : (
                sortedSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{subject.name_kk}</div>
                      <div className="text-xs text-muted-foreground">
                        {subject.slug}
                        {subject.name_ru ? ` · ${subject.name_ru}` : ''}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      #{subject.sort_order}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}