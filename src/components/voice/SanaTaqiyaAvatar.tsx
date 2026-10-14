import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
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
    }, 3800 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Аудио деңгейіне қарай серпінді кеңею (Squish & Stretch)
  const scaleFromAudio = 1 + (state === 'listening' && !isMuted ? (audioLevel / 100) * 0.12 : 0);

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
    >
      {/* 1. Артқы динамикалық сиқырлы Аура / Halo */}
      <div
        className={cn(
          'absolute -inset-4 sm:-inset-6 rounded-full blur-xl transition-all duration-700 pointer-events-none opacity-60',
          state === 'listening'
            ? 'bg-gradient-to-tr from-emerald-500/30 via-teal-400/20 to-cyan-500/30 animate-pulse'
            : state === 'thinking'
            ? 'bg-gradient-to-tr from-purple-600/40 via-fuchsia-500/30 to-pink-500/40 animate-spin-slow'
            : state === 'speaking'
            ? 'bg-gradient-to-tr from-cyan-500/40 via-blue-500/30 to-indigo-500/40 animate-pulse'
            : emotion === 'happy'
            ? 'bg-gradient-to-tr from-amber-400/30 via-yellow-300/20 to-orange-400/30 animate-pulse'
            : 'bg-muted/30',
        )}
      />

      {/* 2. Толқындық сақиналар (Soundwave Rings) */}
      {state === 'listening' && !isMuted && (
        <>
          <span
            className="absolute rounded-full border-2 border-emerald-500/30 transition-all duration-75 pointer-events-none"
            style={{
              width: `${Math.max(160, 160 + audioLevel * 1.3)}px`,
              height: `${Math.max(160, 160 + audioLevel * 1.3)}px`,
            }}
          />
          <span
            className="absolute rounded-full border border-emerald-400/20 transition-all duration-75 pointer-events-none"
            style={{
              width: `${Math.max(130, 130 + audioLevel * 0.8)}px`,
              height: `${Math.max(130, 130 + audioLevel * 0.8)}px`,
            }}
          />
        </>
      )}

      {/* 3. Ойлану кезіндегі орбиталық жарық */}
      {state === 'thinking' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="h-44 w-44 sm:h-52 sm:w-52 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
          <span className="absolute -top-3 text-purple-400 animate-bounce">
            <Sparkles size={18} />
          </span>
        </div>
      )}

      {/* 4. Қуану (Happy) күйіндегі ұшқындар */}
      {(emotion === 'happy' || state === 'speaking') && (
        <>
          <span className="absolute -top-2 -right-2 text-amber-400 animate-bounce delay-100 pointer-events-none z-20">
            <Sparkles size={22} />
          </span>
          <span className="absolute top-8 -left-3 text-cyan-400 animate-pulse delay-200 pointer-events-none z-20">
            <Sparkles size={16} />
          </span>
        </>
      )}

      {/* 5. Негізгі Тақиялы Қазақ Көмекшісі (Векторлық SVG Маскот) */}
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
          viewBox="0 0 200 230"
          className="w-36 h-42 sm:w-44 sm:h-50 drop-shadow-xl"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Сүйкімді көлеңке (Soft drop shadow underneath) */}
          <ellipse
            cx="100"
            cy="214"
            rx="56"
            ry="10"
            fill="currentColor"
            className="text-foreground/10"
          />

          {/* ==================== БАС ЖӘНЕ ДЕНЕ (Squishy Dumpling Head) ==================== */}
          <path
            d="M 52,92 C 26,112 22,156 46,182 C 66,204 134,204 154,182 C 178,156 174,112 148,92 C 126,92 74,92 52,92 Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="9"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* ==================== АЛТЫН / ҚЫЗЫЛ ҰШҚЫН БЕТТЕРІ (Cheek Blush) ==================== */}
          <ellipse
            cx="50"
            cy="154"
            rx="11"
            ry="6"
            className={cn(
              'transition-all duration-300',
              emotion === 'happy' || state === 'speaking'
                ? 'fill-rose-400/60 scale-110'
                : 'fill-rose-300/35',
            )}
          />
          <ellipse
            cx="150"
            cy="154"
            rx="11"
            ry="6"
            className={cn(
              'transition-all duration-300',
              emotion === 'happy' || state === 'speaking'
                ? 'fill-rose-400/60 scale-110'
                : 'fill-rose-300/35',
            )}
          />

          {/* ==================== КӨЗДЕР (Expressive Eyes) ==================== */}
          <g
            className={cn(
              'transition-transform duration-100 origin-[100px_142px]',
              isBlinking ? 'scale-y-[0.08]' : 'scale-y-100',
            )}
          >
            {/* ҚУАНУ (Happy) немесе КҮЛУ КЕЗІНДЕГІ АРКА КӨЗДЕР (^ ^) */}
            {emotion === 'happy' && state !== 'thinking' ? (
              <>
                <path
                  d="M 62,146 Q 74,130 86,146"
                  stroke="#111827"
                  strokeWidth="7"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 114,146 Q 126,130 138,146"
                  stroke="#111827"
                  strokeWidth="7"
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : isMuted ? (
              /* МИКРОФОН ӨШІРУЛІ КЕЗДЕГІ ҰЙҚЫ КӨЗДЕР (- -) */
              <>
                <line
                  x1="64"
                  y1="142"
                  x2="84"
                  y2="142"
                  stroke="#111827"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <line
                  x1="116"
                  y1="142"
                  x2="136"
                  y2="142"
                  stroke="#111827"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </>
            ) : state === 'thinking' ? (
              /* ОЙЛАНУ КЕЗІНДЕГІ ЖОҒАРЫ ҚАРАҒАН КӨЗДЕР */
              <>
                <ellipse cx="74" cy="138" rx="9" ry="13" fill="#111827" />
                <circle cx="72" cy="133" r="3" fill="#FFFFFF" />
                <ellipse cx="126" cy="138" rx="9" ry="13" fill="#111827" />
                <circle cx="124" cy="133" r="3" fill="#FFFFFF" />
              </>
            ) : (
              /* ҚАЛЫПТЫ / ТЫҢДАУ / СӨЙЛЕУ КЕЗІНДЕГІ ТОЛЫҚ ҚАРА СОПАҚ КӨЗДЕР */
              <>
                {/* Сол көз */}
                <ellipse cx="74" cy="143" rx="10" ry="15" fill="#111827" />
                <circle cx="71" cy="138" r="3.5" fill="#FFFFFF" />

                {/* Оң көз */}
                <ellipse cx="126" cy="143" rx="10" ry="15" fill="#111827" />
                <circle cx="123" cy="138" r="3.5" fill="#FFFFFF" />
              </>
            )}
          </g>

          {/* ==================== АУЫЗ (Mouth with Live Speech Animation) ==================== */}
          <g className="origin-[100px_154px]">
            {state === 'speaking' ? (
              /* СӨЙЛЕУ КЕЗІНДЕГІ ТІРІ СӨЗ ҚОЗҒАЛЫСЫ */
              <path
                d="M 91,149 Q 100,165 109,149 Z"
                fill="#111827"
                stroke="#111827"
                strokeWidth="2"
                className="animate-taqiya-mouth"
              />
            ) : emotion === 'happy' ? (
              /* ҚУАНУ КЕЗІНДЕГІ ҮЛКЕН АШЫҚ КҮЛКІ */
              <g>
                <path
                  d="M 89,148 Q 100,166 111,148 Z"
                  fill="#111827"
                  stroke="#111827"
                  strokeWidth="2"
                />
                {/* Сүйкімді қызғылт тіл */}
                <path
                  d="M 94,157 Q 100,166 106,157 Z"
                  fill="#FB7185"
                />
              </g>
            ) : state === 'thinking' ? (
              /* ОЙЛАНУ КЕЗІНДЕГІ КІШКЕНТАЙ АУЫЗ */
              <ellipse cx="100" cy="153" rx="4" ry="4.5" fill="#111827" />
            ) : (
              /* ҚАЛЫПТЫ КҮЛКІ (Reference суретіндегідей) */
              <path
                d="M 91,149 Q 100,160 109,149 Z"
                fill="#111827"
                stroke="#111827"
                strokeWidth="1.5"
              />
            )}
          </g>

          {/* ==================== ТАҚИЯ (Traditional Kazakh Skullcap) ==================== */}
          {/* 1. Тақияның жоғарғы күмбезі (Dome top) */}
          <path
            d="M 52,78 C 52,42 74,28 100,28 C 126,28 148,42 148,78 Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="8"
            strokeLinejoin="round"
          />

          {/* 2. Тақияның тік сегментті жолақтары (Ribbed segments meeting at top) */}
          <path
            d="M 100,28 L 100,78"
            stroke="#111827"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 100,28 Q 72,48 64,78"
            stroke="#111827"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d="M 100,28 Q 128,48 136,78"
            stroke="#111827"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          {/* 3. Тақияның төменгі қалың қара жиегі (Thick Black Rim / Band) */}
          <path
            d="M 44,76 C 44,70 156,70 156,76 L 156,92 C 156,98 44,98 44,92 Z"
            fill="#111827"
            stroke="#111827"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Әсем CSS анимациялар стильдері */}
      <style>{`
        @keyframes taqiyaBreathe {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          50% { transform: translateY(-4px) scale(1.02, 0.98); }
        }
        @keyframes taqiyaFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes taqiyaTilt {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-5deg) translateY(-3px); }
          75% { transform: rotate(4deg) translateY(-2px); }
        }
        @keyframes taqiyaTalkBob {
          0%, 100% { transform: translateY(0) scale(1, 1); }
          30% { transform: translateY(-4px) scale(0.98, 1.03); }
          70% { transform: translateY(1px) scale(1.02, 0.98); }
        }
        @keyframes taqiyaMouth {
          0%, 100% { transform: scaleY(0.7) translateY(0); }
          50% { transform: scaleY(1.3) translateY(1px); }
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
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
