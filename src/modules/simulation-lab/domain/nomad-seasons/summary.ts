// Compact, deterministic experiment summary for the AI tutor and for saved attempts.
// The tutor only explains these numbers; it must never recalculate or override them.
import { PASTURE_INFO, SEASON_TITLES } from './content';
import { MODEL_VERSION, SEASONS, planKind, type NomadResult, type Trend } from './model';
import { NOMAD_SEASONS_SLUG } from './meta';

/** The tutor API accepts at most 2000 characters per message. */
export const TUTOR_MESSAGE_LIMIT = 2000;

export interface ExperimentAnswers {
  hypothesis: Trend | null;
  checkAnswerId: string | null;
  checkCorrect: boolean | null;
}

export interface ExperimentSummary {
  sim: string;
  params: { herd: number; plan: Record<string, string>; planKind: string; jut: boolean };
  result: {
    finalHerd: number;
    totalLosses: number;
    totalBorn: number;
    minFedPct: number;
    avgFedPct: number;
    endAvgGrassPct: number;
    trend: Trend;
    verdict: string;
    hardestSeason: string | null;
  };
  hypothesis: Trend | null;
  hypothesisConfirmed: boolean | null;
  check: { answer: string | null; correct: boolean | null };
}

export function buildExperimentSummary(result: NomadResult, answers: ExperimentAnswers): ExperimentSummary {
  const hardest = result.steps.reduce<NomadResult['steps'][number] | null>(
    (worst, step) => (worst === null || step.fedPct < worst.fedPct ? step : worst),
    null,
  );
  const plan: Record<string, string> = {};
  for (const season of SEASONS) plan[SEASON_TITLES[season]] = PASTURE_INFO[result.params.plan[season]].title;
  return {
    sim: `${NOMAD_SEASONS_SLUG}@${MODEL_VERSION}`,
    params: { herd: result.params.herd, plan, planKind: planKind(result.params.plan), jut: result.params.jut },
    result: {
      finalHerd: result.finalHerd,
      totalLosses: result.totalLosses,
      totalBorn: result.totalBorn,
      minFedPct: result.minFedPct,
      avgFedPct: result.avgFedPct,
      endAvgGrassPct: result.endAvgGrassPct,
      trend: result.trend,
      verdict: result.verdict,
      hardestSeason:
        hardest && hardest.fedPct < 100
          ? `${hardest.year}-жыл, ${SEASON_TITLES[hardest.season]}, ${PASTURE_INFO[hardest.pasture].title}: ${hardest.fedPct}%`
          : null,
    },
    hypothesis: answers.hypothesis,
    hypothesisConfirmed: answers.hypothesis ? answers.hypothesis === result.trend : null,
    check: { answer: answers.checkAnswerId, correct: answers.checkCorrect },
  };
}

/** A ready-to-send tutor message: a short request in Kazakh plus the compact JSON summary. */
export function buildTutorMessage(summary: ExperimentSummary): string {
  const intro =
    'Мен Bilim зертханасында «Көшпелілердің маусымдық көші» симуляциясын жасадым. ' +
    'Төмендегі сандарды модель есептеді, оларды қайта есептеме және өзгертпе. ' +
    'Нәтижемді тарихпен байланыстырып түсіндір де, ойландыратын бір сұрақ қой.';
  const message = `${intro}\n${JSON.stringify(summary)}`;
  return message.length <= TUTOR_MESSAGE_LIMIT ? message : message.slice(0, TUTOR_MESSAGE_LIMIT);
}
