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
            'group relative flex h-15 w-15 items-center justify-center rounded-full',
            'bg-white dark:bg-zinc-900 border border-border/80 dark:border-white/15',
            'shadow-[0_8px_26px_-6px_rgba(15,23,42,0.22)] transition-all duration-300',
            'hover:scale-105 hover:shadow-[0_12px_32px_-6px_rgba(15,23,42,0.32)] active:scale-95',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
          )}
          aria-label="Дауыстық көмекшіні ашу"
          title="Sana Voice AI — Дауыстық көмекші"
        >
          {/* Жинақы әрі үйлесімді Тақиялы кейіпкер (жұлдызшасыз, бауырсақ емес пропорциямен) */}
          <svg
            viewBox="0 0 400 360"
            className="w-11 h-11 relative z-10 transition-transform duration-300 group-hover:scale-105"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 1. Тақияның жоғарғы күмбезі */}
            <path
              d="M 102 132 C 122 70, 162 46, 200 46 C 238 46, 278 70, 298 132 Z"
              fill="#FFFFFF"
              stroke="#0F172A"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 198 48 C 176 70, 160 98, 150 130"
              stroke="#0F172A"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M 202 48 C 224 70, 240 98, 250 130"
              stroke="#0F172A"
              strokeWidth="10"
              strokeLinecap="round"
            />

            {/* 2. Кейіпкердің жинақы домалақ басы (жалпақ бауырсақ емес, тік үйлесімді) */}
            <path
              d="M 104 152 C 82 174, 78 214, 82 250 C 86 290, 118 314, 162 314 L 238 314 C 282 314, 314 290, 318 250 C 322 214, 318 174, 296 152 Z"
              fill="#FFFFFF"
              stroke="#0F172A"
              strokeWidth="20"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 3. Тақияның төменгі қара жиегі */}
            <path
              d="M 96 118 Q 200 126 304 118 C 314 118, 317 126, 316 143 C 315 159, 310 165, 298 166 Q 200 175 102 166 C 90 165, 85 159, 84 143 C 83 126, 86 118, 96 118 Z"
              fill="#0F172A"
            />

            {/* 4. Көздері */}
            <ellipse cx="154" cy="226" rx="16" ry="25" fill="#0F172A" />
            <ellipse cx="246" cy="226" rx="16" ry="25" fill="#0F172A" />

            {/* 5. Күлкісі */}
            <path
              d="M 182 246 Q 182 266 200 266 Q 218 266 218 246 Z"
              fill="#0F172A"
            />
          </svg>
        </button>
      </div>

      <VoiceAssistantModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
