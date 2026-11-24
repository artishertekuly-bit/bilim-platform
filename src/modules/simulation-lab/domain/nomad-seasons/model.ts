// Deterministic, simplified model of the seasonal pasture rotation (көш) of Kazakh nomads.
// Units are abstract and NOT historical statistics: one "sheep unit" eats one "grass unit" per season.
// The model exists to show why nomads moved between four seasonal pastures, what happens when
// a herd stays on one pasture, and how a harsh winter (жұт) hits a herd.
//
// Pure TypeScript: no React, no Three.js, no I/O, no randomness. The same input always gives the same output.
import { z } from 'zod';

export const MODEL_VERSION = 1;

/** The model year starts at spring (Наурыз), the traditional Kazakh new year. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const PASTURES = ['kokteu', 'zhailau', 'kuzeu', 'kystau'] as const;
export type PastureId = (typeof PASTURES)[number];

export const YEARS = 3;
export const TOTAL_STEPS = YEARS * SEASONS.length;

export const HERD_MIN = 100;
export const HERD_MAX = 1200;
export const HERD_STEP = 50;
export const DEFAULT_HERD = 400;
/** Hard ceiling so a very long growth streak can never overflow the scene or the chart. */
export const HERD_CAP = 3000;

/** Below this share of its needs the herd starts losing animals. */
export const HUNGER_THRESHOLD = 0.7;
export const LOSS_FACTOR = 0.5;
/** Spring lambing (төл) happens only when the herd was well fed that spring. */
export const BIRTH_RATE = 0.15;
export const BIRTH_MIN_FED = 0.9;
/** A pasture under this share of its capacity is overgrazed and regrows at half speed. */
export const DEGRADED_SHARE = 0.25;
export const DEGRADED_REGROWTH_FACTOR = 0.5;
/** In a жұт winter an ice crust leaves only this share of the usual winter access. */
export const JUT_ACCESS_FACTOR = 0.4;
/** The жұт option hits the winter of this model year. */
export const JUT_YEAR = 2;

export interface PastureSpec {
  /** Grass units the pasture holds when fully grown. */
  capacity: number;
  /** Share of capacity that grows back during each season. */
  regrowth: Readonly<Record<Season, number>>;
  /** Share of the standing grass animals can reach under snow. */
  winterAccess: number;
}

export const PASTURE_SPECS: Readonly<Record<PastureId, PastureSpec>> = {
  kokteu: { capacity: 900, regrowth: { spring: 0.45, summer: 0.2, autumn: 0.1, winter: 0 }, winterAccess: 0.35 },
  zhailau: { capacity: 1200, regrowth: { spring: 0.2, summer: 0.5, autumn: 0.1, winter: 0 }, winterAccess: 0.1 },
  kuzeu: { capacity: 900, regrowth: { spring: 0.3, summer: 0.25, autumn: 0.15, winter: 0 }, winterAccess: 0.35 },
  kystau: { capacity: 900, regrowth: { spring: 0.25, summer: 0.15, autumn: 0.1, winter: 0.02 }, winterAccess: 0.8 },
};

export type SeasonPlan = Readonly<Record<Season, PastureId>>;

export const TRADITIONAL_PLAN: SeasonPlan = { spring: 'kokteu', summer: 'zhailau', autumn: 'kuzeu', winter: 'kystau' };
export const STAY_PLAN: SeasonPlan = { spring: 'kystau', summer: 'kystau', autumn: 'kystau', winter: 'kystau' };

export const PastureIdSchema = z.enum(PASTURES);

export const NomadParamsSchema = z.object({
  herd: z.number().int().min(HERD_MIN).max(HERD_MAX),
  plan: z.object({
    spring: PastureIdSchema,
    summer: PastureIdSchema,
    autumn: PastureIdSchema,
    winter: PastureIdSchema,
  }),
  jut: z.boolean(),
});
export type NomadParams = z.infer<typeof NomadParamsSchema>;

