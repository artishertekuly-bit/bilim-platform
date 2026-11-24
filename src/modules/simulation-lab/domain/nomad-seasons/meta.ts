// Registry metadata for the nomad seasons simulation. Pure data; validated by SimulationMetaSchema.
import type { SimulationMeta } from '../schema';
import { OBJECTIVES, PASTURE_INFO, SEASON_TITLES } from './content';
import { DEFAULT_HERD, HERD_MAX, HERD_MIN, HERD_STEP, MODEL_VERSION, PASTURES, SEASONS, TRADITIONAL_PLAN } from './model';

export const NOMAD_SEASONS_SLUG = 'nomad-seasons';

const pastureOptions = PASTURES.map((id) => ({ id, label: PASTURE_INFO[id].title }));

export const NOMAD_SEASONS_META: SimulationMeta = {
  id: NOMAD_SEASONS_SLUG,
  slug: NOMAD_SEASONS_SLUG,
  subject: 'history',
  gradeRange: [5, 8],
  title: 'Көшпелілердің маусымдық көші',
  summary: 'Ауылды төрт маусымдық жайылым арасында көшіріп, мал мен шөптің үш жылда қалай өзгеретінін бақыла.',
  objectives: [...OBJECTIVES],
  parameters: [
    { kind: 'number', key: 'herd', label: 'Мал саны', unit: 'бас', min: HERD_MIN, max: HERD_MAX, step: HERD_STEP, defaultValue: DEFAULT_HERD },
    ...SEASONS.map((season) => ({
      kind: 'choice' as const,
      key: `plan${season[0].toUpperCase()}${season.slice(1)}`,
      label: `${SEASON_TITLES[season]} жайылымы`,
      options: pastureOptions,
      defaultValue: TRADITIONAL_PLAN[season],
    })),
    { kind: 'boolean', key: 'jut', label: 'Екінші жылы жұт болсын', defaultValue: false },
  ],
  outputs: [
    { key: 'finalHerd', label: 'Үш жылдан кейінгі мал саны', unit: 'бас' },
    { key: 'totalLosses', label: 'Аштықтан шыққан шығын', unit: 'бас' },
    { key: 'minFedPct', label: 'Ең аш маусымда қажетінің өтелуі', unit: '%' },
    { key: 'endAvgGrassPct', label: 'Жайылымдардың соңғы жағдайы', unit: '%' },
  ],
  version: MODEL_VERSION,
  estimatedMinutes: 10,
  simplifiedModel: true,
};
