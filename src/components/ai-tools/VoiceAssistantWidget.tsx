import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Copy,
  Check,
  Languages,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
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
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
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
        mediaRecorderRef.current.stop();
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

  // Старт записи голоса через MediaRecorder
  const startRecording = useCallback(async () => {
    setErrorMessage(null);

    // Останавливаем предыдущее аудио, если играло
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

      // Определяем поддерживаемый MIME-тип
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
        // Останавливаем дорожки микрофона
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (audioBlob.size > 0) {
          handleSendAudio(audioBlob);
        } else {
          setStatus('idle');
        }
      };

      mediaRecorder.start(250); // собираем чанки каждые 250 мс
      setStatus('recording');
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            // Лимит в 1 минуту на один голосовой вопрос
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
          : 'Микрофонға рұқсат берілмеді немесе құрылғы қосылмаған.';
      setErrorMessage(msg);
      setStatus('error');
      toast({
        title: 'Микрофон қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Остановка записи
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

  // Отправка аудио на бэкенд (Groq Whisper -> Groq LLM -> Edge-TTS)
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

      // Автоматическое воспроизведение ответа
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

  // Воспроизведение аудио
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
      toast({
        title: 'Аудио ойнату қатесі',
        description: 'Дыбысты шығару сәтсіз аяқталды.',
        variant: 'destructive',
      });
    };

    audio.play().catch(() => {
      setStatus('idle');
    });
  }, [toast]);

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
        'relative overflow-hidden border-border/40 bg-card/95 shadow-sm backdrop-blur-sm transition-all',
        className,
      )}
    >
      <CardContent className="p-6 sm:p-8">
        {/* Верхняя панель: Заголовок и выбор языка */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
                Дауыстық ИИ көмекші
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Groq Whisper + LLM + Edge-TTS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setLanguage('kk')}
              disabled={status === 'recording' || status === 'processing'}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold transition',
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
                'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                language === 'ru'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              РУС
            </button>
          </div>
        </div>

        {/* Главная интерактивная кнопка микрофона и анимации */}
        <div className="my-8 flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center">
            {/* Пульсирующие волны при записи */}
            {status === 'recording' ? (
              <>
                <span className="absolute h-28 w-28 animate-ping rounded-full bg-rose-500/20 sm:h-32 sm:w-32" />
                <span className="absolute h-24 w-24 animate-pulse rounded-full bg-rose-500/30 sm:h-28 sm:w-28" />
              </>
            ) : null}

            {/* Пульсирующие волны при воспроизведении */}
            {status === 'speaking' ? (
              <span className="absolute h-24 w-24 animate-pulse rounded-full bg-primary/20 sm:h-28 sm:w-28" />
            ) : null}

            {/* Основная кнопка */}
            {status === 'idle' || status === 'error' ? (
              <button
                type="button"
                onClick={startRecording}
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-md transition-all duration-300',
                  'hover:scale-105 hover:shadow-lg active:scale-95',
                  'sm:h-24 sm:w-24',
                )}
                aria-label="Сөйлеу үшін басыңыз"
              >
                <Mic size={32} className="sm:size-9" />
              </button>
            ) : null}

            {status === 'recording' ? (
              <button
                type="button"
                onClick={stopRecording}
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-rose-500 text-white shadow-md transition-all duration-300',
                  'hover:scale-105 active:scale-95 sm:h-24 sm:w-24',
                )}
                aria-label="Жазбаны тоқтату"
              >
                <Square size={26} className="fill-current" />
              </button>
            ) : null}

            {status === 'processing' ? (
              <div
                className={cn(
                  'relative z-10 flex h-20 w-20 items-center justify-center rounded-full',
                  'bg-muted text-primary shadow-xs sm:h-24 sm:w-24',
                )}
              >
                <Loader2 size={34} className="animate-spin text-primary" />
              </div>
            ) : null}

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

          {/* Статусные подписи и индикаторы */}
          <div className="mt-5 space-y-1.5">
            {status === 'idle' ? (
              <p className="text-xs font-semibold text-muted-foreground sm:text-sm">
                Сұрақ қою үшін басып, сөйлеңіз
              </p>
            ) : null}

            {status === 'recording' ? (
              <div className="flex items-center justify-center gap-2 text-rose-500">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-mono text-sm font-bold">
                  {formatTimer(recordingSeconds)}
                </span>
                <span className="text-xs font-medium">Жазылуда...</span>
              </div>
            ) : null}

            {status === 'processing' ? (
              <p className="text-xs font-semibold text-primary sm:text-sm animate-pulse">
                Дауысты танып, жауап дайындаудамын...
              </p>
            ) : null}

            {status === 'speaking' ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <Volume2 size={16} className="animate-pulse" />
                <span className="text-xs font-semibold">Жауапты оқудамын</span>
                <div className="flex items-end gap-1 h-3.5">
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:0ms] h-full" />
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:150ms] h-2/3" />
                  <span className="w-1 bg-primary rounded-full animate-bounce [animation-delay:300ms] h-full" />
                </div>
              </div>
            ) : null}

            {status === 'paused' ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Кідіртілді (жалғастыру үшін басыңыз)
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

        {/* Блок с историей текущего вопроса и ответа */}
        {lastResponse ? (
          <div className="space-y-3.5 rounded-2xl bg-muted/40 p-4 transition-all sm:p-5">
            {/* Сұрақ */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Сіздің сұрағыңыз:
              </span>
              <p className="text-xs font-medium text-foreground sm:text-sm leading-relaxed">
                "{lastResponse.userTranscript}"
              </p>
            </div>

            {/* Жауап */}
            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles size={12} />
                  AI Көмекші:
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyText}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    title="Мәтінді көшіру"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => playAudio(lastResponse.audioUrl)}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
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

            {/* Батырмалар: жаңа сұрақ қою */}
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
                Жаңа сұрақ қою
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
