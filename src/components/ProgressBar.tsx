interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  size?: 'sm' | 'md';
}

export default function ProgressBar({ value, max = 100, label, showPercent = true, size = 'md' }: ProgressBarProps) {
  const percent = Math.min(Math.round((value / max) * 100), 100);

  return (
    <div>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          {showPercent && <span className="text-xs font-medium">{percent}%</span>}
        </div>
      )}
      <div className={`bg-accent rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2'}`}>
        <div
          className="h-full bg-foreground rounded-full progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
