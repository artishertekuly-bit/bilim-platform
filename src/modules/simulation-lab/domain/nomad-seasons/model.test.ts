import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { CHECK_CORRECT_ID, CHECK_OPTIONS } from './content';
import {
  DEFAULT_PARAMS,
  HERD_MAX,
  HERD_MIN,
  JUT_YEAR,
  PASTURE_SPECS,
  STAY_PLAN,
  TOTAL_STEPS,
  TRADITIONAL_PLAN,
  accessShare,
  birthsFor,
  lossesFor,
  planKind,
  regrow,
  simulateNomadSeasons,
  stateAt,
  trendOf,
  verdictOf,
  type NomadParams,
} from './model';
import { TUTOR_MESSAGE_LIMIT, buildExperimentSummary, buildTutorMessage } from './summary';

const traditional = (herd: number, jut = false): NomadParams => ({ herd, plan: { ...TRADITIONAL_PLAN }, jut });
const stay = (herd: number): NomadParams => ({ herd, plan: { ...STAY_PLAN }, jut: false });

describe('nomad seasons model: building blocks', () => {
  it('regrows a healthy pasture by its seasonal rate and caps at capacity', () => {
    expect(regrow('kokteu', 'spring', 300)).toBe(300 + 0.45 * 900);
    expect(regrow('kokteu', 'spring', 800)).toBe(PASTURE_SPECS.kokteu.capacity);
  });

  it('halves regrowth on an overgrazed pasture and rounds deterministically', () => {
    // 210 < 25% of 900, so kystau grows at 0.125 instead of 0.25: 210 + 112.5 = 322.5 -> 323
    expect(regrow('kystau', 'spring', 210)).toBe(323);
    expect(regrow('zhailau', 'winter', 0)).toBe(0);
  });

  it('limits winter access by snow and by an ice crust in a жұт year', () => {
    expect(accessShare('kystau', 'summer', false)).toBe(1);
    expect(accessShare('kystau', 'winter', false)).toBe(0.8);
    expect(accessShare('kystau', 'winter', true)).toBeCloseTo(0.32, 10);
    expect(accessShare('zhailau', 'winter', false)).toBe(0.1);
  });

  it('counts hunger losses only below 70% of needs', () => {
    expect(lossesFor(600, 0.7)).toBe(0);
    expect(lossesFor(600, 1)).toBe(0);
    expect(lossesFor(600, 0.5)).toBe(60);
    expect(lossesFor(0, 0)).toBe(0);
  });

  it('allows lambing only in a well-fed spring', () => {
    expect(birthsFor(400, 'spring', 1)).toBe(60);
    expect(birthsFor(400, 'spring', 0.89)).toBe(0);
    expect(birthsFor(400, 'summer', 1)).toBe(0);
  });

  it('classifies trend and verdict at the boundaries', () => {
    expect(trendOf(400, 420)).toBe('growth');
    expect(trendOf(400, 419)).toBe('stable');
    expect(trendOf(400, 380)).toBe('decline');
    expect(verdictOf(400, 199, 100)).toBe('collapse');
    expect(verdictOf(400, 200, 69)).toBe('strained');
    expect(verdictOf(400, 200, 70)).toBe('balanced');
  });

  it('recognises the two preset plans', () => {
    expect(planKind(TRADITIONAL_PLAN)).toBe('traditional');
    expect(planKind(STAY_PLAN)).toBe('stay');
    expect(planKind({ ...TRADITIONAL_PLAN, winter: 'zhailau' })).toBe('custom');
  });
});

