import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { VoiceEmotion, VoiceState } from '@/lib/voice-api';

interface SanaTaqiyaAvatarProps {
  state: VoiceState;
  emotion: VoiceEmotion;
  audioLevel?: number; // 0..100
  isMuted?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function SanaTaqiyaAvatar({
  state,
  emotion,
  audioLevel = 0,
  isMuted = false,
  className,
  onClick,
}: SanaTaqiyaAvatarProps) {
  // Автоматты көз жыпылықтату (Natural Blinking)
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 3500 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Аудио деңгейіне қарай жеңіл серпілу
  const activeAudioScale =
    (state === 'listening' || state === 'speaking') && !isMuted
      ? (audioLevel / 100) * 0.06
      : 0;
  const scaleFromAudio = 1 + activeAudioScale;

  // Ойлану кезінде көздің жоғары-оңға қарауы
  const eyeOffsetX = state === 'thinking' ? 5 : 0;
  const eyeOffsetY = state === 'thinking' ? -5 : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center select-none cursor-pointer group',
        className,
      )}
    >
      <style>{`
        @keyframes taqiya-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes taqiya-tilt {
          0%, 100% { transform: rotate(0deg) translateY(0px); }
          35% { transform: rotate(-4deg) translateY(-3px); }
          70% { transform: rotate(4deg) translateY(-2px); }
        }
        @keyframes taqiya-speak-bob {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-3px) scale(1.015); }
        }
        .animate-taqiya-idle {
          animation: taqiya-float 3.4s ease-in-out infinite;
        }
        .animate-taqiya-thinking {
          animation: taqiya-tilt 2.6s ease-in-out infinite;
        }
        .animate-taqiya-speaking {
          animation: taqiya-speak-bob 0.45s ease-in-out infinite;
        }
      `}</style>

      <div
        style={{
          transform: `scale(${scaleFromAudio})`,
          transition: 'transform 100ms ease-out',
        }}
        className={cn(
          'w-full h-full flex items-center justify-center transition-transform duration-300',
          state === 'idle' && 'animate-taqiya-idle',
          state === 'listening' && 'animate-taqiya-idle',
          state === 'thinking' && 'animate-taqiya-thinking',
          state === 'speaking' && 'animate-taqiya-speaking',
        )}
      >
        <svg
          viewBox="0 0 360 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-[220px] max-h-[220px] drop-shadow-sm"
        >
          {/* 1. Құлаққаптар (Audio Earpieces — дыбыс деңгейімен жарқырайды) */}
          <rect
            x="40"
            y="168"
            width="30"
            height="68"
            rx="15"
            fill="#0F172A"
          />
          <rect
            x="290"
            y="168"
            width="30"
            height="68"
            rx="15"
            fill="#0F172A"
          />
          <rect
            x="48"
            y="182"
            width="8"
            height="40"
            rx="4"
            fill={state === 'speaking' ? '#06B6D4' : state === 'listening' && !isMuted ? '#10B981' : '#38BDF8'}
          />
          <rect
            x="304"
            y="182"
            width="8"
            height="40"
            rx="4"
            fill={state === 'speaking' ? '#06B6D4' : state === 'listening' && !isMuted ? '#10B981' : '#38BDF8'}
          />

          {/* 2. Кейіпкердің үйлесімді домалақ басы */}
          <rect
            x="62"
            y="96"
            width="236"
            height="206"
            rx="103"
            fill="#FFFFFF"
            stroke="#0F172A"
            strokeWidth="14"
          />

          {/* 3. Тақияның жоғарғы күмбезі */}
          <path
            d="M 80 128 C 88 64, 130 38, 180 38 C 230 38, 272 64, 280 128 Z"
            fill="#F8FAFC"
            stroke="#0F172A"
            strokeWidth="14"
            strokeLinejoin="round"
          />
          {/* Тақия күмбезінің тігістері */}
          <path
            d="M 180 40 L 180 116"
            stroke="#0F172A"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 180 40 C 148 60, 130 84, 124 116"
            stroke="#0F172A"
            strokeWidth="7.5"
            strokeLinecap="round"
          />
          <path
            d="M 180 40 C 212 60, 230 84, 236 116"
            stroke="#0F172A"
            strokeWidth="7.5"
            strokeLinecap="round"
          />

          {/* 4. Тақияның маңдайдағы қара жиегі және ою өрнегі */}
          <path
            d="M 68 116 Q 180 102 292 116 C 300 118, 302 140, 292 146 Q 180 132 68 146 C 58 140, 60 118, 68 116 Z"
            fill="#0F172A"
          />
          <path
            d="M 116 129 L 130 121 L 144 129 M 166 126 L 180 118 L 194 126 M 216 129 L 230 121 L 244 129"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.88"
          />

          {/* 5. Беттің жеңіл шырайы */}
          <ellipse cx="102" cy="224" rx="15" ry="8" fill="#FB7185" opacity="0.32" />
          <ellipse cx="258" cy="224" rx="15" ry="8" fill="#FB7185" opacity="0.32" />

          {/* 6. Көздері мен қастары */}
          <g
            style={{
              transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)`,
              transition: 'transform 220ms ease-out',
            }}
          >
            {/* Жұмсақ қастар */}
            <path
              d="M 118 172 Q 134 165 150 171"
              stroke="#0F172A"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 210 171 Q 226 165 242 172"
              stroke="#0F172A"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />

            {isBlinking ? (
              <>
                <path
                  d="M 118 200 Q 134 208 150 200"
                  stroke="#0F172A"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <path
                  d="M 210 200 Q 226 208 242 200"
                  stroke="#0F172A"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <ellipse cx="134" cy="198" rx="16" ry="21" fill="#0F172A" />
                <circle cx="128" cy="191" r="6" fill="#FFFFFF" />
                <circle cx="140" cy="204" r="2.5" fill="#FFFFFF" opacity="0.8" />

                <ellipse cx="226" cy="198" rx="16" ry="21" fill="#0F172A" />
                <circle cx="220" cy="191" r="6" fill="#FFFFFF" />
                <circle cx="232" cy="204" r="2.5" fill="#FFFFFF" opacity="0.8" />
              </>
            )}
          </g>

          {/* 7. Аузы (Күйге және дыбыс деңгейіне сай өзгереді) */}
          {state === 'thinking' ? (
            <ellipse cx="180" cy="236" rx="9" ry="7" fill="#0F172A" />
          ) : state === 'speaking' ? (
            <ellipse
              cx="180"
              cy={234 + Math.min(5, (audioLevel / 100) * 6)}
              rx={14 + Math.min(6, (audioLevel / 100) * 7)}
              ry={6 + Math.min(16, (audioLevel / 100) * 20)}
              fill="#0F172A"
              style={{
                transition: 'ry 0.06s ease-out, rx 0.06s ease-out, cy 0.06s ease-out',
              }}
            />
          ) : emotion === 'happy' ? (
            <path
              d="M 156 228 Q 180 248 204 228"
              stroke="#0F172A"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <path
              d="M 160 232 Q 180 244 200 232"
              stroke="#0F172A"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