export const DEFAULT_PARAMS: NomadParams = { herd: DEFAULT_HERD, plan: { ...TRADITIONAL_PLAN }, jut: false };

export type PlanKind = 'traditional' | 'stay' | 'custom';

export function planKind(plan: SeasonPlan): PlanKind {
  if (SEASONS.every((s) => plan[s] === TRADITIONAL_PLAN[s])) return 'traditional';
  if (SEASONS.every((s) => plan[s] === STAY_PLAN[s])) return 'stay';
  return 'custom';
}

export type GrassState = Record<PastureId, number>;

export interface SeasonStep {
  /** 1-based position in the run: 1..TOTAL_STEPS. */
  index: number;
  year: number;
  season: Season;
  pasture: PastureId;
  harshWinter: boolean;
  herdStart: number;
  demand: number;
  accessible: number;
  eaten: number;
  /** Share of the herd's needs that was covered, 0..100. */
  fedPct: number;
  losses: number;
  born: number;
  herdEnd: number;
  /** Grass left on every pasture at the end of the season. */
  grass: GrassState;
  grassPct: Record<PastureId, number>;
}

export type Trend = 'growth' | 'stable' | 'decline';
export type Verdict = 'balanced' | 'strained' | 'collapse';

export interface NomadResult {
  modelVersion: number;
  params: NomadParams;
  initialGrass: GrassState;
  steps: SeasonStep[];
  initialHerd: number;
  finalHerd: number;
  totalLosses: number;
  totalBorn: number;
  minFedPct: number;
  avgFedPct: number;
  endGrassPct: Record<PastureId, number>;
  endAvgGrassPct: number;
  trend: Trend;
  verdict: Verdict;
}

export function fullGrass(): GrassState {
  return { kokteu: PASTURE_SPECS.kokteu.capacity, zhailau: PASTURE_SPECS.zhailau.capacity, kuzeu: PASTURE_SPECS.kuzeu.capacity, kystau: PASTURE_SPECS.kystau.capacity };
}

export function grassPercent(grass: GrassState): Record<PastureId, number> {
  return {
    kokteu: Math.round((grass.kokteu / PASTURE_SPECS.kokteu.capacity) * 100),
    zhailau: Math.round((grass.zhailau / PASTURE_SPECS.zhailau.capacity) * 100),
    kuzeu: Math.round((grass.kuzeu / PASTURE_SPECS.kuzeu.capacity) * 100),
    kystau: Math.round((grass.kystau / PASTURE_SPECS.kystau.capacity) * 100),
  };
}

/** Share of standing grass the herd can reach on a pasture in a given season. */
export function accessShare(pasture: PastureId, season: Season, harshWinter: boolean): number {
  if (season !== 'winter') return 1;
  return PASTURE_SPECS[pasture].winterAccess * (harshWinter ? JUT_ACCESS_FACTOR : 1);
}

/** Seasonal regrowth of one pasture. Overgrazed pastures regrow at half speed. */
export function regrow(pasture: PastureId, season: Season, grass: number): number {
  const spec = PASTURE_SPECS[pasture];
  const degraded = grass < DEGRADED_SHARE * spec.capacity;
  const rate = spec.regrowth[season] * (degraded ? DEGRADED_REGROWTH_FACTOR : 1);
  return Math.min(spec.capacity, Math.round(grass + rate * spec.capacity));
}

export function lossesFor(herd: number, fedRatio: number): number {
  if (fedRatio >= HUNGER_THRESHOLD) return 0;
  return Math.round(herd * (HUNGER_THRESHOLD - fedRatio) * LOSS_FACTOR);
}

export function birthsFor(herd: number, season: Season, fedRatio: number): number {
  if (season !== 'spring' || fedRatio < BIRTH_MIN_FED) return 0;
  return Math.round(herd * BIRTH_RATE);
}

