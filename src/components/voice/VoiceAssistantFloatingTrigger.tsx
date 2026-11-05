import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Sparkles } from 'lucide-react';

import VoiceAssistantModal from '@/components/voice/VoiceAssistantModal';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

function extractRouteParam(pathname: string, prefix: string): string | undefined {
  const regex = new RegExp(`^/${prefix}/([^/?#]+)`);
  const match = pathname.match(regex);
  if (!match?.[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export default function VoiceAssistantFloatingTrigger() {
  const { user, session } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const courseId = useMemo(
    () => extractRouteParam(location.pathname, 'courses'),
    [location.pathname],
  );
  const lessonId = useMemo(
    () => extractRouteParam(location.pathname, 'lessons'),
    [location.pathname],
  );

  if (!user || !session?.access_token) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-24 right-3 z-40 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Аудио көмекші"
          title="Аудио көмекші"
          className={cn(
            'group relative flex h-12 w-12 items-center justify-center rounded-full sm:h-14 sm:w-14',
            'bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground',
            'shadow-[0_10px_30px_-6px_rgba(37,99,235,0.55)] transition-all duration-300',
            'hover:-translate-y-1 hover:scale-105 hover:shadow-[0_14px_36px_-6px_rgba(37,99,235,0.7)]',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-30"
          />
          <Mic size={20} strokeWidth={2.2} className="relative z-10 sm:h-[22px] sm:w-[22px]" />
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow-sm sm:h-5 sm:w-5"
          >
            <Sparkles size={10} strokeWidth={2.5} />
          </span>
        </button>
      </div>

      <VoiceAssistantModal
        open={open}
        onOpenChange={setOpen}
        courseId={courseId}
        lessonId={lessonId}
      />
    </>
  );
}
