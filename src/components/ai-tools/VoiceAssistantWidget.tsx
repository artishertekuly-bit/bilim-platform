import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
  Volume2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  sendVoiceAssistantAudio,
  type VoiceAssistantResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export type VoiceAssistantPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

interface VoiceAssistantWidgetProps {
  className?: string;
  defaultLanguage?: 'kk' | 'ru';
  systemPrompt?: string;
  onResponse?: (response: VoiceAssistantResponse) => void;
}

const SILENCE_THRESHOLD = 16; // Дыбыс деңгейінің шегі (VAD)
const SILENCE_DURATION_MS = 750; // Сөйлеу аяқталған соң күту уақыты (750мс)

export default function VoiceAssistantWidget({
  className,
  defaultLanguage = 'kk',
  systemPrompt,
  onResponse,
}: VoiceAssistantWidgetProps) {
  const { session } = useAuth();
  const { toast } = useToast();

  const [phase, setPhase] = useState<VoiceAssistantPhase>('idle');
  const [language, setLanguage] = useState<'kk' | 'ru'>(defaultLanguage);
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Соңғы диалог жазбасы (Сіз және AI)
  const [lastExchange, setLastExchange] = useState<{
    userText: string;
    aiText: string;
  } | null>(null);

  // Тарихты сақтау (контекст үшін)
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // Аудио және микрофон рефтері
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);

  // Күйді тексеру рефтері (asynchronous closures)
  const isCallActiveRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const phaseRef = useRef<VoiceAssistantPhase>('idle');
  const hasSpokenInChunkRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const languageRef = useRef<'kk' | 'ru'>(language);

  isCallActiveRef.current = isCallActive;
  isMutedRef.current = isMuted;
  phaseRef.current = phase;
  languageRef.current = language;

  // AI дыбысын тоқтату (Barge-in / сөзді бөлген кезде)
  const stopAudioPlayback = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
  }, []);

  // Барлық ресурстарды толық тазалау
  const cleanupAll = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAudioPlayback();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }

    setAudioLevel(0);
    hasSpokenInChunkRef.current = false;
  }, [stopAudioPlayback]);

  // Дыбыстық сегментті серверге жіберу және жауап алу (GoPrep Pipeline)
  const sendUtterance = useCallback(
    async (blob: Blob) => {
      if (!isCallActiveRef.current || blob.size < 500) {
        // Тым қысқа немесе сұхбат тоқтатылған болса, тыңдауды қайта жалғастыру
        if (isCallActiveRef.current && phaseRef.current !== 'speaking') {
          setPhase('listening');
          startChunkRecording();
        }
        return;
      }

      setPhase('processing');
      abortControllerRef.current = new AbortController();

      try {
        const response = await sendVoiceAssistantAudio(blob, {
          language: languageRef.current,
          systemPrompt,
          history: historyRef.current.slice(-4),
          signal: abortControllerRef.current.signal,
          accessToken: session?.access_token,
        });

        if (!isCallActiveRef.current) return;

        // Контекст тарихын жаңарту
        if (response.userTranscript && response.aiReply) {
          historyRef.current.push(
            { role: 'user', content: response.userTranscript },
            { role: 'assistant', content: response.aiReply },
          );
          setLastExchange({
            userText: response.userTranscript,
            aiText: response.aiReply,
          });
        }

        if (onResponse) {
          onResponse(response);
        }

        // AI жауабын ойнату
        if (response.audioUrl) {
          setPhase('speaking');
          stopAudioPlayback();

          const audio = new Audio(response.audioUrl);
          audioPlayerRef.current = audio;

          audio.onended = () => {
            if (isCallActiveRef.current) {
              setPhase('listening');
              startChunkRecording();
            }
          };

          audio.onerror = () => {
            if (isCallActiveRef.current) {
              setPhase('listening');
              startChunkRecording();
            }
          };

          await audio.play();
        } else {
          // Дыбыс жоқ болса, бірден тыңдауға оралу
          setPhase('listening');
          startChunkRecording();
        }
      } catch (err: unknown) {
        if (!isCallActiveRef.current) return;
        const errObj = err as { name?: string; message?: string };
        if (errObj?.name === 'AbortError') return;

        console.warn('Дауыстық өңдеу қатесі:', err);
        // Қате болған жағдайда да байланысты үзбей, тыңдауды жалғастыру
        setPhase('listening');
        startChunkRecording();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onResponse, session?.access_token, stopAudioPlayback, systemPrompt],
  );

  // Жаңа аудио фрагментін жазуды бастау
  const startChunkRecording = useCallback(() => {
    if (!audioStreamRef.current || !isCallActiveRef.current) return;

    audioChunksRef.current = [];
    hasSpokenInChunkRef.current = false;

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      }

      const recorder = mimeType
        ? new MediaRecorder(audioStreamRef.current, { mimeType })
        : new MediaRecorder(audioStreamRef.current);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        audioChunksRef.current = [];
        if (hasSpokenInChunkRef.current && isCallActiveRef.current) {
          sendUtterance(audioBlob);
        } else if (isCallActiveRef.current && phaseRef.current === 'listening') {
          // Егер дыбыс шықпаса, тыңдауды қайта бастау
          startChunkRecording();
        }
      };

      recorder.start(150); // 150мс сайын бөліктер жинау
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('MediaRecorder бастау қатесі:', err);
    }
  }, [sendUtterance]);

  // Дыбыс деңгейін бақылау және VAD (Үнсіздікті автоматты сезу) циклі
  const startAudioMonitoring = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkAudio = () => {
          if (!isCallActiveRef.current) return;

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.round(avg * 1.8));

          // Микрофон өшірулі болса, дыбыс деңгейін 0 ету
          if (isMutedRef.current) {
            setAudioLevel(0);
          } else {
            setAudioLevel(normalized);

            // 1. BARGE-IN: Егер AI сөйлеп тұрғанда пайдаланушы сөйлей бастаса
            if (normalized > SILENCE_THRESHOLD && phaseRef.current === 'speaking') {
              stopAudioPlayback();
              setPhase('listening');
              startChunkRecording();
            }

            // 2. VAD: Тыңдау кезіндегі сөйлеу мен үнсіздікті анықтау
            if (phaseRef.current === 'listening') {
              if (normalized > SILENCE_THRESHOLD) {
                hasSpokenInChunkRef.current = true;
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              } else if (hasSpokenInChunkRef.current) {
                // Пайдаланушы сөйлеп болды, үнсіздік басталды
                if (!silenceTimerRef.current) {
                  silenceTimerRef.current = window.setTimeout(() => {
                    silenceTimerRef.current = null;
                    if (
                      mediaRecorderRef.current &&
                      mediaRecorderRef.current.state === 'recording'
                    ) {
                      mediaRecorderRef.current.stop();
                    }
                  }, SILENCE_DURATION_MS);
                }
              }
            }
          }

          animFrameRef.current = requestAnimationFrame(checkAudio);
        };

        checkAudio();
      } catch (err) {
        console.warn('AudioContext баптау қатесі:', err);
      }
    },
    [startChunkRecording, stopAudioPlayback],
  );

  // Сұхбатты бастау (GoPrep Call Start)
  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setPhase('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      setIsCallActive(true);
      isCallActiveRef.current = true;
      setIsMuted(false);
      isMutedRef.current = false;
      historyRef.current = [];

      startAudioMonitoring(stream);
      setPhase('listening');
      startChunkRecording();

      toast({
        title: 'Сұхбат қосылды',
        description: 'AI дайын. Сұрағыңызды қоя беріңіз.',
      });
    } catch (err) {
      console.error('Микрофонға рұқсат берілмеді:', err);
      setErrorMessage('Микрофонға қолжетімділік жоқ. Браузер параметрлерін тексеріңіз.');
      setPhase('error');
      setIsCallActive(false);
      isCallActiveRef.current = false;
    }
  }, [startAudioMonitoring, startChunkRecording, toast]);

  // Сұхбатты тоқтату (Hang Up)
  const endCall = useCallback(() => {
    setIsCallActive(false);
    isCallActiveRef.current = false;
    setPhase('idle');
    cleanupAll();
  }, [cleanupAll]);

  // Микрофонды қосу / өшіру (Mute / Unmute)
  const toggleMute = useCallback(() => {
    if (!audioStreamRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    isMutedRef.current = nextMute;
    audioStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMute;
    });
  }, [isMuted]);

  // Компонент жабылғанда тазалау
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  return (
    <Card
      className={cn(
        'relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl',
        'border border-border/60 bg-gradient-to-b from-card/95 via-card/85 to-muted/30 shadow-xl backdrop-blur-xl',
        className,
      )}
    >
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
        {/* Жоғарғы қатар: Статус және Тіл таңдау (ҚАЗ / РУС) */}
        <div className="w-full flex items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-2.5 w-2.5 rounded-full transition-colors duration-300',
                isCallActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40',
              )}
            />
            <span className="text-xs font-semibold tracking-wide text-foreground/80">
              {isCallActive ? 'GoPrep Live' : 'Bilim Voice AI'}
            </span>
          </div>

          {/* Тіл таңдау қосқышы */}
          <div className="flex items-center gap-1 rounded-full bg-muted/70 p-1">
            <button
              type="button"
              onClick={() => setLanguage('kk')}
              disabled={isCallActive}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200',
                language === 'kk'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              ҚАЗ
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ru')}
              disabled={isCallActive}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200',
                language === 'ru'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              РУС
            </button>
          </div>
        </div>

        {/* Орталық визуалды Орб (GoPrep Voice Orb) */}
        <div className="my-8 sm:my-10 flex flex-col items-center justify-center">
          <div className="relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
            {/* 1. Толқындар мен Пульсация (Жиектер) */}
            {isCallActive && phase === 'listening' && !isMuted ? (
              <>
                <span
                  className="absolute rounded-full bg-emerald-500/15 transition-all duration-100 ease-out"
                  style={{
                    width: `${Math.max(160, 160 + audioLevel * 1.4)}px`,
                    height: `${Math.max(160, 160 + audioLevel * 1.4)}px`,
                  }}
                />
                <span
                  className="absolute rounded-full bg-emerald-500/25 transition-all duration-100 ease-out"
                  style={{
                    width: `${Math.max(130, 130 + audioLevel * 0.9)}px`,
                    height: `${Math.max(130, 130 + audioLevel * 0.9)}px`,
                  }}
                />
              </>
            ) : null}

            {isCallActive && phase === 'speaking' ? (
              <>
                <span className="absolute h-44 w-44 animate-ping rounded-full bg-primary/15 sm:h-52 sm:w-52" />
                <span className="absolute h-40 w-40 animate-pulse rounded-full bg-primary/25 sm:h-48 sm:w-48" />
              </>
            ) : null}

            {isCallActive && phase === 'processing' ? (
              <span className="absolute h-36 w-36 animate-spin rounded-full border-2 border-primary/40 border-t-transparent sm:h-44 sm:w-44" />
            ) : null}

            {/* 2. Негізгі Орталық Интерактивті Түйме / Орб */}
            {!isCallActive ? (
              <button
                type="button"
                onClick={startCall}
                className={cn(
                  'relative z-10 flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32',
                  'bg-gradient-to-tr from-primary to-primary/80 text-primary-foreground',
                  'shadow-lg shadow-primary/25 transition-all duration-300',
                  'hover:scale-105 active:scale-95 focus:outline-hidden',
                )}
                aria-label="Сұхбатты бастау"
              >
                <Mic size={44} className="sm:size-12" />
              </button>
            ) : (
              <div
                className={cn(
                  'relative z-10 flex h-28 w-28 items-center justify-center rounded-full sm:h-32 sm:w-32',
                  'transition-all duration-500 shadow-xl',
                  phase === 'speaking'
                    ? 'bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-primary/30'
                    : phase === 'listening'
                    ? isMuted
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-emerald-500/30'
                    : 'bg-muted text-primary',
                )}
              >
                {phase === 'connecting' || phase === 'processing' ? (
                  <Loader2 size={40} className="animate-spin" />
                ) : phase === 'speaking' ? (
                  <Volume2 size={40} className="animate-pulse" />
                ) : isMuted ? (
                  <MicOff size={40} />
                ) : (
                  <Mic size={40} />
                )}
              </div>
            )}
          </div>

          {/* Статус мәтіні */}
          <div className="mt-4 space-y-1">
            {!isCallActive ? (
              <>
                <h3 className="text-base font-bold text-foreground sm:text-lg">
                  Сұхбатты бастау үшін басыңыз
                </h3>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Нақты уақыттағы тікелей сөйлесу (қолмен түйме басудың қажеті жоқ)
                </p>
              </>
            ) : phase === 'connecting' ? (
              <p className="text-sm font-semibold text-muted-foreground animate-pulse">
                Байланыс орнатылуда...
              </p>
            ) : phase === 'listening' ? (
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {isMuted ? 'Микрофон өшірулі' : 'Тыңдап тұрмын, сөйлей беріңіз...'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Сөзді аяқтаған соң өзі автоматты түрде жауап береді
                </p>
              </div>
            ) : phase === 'processing' ? (
              <p className="text-sm font-bold text-primary animate-pulse">
                Жауап ойлануда...
              </p>
            ) : phase === 'speaking' ? (
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-primary">
                  AI жауап беріп жатыр...
                </p>
                <p className="text-xs text-muted-foreground">
                  (Сөйлей бастасаңыз, AI бірден тоқтап сізді тыңдайды)
                </p>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="flex items-center justify-center gap-1.5 text-xs text-destructive pt-1">
                <AlertCircle size={13} />
                <span>{errorMessage}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Соңғы сұрақ пен жауап (Қарапайым, артық сөзсіз таза мәтін) */}
        {lastExchange ? (
          <div className="w-full space-y-2.5 rounded-2xl bg-muted/40 p-4 text-left transition-all">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Сіз
              </span>
              <p className="text-xs font-medium text-foreground sm:text-sm leading-relaxed">
                {lastExchange.userText}
              </p>
            </div>
            <div className="border-t border-border/40 pt-2 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                AI
              </span>
              <p className="text-xs text-foreground/90 sm:text-sm leading-relaxed">
                {lastExchange.aiText}
              </p>
            </div>
          </div>
        ) : null}

        {/* Сұхбатты басқару панелі (Тек сұхбат қосулы кезде шығады) */}
        {isCallActive ? (
          <div className="mt-6 flex items-center justify-center gap-4">
            {/* Микрофонды уақытша өшіру (Mute) */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleMute}
              className={cn(
                'h-12 w-12 rounded-full border-border/60 transition-all',
                isMuted
                  ? 'bg-destructive/10 text-destructive border-destructive/30'
                  : 'hover:bg-muted text-foreground',
              )}
              title={isMuted ? 'Микрофонды қосу' : 'Микрофонды өшіру'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </Button>

            {/* Сұхбатты тоқтату (Қызыл батырма) */}
            <Button
              type="button"
              onClick={endCall}
              className={cn(
                'h-12 px-6 rounded-full font-semibold shadow-md transition-all',
                'bg-rose-500 hover:bg-rose-600 text-white active:scale-95',
              )}
            >
              <PhoneOff size={18} className="mr-2" />
              Сұхбатты аяқтау
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
