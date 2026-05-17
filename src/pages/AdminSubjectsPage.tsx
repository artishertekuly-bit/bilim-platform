import { useMemo, useState } from 'react';
import { BookOpen, Hash, ListChecks, Plus, RotateCcw, Search } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import DashboardLayout from '@/components/DashboardLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common/DataState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { platformKeys, useSubjects } from '@/hooks/use-platform-data';
import { useToast } from '@/hooks/use-toast';
import { createSubject } from '@/lib/app-data';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

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

type SubjectRow = {
  id: string;
  name_kk: string;
  name_ru: string | null;
  slug: string;
  sort_order: number;
};

const MAX_ID_CHARS = 180;
const MAX_NAME_CHARS = 160;
const MAX_SLUG_CHARS = 120;
const MAX_SEARCH_CHARS = 160;
const MAX_ERROR_CHARS = 700;
const MAX_SORT_ORDER = 9999;

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_NAME_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizeSearchInput(value: unknown): string {
  return cleanText(value, MAX_SEARCH_CHARS);
}

function normalizeSearchText(value: unknown): string {
  return cleanText(value, MAX_NAME_CHARS).toLowerCase();
}

function transliterate(value: unknown): string {
  return cleanText(value, MAX_NAME_CHARS)
    .toLowerCase()
    .split('')
    .map((char) => cyrillicMap[char] ?? char)
    .join('');
}

function normalizeSlug(value: unknown): string {
  return limitText(
    transliterate(value)
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .replace(/-+/g, '-')
      .replace(/_+/g, '_')
      .replace(/^-+|-+$/g, ''),
    MAX_SLUG_CHARS,
  );
}

function normalizeSortOrder(value: unknown): number {
  const rawValue = cleanRawText(value).replace(/[^\d]/g, '');
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_SORT_ORDER, Math.floor(parsed)));
}

