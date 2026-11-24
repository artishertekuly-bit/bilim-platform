// 2D SVG fallback for the nomad seasons scene: used when WebGL is missing or fails, or in low-end mode.
// Shows the same state as the 3D scene from the same deterministic model output.
import { PASTURE_INFO } from '../../domain/nomad-seasons/content';
import { PASTURES, type PastureId, type Season } from '../../domain/nomad-seasons/model';
import { GROUND_COLORS, MAP_POSITIONS, herdMarks, herdOffset, pastureColor } from './layout';

export interface NomadMapProps {
  season: Season;
  pasture: PastureId;
  grassPct: Record<PastureId, number>;
  herd: number;
  harshWinter: boolean;
  reducedMotion: boolean;
}

const SHEEP = ['#F6F3EC', '#ECE3D2', '#F6F3EC', '#8A6A4B', '#F6F3EC', '#E2D6C0'];

function routePath(): string {
  const [ax, ay] = MAP_POSITIONS.kokteu;
  const [bx, by] = MAP_POSITIONS.zhailau;
  const [cx, cy] = MAP_POSITIONS.kuzeu;
  const [dx, dy] = MAP_POSITIONS.kystau;
  return `M${ax} ${ay} Q${ax + 10} ${by - 6} ${bx} ${by} Q${cx - 10} ${by - 6} ${cx} ${cy} Q${cx - 6} ${dy + 18} ${dx} ${dy} Q${ax + 6} ${dy + 18} ${ax} ${ay}`;
}

export default function NomadMap2D({ season, pasture, grassPct, herd, harshWinter, reducedMotion }: NomadMapProps) {
  const [campX, campY] = MAP_POSITIONS[pasture];
  const frozen = season === 'winter';
  const marks = herdMarks(herd);

  return (
    <svg viewBox="0 0 400 300" className="block h-full w-full" aria-hidden="true" data-testid="lab-map-2d">
      <rect width="400" height="300" fill={GROUND_COLORS[season]} />
      <path d="M0 58 L34 24 L62 46 L104 6 L146 48 L188 16 L230 52 L270 12 L312 50 L352 22 L400 54 L400 0 L0 0 Z" fill="#9A9C93" />
      <path d="M92 18 L104 6 L116 18 Z M178 26 L188 16 L198 26 Z M260 22 L270 12 L280 22 Z" fill="#F7F8F9" />
      <path d="M0 286 C80 270 140 296 200 284 C260 272 320 296 400 282" fill="none" stroke={frozen ? '#DDE9F1' : '#6FA8D0'} strokeWidth="12" />
      <ellipse cx="128" cy="252" rx="40" ry="16" fill={frozen ? '#E9EDF0' : '#9C9A6A'} />
      <ellipse cx="272" cy="252" rx="40" ry="16" fill={frozen ? '#E9EDF0' : '#9C9A6A'} />
      <path d={routePath()} fill="none" stroke="#6E675B" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="4 6" />

      {PASTURES.map((id) => {
        const [x, y] = MAP_POSITIONS[id];
        const active = id === pasture;
        return (
          <g key={id}>
            <ellipse
              cx={x}
              cy={y}
              rx="58"
              ry="34"
              fill={pastureColor(id, grassPct[id], season, harshWinter)}
              stroke={active ? '#111111' : 'rgba(17,17,17,0.14)'}
              strokeWidth={active ? 3 : 1}
            />
            <rect x={x - 46} y={y + 37} width="92" height="22" rx="11" fill={active ? '#111111' : '#FFFFFF'} stroke="#E2E0DB" />
            <text x={x} y={y + 52} textAnchor="middle" fontSize="12" fontWeight="600" fill={active ? '#FFFFFF' : '#111111'}>
              {PASTURE_INFO[id].title} · {grassPct[id]}%
            </text>
          </g>
        );
      })}

      <g
        data-testid="lab-map-camp"
        style={{ transform: `translate(${campX}px, ${campY}px)`, transition: reducedMotion ? 'none' : 'transform 700ms ease-in-out' }}
      >
        {Array.from({ length: marks }, (_, i) => {
          const [ox, oz] = herdOffset(i);
          return <circle key={i} cx={ox * 14} cy={oz * 8.5} r="3.1" fill={SHEEP[i % SHEEP.length]} stroke="rgba(17,17,17,0.35)" strokeWidth="0.6" />;
        })}
        <path d="M-14 7 L-14 -3 Q0 -20 14 -3 L14 7 Z" fill="#F2ECDF" stroke="#7A4E2A" strokeWidth="1.5" />
        <path d="M-14 -3 Q0 -9 14 -3" fill="none" stroke="#B03A2E" strokeWidth="2" />
        <rect x="-3" y="-1" width="6" height="8" fill="#9C3B2E" />
      </g>
    </svg>
  );
}
