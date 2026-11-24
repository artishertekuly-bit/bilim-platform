import { describe, expect, it } from 'vitest';

import { NOMAD_SEASONS_META } from '../domain/nomad-seasons/meta';
import { SimulationMetaSchema } from '../domain/schema';
import { buildRegistry, getSimulation, listSimulations, RegistryError, type SimulationRegistration } from './registry';

const load: SimulationRegistration['load'] = () => Promise.resolve({ default: () => null });

describe('simulation registry', () => {
  it('registers the nomad seasons simulation with valid metadata', () => {
    const entry = getSimulation('nomad-seasons');
    expect(entry).toBeDefined();
    expect(entry?.meta.subject).toBe('history');
    expect(entry?.meta.simplifiedModel).toBe(true);
    expect(SimulationMetaSchema.safeParse(entry?.meta).success).toBe(true);
    expect(listSimulations().map((s) => s.meta.slug)).toContain('nomad-seasons');
  });

  it('returns undefined for unknown or missing slugs', () => {
    expect(getSimulation('does-not-exist')).toBeUndefined();
    expect(getSimulation(undefined)).toBeUndefined();
  });

  it('rejects duplicate slugs', () => {
    expect(() => buildRegistry([{ meta: NOMAD_SEASONS_META, load }, { meta: NOMAD_SEASONS_META, load }])).toThrow(RegistryError);
  });

  it('rejects invalid metadata', () => {
    const bad = { ...NOMAD_SEASONS_META, slug: 'Bad Slug' };
    expect(() => buildRegistry([{ meta: bad, load }])).toThrow(/Invalid simulation/);
    const badRange = { ...NOMAD_SEASONS_META, gradeRange: [9, 5] as [number, number] };
    expect(() => buildRegistry([{ meta: badRange, load }])).toThrow(RegistryError);
  });

  it('rejects parameters with defaults outside their bounds', () => {
    const parameters = NOMAD_SEASONS_META.parameters.map((p) => (p.kind === 'number' ? { ...p, defaultValue: p.max + 1 } : p));
    expect(SimulationMetaSchema.safeParse({ ...NOMAD_SEASONS_META, parameters }).success).toBe(false);
  });

  it('rejects duplicate parameter keys and choice defaults that are not options', () => {
    const dup = [...NOMAD_SEASONS_META.parameters, NOMAD_SEASONS_META.parameters[0]];
    expect(SimulationMetaSchema.safeParse({ ...NOMAD_SEASONS_META, parameters: dup }).success).toBe(false);
    const parameters = NOMAD_SEASONS_META.parameters.map((p) => (p.kind === 'choice' ? { ...p, defaultValue: 'nowhere' } : p));
    expect(SimulationMetaSchema.safeParse({ ...NOMAD_SEASONS_META, parameters }).success).toBe(false);
  });

  it('rejects a registration without a loader', () => {
    const broken = { meta: NOMAD_SEASONS_META, load: undefined } as unknown as SimulationRegistration;
    expect(() => buildRegistry([broken])).toThrow(/no loader/);
  });
});
