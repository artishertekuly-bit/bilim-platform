import { Sparkles } from 'lucide-react';
import { useVoiceAssistant } from '@/hooks/use-voice-assistant';
import VoiceAssistantModal from './VoiceAssistantModal';
import { cn } from '@/lib/utils';

interface VoiceAssistantFloatingTriggerProps {
  className?: string;
}

export default function VoiceAssistantFloatingTrigger({
  className,
}: VoiceAssistantFloatingTriggerProps) {
  const { isOpen, setIsOpen, openAssistant } = useVoiceAssistant();

  return (
    <>
      <div
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2',
          className,
        )}
      >
        <button
          type="button"
          onClick={openAssistant}
          className={cn(
            'group relative flex h-16 w-16 items-center justify-center rounded-full',
            'bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10',
            'shadow-[0_8px_28px_-6px_rgba(15,23,42,0.25)] transition-all duration-300',
            'hover:scale-105 hover:shadow-[0_12px_32px_-6px_rgba(15,23,42,0.35)] active:scale-95',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25',
          )}
          aria-label="Дауыстық көмекшіні ашу"
          title="Sana Voice AI — Тақиялы ақылды көмекші"
        >
          {/* Sparkle icon */}
          <Sparkles
            size={13}
            className="absolute top-0.5 right-0.5 text-amber-400 z-20 opacity-90"
          />

          {/* Mini Wide Taqiya Mascot */}
          <svg
            viewBox="0 0 280 200"
            className="w-13 h-10 relative z-10 group-hover:scale-105 transition-transform"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Бас және Дене (Жалпақ сүйкімді моти) */}
            <path
              d="M 82,78 C 42,94 24,116 28,134 C 34,158 64,166 140,166 C 216,166 246,158 252,134 C 256,116 238,94 198,78 Z"
              fill="#FFFFFF"
              stroke="#111827"
              strokeWidth="12"
              strokeLinejoin="round"
            />
            {/* Беттің қызғылт румянеці */}
            <ellipse cx="62" cy="140" rx="12" ry="7" fill="#FB7185" opacity="0.45" />
            <ellipse cx="218" cy="140" rx="12" ry="7" fill="#FB7185" opacity="0.45" />
            {/* Көздер */}
            <ellipse cx="102" cy="128" rx="11" ry="16" fill="#111827" />
            <circle cx="98" cy="122" r="3.5" fill="#FFFFFF" />
            <ellipse cx="178" cy="128" rx="11" ry="16" fill="#111827" />
            <circle cx="174" cy="122" r="3.5" fill="#FFFFFF" />
            {/* Күлкі */}
            <path d="M 132,130 Q 140,140 148,130 Z" fill="#111827" />
            {/* Тақия күмбезі */}
            <path
              d="M 82,58 C 82,28 104,20 140,20 C 176,20 198,28 198,58 Z"
              fill="#FFFFFF"
              stroke="#111827"
              strokeWidth="10"
              strokeLinejoin="round"
            />
            {/* Сегменттер */}
            <path d="M 140,20 L 140,58" stroke="#111827" strokeWidth="7" />
            <path d="M 140,20 Q 106,34 98,58" stroke="#111827" strokeWidth="6" />
            <path d="M 140,20 Q 174,34 182,58" stroke="#111827" strokeWidth="6" />
            {/* Тақияның қалың қара жиегі */}
            <path
              d="M 72,60 C 100,54 180,54 208,60 C 212,60 214,76 208,80 C 180,84 100,84 72,80 C 66,76 68,60 72,60 Z"
              fill="#111827"
            />
          </svg>
        </button>
      </div>

      <VoiceAssistantModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
