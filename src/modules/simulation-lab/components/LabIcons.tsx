// Playback icons for the Simulation Lab toolbar (stroke style matches src/components/bl/icons).
type IconProps = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function PlayIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PauseIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </svg>
  );
}

export function NextIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 5v14l9-7z" fill="currentColor" stroke="none" />
      <path d="M18 5v14" strokeWidth={2.4} />
    </svg>
  );
}

export function ResetIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}

export function ExpandIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function CollapseIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}
