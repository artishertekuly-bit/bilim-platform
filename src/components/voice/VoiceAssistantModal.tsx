import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Check,
  History,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
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

// Адам дауысын сезу шегі (Vocal Energy Threshold)
const VOICE_THRESHOLD = 8;
const SILENCE_DURATION_MS = 1000; // 1 секунд үнсіздік болса автоматты жіберу

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
  const [connectionMode, setConnectionMode] = useState<'ws' | 'rest' | 'connecting'>('connecting');

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
  const maxUtteranceTimerRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);

  // Синхрондау рефтері
  const stateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(open);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  isOpenRef.current = open;

  // AI дауысын бірден үзу (Barge-in / сөзді бөлу)
  const stopAudioPlayback = useCallback(() => {
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {
        // ignore
      }
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
    if (maxUtteranceTimerRef.current) {
      clearTimeout(maxUtteranceTimerRef.current);
      maxUtteranceTimerRef.current = null;
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
        console.log('[Sana Voice] Audio too small or modal closed, ignoring (size=' + blob.size + ')');
        if (stateRef.current !== 'speaking') {
          setState('listening');
          startRecorderChunk();
        }
        return;
      }

      console.log('[Sana Voice] Submitting voice blob, size =', blob.size, 'bytes');
      setErrorMessage(null);
      setState('thinking');
      setEmotion('thinking');

      // 1. WebSocket арқылы жіберуге тырысу
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = (reader.result as string).split(',')[1];
            if (base64Audio && wsRef.current?.readyState === WebSocket.OPEN) {
              console.log('[Sana Voice] Sending audio through WebSocket');
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
          console.warn('[Sana Voice] WebSocket send failed, falling back to REST:', wsErr);
        }
      }

      // 2. REST Fallback (егер WebSocket қосылмаған немесе жұмыс істемесе)
      try {
        console.log('[Sana Voice] Processing via REST endpoint fallback...');
        setConnectionMode('rest');
        const result = await sendVoiceInteractRest(blob, {
          accessToken: session?.access_token,
        });

        if (!isOpenRef.current) return;

        console.log('[Sana Voice] AI Reply received:', result.aiResponse);
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

        audio.onerror = (e) => {
          console.warn('[Sana Voice] Audio playback failed:', e);
          if (isOpenRef.current) {
            setState('listening');
            startRecorderChunk();
          }
        };

        await audio.play();
      } catch (restErr: any) {
        if (!isOpenRef.current) return;
        console.error('[Sana Voice] Voice processing error:', restErr);
        const errStr = restErr?.message || 'Дыбысты өңдеу кезінде қате орын алды.';
        setErrorMessage(errStr);
        setState('listening');
        startRecorderChunk();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.access_token, stopAudioPlayback]
  );

  // Жаңа аудио бөлігін жазуды бастау (MediaRecorder)
  const startRecorderChunk = useCallback(() => {
    if (!audioStreamRef.current || !isOpenRef.current) return;

    audioChunksRef.current = [];
    hasSpokenRef.current = false;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxUtteranceTimerRef.current) {
      clearTimeout(maxUtteranceTimerRef.current);
      maxUtteranceTimerRef.current = null;
    }

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
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

        console.log('[Sana Voice] MediaRecorder onstop, hasSpoken =', hasSpokenRef.current);
        if (hasSpokenRef.current && isOpenRef.current) {
          sendAudioUtterance(audioBlob);
        } else if (isOpenRef.current && stateRef.current === 'listening') {
          // Егер сөйлемеген болса, тыңдауды қайта жалғастыру
          startRecorderChunk();
        }
      };

      recorder.start(150); // 150мс сайын бөліп жинау
      mediaRecorderRef.current = recorder;
      console.log('[Sana Voice] MediaRecorder started listening');
    } catch (err) {
      console.warn('[Sana Voice] MediaRecorder creation error:', err);
    }
  }, [sendAudioUtterance]);

  // Қолмен / батырмамен сөйлеуді аяқтап, дереу AI-ға жіберу
  const finishSpeakingAndSubmit = useCallback(() => {
    if (stateRef.current !== 'listening') return;

    hasSpokenRef.current = true;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recorder:', e);
      }
    }
  }, []);

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
        analyser.smoothingTimeConstant = 0.2;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkAudio = () => {
          if (!isOpenRef.current) return;

          analyser.getByteFrequencyData(dataArray);

          // Адам дауысының жиіліктері: 150Гц - 3000Гц (2-ден 32-ге дейінгі биндер)
          const voiceBinsCount = 30;
          let voiceSum = 0;
          for (let i = 2; i < 2 + voiceBinsCount; i++) {
            voiceSum += dataArray[i];
          }
          const vocalAvg = voiceSum / voiceBinsCount;
          const normalized = Math.min(100, Math.round(vocalAvg * 1.6));

          if (isMutedRef.current) {
            setAudioLevel(0);
          } else {
            setAudioLevel(normalized);

            // 1. BARGE-IN: Егер AI сөйлеп жатқанда оқушы сөйлесе -> AI бірден тоқтайды
            if (normalized > VOICE_THRESHOLD && stateRef.current === 'speaking') {
              console.log('[Sana Voice] Barge-in triggered (interrupted by user)');
              stopAudioPlayback();
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
              }
              setState('listening');
              setEmotion('listening');
              startRecorderChunk();
            }

            // 2. VAD: Тыңдау кезіндегі сөйлеу мен үнсіздікті автоматты сезу
            if (stateRef.current === 'listening') {
              if (normalized > VOICE_THRESHOLD) {
                if (!hasSpokenRef.current) {
                  console.log('[Sana Voice] User speech detected (level = ' + normalized + ')');
                  hasSpokenRef.current = true;

                  // Егер 14 секундтан артық үздіксіз сөйлесе, автоматты жіберу
                  if (!maxUtteranceTimerRef.current) {
                    maxUtteranceTimerRef.current = window.setTimeout(() => {
                      if (
                        mediaRecorderRef.current &&
                        mediaRecorderRef.current.state === 'recording'
                      ) {
                        mediaRecorderRef.current.stop();
                      }
                    }, 14000);
                  }
                }

                if (silenceTimerRef.current) {
                  clearTimeout(silenceTimerRef.current);
                  silenceTimerRef.current = null;
                }
              } else if (hasSpokenRef.current) {
                // Сөйлеп болды, үнсіздік таймерін бастау
                if (!silenceTimerRef.current) {
                  silenceTimerRef.current = window.setTimeout(() => {
                    silenceTimerRef.current = null;
                    console.log('[Sana Voice] Silence duration reached, auto-submitting audio');
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
        console.warn('[Sana Voice] AudioContext monitoring setup error:', err);
      }
    },
    [startRecorderChunk, stopAudioPlayback]
  );

  // WebSocket байланысын бастау
  const initWebSocket = useCallback(() => {
    closeWebSocket();
    try {
      const wsUrl = getVoiceWsUrl();
      console.log('[Sana Voice] Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Sana Voice] WebSocket connected successfully');
        setConnectionMode('ws');
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
          console.log('[Sana Voice] WS message received:', msg.type);

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
            console.warn('[Sana Voice] Backend error:', msg.message);
            setErrorMessage(msg.message);
          }
        } catch (parseErr) {
          console.warn('[Sana Voice] WS parse error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('[Sana Voice] WebSocket connection error, REST will be used:', err);
        setConnectionMode('rest');
      };

      ws.onclose = () => {
        console.log('[Sana Voice] WebSocket disconnected');
      };
    } catch (wsErr) {
      console.warn('[Sana Voice] WebSocket open failed, using REST fallback:', wsErr);
      setConnectionMode('rest');
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
    } catch (micErr: any) {
      console.error('[Sana Voice] Microphone access error:', micErr);
      setErrorMessage(
        micErr?.name === 'NotAllowedError'
          ? 'Микрофонға рұқсат берілмеді. Браузердің жоғарғы мекенжай қатарынан микрофонды қосыңыз.'
          : 'Микрофон табылмады немесе басқа бағдарламамен бос емес.'
      );
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
          'w-[calc(100%-1.5rem)] max-w-md sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden',
          'rounded-3xl border border-border/70 p-5 sm:p-7',
          'bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-300',
        )}
      >
        {/* Жоғарғы тақырыпша */}
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 shrink-0">
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
            <DialogTitle className="text-sm sm:text-base font-bold tracking-tight text-foreground flex items-center gap-2">
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
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Сұхбат тарихы"
            >
              <History size={16} />
            </Button>
          </div>
        </DialogHeader>

        {/* 1. Сұхбат тарихы панелі */}
        {showHistory ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left my-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Соңғы сұрақ-жауаптар
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
              <p className="text-xs text-muted-foreground py-8 text-center">
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
                  <p className="text-xs text-primary leading-relaxed">
                    🤖 {item.aiResponse}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : (
          /* 2. Негізгі GoPrep Визуалды Интерфейсі */
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-between text-center pt-2 pb-1 space-y-4">
            {/* Орталық Эмоциялы Орб және Дыбыс толқыны */}
            <div className="relative flex h-40 w-40 sm:h-48 sm:w-48 items-center justify-center my-1 select-none">
              {/* Дыбыс толқындарының динамикалық кеңеюі (Listening кезінде mic деңгейіне қарай) */}
              {state === 'listening' && !isMuted ? (
                <>
                  <span
                    className="absolute rounded-full bg-emerald-500/15 transition-all duration-75 ease-out pointer-events-none"
                    style={{
                      width: `${Math.max(130, 130 + audioLevel * 1.3)}px`,
                      height: `${Math.max(130, 130 + audioLevel * 1.3)}px`,
                    }}
                  />
                  <span
                    className="absolute rounded-full bg-emerald-500/25 transition-all duration-75 ease-out pointer-events-none"
                    style={{
                      width: `${Math.max(105, 105 + audioLevel * 0.9)}px`,
                      height: `${Math.max(105, 105 + audioLevel * 0.9)}px`,
                    }}
                  />
                </>
              ) : null}

              {/* Ойлану кезіндегі сиқырлы айналмалы жарқыл */}
              {state === 'thinking' ? (
                <>
                  <span className="absolute h-36 w-36 sm:h-44 sm:w-44 rounded-full border-2 border-purple-500/40 border-t-transparent animate-spin pointer-events-none" />
                  <span className="absolute h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-purple-500/20 animate-pulse pointer-events-none" />
                </>
              ) : null}

              {/* Сөйлеу кезіндегі ырғақты дыбыс пульсациясы */}
              {state === 'speaking' ? (
                <>
                  <span className="absolute h-40 w-40 sm:h-48 sm:w-48 rounded-full bg-cyan-500/15 animate-ping pointer-events-none" />
                  <span className="absolute h-34 w-34 sm:h-42 sm:w-42 rounded-full bg-cyan-500/25 animate-pulse pointer-events-none" />
                </>
              ) : null}

              {/* Қуану (Happy) күйіндегі алтын ұшқындар */}
              {emotion === 'happy' && state !== 'thinking' ? (
                <span className="absolute 1 top-0 right-1 z-20 text-amber-400 animate-bounce pointer-events-none">
                  <Sparkles size={22} />
                </span>
              ) : null}

              {/* Негізгі интерактивті эмоционалды Орб (басуға болады) */}
              <button
                type="button"
                onClick={state === 'listening' ? finishSpeakingAndSubmit : undefined}
                className={cn(
                  'relative z-10 flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full cursor-pointer',
                  'shadow-2xl transition-all duration-300 active:scale-95 focus:outline-none focus:ring-4 focus:ring-primary/20',
                  state === 'speaking'
                    ? 'bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white shadow-cyan-500/30'
                    : state === 'thinking'
                    ? 'bg-gradient-to-tr from-purple-600 via-fuchsia-600 to-pink-500 text-white shadow-purple-500/30'
                    : state === 'listening'
                    ? isMuted
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-emerald-500/35 hover:scale-105'
                    : 'bg-primary text-primary-foreground',
                )}
                title={state === 'listening' ? 'Сөйлеп болсаңыз, осында басып бірден жіберіңіз' : undefined}
              >
                {/* Эмоциялы бет-жүз бейнесі (GoPrep Emotional Avatar) */}
                <div className="flex flex-col items-center justify-center space-y-1">
                  {/* Көздері */}
                  <div className="flex items-center gap-3">
                    {emotion === 'happy' ? (
                      <>
                        <span className="text-lg font-black leading-none">^</span>
                        <span className="text-lg font-black leading-none">^</span>
                      </>
                    ) : state === 'thinking' ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-white animate-bounce" />
                        <span className="h-2 w-2 rounded-full bg-white animate-bounce delay-150" />
                      </>
                    ) : state === 'speaking' ? (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-white" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white" />
                      </>
                    ) : isMuted ? (
                      <>
                        <span className="h-1 w-2.5 bg-muted-foreground rounded-full" />
                        <span className="h-1 w-2.5 bg-muted-foreground rounded-full" />
                      </>
                    ) : (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-white transition-all duration-100" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white transition-all duration-100" />
                      </>
                    )}
                  </div>

                  {/* Ауыз / Көңіл-күй */}
                  <div className="pt-0.5">
                    {state === 'speaking' ? (
                      <span className="inline-block h-2.5 w-4 rounded-full border-2 border-white bg-white/40 animate-pulse" />
                    ) : emotion === 'happy' ? (
                      <span className="inline-block h-1.5 w-3.5 border-b-2 border-white rounded-full" />
                    ) : state === 'thinking' ? (
                      <span className="inline-block h-1 w-2.5 bg-white/80 rounded-full" />
                    ) : (
                      <span className="inline-block h-1 w-3 border-b border-white/80 rounded-full" />
                    )}
                  </div>
                </div>
              </button>
            </div>

            {/* Микрофон деңгейінің индикаторы (Тірі толқын) */}
            {state === 'listening' && !isMuted ? (
              <div className="flex items-center justify-center gap-1 h-3">
                {[1, 2, 3, 4, 5, 6, 7].map((bar) => {
                  const active = audioLevel > bar * 8;
                  return (
                    <span
                      key={bar}
                      className={cn(
                        'w-1 rounded-full transition-all duration-75',
                        active
                          ? 'bg-emerald-500 h-3'
                          : 'bg-muted-foreground/30 h-1',
                      )}
                    />
                  );
                })}
              </div>
            ) : null}

            {/* Статус мәтіні */}
            <div className="space-y-1 px-2">
              {state === 'listening' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {isMuted ? 'Микрофон өшірулі' : 'Тыңдап тұрмын, сөйлей бер...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Сөйлеп болған соң өзі автоматты түрде жауап береді
                  </p>
                </div>
              ) : state === 'thinking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-purple-600 dark:text-purple-400 animate-pulse">
                    Сұрағыңды ойланып жатырмын...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Whisper және Qwen өңдеуде
                  </p>
                </div>
              ) : state === 'speaking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                    Sana жауап беруде...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    (Сөйлей бастасаң, AI бірден тоқтап сені тыңдайды)
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Сөйлесуді бастау үшін микрофонды қосыңыз
                </p>
              )}

              {/* Қате болса қызыл түспен анық көрсету */}
              {errorMessage ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>

            {/* Қалқымалы диалог нәтижесі (GoPrep Clean Speech Bubble) */}
            {(currentTranscript || currentAiResponse) && (
              <div className="w-full max-h-36 overflow-y-auto space-y-2 rounded-2xl bg-muted/40 p-3 text-left border border-border/40 backdrop-blur-md">
                {currentTranscript && (
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Сіз:
                    </span>
                    <p className="text-xs font-medium text-foreground sm:text-sm">
                      {currentTranscript}
                    </p>
                  </div>
                )}
                {currentAiResponse && (
                  <div className="border-t border-border/40 pt-1.5 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Sana AI:
                    </span>
                    <p className="text-xs text-foreground/90 sm:text-sm leading-relaxed">
                      {currentAiResponse}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Төменгі басқару түймелері (100% көрінетіндей орналасу) */}
            <div className="w-full pt-1 pb-1 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              {/* Сөйлеп болдым (Жіберу) жылдам батырмасы */}
              {state === 'listening' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={finishSpeakingAndSubmit}
                  className="w-full sm:w-auto h-10 px-5 rounded-full font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5"
                >
                  <Send size={14} />
                  <span>Сөйлеп болдым (Жіберу)</span>
                </Button>
              ) : null}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={toggleMute}
                  className={cn(
                    'h-10 w-10 rounded-full border-border/60 transition-all shadow-xs',
                    isMuted
                      ? 'bg-destructive/15 text-destructive border-destructive/40'
                      : 'text-foreground hover:bg-muted',
                  )}
                  title={isMuted ? 'Микрофонды қосу' : 'Микрофонды өшіру'}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-10 px-4 rounded-full font-semibold shadow-md bg-rose-500 hover:bg-rose-600 text-white active:scale-95 transition-all text-xs flex items-center gap-1.5"
                >
                  <PhoneOff size={14} />
                  <span>Аяқтау</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
