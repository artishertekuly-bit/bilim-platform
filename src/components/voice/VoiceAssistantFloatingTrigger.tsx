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
            'group relative flex h-14 w-14 items-center justify-center rounded-full',
            'bg-gradient-to-tr from-primary via-indigo-600 to-cyan-500 text-white',
            'shadow-xl shadow-primary/30 transition-all duration-300',
            'hover:scale-110 active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20',
          )}
          aria-label="Дауыстық көмекшіні ашу"
          title="Sana Voice AI — Нақты уақыттағы сұхбат"
        >
          {/* Subtle pulse wave */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary to-cyan-500 opacity-40 blur-xs transition-opacity duration-300 group-hover:opacity-80 animate-pulse" />

          {/* Sparkle icon */}
          <Sparkles
            size={14}
            className="absolute top-2 right-2 text-amber-300 animate-bounce"
          />

          {/* Main mic icon */}
          <Mic size={24} className="relative z-10" />
        </button>
      </div>

      <VoiceAssistantModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
