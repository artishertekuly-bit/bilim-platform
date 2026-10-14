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
  // Автоматты жыпылықтау (Natural Blinking)
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 160);
    }, 3600 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Аудио деңгейіне қарай жеңіл серпілу
  const scaleFromAudio = 1 + (state === 'listening' && !isMuted ? (audioLevel / 100) * 0.08 : 0);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center select-none cursor-pointer group',
        className,
      )}
      style={{
        transform: `scale(${scaleFromAudio})`,
        transition: 'transform 0.08s ease-out',
      }}
      title={state === 'listening' ? 'Сөйлеп болсаңыз, басып бірден жіберіңіз' : undefined}
    >
      {/* 
        Минималистік дизайн: 
        Пайдаланушы өтініші бойынша шетіндегі жасыл сақиналар мен ауралар алынып тасталды.
        Тек көмекшінің таза, жалпақ әрі сүйкімді өзі ғана көрсетіледі.
      */}

      {/* Негізгі Тақиялы Қазақ Көмекшісі (Жалпақ сүйкімді моти/бауырсақ пішіні) */}
      <div
        className={cn(
          'relative z-10 transition-transform duration-300 ease-out',
          state === 'listening'
            ? 'animate-taqiya-breathe'
            : state === 'thinking'
            ? 'animate-taqiya-tilt'
            : state === 'speaking'
            ? 'animate-taqiya-talk-bob'
            : 'animate-taqiya-float',
        )}
      >
        <svg
          viewBox="0 0 280 200"
          className="w-48 h-36 sm:w-56 sm:h-42 drop-shadow-md"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Сүйкімді нәзік көлеңке (Төменгі жер көлеңкесі) */}
          <ellipse
            cx="140"
            cy="186"
            rx="82"
            ry="10"
            fill="currentColor"
            className="text-foreground/8"
          />

          {/* ==================== БАС ЖӘНЕ ДЕНЕ (Wide Chubby Dumpling / Mochi Head) ==================== */}
          {/* 
            Ені кең (224px), бойы сәл жалпақтау (~90px),
            тура пайдаланушы жіберген суреттегідей chubby сүйкімді силуэт
          */}
          <path
            d="M 82,78 C 42,94 24,116 28,134 C 34,158 64,166 140,166 C 216,166 246,158 252,134 C 256,116 238,94 198,78 Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="11"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* ==================== БЕТТІҢ ҚЫЗҒЫЛТ РУМЯНЕЦІ (Soft Kawaii Blush) ==================== */}
          <ellipse
            cx="62"
            cy="140"
            rx="12"
            ry="7"
            className={cn(
              'transition-all duration-300',
              emotion === 'happy' || state === 'speaking'
                ? 'fill-rose-400/55'
                : 'fill-rose-300/30',
            )}
          />
          <ellipse
            cx="218"
            cy="140"
            rx="12"
            ry="7"
            className={cn(
              'transition-all duration-300',
              emotion === 'happy' || state === 'speaking'
                ? 'fill-rose-400/55'
                : 'fill-rose-300/30',
            )}
          />

          {/* ==================== КӨЗДЕР (Wide Separated Expressive Eyes) ==================== */}
          <g
            className={cn(
              'transition-transform duration-100 origin-[140px_128px]',
              isBlinking ? 'scale-y-[0.08]' : 'scale-y-100',
            )}
          >
            {/* ҚУАНУ КЕЗІНДЕГІ АРКА КӨЗДЕР (^ ^) */}
            {emotion === 'happy' && state !== 'thinking' ? (
              <>
                <path
                  d="M 88,132 Q 102,114 116,132"
                  stroke="#111827"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 164,132 Q 178,114 192,132"
                  stroke="#111827"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : isMuted ? (
              /* МИКРОФОН ӨШІРУЛІ (- -) */
              <>
                <line
                  x1="90"
                  y1="128"
                  x2="114"
                  y2="128"
                  stroke="#111827"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <line
                  x1="166"
                  y1="128"
                  x2="190"
                  y2="128"
                  stroke="#111827"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              </>
            ) : state === 'thinking' ? (
              /* ОЙЛАНУ КЕЗІНДЕГІ ЖОҒАРЫ ҚАРАҒАН КӨЗДЕР */
              <>
                <ellipse cx="102" cy="122" rx="10" ry="14" fill="#111827" />
                <circle cx="100" cy="117" r="3.5" fill="#FFFFFF" />
                <ellipse cx="178" cy="122" rx="10" ry="14" fill="#111827" />
                <circle cx="176" cy="117" r="3.5" fill="#FFFFFF" />
              </>
            ) : (
              /* 
                ҚАЛЫПТЫ СОПАҚ ҚАРА КӨЗДЕР 
                Тура суреттегідей арақашықтығы кең (76px аралық)
              */
              <>
                <ellipse cx="102" cy="128" rx="11" ry="16" fill="#111827" />
                <circle cx="98" cy="122" r="3.5" fill="#FFFFFF" />

                <ellipse cx="178" cy="128" rx="11" ry="16" fill="#111827" />
                <circle cx="174" cy="122" r="3.5" fill="#FFFFFF" />
              </>
            )}
          </g>

          {/* ==================== АУЫЗ (Mouth with Live Speech Animation) ==================== */}
          <g className="origin-[140px_138px]">
            {state === 'speaking' ? (
              /* СӨЙЛЕУ КЕЗІНДЕГІ ТІРІ СӨЗ ҚОЗҒАЛЫСЫ */
              <path
                d="M 131,130 Q 140,146 149,130 Z"
                fill="#111827"
                stroke="#111827"
                strokeWidth="2"
                className="animate-taqiya-mouth"
              />
            ) : emotion === 'happy' ? (
              /* ҚУАНУ КЕЗІНДЕГІ АШЫҚ КҮЛКІ */
              <g>
                <path
                  d="M 129,130 Q 140,148 151,130 Z"
                  fill="#111827"
                  stroke="#111827"
                  strokeWidth="2"
                />
                <path
                  d="M 134,138 Q 140,148 146,138 Z"
                  fill="#FB7185"
                />
              </g>
            ) : state === 'thinking' ? (
              /* ОЙЛАНУ КЕЗІНДЕГІ КІШКЕНТАЙ АУЫЗ */
              <ellipse cx="140" cy="134" rx="4.5" ry="4.5" fill="#111827" />
            ) : (
              /* 
                ҚАЛЫПТЫ ЖАРТЫ АЙ КҮЛКІ 
                Тура пайдаланушы жіберген суреттегідей
              */
              <path
                d="M 132,130 Q 140,140 148,130 Z"
                fill="#111827"
                stroke="#111827"
                strokeWidth="1.5"
              />
            )}
          </g>

          {/* ==================== ТАҚИЯ (Wide Traditional Kazakh Cap) ==================== */}
          {/* 1. Тақияның жоғарғы күмбезі (Dome top) */}
          <path
            d="M 82,58 C 82,28 104,20 140,20 C 176,20 198,28 198,58 Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="9"
            strokeLinejoin="round"
          />

          {/* 2. Тақияның сегменттік сызықтары (Meeting at apex) */}
          <path
            d="M 140,20 L 140,58"
            stroke="#111827"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M 140,20 Q 106,34 98,58"
            stroke="#111827"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 140,20 Q 174,34 182,58"
            stroke="#111827"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* 3. Тақияның қалың қара жиегі (Thick Curved Black Rim) */}
          <path
            d="M 72,60 C 100,54 180,54 208,60 C 212,60 214,76 208,80 C 180,84 100,84 72,80 C 66,76 68,60 72,60 Z"
            fill="#111827"
          />
        </svg>
      </div>

      {/* Әсем CSS анимациялар стильдері */}
      <style>{`
        @keyframes taqiyaBreathe {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          50% { transform: translateY(-3px) scale(1.02, 0.98); }
        }
        @keyframes taqiyaFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes taqiyaTilt {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-5deg) translateY(-2px); }
          75% { transform: rotate(4deg) translateY(-2px); }
        }
        @keyframes taqiyaTalkBob {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          30% { transform: translateY(-3px) scale(0.99, 1.02); }
          70% { transform: translateY(1px) scale(1.01, 0.99); }
        }
        @keyframes taqiyaMouth {
          0%, 100% { transform: scaleY(0.65) translateY(0); }
          50% { transform: scaleY(1.35) translateY(1px); }
        }
        .animate-taqiya-breathe {
          animation: taqiyaBreathe 2.4s ease-in-out infinite;
        }
        .animate-taqiya-float {
          animation: taqiyaFloat 3.2s ease-in-out infinite;
        }
        .animate-taqiya-tilt {
          animation: taqiyaTilt 2s ease-in-out infinite;
        }
        .animate-taqiya-talk-bob {
          animation: taqiyaTalkBob 0.38s ease-in-out infinite;
        }
        .animate-taqiya-mouth {
          animation: taqiyaMouth 0.22s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
