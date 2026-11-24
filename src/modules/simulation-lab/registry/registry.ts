// Typed, code-only registry of Simulation Lab entries. Every entry is a static import here:
// nothing is ever loaded or executed from database values (the DB only stores the slug as a key).
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { NOMAD_SEASONS_META } from '../domain/nomad-seasons/meta';
import { SimulationMetaSchema, type SimulationMeta } from '../domain/schema';

export interface SimulationEntryProps {
  /** False in the dev test harness and for signed-out previews: attempts are not saved. */
  saveEnabled: boolean;
}

export type SimulationLoader = () => Promise<{ default: ComponentType<SimulationEntryProps> }>;

export interface SimulationRegistration {
  meta: SimulationMeta;
  load: SimulationLoader;
}

export interface RegisteredSimulation extends SimulationRegistration {
  Component: LazyExoticComponent<ComponentType<SimulationEntryProps>>;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/** Validates every registration and fails loudly on a bad or duplicate entry. */
export function buildRegistry(registrations: readonly SimulationRegistration[]): ReadonlyMap<string, RegisteredSimulation> {
  const map = new Map<string, RegisteredSimulation>();
  for (const registration of registrations) {
    const parsed = SimulationMetaSchema.safeParse(registration.meta);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new RegistryError(`Invalid simulation "${String(registration.meta?.slug)}": ${issue.path.join('.')} ${issue.message}`);
    }
    if (typeof registration.load !== 'function') throw new RegistryError(`Simulation "${parsed.data.slug}" has no loader`);
    if (map.has(parsed.data.slug)) throw new RegistryError(`Duplicate simulation slug "${parsed.data.slug}"`);
    map.set(parsed.data.slug, { meta: parsed.data, load: registration.load, Component: lazy(registration.load) });
  }
  return map;
}

export const REGISTRATIONS: readonly SimulationRegistration[] = [
  { meta: NOMAD_SEASONS_META, load: () => import('../components/nomad-seasons/NomadSeasonsLab') },
];

const REGISTRY = buildRegistry(REGISTRATIONS);

export function listSimulations(): RegisteredSimulation[] {
  return [...REGISTRY.values()];
}

export function getSimulation(slug: string | undefined): RegisteredSimulation | undefined {
  return slug ? REGISTRY.get(slug) : undefined;
}
