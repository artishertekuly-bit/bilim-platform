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
          'fixed bottom-6 right-6 z-40 flex items-center',
          className,
        )}
      >
        <button
          type="button"
          onClick={openAssistant}
          className={cn(
            'group relative flex h-14 w-14 sm:h-15 sm:w-15 items-center justify-center rounded-2xl',
            'bg-card/95 dark:bg-zinc-900/95 backdrop-blur-xl',
            'border border-border/80 dark:border-white/10',
            'shadow-[0_10px_30px_-8px_rgba(15,23,42,0.22)] transition-all duration-300',
            'hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-8px_rgba(15,23,42,0.32)] active:translate-y-0 active:scale-95',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
          aria-label="Дауыстық көмекшіні ашу"
          title="Sana Voice AI — Дауыстық көмекші"
        >
          {/* Sana AI Assistant Mascot (Proper round head + Kazakh Taqiya + Audio Headphones) */}
          <svg
            viewBox="0 0 240 240"
            className="w-11 h-11 relative z-10 transition-transform duration-300 group-hover:scale-105"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Құлаққаптар (Audio Assistant Earpieces) */}
            <rect
              x="22"
              y="112"
              width="22"
              height="48"
              rx="11"
              fill="#0F172A"
            />
            <rect
              x="196"
              y="112"
              width="22"
              height="48"
              rx="11"
              fill="#0F172A"
            />
            <rect
              x="27"
              y="122"
              width="6"
              height="28"
              rx="3"
              fill="#38BDF8"
            />
            <rect
              x="207"
              y="122"
              width="6"
              height="28"
              rx="3"
              fill="#38BDF8"
            />

            {/* Домалақ үйлесімді бас пішіні */}
            <rect
              x="38"
              y="64"
              width="164"
              height="144"
              rx="72"
              fill="#FFFFFF"
              stroke="#0F172A"
              strokeWidth="10"
            />

            {/* Тақияның жоғарғы күмбезі */}
            <path
              d="M 50 86 C 56 42, 86 24, 120 24 C 154 24, 184 42, 190 86 Z"
              fill="#F8FAFC"
              stroke="#0F172A"
              strokeWidth="10"
              strokeLinejoin="round"
            />
            {/* Тақия тігістері */}
            <path
              d="M 120 26 L 120 76"
              stroke="#0F172A"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 120 26 C 98 40, 86 56, 82 76"
              stroke="#0F172A"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
            <path
              d="M 120 26 C 142 40, 154 56, 158 76"
              stroke="#0F172A"
              strokeWidth="5.5"
              strokeLinecap="round"
            />

            {/* Тақияның маңдайдағы қара жиегі + ою сызығы */}
            <path
              d="M 42 78 Q 120 68 198 78 C 203 79, 205 94, 198 98 Q 120 88 42 98 C 35 94, 37 79, 42 78 Z"
              fill="#0F172A"
            />
            <path
              d="M 78 86 L 88 81 L 98 86 M 110 84 L 120 79 L 130 84 M 142 86 L 152 81 L 162 86"
              stroke="#FFFFFF"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />

            {/* Көздер */}
            <ellipse cx="88" cy="136" rx="11" ry="14" fill="#0F172A" />
            <circle cx="84" cy="131" r="4" fill="#FFFFFF" />
            <ellipse cx="152" cy="136" rx="11" ry="14" fill="#0F172A" />
            <circle cx="148" cy="131" r="4" fill="#FFFFFF" />

            {/* Беттің жеңіл шырайы */}
            <ellipse cx="64" cy="154" rx="10" ry="5.5" fill="#FB7185" opacity="0.35" />
            <ellipse cx="176" cy="154" rx="10" ry="5.5" fill="#FB7185" opacity="0.35" />

            {/* Жылы күлкі */}
            <path
              d="M 104 156 Q 120 170 136 156"
              stroke="#0F172A"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      <VoiceAssistantModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
