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
import {
  sendVoiceAssistantAudio,
  type VoiceAssistantResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export type VoiceAssistantStatus =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'speaking'
  | 'paused'
  | 'error';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
}

interface VoiceAssistantWidgetProps {
  className?: string;
  defaultLanguage?: 'kk' | 'ru';
  systemPrompt?: string;
  onResponse?: (response: VoiceAssistantResponse) => void;
}

const SILENCE_THRESHOLD = 15; // Дыбыс сезу шегі
const SILENCE_TIMEOUT_MS = 1400; // Сөйлеп болған соң 1.4 сек үнсіздіктен кейін автоматты жіберу

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
  const [voice, setVoice] = useState<string>(
    defaultLanguage === 'ru' ? 'ru-RU-DmitryNeural' : 'kk-KZ-DauletNeural',
  );
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<VoiceAssistantResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Рефтер
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Web Audio Analyser
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);

  // Тазалау (cleanup)
  const cleanupRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setAudioLevel(0);
    hasSpokenRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [cleanupRecording]);

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

  // Аудионы серверге жіберу
  const sendAudioToBackend = useCallback(
    async (blob: Blob) => {
      setStatus('processing');
      setErrorMessage(null);
      abortControllerRef.current = new AbortController();

      try {
        const historyContext = chatHistory.slice(-6).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await sendVoiceAssistantAudio(blob, {
          language,
          voice,
          systemPrompt,
          history: historyContext,
          accessToken: session?.access_token,
          signal: abortControllerRef.current.signal,
        });

        setLastResponse(response);
        onResponse?.(response);

        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: response.userTranscript },
          { role: 'assistant', content: response.aiReply, audioUrl: response.audioUrl },
        ]);

        playAudio(response.audioUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Дауысты өңдеу кезінде қате орын алды.';
        setErrorMessage(msg);
        setStatus('error');
        toast({
          title: 'Қате орын алды',
          description: msg,
          variant: 'destructive',
        });
      }
    },
    [chatHistory, language, onResponse, playAudio, session?.access_token, systemPrompt, toast, voice],
  );

  // Жазуды аяқтап, серверге жіберу
  const stopRecordingAndSend = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping recorder:', e);
      }
    }
  }, []);

  // Жазуды толық болдырмау және өшіру
  const cancelRecording = useCallback(() => {
    isCancelledRef.current = true;
    cleanupRecording();

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error('Error stopping recorder on cancel:', e);
      }
    }

    audioChunksRef.current = [];
    setStatus('idle');
    setRecordingSeconds(0);

    toast({
      title: 'Жазба тоқтатылды',
      description: 'Аудио өшірілді, сұраныс жіберілген жоқ.',
    });
  }, [cleanupRecording, toast]);

  // Жазуды бастау (Start Recording & VAD)
  const startRecording = useCallback(async () => {
    cleanupRecording();
    setErrorMessage(null);
    isCancelledRef.current = false;
    audioChunksRef.current = [];
    hasSpokenRef.current = false;

    // Егер AI сөйлеп жатса, тоқтатамыз
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Браузер микрофонды қолдамайды.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;

      // Web Audio API дыбыс өлшеуіші
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        cleanupRecording();

        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          setStatus('idle');
          setRecordingSeconds(0);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (audioBlob.size > 500) {
          sendAudioToBackend(audioBlob);
        } else {
          setStatus('idle');
        }
      };

      recorder.start(150);
      setStatus('recording');
      setRecordingSeconds(0);

      // Секундомер
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            stopRecordingAndSend();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

      // VAD ағындық циклі (Дыбысты үздіксіз бақылау және үнсіздікте автоматты тоқтату)
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolumeLoop = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);

        // Егер дауыс шықса
        if (normalized > SILENCE_THRESHOLD) {
          hasSpokenRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
          // Егер адам сөйлеп болып, үнсіз қалса — 1.4 секундтан соң автоматты жібереміз
          if (hasSpokenRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => {
              stopRecordingAndSend();
            }, SILENCE_TIMEOUT_MS);
          }
        }

        animFrameRef.current = requestAnimationFrame(checkVolumeLoop);
      };

      animFrameRef.current = requestAnimationFrame(checkVolumeLoop);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Микрофонды қосу мүмкін болмады.';
      setErrorMessage(msg);
      setStatus('error');
      toast({
        title: 'Микрофон қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [cleanupRecording, sendAudioToBackend, stopRecordingAndSend, toast]);

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

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-none bg-card/95 shadow-xs backdrop-blur-xs transition-all',
        className,
      )}
    >
      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Жоғарғы қатар: Таза тақырып және дауыс / тіл баптауы */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <h3 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
              Дауыстық көмекші
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Дауыс түрін таңдау */}
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1 text-xs">
              {language === 'kk' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setVoice('kk-KZ-DauletNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      voice === 'kk-KZ-DauletNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    👨 Дәулет
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoice('kk-KZ-AigulNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      voice === 'kk-KZ-AigulNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    👩 Айгүл
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVoice('ru-RU-DmitryNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      voice === 'ru-RU-DmitryNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    👨 Дмитрий
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoice('ru-RU-SvetlanaNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      voice === 'ru-RU-SvetlanaNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    👩 Светлана
                  </button>
                </>
              )}
            </div>

            {/* Тіл ауыстыру */}
            <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => {
                  setLanguage('kk');
                  setVoice('kk-KZ-DauletNeural');
                }}
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
                onClick={() => {
                  setLanguage('ru');
                  setVoice('ru-RU-DmitryNeural');
                }}
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
        </div>

        {/* Негізгі орталық интерактивті батырма (GoPrep / Clean UI) */}
        <div className="my-6 flex flex-col items-center justify-center text-center space-y-5">
          <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
            {/* Жазу кезіндегі динамикалық дыбыс толқыны */}
            {status === 'recording' ? (
              <>
                <span
                  className="absolute rounded-full bg-rose-500/20 transition-all duration-75"
                  style={{
                    width: `${Math.max(140, 140 + audioLevel * 1.3)}px`,
                    height: `${Math.max(140, 140 + audioLevel * 1.3)}px`,
                  }}
                />
                <span
                  className="absolute rounded-full bg-rose-500/30 transition-all duration-75"
                  style={{
                    width: `${Math.max(120, 120 + audioLevel * 0.9)}px`,
                    height: `${Math.max(120, 120 + audioLevel * 0.9)}px`,
                  }}
                />
              </>
            ) : null}

            {/* Дыбыс ойналып жатқандағы пульсация */}
            {status === 'speaking' ? (
              <>
                <span className="absolute h-36 w-36 animate-pulse rounded-full bg-primary/20 sm:h-44 sm:w-44" />
                <span className="absolute h-32 w-32 animate-ping rounded-full bg-primary/10 sm:h-40 sm:w-40" />
              </>
            ) : null}

            {/* БОС КҮЙ (IDLE): Микрофонды басып сөйлесу */}
            {status === 'idle' || status === 'error' ? (
              <button
                type="button"
                onClick={startRecording}
                className={cn(
                  'relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-lg transition-all duration-300',
                  'hover:scale-105 active:scale-95 sm:h-28 sm:w-28',
                )}
                aria-label="Сөйлесуді бастау"
              >
                <Mic size={36} className="sm:size-10" />
              </button>
            ) : null}

            {/* ЖАЗУ КЕЗІНДЕ: Болдырмау (X) және Жіберу (Send) батырмалары */}
            {status === 'recording' ? (
              <div className="relative z-10 flex items-center gap-4 sm:gap-6">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    'bg-muted/80 text-muted-foreground shadow-xs transition-all duration-200',
                    'hover:bg-destructive/15 hover:text-destructive active:scale-90',
                  )}
                  title="Жазбаны өшіру (болдырмау)"
                  aria-label="Жазбаны өшіру"
                >
                  <X size={22} />
                </button>

                <button
                  type="button"
                  onClick={stopRecordingAndSend}
                  className={cn(
                    'flex h-20 w-20 items-center justify-center rounded-full',
                    'bg-rose-500 text-white shadow-md transition-all duration-300',
                    'hover:scale-105 active:scale-95 sm:h-24 sm:w-24',
                  )}
                  title="Аяқтау және жіберу"
                  aria-label="Аяқтау және жіберу"
                >
                  <Send size={28} className="translate-x-0.5" />
                </button>
              </div>
            ) : null}

            {/* ӨҢДЕУ КЕЗІНДЕ (PROCESSING) */}
            {status === 'processing' ? (
              <div
                className={cn(
                  'relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
                  'bg-muted text-primary shadow-xs sm:h-28 sm:w-28',
                )}
              >
                <Loader2 size={36} className="animate-spin text-primary" />
              </div>
            ) : null}

            {/* ДАУЫС ОЙНАЛЫП ЖАТҚАНДА (SPEAKING / PAUSED) */}
            {status === 'speaking' || status === 'paused' ? (
              <button
                type="button"
                onClick={togglePlayPause}
                className={cn(
                  'relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground shadow-md transition-all duration-300',
                  'hover:scale-105 active:scale-95 sm:h-28 sm:w-28',
                )}
                aria-label={status === 'speaking' ? 'Кідірту' : 'Жалғастыру'}
              >
                {status === 'speaking' ? (
                  <Pause size={32} className="fill-current" />
                ) : (
                  <Play size={32} className="ml-1 fill-current" />
                )}
              </button>
            ) : null}
          </div>

          {/* Статустық нақты әрі қысқа мәтіндер */}
          <div className="space-y-1.5">
            {status === 'idle' ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">
                  Сөйлесу үшін басыңыз
                </p>
                <p className="text-xs text-muted-foreground">
                  Сұрағыңызды қойыңыз, AI дауыстап жауап береді
                </p>
              </div>
            ) : null}

            {status === 'recording' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-center gap-2 text-rose-500 font-bold text-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>{formatTimer(recordingSeconds)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Сөйлеп болған соң өзі жібереді немесе қызыл түймені басыңыз
                </p>
              </div>
            ) : null}

            {status === 'processing' ? (
              <p className="text-xs font-semibold text-primary animate-pulse">
                Жауап дайындалуда...
              </p>
            ) : null}

            {status === 'speaking' ? (
              <div className="flex items-center justify-center gap-2 text-primary font-semibold text-xs">
                <Volume2 size={16} className="animate-pulse" />
                <span>Жауап оқылуда</span>
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

        {/* Сұрақ пен жауап нәтижесі (Таза сұхбат карточкасы) */}
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
                    onClick={() => handleCopyText(lastResponse.aiReply, 0)}
                    className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                    title="Көшіру"
                  >
                    {copiedIndex === 0 ? <Check size={12} /> : <Copy size={12} />}
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
