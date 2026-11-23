// Сыныпқа қосылу кодының QR-ы (D33): QR-да тек код болады (api §5.2).
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

export default function JoinCodeQr({ code, size = 168 }: { code: string; size?: number }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(code, 'Alphanumeric');
    qr.make();
    const count = qr.getModuleCount();
    const dark: [number, number][] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) dark.push([row, col]);
      }
    }
    return { count, dark };
  }, [code]);

  const quiet = 2;
  const total = cells.count + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={`Қосылу коды ${code}`}
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
    >
      <rect width={total} height={total} fill="#FFFFFF" />
      {cells.dark.map(([row, col]) => (
        <rect key={`${row}-${col}`} x={col + quiet} y={row + quiet} width={1} height={1} fill="#111111" />
      ))}
    </svg>
  );
}
