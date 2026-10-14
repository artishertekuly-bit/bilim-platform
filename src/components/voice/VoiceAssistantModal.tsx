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
  Send,
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
  sendVoiceInteractHttp,
  type VoiceDialogRecord,
  type VoiceEmotion,
  type VoiceState,
} from '@/lib/voice-api';
import SanaTaqiyaAvatar from './SanaTaqiyaAvatar';

interface VoiceAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Адам дауысының сезгіштік шегі
const VOICE_THRESHOLD = 7;
const SILENCE_DURATION_MS = 1200; // 1.2 секунд үнсіздіктен соң автоматты жіберу

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

  // Сұхбат мәтіндері
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [currentAiResponse, setCurrentAiResponse] = useState<string>('');
  const [sessionId] = useState<string>(() => `sess_${Date.now()}`);

  // Рефтер
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const hasSpokenRef = useRef<boolean>(false);

  // Синхрондау рефтері
  const stateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(open);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  isOpenRef.current = open;

  // AI дыбысын тоқтату
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

  // Барлық аудио ресурстарды тазарту
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

  // Аудио файлды тікелей Gemini 2.5 Flash HTTP POST арқылы жіберу
  const submitAudioToGemini = useCallback(
    async (blob: Blob) => {
      if (!isOpenRef.current || blob.size < 500) {
        if (stateRef.current !== 'speaking') {
          setState('listening');
          startRecordingSession();
        }
        return;
      }

      console.log('[Sana Gemini Voice] Sending audio blob to Gemini 2.5 Flash:', blob.size, 'bytes');
      setErrorMessage(null);
      setState('thinking');
      setEmotion('thinking');

      try {
        const result = await sendVoiceInteractHttp(blob, {
          accessToken: session?.access_token,
          sessionId,
        });

        if (!isOpenRef.current) return;

        console.log('[Sana Gemini Voice] Received result:', result);
        setCurrentTranscript(result.userTranscript);
        setCurrentAiResponse(result.aiResponse);
        setEmotion(result.emotion);

        // Егер дайын MP3 аудио келсе -> ойнату
        if (result.audioUrl) {
          setState('speaking');
          stopAudioPlayback();

          const audio = new Audio(result.audioUrl);
          audioPlayerRef.current = audio;

          audio.onended = () => {
            if (isOpenRef.current) {
              setState('listening');
              setEmotion('happy');
              startRecordingSession();
            }
          };

          audio.onerror = () => {
            if (isOpenRef.current) {
              setState('listening');
              startRecordingSession();
            }
          };

          await audio.play();
        } else {
          // Дыбыс болмаса, тек мәтін көрсетіп қайта тыңдау
          setState('listening');
          startRecordingSession();
        }
      } catch (err: any) {
        if (!isOpenRef.current) return;
        console.error('[Sana Gemini Voice] Error:', err);
        const errText = err?.message || 'Дыбысты өңдеу кезінде қате орын алды.';
        setErrorMessage(errText);
        setState('listening');
        startRecordingSession();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, session?.access_token, stopAudioPlayback]
  );

  // Жаңа MediaRecorder сессиясын бастау
  const startRecordingSession = useCallback(() => {
    if (!audioStreamRef.current || !isOpenRef.current) return;

    audioChunksRef.current = [];
    hasSpokenRef.current = false;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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

        if (hasSpokenRef.current && isOpenRef.current) {
          submitAudioToGemini(audioBlob);
        } else if (isOpenRef.current && stateRef.current === 'listening') {
          startRecordingSession();
        }
      };

      recorder.start(200); // 200мс сайын бөліп жинау
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('[Sana Gemini Voice] MediaRecorder init error:', err);
    }
  }, [submitAudioToGemini]);

  // Қолмен «Сөйлеп болдым (Жіберу)» батырмасын басу
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
      } catch (err) {
        console.warn('Error stopping recorder:', err);
      }
    }
  }, []);

  // Аудио бақылау (Дыбыс деңгейі және VAD)
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

          // Адам дауысының жиіліктері: 150Гц - 3000Гц
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

            // 1. Сөйлеп жатқанда оқушы сөйлесе -> AI дыбысын тоқтату (Barge-in)
            if (normalized > VOICE_THRESHOLD && stateRef.current === 'speaking') {
              stopAudioPlayback();
              setState('listening');
              setEmotion('listening');
              startRecordingSession();
            }

            // 2. Тыңдау кезінде сөйлеу мен үнсіздікті автоматты сезу
            if (stateRef.current === 'listening') {
              if (normalized > VOICE_THRESHOLD) {
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
    [startRecordingSession, stopAudioPlayback]
  );

  // Сұхбатты бастау
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

      startAudioMonitoring(stream);
      startRecordingSession();
    } catch (micErr: any) {
      console.error('[Sana Gemini Voice] Mic permission error:', micErr);
      setErrorMessage(
        micErr?.name === 'NotAllowedError'
          ? 'Микрофонға рұқсат берілмеді. Браузер баптауынан рұқсат етіңіз.'
          : 'Микрофон табылмады немесе басқа бағдарламамен бос емес.'
      );
      setState('error');
    }
  }, [startAudioMonitoring, startRecordingSession]);

  // Сұхбатты аяқтау
  const stopConversation = useCallback(() => {
    setState('idle');
    setEmotion('happy');
    cleanupAudio();
  }, [cleanupAudio]);

  // Микрофонды уақытша өшіру (Mute)
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

  // Ашылу / жабылу
  useEffect(() => {
    if (open) {
      startConversation();
    } else {
      stopConversation();
      setShowHistory(false);
    }
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio, open, startConversation, stopConversation]);

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
                Gemini 2.5 Flash
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

        {/* 1. Сұхбат тарихы */}
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
          /* 2. Негізгі таза, минималистік интерфейс */
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-between text-center pt-2 pb-1 space-y-4">
            {/* Орталық Жалпақ Тақиялы Қазақ Көмекшісі (Шетінде артық шеңберлерсіз) */}
            <div className="relative flex items-center justify-center my-1 select-none">
              <SanaTaqiyaAvatar
                state={state}
                emotion={emotion}
                audioLevel={audioLevel}
                isMuted={isMuted}
                onClick={state === 'listening' ? finishSpeakingAndSubmit : undefined}
              />
            </div>

            {/* Микрофон деңгейінің нәзік индикаторы */}
            {state === 'listening' && !isMuted ? (
              <div className="flex items-center justify-center gap-1.5 h-3">
                {[1, 2, 3, 4, 5, 6].map((bar) => {
                  const active = audioLevel > bar * 8;
                  return (
                    <span
                      key={bar}
                      className={cn(
                        'w-1 rounded-full transition-all duration-75',
                        active
                          ? 'bg-emerald-500 h-3'
                          : 'bg-muted-foreground/25 h-1',
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
                    Gemini 2.5 Flash өңдеуде
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

              {/* Қате шықса қызыл түспен көрсету */}
              {errorMessage ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive text-left">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>

            {/* Сұхбат нәтижесі (Bubble) */}
            {(currentTranscript || currentAiResponse) && (
              <div className="w-full max-h-36 overflow-y-auto space-y-2 rounded-2xl bg-muted/40 p-3.5 text-left border border-border/40 backdrop-blur-md">
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

            {/* Төменгі басқару түймелері */}
            <div className="w-full pt-1 pb-1 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              {state === 'listening' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={finishSpeakingAndSubmit}
                  className="w-full sm:w-auto h-11 px-6 rounded-full font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5"
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
                    'h-11 w-11 rounded-full border-border/60 transition-all shadow-xs',
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
                  className="h-11 px-5 rounded-full font-semibold shadow-md bg-rose-500 hover:bg-rose-600 text-white active:scale-95 transition-all text-xs flex items-center gap-1.5"
                >
                  <PhoneOff size={15} />
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
