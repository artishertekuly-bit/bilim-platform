// Shared scene layout and colour mapping for the 3D scene and the 2D map. Pure functions.
import { accessShare, type PastureId, type Season } from '../../domain/nomad-seasons/model';

/** Pasture centres on the ground plane (x, z). The camp loops spring → summer → autumn → winter. */
export const PASTURE_POSITIONS: Readonly<Record<PastureId, readonly [number, number]>> = {
  kokteu: [-6, 0.5],
  zhailau: [0, -5.2],
  kuzeu: [6, 0.5],
  kystau: [0, 5.2],
};

/** Pasture centres on the 400×300 SVG map. */
export const MAP_POSITIONS: Readonly<Record<PastureId, readonly [number, number]>> = {
  kokteu: [82, 150],
  zhailau: [200, 84],
  kuzeu: [318, 150],
  kystau: [200, 218],
};

export const SKY_COLORS: Readonly<Record<Season, string>> = {
  spring: '#DCEAF3',
  summer: '#CFE3F1',
  autumn: '#EAE2D4',
  winter: '#E4E9EE',
};

export const GROUND_COLORS: Readonly<Record<Season, string>> = {
  spring: '#A9C47A',
  summer: '#BDBF74',
  autumn: '#C9AD72',
  winter: '#EEF1F4',
};

const DRY = '#C9B27B';
const LUSH = '#4F8A35';
const SNOW = '#F3F5F7';
const ICE = '#CFE2EE';

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(from: string, to: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Grass health drives the colour (dry → lush); in winter, snow covers what animals cannot reach. */
export function pastureColor(id: PastureId, grassPct: number, season: Season, harshWinter: boolean): string {
  const grass = mixHex(DRY, LUSH, grassPct / 100);
  if (season !== 'winter') return grass;
  const covered = 1 - accessShare(id, season, harshWinter);
  return mixHex(grass, harshWinter ? ICE : SNOW, 0.35 + covered * 0.55);
}

/** One sheep mesh/dot stands for this many animals. */
export const HERD_PER_MARK = 12;
export const MAX_HERD_MARKS = 90;

export function herdMarks(herd: number): number {
  return Math.min(MAX_HERD_MARKS, Math.ceil(herd / HERD_PER_MARK));
}

/** Deterministic golden-angle spiral around the camp, in local units. */
export function herdOffset(index: number): [number, number] {
  const angle = index * 2.399963;
  const radius = 1.15 + 0.17 * Math.sqrt(index);
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}
