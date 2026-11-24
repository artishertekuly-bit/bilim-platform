// Simulation Lab screens: the catalogue (/lab) and one simulation (/lab/:slug).
// The dev-only harness (/dev/lab/:slug) renders the same simulation without the app shell or saving.
import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';

import AppShell from '@/components/bl/AppShell';
import { ChevronIcon } from '@/components/bl/icons';
import { Badge, ButtonLink, LoadingBlock, Page, PageTitle, StateCard, TopBar } from '@/components/bl/ui';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime } from '@/lib/teacher-ui';

import { listSimulations, getSimulation } from '../registry/registry';
import { mySimulationStats, simulationKeys } from '../services/attempts';

const SUBJECT_TITLES: Record<string, string> = {
  history: 'Қазақстан тарихы',
  physics: 'Физика',
  chemistry: 'Химия',
  biology: 'Биология',
  geography: 'География',
  math: 'Математика',
};

export function LabHomePage() {
  const { user } = useAuth();
  const stats = useQuery({ queryKey: simulationKeys.stats, queryFn: mySimulationStats, enabled: Boolean(user) });
  const bySlug = new Map((stats.data ?? []).map((s) => [s.slug, s]));

  return (
    <AppShell>
      <Page className="gap-4">
        <PageTitle title="Зертхана" subtitle="Құбылысты өз қолыңмен тексеретін интерактивті модельдер" />
        <div className="flex flex-col gap-3">
          {listSimulations().map(({ meta }) => {
            const stat = bySlug.get(meta.slug);
            return (
              <Link
                key={meta.slug}
                to={`/lab/${meta.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-bl-line bg-white p-4 text-bl-ink no-underline hover:bg-[#FBFAF8]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone="dark">{SUBJECT_TITLES[meta.subject] ?? meta.subject}</Badge>
                    <Badge>
                      {meta.gradeRange[0]}–{meta.gradeRange[1]}-сынып
                    </Badge>
                    <Badge>~{meta.estimatedMinutes} минут</Badge>
                  </span>
                  <span className="text-[17px] font-semibold leading-[1.3]">{meta.title}</span>
                  <span className="text-[14px] leading-[1.45] text-bl-ink3">{meta.summary}</span>
                  {stat?.attempts ? (
                    <span className="text-[13px] text-bl-ink2">
                      {stat.attempts} рет жасадың{stat.last_at ? ` · соңғысы ${formatDateTime(stat.last_at)}` : ''}
                    </span>
                  ) : null}
                </span>
                <ChevronIcon />
              </Link>
            );
          })}
        </div>
        <p className="m-0 text-[13px] leading-[1.45] text-bl-ink2">
          Зертхана модельдері жеңілдетілген: олар құбылыстың себеп-салдарын түсінуге көмектеседі, бірақ нақты статистиканы алмастырмайды.
        </p>
      </Page>
    </AppShell>
  );
}

export function LabSimulationPage({ harness = false }: { harness?: boolean }) {
  const { slug } = useParams();
  const entry = getSimulation(slug);

  const body = entry ? (
    <Suspense fallback={<LoadingBlock rows={4} />}>
      <entry.Component saveEnabled={!harness} />
    </Suspense>
  ) : (
    <StateCard mark="?" title="Симуляция табылмады" text="Сілтеме ескірген болуы мүмкін. Зертхана тізімінен таңдаңыз.">
      <ButtonLink to="/lab">Зертханаға оралу</ButtonLink>
    </StateCard>
  );

  if (harness) {
    return (
      <div className="min-h-[100dvh] bg-bl-bg font-sans text-bl-ink">
        <Page wide className="gap-4">
          {body}
        </Page>
      </div>
    );
  }

  return (
    <AppShell>
      <TopBar back="/lab" backLabel="Зертханаға оралу" title="Зертхана" />
      <Page wide className="gap-4 pt-1 lg:pt-2">
        {body}
      </Page>
    </AppShell>
  );
}
