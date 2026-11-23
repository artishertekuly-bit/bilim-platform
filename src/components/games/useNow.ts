import { useEffect, useState } from 'react';

// Кері санауға арналған ағымдағы уақыт (мс). Таймердің өзі серверде: бұл тек көрсету үшін.
export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
