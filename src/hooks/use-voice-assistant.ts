import { useCallback, useEffect, useState } from 'react';

const VOICE_ASSISTANT_EVENT = 'bilim:voice-assistant-toggle';

export function openVoiceAssistant() {
  window.dispatchEvent(new CustomEvent(VOICE_ASSISTANT_EVENT, { detail: { open: true } }));
}

export function closeVoiceAssistant() {
  window.dispatchEvent(new CustomEvent(VOICE_ASSISTANT_EVENT, { detail: { open: false } }));
}

export function toggleVoiceAssistant() {
  window.dispatchEvent(new CustomEvent(VOICE_ASSISTANT_EVENT, { detail: { toggle: true } }));
}

export function useVoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean; toggle?: boolean }>;
      if (customEvent.detail?.toggle) {
        setIsOpen((prev) => !prev);
      } else if (typeof customEvent.detail?.open === 'boolean') {
        setIsOpen(customEvent.detail.open);
      }
    };

    window.addEventListener(VOICE_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(VOICE_ASSISTANT_EVENT, handler);
  }, []);

  const openAssistant = useCallback(() => openVoiceAssistant(), []);
  const closeAssistant = useCallback(() => closeVoiceAssistant(), []);
  const toggleAssistant = useCallback(() => toggleVoiceAssistant(), []);

  return {
    isOpen,
    setIsOpen,
    openAssistant,
    closeAssistant,
    toggleAssistant,
  };
}
