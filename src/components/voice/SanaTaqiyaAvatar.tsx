import React, { useEffect, useState } from 'react';
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
  const eyeOffsetY = state === 'thinking' ? -6 : 0;

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
          50% { transform: translateY(-6px); }
        }
        @keyframes taqiya-tilt {
          0%, 100% { transform: rotate(0deg) translateY(0px); }
          35% { transform: rotate(-6deg) translateY(-4px); }
          70% { transform: rotate(5deg) translateY(-2px); }
        }
        @keyframes taqiya-speak-bob {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.02, 0.98); }
        }
        @keyframes taqiya-mouth-talk {
          0%, 100% { transform: scaleY(0.85); }
          25% { transform: scaleY(1.65); }
          50% { transform: scaleY(0.6); }
          75% { transform: scaleY(1.45); }
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
        .animate-taqiya-mouth {
          transform-origin: 200px 252px;
          animation: taqiya-mouth-talk 0.36s ease-in-out infinite;
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
          viewBox="0 0 400 360"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full max-w-[260px] max-h-[260px] drop-shadow-sm"
        >
          {/* 1. ТАҚИЯНЫҢ ЖОҒАРҒЫ КҮМБЕЗІ (Ақ іші + қара контур және тігіс сызықтары) */}
          <path
            d="M 92 132 C 116 74, 160 52, 200 52 C 240 52, 284 74, 308 132 Z"
            fill="#FFFFFF"
            stroke="#000000"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Тақия күмбезінің ішкі екі сызығы */}
          <path
            d="M 198 53 C 174 74, 155 100, 144 130"
            stroke="#000000"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M 202 53 C 226 74, 245 100, 256 130"
            stroke="#000000"
            strokeWidth="9"
            strokeLinecap="round"
          />

          {/* 2. КЕЙІПКЕРДІҢ ЖАЛПАҚ БАСЫ / ДЕНЕСІ (Қалың қара контурлы моти/бауырсақ пішіні) */}
          <path
            d="M 92 160 C 56 178, 50 220, 55 252 C 60 288, 92 310, 142 310 L 258 310 C 308 310, 340 288, 345 252 C 350 220, 344 178, 308 160 Z"
            fill="#FFFFFF"
            stroke="#000000"
            strokeWidth="22"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 3. ТАҚИЯНЫҢ ТӨМЕНГІ ҚАРА ЖИЕГІ (Біртұтас қанық қара жолақ) */}
          <path
            d="M 86 120 Q 200 128 314 120 C 324 120, 327 128, 326 145 C 325 162, 320 168, 308 169 Q 200 178 92 169 C 80 168, 75 162, 74 145 C 73 128, 76 120, 86 120 Z"
            fill="#000000"
          />

          {/* 4. КӨЗДЕРІ */}
          <g
            style={{
              transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)`,
              transition: 'transform 250ms ease-out',
            }}
          >
            {isBlinking ? (
              /* Көзді жыпылықтатқан кездегі сызық */
              <>
                <path
                  d="M 132 232 Q 150 240 168 232"
                  stroke="#000000"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M 232 232 Q 250 240 268 232"
                  stroke="#000000"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              </>
            ) : emotion === 'happy' ? (
              /* Қуанған кездегі күлімдеген көздер (^ ^) */
              <>
                <path
                  d="M 132 238 Q 150 212 168 238"
                  stroke="#000000"
                  strokeWidth="12"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 232 238 Q 250 212 268 238"
                  stroke="#000000"
                  strokeWidth="12"
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : (
              /* Суреттегідей стандартты қара сопақша көздер */
              <>
                <ellipse cx="150" cy="232" rx="18" ry="28" fill="#000000" />
                <ellipse cx="250" cy="232" rx="18" ry="28" fill="#000000" />
              </>
            )}
          </g>

          {/* 5. АУЗЫ (Күйге байланысты өзгереді) */}
          {state === 'thinking' ? (
            /* Ойланғанда кішкентай дөңгелек ауыз */
            <ellipse cx="200" cy="256" rx="10" ry="8" fill="#000000" />
          ) : state === 'speaking' ? (
            /* Сөйлегенде ашылып-жабылатын ауыз (Lip-sync) */
            <path
              d="M 180 248 Q 180 272 200 272 Q 220 272 220 248 Z"
              fill="#000000"
              className="animate-taqiya-mouth"
            />
          ) : (
            /* Суреттегідей жарты ай тәрізді сүйкімді қара күлкі */
            <path
              d="M 181 249 Q 181 269 200 269 Q 219 269 219 249 Z"
              fill="#000000"
            />
          )}
        </svg>
      </div>
    </div>
  );
}