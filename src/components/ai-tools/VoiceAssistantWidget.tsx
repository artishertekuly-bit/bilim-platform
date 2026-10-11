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
  Headphones,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { sendVoiceAssistantAudio, type VoiceAssistantResponse } from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export type VoiceAssistantMode = 'live' | 'manual';

export type VoiceAssistantStatus =
  | 'idle'
  | 'listening'
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

const SILENCE_THRESHOLD_VOLUME = 16; // Дыбыс деңгейінің шегі (0-100)
const SILENCE_DURATION_MS = 1300; // Сөйлеп болған соң күту уақыты (1.3 сек)
const MIN_SPEECH_DURATION_MS = 600; // Кездейсоқ шуды жібермеу үшін ең аз сөйлеу уақыты

export default function VoiceAssistantWidget({
  className,
  defaultLanguage = 'kk',
  systemPrompt,
  onResponse,
}: VoiceAssistantWidgetProps) {
  const { session } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<VoiceAssistantMode>('live');
  const [status, setStatus] = useState<VoiceAssistantStatus>('idle');
  const [language, setLanguage] = useState<'kk' | 'ru'>(defaultLanguage);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
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
  const isCancelledRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // VAD және Web Audio API рефтері
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const isSpeakingNowRef = useRef<boolean>(false);
  const statusRef = useRef<VoiceAssistantStatus>('idle');
  const isLiveActiveRef = useRef<boolean>(false);

  // status пен isLiveActive рефтерін синхрондау
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    isLiveActiveRef.current = isLiveActive;
  }, [isLiveActive]);

  // Тазалау (cleanup)
  const cleanupAudio = useCallback(() => {
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
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      isCancelledRef.current = true;
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Игнорируем
      }
      mediaRecorderRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {
        // Игнорируем
      }
      audioContextRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Аудио ойнату
  const playAudio = useCallback((audioUrl: string, onEndedCallback?: () => void) => {
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
      if (isLiveActiveRef.current) {
        // Live режимде AI сөйлеп болған соң қайтадан тыңдауға көшеді
        setStatus('listening');
        onEndedCallback?.();
      } else {
        setStatus('idle');
      }
    };

    audio.onerror = () => {
      if (isLiveActiveRef.current) {
        setStatus('listening');
      } else {
        setStatus('idle');
      }
    };

    audio.play().catch(() => {
      if (isLiveActiveRef.current) {
        setStatus('listening');
      } else {
        setStatus('idle');
      }
    });
  }, []);

  // Аудионы бэкендке жіберу және жауап алу
  const sendAudioToBackend = useCallback(async (blob: Blob) => {
    setStatus('processing');
    setErrorMessage(null);
    abortControllerRef.current = new AbortController();

    try {
      // Соңғы 6 хабарламаны контекст ретінде жібереміз
      const historyContext = chatHistory.slice(-6).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await sendVoiceAssistantAudio(blob, {
        language,
        systemPrompt,
        history: historyContext,
        accessToken: session?.access_token,
        signal: abortControllerRef.current.signal,
      });

      setLastResponse(response);
      onResponse?.(response);

      // Тарихқа қосу
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: response.userTranscript },
        { role: 'assistant', content: response.aiReply, audioUrl: response.audioUrl },
      ]);

      // Жауапты автоматты түрде ойнату
      playAudio(response.audioUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Дауысты өңдеу сәтсіз аяқталды.';
      setErrorMessage(msg);
      setStatus(isLiveActiveRef.current ? 'listening' : 'error');
      toast({
        title: 'Қате орын алды',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [chatHistory, language, onResponse, playAudio, session?.access_token, systemPrompt, toast]);

  // VAD циклі: микрофон дыбыс деңгейін талдау және автоматты сөйлесуді басқару
  const startLiveVadLoop = useCallback(() => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkVolume = () => {
      if (!isLiveActiveRef.current) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const rawAvg = sum / dataArray.length;
      const normalizedVolume = Math.min(100, Math.round((rawAvg / 128) * 100));
      setAudioLevel(normalizedVolume);

      const currentStatus = statusRef.current;

      // 1. СӨЗДІ БӨЛУ (BARGE-IN / INTERRUPTION):
      // Егер AI сөйлеп жатқанда немесе паузада пайдаланушы сөйлей бастаса (volume > threshold)
      if (
        (currentStatus === 'speaking' || currentStatus === 'paused') &&
        normalizedVolume > SILENCE_THRESHOLD_VOLUME
      ) {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current = null;
        }
        // AI дауысын тоқтатып, пайдаланушының жаңа сөзін тыңдауға көшеміз
        setStatus('recording');
        startLiveSpeechChunk();
      }

      // 2. СӨЙЛЕУДІ БАСТАУ (Адам сөйлей бастаған сәт)
      if (
        currentStatus === 'listening' &&
        normalizedVolume > SILENCE_THRESHOLD_VOLUME &&
        !isSpeakingNowRef.current
      ) {
        isSpeakingNowRef.current = true;
        speechStartTimeRef.current = Date.now();
        setStatus('recording');
        startLiveSpeechChunk();
      }

      // 3. СӨЙЛЕП ЖАТҚАН КЕЗДЕ
      if (isSpeakingNowRef.current) {
        if (normalizedVolume > SILENCE_THRESHOLD_VOLUME) {
          // Пайдаланушы әлі сөйлеп жатыр, үнсіздік таймерін өшіреміз
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
          // Пайдаланушы үнсіз қалды, үнсіздік санағышын бастаймыз
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => {
              finishLiveSpeechChunk();
            }, SILENCE_DURATION_MS);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(checkVolume);
    };

    animFrameRef.current = requestAnimationFrame(checkVolume);
  }, []);

  // Live режимде адамның жаңа аудио үзіндісін жазуды бастау
  const startLiveSpeechChunk = useCallback(() => {
    if (!audioStreamRef.current) return;

    audioChunksRef.current = [];
    isCancelledRef.current = false;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = new MediaRecorder(
        audioStreamRef.current,
        mimeType ? { mimeType } : undefined,
      );

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        const duration = Date.now() - (speechStartTimeRef.current || 0);
        // Егер адам тым аз уақыт сөйлесе (мысалы 0.6 секундтан аз шу болса), елемейміз
        if (audioBlob.size > 1000 && duration >= MIN_SPEECH_DURATION_MS) {
          sendAudioToBackend(audioBlob);
        } else {
          setStatus('listening');
        }
      };

      recorder.start(100);
    } catch (e) {
      console.error('Failed to start live media recorder:', e);
    }
  }, [sendAudioToBackend]);

  // Үнсіздік анықталған соң жазбаны аяқтап, жіберу
  const finishLiveSpeechChunk = useCallback(() => {
    isSpeakingNowRef.current = false;
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

  // LIVE (GoPrep стилі) СҰХБАТТЫ БАСТАУ
  const startLiveConversation = useCallback(async () => {
    cleanupAudio();
    setErrorMessage(null);

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

      // Web Audio API инициализациясы
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const sourceNode = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      sourceNode.connect(analyser);
      analyserRef.current = analyser;

      setIsLiveActive(true);
      isLiveActiveRef.current = true;
      setStatus('listening');

      // VAD циклін іске қосу
      startLiveVadLoop();

      toast({
        title: 'Тірі сұхбат қосылды',
        description: 'Микрофон белсенді. Батырма баспай-ақ еркін сөйлесе аласыз!',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Микрофонды қосу мүмкін болмады.';
      setErrorMessage(msg);
      setStatus('error');
      setIsLiveActive(false);
      isLiveActiveRef.current = false;
      toast({
        title: 'Микрофон қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [cleanupAudio, startLiveVadLoop, toast]);

  // LIVE СҰХБАТТЫ ТОҚТАТУ
  const stopLiveConversation = useCallback(() => {
    cleanupAudio();
    setIsLiveActive(false);
    isLiveActiveRef.current = false;
    setStatus('idle');
    toast({
      title: 'Тірі сұхбат тоқтатылды',
      description: 'Микрофон өшірілді.',
    });
  }, [cleanupAudio, toast]);

  // ҚОЛМЕН ЖАЗУ (MANUAL PUSH-TO-TALK) СТАРТЫ
  const startManualRecording = useCallback(async () => {
    cleanupAudio();
    setErrorMessage(null);
    isCancelledRef.current = false;

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
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

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
          sendAudioToBackend(audioBlob);
        } else {
          setStatus('idle');
        }
      };

      recorder.start(250);
      setStatus('recording');
      setRecordingSeconds(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 60) {
            stopManualRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Микрофонға рұқсат берілмеді.';
      setErrorMessage(msg);
      setStatus('error');
      toast({
        title: 'Микрофон қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [cleanupAudio, sendAudioToBackend, toast]);

  const stopManualRecording = useCallback(() => {
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

  const cancelManualRecording = useCallback(() => {
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

  const clearChatHistory = () => {
    setChatHistory([]);
    setLastResponse(null);
    toast({
      title: 'Тарих тазартылды',
      description: 'Диалог тарихы өшірілді.',
    });
  };

  // Режимді ауыстыру
  const handleModeChange = (newMode: VoiceAssistantMode) => {
    if (newMode === mode) return;
    cleanupAudio();
    setIsLiveActive(false);
    isLiveActiveRef.current = false;
    setStatus('idle');
    setMode(newMode);
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-none bg-card/95 shadow-xs backdrop-blur-xs transition-all',
        className,
      )}
    >
      <CardContent className="p-6 sm:p-8 space-y-6">
        {/* Жоғарғы қатар: Режимдерді таңдау және Тіл ауыстыру */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
          {/* Режим таңдау: Live (GoPrep) немесе Manual */}
          <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => handleModeChange('live')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                mode === 'live'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Zap size={13} className={mode === 'live' ? 'fill-current' : ''} />
              <span>Тірі сұхбат (Live)</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('manual')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                mode === 'manual'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Mic size={13} />
              <span>Қолмен басу</span>
            </button>
          </div>

          {/* Тіл ауыстыру */}
          <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
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

        {/* ---------------------------------------------------- */}
        {/* РЕЖИМ 1: ТІРІ СҰХБАТ (LIVE CONVERSATION / GOPREP STYLE) */}
        {/* ---------------------------------------------------- */}
        {mode === 'live' ? (
          <div className="my-6 flex flex-col items-center justify-center text-center space-y-6">
            {/* Интерактивті орталық visualizer */}
            <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
              {/* Сыртқы импульсті толқындар */}
              {isLiveActive && status === 'listening' ? (
                <>
                  <span
                    className="absolute rounded-full bg-primary/10 transition-all duration-75"
                    style={{
                      width: `${Math.max(140, 140 + audioLevel * 1.2)}px`,
                      height: `${Math.max(140, 140 + audioLevel * 1.2)}px`,
                    }}
                  />
                  <span
                    className="absolute rounded-full bg-primary/15 transition-all duration-75"
                    style={{
                      width: `${Math.max(120, 120 + audioLevel * 0.8)}px`,
                      height: `${Math.max(120, 120 + audioLevel * 0.8)}px`,
                    }}
                  />
                </>
              ) : null}

              {isLiveActive && status === 'recording' ? (
                <>
                  <span
                    className="absolute rounded-full bg-rose-500/20 animate-ping"
                    style={{
                      width: `${Math.max(140, 140 + audioLevel * 1.3)}px`,
                      height: `${Math.max(140, 140 + audioLevel * 1.3)}px`,
                    }}
                  />
                  <span
                    className="absolute rounded-full bg-rose-500/30 transition-all duration-75"
                    style={{
                      width: `${Math.max(130, 130 + audioLevel)}px`,
                      height: `${Math.max(130, 130 + audioLevel)}px`,
                    }}
                  />
                </>
              ) : null}

              {status === 'speaking' ? (
                <>
                  <span className="absolute h-36 w-36 animate-pulse rounded-full bg-primary/20 sm:h-44 sm:w-44" />
                  <span className="absolute h-32 w-32 animate-ping rounded-full bg-primary/10 sm:h-40 sm:w-40" />
                </>
              ) : null}

              {/* Негізгі кнопка */}
              {!isLiveActive ? (
                <button
                  type="button"
                  onClick={startLiveConversation}
                  className={cn(
                    'relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
                    'bg-primary text-primary-foreground shadow-lg transition-all duration-300',
                    'hover:scale-105 active:scale-95 sm:h-28 sm:w-28',
                  )}
                  aria-label="Тірі сұхбатты бастау"
                >
                  <Radio size={36} className="animate-pulse" />
                </button>
              ) : (
                <div
                  className={cn(
                    'relative z-10 flex h-24 w-24 items-center justify-center rounded-full shadow-lg transition-all duration-300 sm:h-28 sm:w-28',
                    status === 'recording'
                      ? 'bg-rose-500 text-white'
                      : status === 'processing'
                      ? 'bg-muted text-primary'
                      : status === 'speaking'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/90 text-primary-foreground',
                  )}
                >
                  {status === 'processing' ? (
                    <Loader2 size={36} className="animate-spin text-primary" />
                  ) : status === 'speaking' ? (
                    <Volume2 size={36} className="animate-pulse" />
                  ) : status === 'recording' ? (
                    <Mic size={36} className="animate-bounce" />
                  ) : (
                    <Headphones size={36} />
                  )}
                </div>
              )}
            </div>

            {/* Дыбыс толқындары (Visualizer Waveform) */}
            {isLiveActive ? (
              <div className="flex items-center justify-center gap-1.5 h-8">
                {[0.4, 0.7, 1.0, 0.8, 0.5, 0.9, 0.6].map((multiplier, idx) => {
                  const barHeight =
                    status === 'recording' || status === 'listening'
                      ? Math.max(6, Math.min(32, audioLevel * multiplier * 0.8))
                      : status === 'speaking'
                      ? Math.max(8, (idx % 2 === 0 ? 24 : 14))
                      : 6;

                  return (
                    <span
                      key={idx}
                      className={cn(
                        'w-1.5 rounded-full transition-all duration-75',
                        status === 'recording'
                          ? 'bg-rose-500'
                          : status === 'speaking'
                          ? 'bg-primary animate-pulse'
                          : 'bg-primary/60',
                      )}
                      style={{ height: `${barHeight}px` }}
                    />
                  );
                })}
              </div>
            ) : null}

            {/* Статустар және нұсқаулықтар */}
            <div className="space-y-2">
              {!isLiveActive ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-foreground">
                    Тірі сұхбатты бастау үшін басыңыз
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Қолмен батырма басудың қажеті жоқ — сөйлесеңіз өзі тыңдайды, жауап береді
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {status === 'listening' ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Сізді тыңдап тұрмын... Еркін сөйлей беріңіз
                      </span>
                    </div>
                  ) : null}

                  {status === 'recording' ? (
                    <div className="flex items-center justify-center gap-2 text-rose-500 font-semibold text-xs">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>Дауысыңыз жазылуда... Сөйлеп болған соң өзі тоқтайды</span>
                    </div>
                  ) : null}

                  {status === 'processing' ? (
                    <p className="text-xs font-semibold text-primary animate-pulse">
                      Ойлануда, жауап дайындалып жатыр...
                    </p>
                  ) : null}

                  {status === 'speaking' ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center gap-2 text-primary text-xs font-semibold">
                        <Volume2 size={14} className="animate-pulse" />
                        <span>AI жауап беріп жатыр</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Сөзін бөлу үшін — жай ғана микрофонға сөйлей беріңіз (Barge-in)
                      </p>
                    </div>
                  ) : null}

                  {/* Сұхбатты тоқтату батырмасы */}
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={stopLiveConversation}
                      className="rounded-full text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <MicOff size={13} className="mr-1.5" />
                      Сұхбатты аяқтау
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ---------------------------------------------------- */
          /* РЕЖИМ 2: ҚОЛМЕН БАСУ (MANUAL PUSH-TO-TALK)           */
          /* ---------------------------------------------------- */
          <div className="my-6 flex flex-col items-center justify-center text-center">
            <div className="relative flex items-center justify-center">
              {status === 'recording' ? (
                <>
                  <span className="absolute h-28 w-28 animate-ping rounded-full bg-rose-500/20 sm:h-32 sm:w-32" />
                  <span className="absolute h-24 w-24 animate-pulse rounded-full bg-rose-500/30 sm:h-28 sm:w-28" />
                </>
              ) : null}

              {status === 'speaking' ? (
                <span className="absolute h-24 w-24 animate-pulse rounded-full bg-primary/20 sm:h-28 sm:w-28" />
              ) : null}

              {/* Бос күй (Микрофон) */}
              {status === 'idle' || status === 'error' ? (
                <button
                  type="button"
                  onClick={startManualRecording}
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

              {/* Жазу үдерісі: Болдырмау (X) және Жіберу (Send) */}
              {status === 'recording' ? (
                <div className="relative z-10 flex items-center gap-4 sm:gap-6">
                  <button
                    type="button"
                    onClick={cancelManualRecording}
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

                  <button
                    type="button"
                    onClick={stopManualRecording}
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

            {/* Мәтіндер */}
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
                </div>
              ) : null}

              {status === 'error' && errorMessage ? (
                <div className="flex items-center justify-center gap-1.5 text-xs text-destructive">
                  <AlertCircle size={13} />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* ДИАЛОГ ТАРИХЫ (Транскрипт карточкалары)              */}
        {/* ---------------------------------------------------- */}
        {chatHistory.length > 0 ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Диалог барысы
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearChatHistory}
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={12} className="mr-1" />
                Тазалау
              </Button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {chatHistory.map((item, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed transition-all',
                    item.role === 'user'
                      ? 'bg-muted/60 ml-4 text-foreground'
                      : 'bg-primary/5 border border-primary/15 mr-4 text-foreground',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider',
                        item.role === 'user' ? 'text-muted-foreground' : 'text-primary',
                      )}
                    >
                      {item.role === 'user' ? 'Сіз' : 'AI'}
                    </span>

                    {item.role === 'assistant' ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyText(item.content, idx)}
                          className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
                          title="Көшіру"
                        >
                          {copiedIndex === idx ? <Check size={11} /> : <Copy size={11} />}
                        </Button>
                        {item.audioUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => playAudio(item.audioUrl!)}
                            className="h-5 w-5 rounded-full text-muted-foreground hover:text-foreground"
                            title="Қайта тыңдау"
                          >
                            <RotateCcw size={11} />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