describe('nomad seasons model: full runs', () => {
  it('is deterministic for the same input', () => {
    expect(simulateNomadSeasons(DEFAULT_PARAMS)).toEqual(simulateNomadSeasons(DEFAULT_PARAMS));
  });

  it('runs three years of four seasons, starting in spring', () => {
    const result = simulateNomadSeasons(DEFAULT_PARAMS);
    expect(result.steps).toHaveLength(TOTAL_STEPS);
    expect(result.steps[0]).toMatchObject({ index: 1, year: 1, season: 'spring', pasture: 'kokteu' });
    expect(result.steps[11]).toMatchObject({ index: 12, year: 3, season: 'winter', pasture: 'kystau' });
  });

  it('keeps a 400-head herd balanced with the traditional rotation', () => {
    const result = simulateNomadSeasons(traditional(400));
    expect(result.steps[0]).toMatchObject({ eaten: 400, fedPct: 100, born: 60, herdEnd: 460, grass: { kokteu: 500 } });
    expect(result.finalHerd).toBe(608);
    expect(result.totalLosses).toBe(0);
    expect(result.minFedPct).toBe(100);
    expect(result.trend).toBe('growth');
    expect(result.verdict).toBe('balanced');
  });

  it('collapses the herd when the aul stays on one pasture all year', () => {
    const result = simulateNomadSeasons(stay(400));
    expect(result.steps[2]).toMatchObject({ season: 'autumn', eaten: 220, fedPct: 48, losses: 51, herdEnd: 409 });
    expect(result.finalHerd).toBeLessThan(200);
    expect(result.trend).toBe('decline');
    expect(result.verdict).toBe('collapse');
    expect(result.endGrassPct.kystau).toBeLessThan(25);
  });

  it('hits the herd in the winter of year 2 when жұт is on', () => {
    const calm = simulateNomadSeasons(traditional(400));
    const jut = simulateNomadSeasons(traditional(400, true));
    const winter = jut.steps.find((s) => s.year === JUT_YEAR && s.season === 'winter');
    expect(winter).toMatchObject({ harshWinter: true, accessible: 288, eaten: 288, fedPct: 54, losses: 41, herdEnd: 488 });
    expect(jut.steps.filter((s) => s.harshWinter)).toHaveLength(1);
    expect(jut.totalLosses).toBeGreaterThan(calm.totalLosses);
    expect(jut.finalHerd).toBeLessThan(calm.finalHerd);
  });

  it('shows the carrying limit: a large herd strains even with rotation', () => {
    const result = simulateNomadSeasons(traditional(600));
    expect(result.verdict).toBe('strained');
    expect(result.minFedPct).toBeLessThan(70);
  });

  it('never lets grass go below zero or above capacity, nor the herd below zero', () => {
    for (const params of [traditional(HERD_MIN), traditional(HERD_MAX, true), stay(HERD_MAX), stay(HERD_MIN)]) {
      const result = simulateNomadSeasons(params);
      for (const step of result.steps) {
        expect(step.herdEnd).toBeGreaterThanOrEqual(0);
        expect(step.eaten).toBeLessThanOrEqual(step.demand);
        for (const id of Object.keys(step.grass) as (keyof typeof step.grass)[]) {
          expect(step.grass[id]).toBeGreaterThanOrEqual(0);
          expect(step.grass[id]).toBeLessThanOrEqual(PASTURE_SPECS[id].capacity);
          expect(Number.isInteger(step.grass[id])).toBe(true);
        }
      }
    }
  });
});

describe('nomad seasons model: validation', () => {
  it('rejects a herd outside the allowed bounds', () => {
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, herd: HERD_MIN - 1 })).toThrow(ZodError);
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, herd: HERD_MAX + 1 })).toThrow(ZodError);
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, herd: -50 })).toThrow(ZodError);
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, herd: 400.5 })).toThrow(ZodError);
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, herd: Number.NaN })).toThrow(ZodError);
  });

  it('rejects an unknown pasture in the plan', () => {
    const plan = { ...TRADITIONAL_PLAN, summer: 'moon' } as unknown as NomadParams['plan'];
    expect(() => simulateNomadSeasons({ ...DEFAULT_PARAMS, plan })).toThrow(ZodError);
  });
});

describe('nomad seasons model: playback state', () => {
  it('shows full pastures and the spring camp before the first season', () => {
    const result = simulateNomadSeasons(DEFAULT_PARAMS);
    expect(stateAt(result, 0)).toEqual({ herd: 400, grassPct: { kokteu: 100, zhailau: 100, kuzeu: 100, kystau: 100 }, pasture: 'kokteu', season: 'spring', year: 1 });
  });

  it('follows the timeline and clamps past the end', () => {
    const result = simulateNomadSeasons(DEFAULT_PARAMS);
    expect(stateAt(result, 1).herd).toBe(460);
    expect(stateAt(result, 99)).toEqual(stateAt(result, TOTAL_STEPS));
  });
});

describe('nomad seasons: tutor summary', () => {
  it('builds a compact summary that fits the tutor message limit', () => {
    const result = simulateNomadSeasons(stay(400));
    const summary = buildExperimentSummary(result, { hypothesis: 'growth', checkAnswerId: CHECK_CORRECT_ID, checkCorrect: true });
    expect(summary.sim).toBe('nomad-seasons@1');
    expect(summary.hypothesisConfirmed).toBe(false);
    expect(summary.result.finalHerd).toBe(result.finalHerd);
    expect(summary.params.planKind).toBe('stay');
    const message = buildTutorMessage(summary);
    expect(message.length).toBeLessThanOrEqual(TUTOR_MESSAGE_LIMIT);
    expect(message).toContain('қайта есептеме');
    expect(JSON.parse(message.slice(message.indexOf('{')))).toEqual(summary);
  });

  it('has exactly one correct check option', () => {
    expect(CHECK_OPTIONS.filter((o) => o.id === CHECK_CORRECT_ID)).toHaveLength(1);
  });
});
