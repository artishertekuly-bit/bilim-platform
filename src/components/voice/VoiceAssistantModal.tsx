import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  History,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  fetchVoiceHistory,
  getVoiceWsUrl,
  sendVoiceInteractRest,
  type VoiceDialogRecord,
  type VoiceEmotion,
  type VoiceState,
} from '@/lib/voice-api';

interface VoiceAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SILENCE_THRESHOLD = 15; // Дыбыс деңгейінің шегі (VAD)
const SILENCE_DURATION_MS = 800; // Сөйлеп болған соң күту уақыты (800мс)

export default function VoiceAssistantModal({
  open,
  onOpenChange,
}: VoiceAssistantModalProps) {
  const { user, session } = useAuth();

  // Негізгі күйлер
  const [state, setState] = useState<VoiceState>('idle');
  const [emotion, setEmotion] = useState<VoiceEmotion>('happy');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<VoiceDialogRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Соңғы сұхбат мәтіні
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [currentAiResponse, setCurrentAiResponse] = useState<string>('');

  // Рефтер
  const wsRef = useRef<WebSocket | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);

  // Asynchronous closures үшін күй рефтері
  const stateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(open);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  isOpenRef.current = open;

  // AI дауысын бірден үзу (Barge-in / сөзді бөлу)
  const stopAudioPlayback = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
  }, []);

  // Барлық аудио ресурстарды тазалау
  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    hasSpokenRef.current = false;
  }, [stopAudioPlayback]);

  // WebSocket байланысын жабу
  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  // Аудио бөлігін серверге жіберу (WebSocket немесе REST fallback)
  const sendAudioUtterance = useCallback(
    async (blob: Blob) => {
      if (!isOpenRef.current || blob.size < 400) {
        if (stateRef.current !== 'speaking') {
          setState('listening');
          startRecorderChunk();
        }
        return;
      }

      setState('thinking');
      setEmotion('thinking');

      // 1. WebSocket арқылы жіберуге тырысу
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = (reader.result as string).split(',')[1];
            if (base64Audio && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'audio',
                  audio_base64: base64Audio,
                })
              );
            }
          };
          reader.readAsDataURL(blob);
          return;
        } catch (wsErr) {
          console.warn('WebSocket send error, using REST fallback:', wsErr);
        }
      }

      // 2. REST Fallback (егер WebSocket қосылмаған болса)
      try {
        const result = await sendVoiceInteractRest(blob, {
          accessToken: session?.access_token,
        });

        if (!isOpenRef.current) return;

        setCurrentTranscript(result.userTranscript);
        setCurrentAiResponse(result.aiResponse);
        setEmotion(result.emotion);
        setState('speaking');

        stopAudioPlayback();
        const audio = new Audio(result.audioUrl);
        audioPlayerRef.current = audio;

        audio.onended = () => {
          if (isOpenRef.current) {
            setState('listening');
            setEmotion('happy');
            startRecorderChunk();
          }
        };

        audio.onerror = () => {
          if (isOpenRef.current) {
            setState('listening');
            startRecorderChunk();
          }
        };

        await audio.play();
      } catch (restErr: any) {
        if (!isOpenRef.current) return;
        console.warn('Voice REST error:', restErr);
        setErrorMessage(restErr?.message || 'Дыбысты өңдеу сәтсіз аяқталды');
        setState('listening');
        startRecorderChunk();
      }
    },
    [session?.access_token, stopAudioPlayback]
  );

  // Жаңа аудио бөлігін жазуды бастау (MediaRecorder)
  const startRecorderChunk = useCallback(() => {
    if (!audioStreamRef.current || !isOpenRef.current) return;

    audioChunksRef.current = [];
    hasSpokenRef.current = false;

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

        if (hasSpokenRef.current && isOpenRef.current) {
          sendAudioUtterance(audioBlob);
        } else if (isOpenRef.current && stateRef.current === 'listening') {
          // Үнсіздік болса тыңдауды қайта жалғастыру
          startRecorderChunk();
        }
      };

      recorder.start(150); // 150мс сайын тілімдеу
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('MediaRecorder error:', err);
    }
  }, [sendAudioUtterance]);

  // Дыбыс деңгейін (RMS) және VAD (Үнсіздікті) бақылау
  const startAudioMonitoring = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.25;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkAudio = () => {
          if (!isOpenRef.current) return;

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.round(avg * 1.9));

          if (isMutedRef.current) {
            setAudioLevel(0);
          } else {
            setAudioLevel(normalized);

            // 1. BARGE-IN: Егер AI сөйлеп жатқанда оқушы сөйлесе -> AI бірден тоқтайды
            if (normalized > SILENCE_THRESHOLD && stateRef.current === 'speaking') {
              stopAudioPlayback();
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
              }
              setState('listening');
              setEmotion('listening');
              startRecorderChunk();
            }

            // 2. VAD: Тыңдау кезіндегі сөйлеу мен үнсіздікті сезу
            if (stateRef.current === 'listening') {
              if (normalized > SILENCE_THRESHOLD) {
                hasSpokenRef.current = true;
                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              } else if (hasSpokenRef.current) {
                // Сөйлеу бітті, үнсіздік таймері
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
        console.warn('AudioContext monitoring setup error:', err);
      }
    },
    [startRecorderChunk, stopAudioPlayback]
  );

  // WebSocket байланысын бастау
  const initWebSocket = useCallback(() => {
    closeWebSocket();
    try {
      const wsUrl = getVoiceWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            user_id: user?.id,
            auth_token: session?.access_token,
          })
        );
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'status') {
            if (msg.state === 'listening' || msg.state === 'thinking' || msg.state === 'speaking') {
              setState(msg.state);
            }
            if (msg.emotion) {
              setEmotion(msg.emotion);
            }
          } else if (msg.type === 'user_transcript') {
            setCurrentTranscript(msg.text);
          } else if (msg.type === 'ai_response') {
            setCurrentAiResponse(msg.text);
            if (msg.emotion) {
              setEmotion(msg.emotion);
            }
          } else if (msg.type === 'audio') {
            setState('speaking');
            if (msg.emotion) {
              setEmotion(msg.emotion);
            }

            const rawBase64 = msg.audio_base64 || '';
            const byteChars = atob(rawBase64);
            const byteNumbers = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNumbers[i] = byteChars.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const audioBlob = new Blob([byteArray], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);

            stopAudioPlayback();
            const audio = new Audio(audioUrl);
            audioPlayerRef.current = audio;

            audio.onended = () => {
              if (isOpenRef.current) {
                setState('listening');
                setEmotion('happy');
                startRecorderChunk();
              }
            };

            audio.onerror = () => {
              if (isOpenRef.current) {
                setState('listening');
                startRecorderChunk();
              }
            };

            await audio.play();
          } else if (msg.type === 'error') {
            setErrorMessage(msg.message);
          }
        } catch (parseErr) {
          console.warn('WS message parsing error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('Voice WebSocket error, fallback ready:', err);
      };

      ws.onclose = () => {
        // Disconnected
      };
    } catch (wsErr) {
      console.warn('Voice WebSocket could not be opened:', wsErr);
    }
  }, [closeWebSocket, session?.access_token, startRecorderChunk, stopAudioPlayback, user?.id]);

  // Микрофонды қосып сұхбатты бастау (GoPrep Call Start)
  const startConversation = useCallback(async () => {
    setErrorMessage(null);
    setState('listening');
    setEmotion('happy');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      setIsMuted(false);
      isMutedRef.current = false;

      initWebSocket();
      startAudioMonitoring(stream);
      startRecorderChunk();
    } catch (micErr) {
      console.error('Microphone permission error:', micErr);
      setErrorMessage('Микрофонға рұқсат берілмеді. Браузер баптауларын тексеріңіз.');
      setState('error');
    }
  }, [initWebSocket, startAudioMonitoring, startRecorderChunk]);

  // Сұхбатты аяқтау (Hang Up)
  const stopConversation = useCallback(() => {
    setState('idle');
    setEmotion('happy');
    cleanupAudio();
    closeWebSocket();
  }, [cleanupAudio, closeWebSocket]);

  // Микрофонды уақытша өшіру (Mute / Unmute)
  const toggleMute = useCallback(() => {
    if (!audioStreamRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    isMutedRef.current = nextMute;
    audioStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMute;
    });
  }, [isMuted]);

  // Тарихты жүктеу
  const loadHistory = useCallback(async () => {
    const records = await fetchVoiceHistory(session?.access_token);
    setHistoryList(records);
    setShowHistory(true);
  }, [session?.access_token]);

  // Модаль ашылғанда және жабылғанда
  useEffect(() => {
    if (open) {
      startConversation();
    } else {
      stopConversation();
      setShowHistory(false);
    }
    return () => {
      cleanupAudio();
      closeWebSocket();
    };
  }, [cleanupAudio, closeWebSocket, open, startConversation, stopConversation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'relative w-[calc(100%-1.5rem)] max-w-md sm:max-w-lg overflow-hidden',
          'rounded-3xl border border-white/10 p-6 sm:p-8',
          'bg-gradient-to-b from-card/95 via-card/90 to-card/98 shadow-2xl backdrop-blur-2xl',
        )}
      >
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-3 w-3 rounded-full transition-colors duration-300',
                state === 'listening'
                  ? 'bg-emerald-500 animate-pulse'
                  : state === 'thinking'
                  ? 'bg-purple-500 animate-spin'
                  : state === 'speaking'
                  ? 'bg-cyan-500 animate-ping'
                  : 'bg-muted-foreground/40',
              )}
            />
            <DialogTitle className="text-sm sm:text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <span>Sana Voice AI</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                GoPrep Realtime
              </span>
            </DialogTitle>
          </div>

          <div className="flex items-center gap-1 pr-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={showHistory ? () => setShowHistory(false) : loadHistory}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              title="Сұхбат тарихы"
            >
              <History size={16} />
            </Button>
          </div>
        </DialogHeader>

        {/* 1. Сұхбат тарихы панелі (Егер ашылса) */}
        {showHistory ? (
          <div className="my-4 max-h-80 overflow-y-auto space-y-3 pr-1 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Соңғы диалогтар
              </span>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Артқа қайту
              </button>
            </div>
            {historyList.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Әзірге сұхбат тарихы бос.
              </p>
            ) : (
              historyList.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border/50 bg-muted/40 p-3 space-y-1.5"
                >
                  <p className="text-xs font-semibold text-foreground">
                    👤 {item.userTranscript}
                  </p>
                  <p className="text-xs text-primary/90 leading-relaxed">
                    🤖 {item.aiResponse}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : (
          /* 2. Негізгі GoPrep Визуалды Интерфейсі */
          <div className="my-6 flex flex-col items-center justify-center text-center">
            {/* Орталық Эмоциялы Орб және Дыбыс толқыны */}
            <div className="relative flex h-48 w-48 sm:h-56 sm:w-56 items-center justify-center">
              {/* Дыбыс толқындарының динамикалық кеңеюі (Listening кезінде mic деңгейіне қарай) */}
              {state === 'listening' && !isMuted ? (
                <>
                  <span
                    className="absolute rounded-full bg-emerald-500/15 transition-all duration-75 ease-out"
                    style={{
                      width: `${Math.max(160, 160 + audioLevel * 1.5)}px`,
                      height: `${Math.max(160, 160 + audioLevel * 1.5)}px`,
                    }}
                  />
                  <span
                    className="absolute rounded-full bg-emerald-500/25 transition-all duration-75 ease-out"
                    style={{
                      width: `${Math.max(130, 130 + audioLevel * 1.0)}px`,
                      height: `${Math.max(130, 130 + audioLevel * 1.0)}px`,
                    }}
                  />
                </>
              ) : null}

              {/* Ойлану кезіндегі сиқырлы айналмалы жарқыл */}
              {state === 'thinking' ? (
                <>
                  <span className="absolute h-44 w-44 sm:h-52 sm:w-52 rounded-full border-2 border-purple-500/40 border-t-transparent animate-spin" />
                  <span className="absolute h-40 w-40 sm:h-48 sm:w-48 rounded-full bg-purple-500/20 animate-pulse" />
                </>
              ) : null}

              {/* Сөйлеу кезіндегі ырғақты дыбыс пульсациясы */}
              {state === 'speaking' ? (
                <>
                  <span className="absolute h-48 w-48 sm:h-56 sm:w-56 rounded-full bg-cyan-500/15 animate-ping" />
                  <span className="absolute h-42 w-42 sm:h-50 sm:w-50 rounded-full bg-cyan-500/25 animate-pulse" />
                </>
              ) : null}

              {/* Қуану (Happy) күйіндегі алтын ұшқындар */}
              {emotion === 'happy' && state !== 'thinking' ? (
                <span className="absolute -top-1 -right-1 z-20 text-amber-400 animate-bounce">
                  <Sparkles size={24} />
                </span>
              ) : null}

              {/* Негізгі интерактивті эмоционалды Орб */}
              <div
                className={cn(
                  'relative z-10 flex h-32 w-32 sm:h-36 sm:w-36 items-center justify-center rounded-full',
                  'shadow-2xl transition-all duration-500 select-none',
                  state === 'speaking'
                    ? 'bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-cyan-500/30'
                    : state === 'thinking'
                    ? 'bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-pink-500 text-white shadow-purple-500/30'
                    : state === 'listening'
                    ? isMuted
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-emerald-500/30'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {/* Эмоциялы бет-жүз бейнесі (GoPrep Emotional Avatar) */}
                <div className="flex flex-col items-center justify-center space-y-1">
                  {/* Көздері */}
                  <div className="flex items-center gap-4">
                    {emotion === 'happy' ? (
                      <>
                        <span className="text-xl font-black">^</span>
                        <span className="text-xl font-black">^</span>
                      </>
                    ) : state === 'thinking' ? (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-white animate-bounce" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white animate-bounce delay-150" />
                      </>
                    ) : state === 'speaking' ? (
                      <>
                        <span className="h-3 w-3 rounded-full bg-white" />
                        <span className="h-3 w-3 rounded-full bg-white" />
                      </>
                    ) : isMuted ? (
                      <>
                        <span className="h-1.5 w-3 bg-muted-foreground rounded-full" />
                        <span className="h-1.5 w-3 bg-muted-foreground rounded-full" />
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-full bg-white transition-all duration-100" />
                        <span className="h-3 w-3 rounded-full bg-white transition-all duration-100" />
                      </>
                    )}
                  </div>

                  {/* Ауыз / Көңіл-күй */}
                  <div className="pt-1">
                    {state === 'speaking' ? (
                      <span className="inline-block h-3 w-5 rounded-full border-2 border-white bg-white/40 animate-pulse" />
                    ) : emotion === 'happy' ? (
                      <span className="inline-block h-2 w-4 border-b-2 border-white rounded-full" />
                    ) : state === 'thinking' ? (
                      <span className="inline-block h-1.5 w-3 bg-white/80 rounded-full" />
                    ) : (
                      <span className="inline-block h-1.5 w-4 border-b border-white/80 rounded-full" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Статус мәтіні */}
            <div className="mt-3 space-y-1">
              {state === 'listening' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">
                    {isMuted ? 'Микрофон өшірулі' : 'Тыңдап тұрмын, сөйлей бер...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Сөйлеп болған соң өзі автоматты түрде жауап береді
                  </p>
                </div>
              ) : state === 'thinking' ? (
                <p className="text-sm font-bold text-purple-500 animate-pulse">
                  Сұрағыңды ойланып жатырмын...
                </p>
              ) : state === 'speaking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-cyan-500">
                    Sana жауап беруде...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    (Сөйлей бастасаң, AI бірден тоқтап сені тыңдайды)
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Сөйлесуді бастау үшін микрофонды басыңыз
                </p>
              )}

              {errorMessage ? (
                <div className="flex items-center justify-center gap-1.5 text-xs text-destructive pt-1">
                  <AlertCircle size={13} />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>

            {/* Қалқымалы диалог нәтижесі (GoPrep Clean Speech Bubble) */}
            {(currentTranscript || currentAiResponse) && (
              <div className="w-full mt-4 space-y-2 rounded-2xl bg-muted/40 p-3.5 text-left border border-border/40 backdrop-blur-md">
                {currentTranscript && (
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Сіз
                    </span>
                    <p className="text-xs font-medium text-foreground sm:text-sm">
                      {currentTranscript}
                    </p>
                  </div>
                )}
                {currentAiResponse && (
                  <div className="border-t border-border/40 pt-1.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Sana AI
                    </span>
                    <p className="text-xs text-foreground/90 sm:text-sm leading-relaxed">
                      {currentAiResponse}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Басқару түймелері (Mute & Hang Up) */}
            <div className="mt-6 flex items-center justify-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={toggleMute}
                className={cn(
                  'h-12 w-12 rounded-full border-border/60 transition-all shadow-md',
                  isMuted
                    ? 'bg-destructive/15 text-destructive border-destructive/40'
                    : 'text-foreground hover:bg-muted',
                )}
                title={isMuted ? 'Микрофонды қосу' : 'Микрофонды өшіру'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </Button>

              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-12 px-6 rounded-full font-semibold shadow-lg bg-rose-500 hover:bg-rose-600 text-white active:scale-95 transition-all"
              >
                <PhoneOff size={18} className="mr-2" />
                Сұхбатты аяқтау
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
