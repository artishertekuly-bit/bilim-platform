import { Mic, Sparkles } from 'lucide-react';
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
            'bg-card border-2 border-border shadow-2xl transition-all duration-300',
            'hover:scale-110 active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20',
          )}
          aria-label="Дауыстық көмекшіні ашу"
          title="Sana Voice AI — Тақиялы ақылды көмекші"
        >
          {/* Subtle pulse wave */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-500 opacity-40 blur-xs transition-opacity duration-300 group-hover:opacity-80 animate-pulse" />

          {/* Sparkle icon */}
          <Sparkles
            size={14}
            className="absolute -top-1 -right-1 text-amber-400 animate-bounce z-20"
          />

          {/* Mini Taqiya Mascot */}
          <svg
            viewBox="0 0 200 230"
            className="w-11 h-11 relative z-10 group-hover:scale-105 transition-transform"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Бас және Дене */}
            <path
              d="M 52,92 C 26,112 22,156 46,182 C 66,204 134,204 154,182 C 178,156 174,112 148,92 C 126,92 74,92 52,92 Z"
              fill="#FFFFFF"
              stroke="#111827"
              strokeWidth="9"
              strokeLinejoin="round"
            />
            {/* Беттің қызғылт ұшқыны */}
            <ellipse cx="50" cy="154" rx="10" ry="6" fill="#FB7185" opacity="0.45" />
            <ellipse cx="150" cy="154" rx="10" ry="6" fill="#FB7185" opacity="0.45" />
            {/* Көздер */}
            <ellipse cx="74" cy="144" rx="9" ry="14" fill="#111827" />
            <circle cx="71" cy="139" r="3" fill="#FFFFFF" />
            <ellipse cx="126" cy="144" rx="9" ry="14" fill="#111827" />
            <circle cx="123" cy="139" r="3" fill="#FFFFFF" />
            {/* Күлкі */}
            <path d="M 91,150 Q 100,161 109,150 Z" fill="#111827" />
            {/* Тақия күмбезі */}
            <path
              d="M 52,78 C 52,42 74,28 100,28 C 126,28 148,42 148,78 Z"
              fill="#FFFFFF"
              stroke="#111827"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            {/* Сегменттер */}
            <path d="M 100,28 L 100,78" stroke="#111827" strokeWidth="5" />
            <path d="M 100,28 Q 72,48 64,78" stroke="#111827" strokeWidth="4.5" />
            <path d="M 100,28 Q 128,48 136,78" stroke="#111827" strokeWidth="4.5" />
            {/* Қалың жиек */}
            <path
              d="M 44,76 C 44,70 156,70 156,76 L 156,92 C 156,98 44,98 44,92 Z"
              fill="#111827"
            />
          </svg>

          {/* Tiny Active Mic Badge */}
          <span className="absolute -bottom-1 -right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md border-2 border-card">
            <Mic size={12} />
          </span>
        </button>
      </div>

      <VoiceAssistantModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