function normalizeSortOrderInput(value: unknown): string {
  return String(normalizeSortOrder(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return t('page.admin_subjects.toast.error_text');
}

function normalizeSubjectRows(input: unknown): SubjectRow[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();

  return input.reduce<SubjectRow[]>((acc, item) => {
    const row = item as Record<string, unknown>;
    const id = cleanId(row.id);
    const slug = normalizeSlug(row.slug);

    if (!id || seen.has(id)) return acc;

    seen.add(id);

    acc.push({
      id,
      name_kk: cleanText(row.name_kk, MAX_NAME_CHARS) || 'Пән',
      name_ru: cleanText(row.name_ru, MAX_NAME_CHARS) || null,
      slug,
      sort_order: normalizeSortOrder(row.sort_order),
    });

    return acc;
  }, []);
}

function buildSubjectSearchHaystack(subject: SubjectRow): string {
  return normalizeSearchText(
    [
      subject.id,
      subject.name_kk,
      subject.name_ru,
      subject.slug,
      subject.sort_order,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function SubjectMetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-medium text-muted-foreground">
        {cleanText(label, MAX_NAME_CHARS)}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

function SubjectRowCard({ subject }: { subject: SubjectRow }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {subject.name_kk}
          </p>

          <StatusBadge tone="muted">
            <Hash size={12} />
            {subject.sort_order}
          </StatusBadge>
        </div>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          {subject.slug || 'slug жоқ'}
          {subject.name_ru ? ` · ${subject.name_ru}` : ''}
        </p>
      </div>

      <StatusBadge tone="primary">
        <BookOpen size={12} />
        Пән
      </StatusBadge>
    </div>
  );
}

export default function AdminSubjectsPage() {
  const { data, isLoading, error } = useSubjects();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [nameKk, setNameKk] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [search, setSearch] = useState('');

  const subjects = useMemo(() => normalizeSubjectRows(data), [data]);

  const sortedSubjects = useMemo(
    () =>
      [...subjects].sort((a, b) => {
        const orderDiff = a.sort_order - b.sort_order;
        if (orderDiff !== 0) return orderDiff;

        return a.name_kk.localeCompare(b.name_kk, 'kk');
      }),
    [subjects],
  );

  const resolvedSlug = useMemo(
    () => normalizeSlug(slug || nameKk || nameRu),
    [nameKk, nameRu, slug],
  );

  const duplicateSubject = useMemo(
    () => sortedSubjects.find((subject) => subject.slug === resolvedSlug) || null,
    [resolvedSlug, sortedSubjects],
  );

  const filteredSubjects = useMemo(() => {
    const normalizedSearch = normalizeSearchText(search);

    if (!normalizedSearch) return sortedSubjects;

    return sortedSubjects.filter((subject) =>
      buildSubjectSearchHaystack(subject).includes(normalizedSearch),
    );
  }, [search, sortedSubjects]);

  const resetForm = () => {
    setNameKk('');
    setNameRu('');
    setSlug('');
    setSortOrder('0');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const safeNameKk = cleanText(nameKk, MAX_NAME_CHARS);
      const safeNameRu = cleanText(nameRu, MAX_NAME_CHARS);
      const safeSlug = normalizeSlug(resolvedSlug);

      if (!safeNameKk) {
        throw new Error('Қазақша атауын енгізіңіз.');
      }

      if (!safeSlug) {
        throw new Error('Slug мәнін енгізіңіз.');
      }

      if (duplicateSubject) {
        throw new Error('Бұл slug бұрыннан бар.');
      }

      return createSubject({
        nameKk: safeNameKk,
        nameRu: safeNameRu,
        slug: safeSlug,
        sortOrder: normalizeSortOrder(sortOrder),
      });
    },
    onSuccess: async () => {
      resetForm();

      await queryClient.invalidateQueries({ queryKey: platformKeys.subjects });

      toast({ title: t('page.admin_subjects.toast.create_title') });
    },
    onError: (mutationError) =>
      toast({
        title: t('page.admin_subjects.toast.error_title'),
        description: getErrorMessage(mutationError),
        variant: 'destructive',
      }),
  });

  const finalCanSubmit =
    Boolean(cleanText(nameKk, MAX_NAME_CHARS)) &&
    Boolean(resolvedSlug) &&
    !duplicateSubject &&
    !isLoading &&
    !mutation.isPending;

  const hasActiveSearch = Boolean(search.trim());

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <BookOpen size={13} />
              Пәндер
            </>
          }
          icon={<ListChecks size={20} />}
          title={t('page.admin_subjects.title')}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <SubjectMetricCard label="Пән саны" value={subjects.length} />
          <SubjectMetricCard
            label="Slug бар"
            value={subjects.filter((subject) => subject.slug).length}
          />
          <SubjectMetricCard
            label="Көрсетілді"
            value={filteredSubjects.length}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Plus size={16} />
                {t('page.admin_subjects.section.new_subject')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1.5">
                <Label htmlFor="name-kk">
                  {t('page.admin_subjects.field.name_kk')}
                </Label>
                <Input
                  id="name-kk"
                  value={nameKk}
                  maxLength={MAX_NAME_CHARS}
                  onChange={(event) =>
                    setNameKk(cleanText(event.target.value, MAX_NAME_CHARS))
                  }
                  placeholder={t('page.admin_subjects.placeholder.name_kk')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="name-ru">
                  {t('page.admin_subjects.field.name_ru')}
                </Label>
                <Input
                  id="name-ru"
                  value={nameRu}
                  maxLength={MAX_NAME_CHARS}
                  onChange={(event) =>
                    setNameRu(cleanText(event.target.value, MAX_NAME_CHARS))
                  }
                  placeholder={t('page.admin_subjects.placeholder.name_ru')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">{t('page.admin_subjects.field.slug')}</Label>
                <Input
                  id="slug"
                  value={slug}
                  maxLength={MAX_SLUG_CHARS}
                  onChange={(event) =>
                    setSlug(normalizeSlug(event.target.value))
                  }
                  onBlur={() => setSlug(normalizeSlug(slug || nameKk || nameRu))}
                  placeholder={t('page.admin_subjects.placeholder.slug')}
                />

                <div className="rounded-2xl border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  Slug: <span className="font-semibold">{resolvedSlug || '—'}</span>
                </div>

                {duplicateSubject ? (
                  <p className="text-xs text-destructive">
                    Бұл slug бұрыннан бар: {duplicateSubject.name_kk}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sort-order">
                  {t('page.admin_subjects.field.sort_order')}
                </Label>
                <Input
                  id="sort-order"
                  value={sortOrder}
                  onChange={(event) =>
                    setSortOrder(normalizeSortOrderInput(event.target.value))
                  }
                  inputMode="numeric"
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={() => mutation.mutate()}
                disabled={!finalCanSubmit}
              >
                {mutation.isPending
                  ? t('page.admin_subjects.action.saving')
                  : t('page.admin_subjects.action.create')}
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle className="text-base font-semibold">
                  {t('page.admin_subjects.section.all_subjects')}
                </CardTitle>

                <div className="relative w-full lg:max-w-sm">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />

                  <Input
                    value={search}
                    maxLength={MAX_SEARCH_CHARS}
                    onChange={(event) =>
                      setSearch(normalizeSearchInput(event.target.value))
                    }
                    placeholder="Пән атауы немесе slug"
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 p-4 sm:p-5">
              {isLoading ? (
                <LoadingState text={t('page.admin_subjects.loading')} />
              ) : null}

              {!isLoading && error ? (
                <ErrorState
                  text={t('page.admin_subjects.error')}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.location.reload()}
                    >
                      <RotateCcw size={15} className="mr-2" />
                      Қайта жүктеу
                    </Button>
                  }
                />
              ) : null}

              {!isLoading && !error && sortedSubjects.length === 0 ? (
                <EmptyState
                  title={t('page.admin_subjects.empty.title')}
                  text={t('page.admin_subjects.empty.text')}
                />
              ) : null}

              {!isLoading &&
              !error &&
              sortedSubjects.length > 0 &&
              filteredSubjects.length === 0 ? (
                <EmptyState
                  title="Іздеу бойынша пән табылмады"
                  text="Іздеу сөзін өзгертіңіз немесе өрісті тазалаңыз."
                  action={
                    hasActiveSearch ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSearch('')}
                      >
                        <RotateCcw size={15} className="mr-2" />
                        Тазалау
                      </Button>
                    ) : null
                  }
                />
              ) : null}

              {!isLoading && !error && filteredSubjects.length > 0 ? (
                <div className="grid gap-3">
                  {filteredSubjects.map((subject, index) => (
                    <SubjectRowCard
                      key={subject.id || `${subject.slug}-${index}`}
                      subject={subject}
                    />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
