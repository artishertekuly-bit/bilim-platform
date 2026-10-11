import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { sendVoiceAssistantAudio, type VoiceAssistantResponse } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export type VoiceAssistantStatus =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'paused'
  | 'error';

interface VoiceAssistantWidgetProps {
  className?: string;
  defaultLanguage?: 'kk' | 'ru';
  systemPrompt?: string;
  onResponse?: (response: VoiceAssistantResponse) => void;
}

export default function VoiceAssistantWidget({
  className,
  defaultLanguage = 'kk',
  systemPrompt,
  onResponse,
}: VoiceAssistantWidgetProps) {
  const { session } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<VoiceAssistantStatus>('idle');
  const [language, setLanguage] = useState<'kk' | 'ru'>(defaultLanguage);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastResponse, setLastResponse] = useState<VoiceAssistantResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        isCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Старт записи голоса
  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    isCancelledRef.current = false;

    // Тоқтатамыз алдыңғы аудионы
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Браузер микрофонмен жұмыс істеуді қолдамайды.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Микрофон трассасын тоқтату
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        // Егер пайдаланушы жазбаны болдырмаса (Отмена)
        if (isCancelledRef.current) {
          isCancelledRef.current = false;
          audioChunksRef.current = [];
          setStatus('idle');
          setRecordingSeconds(0);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (audioBlob.size > 0) {
          handleSendAudio(audioBlob);
        } else {
          setStatus('idle');
        }
      };

      mediaRecorder.start(250);
      setStatus('recording');
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Микрофонға рұқсат берілмеді.';
      setErrorMessage(msg);
      setStatus('error');
      toast({
        title: 'Микрофон қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Жазбаны тоқтатып, жіберу (Завершить и отправить)
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Жазбаны болдырмау және жою (Отменить запись без отправки)
  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setStatus('idle');
    setRecordingSeconds(0);

    toast({
      title: 'Жазба тоқтатылды',
      description: 'Аудио өшірілді, сұраныс жіберілген жоқ.',
    });
  }, [toast]);

  // Аудионы бэкендке жіберу
  const handleSendAudio = async (blob: Blob) => {
    setStatus('processing');
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendVoiceAssistantAudio(blob, {
        language,
        systemPrompt,
        accessToken: session?.access_token,
        signal: abortControllerRef.current.signal,
      });

      setLastResponse(response);
      onResponse?.(response);

      playAudio(response.audioUrl);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Дауысты өңдеу сәтсіз аяқталды.';
      setErrorMessage(msg);
      setStatus('error');
      toast({
        title: 'Қате орын алды',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  // Аудио ойнату
  const playAudio = useCallback((audioUrl: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(audioUrl);
    audioPlayerRef.current = audio;

    audio.onplay = () => {
      setStatus('speaking');
    };

    audio.onpause = () => {
      if (audio.currentTime < audio.duration) {
        setStatus('paused');
      }
    };

    audio.onended = () => {
      setStatus('idle');
    };

    audio.onerror = () => {
      setStatus('idle');
    };

    audio.play().catch(() => {
      setStatus('idle');
    });
  }, []);

  const togglePlayPause = () => {
    if (!audioPlayerRef.current) {
      if (lastResponse?.audioUrl) {
        playAudio(lastResponse.audioUrl);
      }
      return;
    }

    if (status === 'speaking') {
      audioPlayerRef.current.pause();
    } else if (status === 'paused') {
      audioPlayerRef.current.play().catch(console.error);
    }
  };

  const handleCopyText = () => {
    if (lastResponse?.aiReply) {
      navigator.clipboard.writeText(lastResponse.aiReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-none bg-card/95 shadow-xs backdrop-blur-xs transition-all',
        className,
      )}
    >
      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Жоғарғы қатар: Тақырып және тіл таңдау */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h3 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
              Дауыстық көмекші
            </h3>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setLanguage('kk')}
              disabled={status === 'recording' || status === 'processing'}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
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
              disabled={status === 'recording' || status === 'processing'}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                language === 'ru'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              РУС
            </button>
          </div>
        </div>

        {/* Негізгі интерактивті батырма */}
        <div className="my-6 flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center">
            {/* Жазу кезіндегі анимация */}
            {status === 'recording' ? (
              <>
                <span className="absolute h-28 w-28 animate-ping rounded-full bg-rose-500/20 sm:h-32 sm:w-32" />
                <span className="absolute h-24 w-24 animate-pulse rounded-full bg-rose-500/30 sm:h-28 sm:w-28" />
              </>
            ) : null}

            {/* Дыбыс ойналып жатқандағы анимация */}
            {status === 'speaking' ? (
              <span className="absolute h-24 w-24 animate-pulse rounded-full bg-primary/20 sm:h-28 sm:w-28" />
            ) : null}

            {/* Бос күй (Микрофон) */}
            {status === 'idle' || status === 'error' ? (
              <button
                type="button"
                onClick={startRecording}
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-md transition-all duration-300',
                  'hover:scale-105 active:scale-95 sm:h-24 sm:w-24',
                )}
                aria-label="Сөйлеу үшін басыңыз"
              >
                <Mic size={32} className="sm:size-9" />
              </button>
            ) : null}

            {/* Жазу үдерісі: Болдырмау (X) және Жіберу (Send) батырмалары */}
            {status === 'recording' ? (
              <div className="relative z-10 flex items-center gap-4 sm:gap-6">
                {/* Болдырмау батырмасы */}
                <button
                  type="button"
                  onClick={cancelRecording}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    'bg-muted/80 text-muted-foreground shadow-xs transition-all duration-200',
                    'hover:bg-destructive/15 hover:text-destructive active:scale-90',
                  )}
                  title="Жазбаны болдырмау"
                  aria-label="Жазбаны болдырмау"
                >
                  <X size={22} />
                </button>

                {/* Жіберу / Аяқтау батырмасы */}
                <button
                  type="button"
                  onClick={stopRecording}
                  className={cn(
                    'flex h-20 w-20 items-center justify-center rounded-full',
                    'bg-rose-500 text-white shadow-md transition-all duration-300',
                    'hover:scale-105 active:scale-95 sm:h-24 sm:w-24',
                  )}
                  title="Аяқтау және жіберу"
                  aria-label="Жазбаны аяқтау және жіберу"
                >
                  <Send size={28} className="translate-x-0.5" />
                </button>
              </div>
            ) : null}

            {/* Өңдеу индикаторы */}
            {status === 'processing' ? (
              <div
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-muted text-primary shadow-xs sm:h-24 sm:w-24',
                )}
              >
                <Loader2 size={32} className="animate-spin text-primary" />
              </div>
            ) : null}

            {/* Ойнату / Кідірту */}
            {status === 'speaking' || status === 'paused' ? (
              <button
                type="button"
                onClick={togglePlayPause}
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-md transition-all duration-300',
                  'hover:scale-105 active:scale-95 sm:h-24 sm:w-24',
                )}
                aria-label={status === 'speaking' ? 'Кідірту' : 'Жалғастыру'}
              >
                {status === 'speaking' ? (
                  <Pause size={28} className="fill-current" />
                ) : (
                  <Play size={28} className="ml-1 fill-current" />
                )}
              </button>
            ) : null}
          </div>

          {/* Қарапайым әрі қысқа статустық мәтіндер */}
          <div className="mt-4 space-y-1">
            {status === 'idle' ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Сұрақ қою үшін басыңыз
              </p>
            ) : null}

            {status === 'recording' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-2 text-rose-500">
                  <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-mono text-sm font-bold">
                    {formatTimer(recordingSeconds)}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
                  <span className="text-destructive font-medium">Крестик — болдырмау</span>
                  <span>•</span>
                  <span className="text-foreground font-medium">Қызыл — жіберу</span>
                </div>
              </div>
            ) : null}

            {status === 'processing' ? (
              <p className="text-xs font-semibold text-primary animate-pulse">
                Жауап дайындалуда...
              </p>
            ) : null}

            {status === 'speaking' ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <Volume2 size={15} className="animate-pulse" />
                <span className="text-xs font-semibold">Жауап оқылуда</span>
                <div className="flex items-end gap-1 h-3">
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:0ms] h-full" />
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:150ms] h-2/3" />
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:300ms] h-full" />
                </div>
              </div>
            ) : null}

            {status === 'paused' ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Кідіртілді
              </p>
            ) : null}

            {status === 'error' && errorMessage ? (
              <div className="flex items-center justify-center gap-1.5 text-xs text-destructive">
                <AlertCircle size={13} />
                <span>{errorMessage}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Сұрақ-жауап нәтижесі */}
        {lastResponse ? (
          <div className="space-y-3 rounded-2xl bg-muted/40 p-4 transition-all sm:p-5">
            {/* Пайдаланушы сұрағы */}
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Сіз
              </span>
              <p className="text-xs font-medium text-foreground sm:text-sm leading-relaxed">
                {lastResponse.userTranscript}
              </p>
            </div>

            {/* AI жауабы */}
            <div className="space-y-1 border-t border-border/40 pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  AI
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyText}
                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                    title="Көшіру"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => playAudio(lastResponse.audioUrl)}
                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                    title="Қайта тыңдау"
                  >
                    <RotateCcw size={12} />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-foreground/90 sm:text-sm leading-relaxed">
                {lastResponse.aiReply}
              </p>
            </div>

            {/* Жаңа сұрақ қою батырмасы */}
            <div className="pt-1 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startRecording}
                disabled={status === 'recording' || status === 'processing'}
                className="rounded-full text-xs font-semibold shadow-xs"
              >
                <Mic size={12} className="mr-1.5" />
                Жаңа сұрақ
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