export function trendOf(initialHerd: number, finalHerd: number): Trend {
  if (finalHerd >= initialHerd * 1.05) return 'growth';
  if (finalHerd <= initialHerd * 0.95) return 'decline';
  return 'stable';
}

export function verdictOf(initialHerd: number, finalHerd: number, minFedPct: number): Verdict {
  if (finalHerd < initialHerd * 0.5) return 'collapse';
  if (minFedPct < HUNGER_THRESHOLD * 100) return 'strained';
  return 'balanced';
}

/**
 * Runs the whole three-year model. Throws a ZodError when the parameters are out of bounds,
 * so invalid input can never produce a misleading measurement.
 */
export function simulateNomadSeasons(input: NomadParams): NomadResult {
  const params = NomadParamsSchema.parse(input);
  const grass = fullGrass();
  const initialGrass = { ...grass };
  const steps: SeasonStep[] = [];
  let herd = params.herd;

  for (let year = 1; year <= YEARS; year += 1) {
    for (const season of SEASONS) {
      const pasture = params.plan[season];
      const harshWinter = params.jut && season === 'winter' && year === JUT_YEAR;

      // 1. Grass grows during the season on every pasture.
      for (const id of PASTURES) grass[id] = regrow(id, season, grass[id]);

      // 2. The herd grazes the chosen pasture.
      const demand = herd;
      const accessible = Math.floor(grass[pasture] * accessShare(pasture, season, harshWinter));
      const eaten = Math.min(demand, accessible);
      grass[pasture] -= eaten;
      const fedRatio = demand === 0 ? 1 : eaten / demand;

      // 3. Hunger losses and spring lambing.
      const losses = lossesFor(herd, fedRatio);
      const born = birthsFor(herd, season, fedRatio);
      const herdEnd = Math.min(HERD_CAP, Math.max(0, herd - losses + born));

      steps.push({
        index: steps.length + 1,
        year,
        season,
        pasture,
        harshWinter,
        herdStart: herd,
        demand,
        accessible,
        eaten,
        fedPct: Math.round(fedRatio * 100),
        losses,
        born,
        herdEnd,
        grass: { ...grass },
        grassPct: grassPercent(grass),
      });
      herd = herdEnd;
    }
  }

  const fedRatios = steps.map((s) => (s.demand === 0 ? 1 : s.eaten / s.demand));
  const minFedPct = Math.min(...steps.map((s) => s.fedPct));
  const avgFedPct = Math.round((fedRatios.reduce((sum, r) => sum + r, 0) / fedRatios.length) * 100);
  const endGrassPct = grassPercent(grass);
  const endAvgGrassPct = Math.round(PASTURES.reduce((sum, id) => sum + endGrassPct[id], 0) / PASTURES.length);

  return {
    modelVersion: MODEL_VERSION,
    params,
    initialGrass,
    steps,
    initialHerd: params.herd,
    finalHerd: herd,
    totalLosses: steps.reduce((sum, s) => sum + s.losses, 0),
    totalBorn: steps.reduce((sum, s) => sum + s.born, 0),
    minFedPct,
    avgFedPct,
    endGrassPct,
    endAvgGrassPct,
    trend: trendOf(params.herd, herd),
    verdict: verdictOf(params.herd, herd, minFedPct),
  };
}

/** Herd size and grass shown before the first season is played (step 0). */
export function stateAt(result: NomadResult, step: number): { herd: number; grassPct: Record<PastureId, number>; pasture: PastureId; season: Season; year: number } {
  if (step <= 0) {
    return { herd: result.initialHerd, grassPct: grassPercent(result.initialGrass), pasture: result.params.plan.spring, season: 'spring', year: 1 };
  }
  const s = result.steps[Math.min(step, result.steps.length) - 1];
  return { herd: s.herdEnd, grassPct: s.grassPct, pasture: s.pasture, season: s.season, year: s.year };
}
