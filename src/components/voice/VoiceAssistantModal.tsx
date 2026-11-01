import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Check,
  Crown,
  Flame,
  GraduationCap,
  Heart,
  History,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Square,
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
  createRealtimeSession,
  fetchVoiceHistory,
  saveVoiceTurn,
  sendVoiceInteractHttp,
  type VoiceDialogRecord,
  type VoiceEmotion,
  type VoiceManner,
  type VoiceState,
} from '@/lib/voice-api';
import SanaTaqiyaAvatar from './SanaTaqiyaAvatar';

interface LiveMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export type VoiceTierMode = 'free' | 'pro';

const MAX_LIVE_MESSAGES = 40;
const VOICE_MODE_STORAGE_KEY = 'sana_voice_assistant_mode';
const VOICE_MANNER_STORAGE_KEY = 'sana_voice_assistant_manner';

interface MannerOption {
  id: VoiceManner;
  label: string;
  shortDesc: string;
  badgeColor: string;
  promptRule: string;
}

const VOICE_MANNER_OPTIONS: MannerOption[] = [
  {
    id: 'modern',
    label: 'Қазіргі заманға сай',
    shortDesc: 'Заманауи, жеңіл, жинақы әрі нақты жауап',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
    promptRule:
      'SPEAKING MANNER (MODERN / ҚАЗІРГІ ЗАМАНҒА САЙ): Speak in a crisp, up-to-date, smart, and effortless modern tone. Be clear, direct, and relatable without unnecessary filler.',
  },
  {
    id: 'warm',
    label: 'Жылы',
    shortDesc: 'Мейірімді, жұмсақ, қамқор әрі қолдаушы',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    promptRule:
      'SPEAKING MANNER (WARM / ЖЫЛЫ): Speak with deep warmth, kindness, empathy, and gentle encouragement. Use caring phrases like "Жарайсың, күнім!", "Уайымдама, бірге шешеміз", "Тамаша сұрақ!".',
  },
  {
    id: 'strict',
    label: 'Қатты',
    shortDesc: 'Талапшыл, тәртіпті, нақты фактімен қысқа жауап',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    promptRule:
      'SPEAKING MANNER (STRICT / ҚАТТЫ): Speak like a strict, disciplined, no-nonsense coach or demanding teacher. Be firm, direct, concise, and focused purely on discipline and results ("Мұқият тыңда", "Нақты іске көшейік").',
  },
  {
    id: 'youth',
    label: 'Жастарша',
    shortDesc: 'Еркін, жақын дос сияқты, жастар тілімен',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800',
    promptRule:
      'SPEAKING MANNER (YOUTH / ЖАСТАРША): Speak like an energetic peer or cool older friend using natural youth expressions ("Досым", "Керемет вайб", "Топ екен", "Қазір тез шашып тастаймыз"). Keep it lively and fun.',
  },
  {
    id: 'mature',
    label: 'Үлкендерше',
    shortDesc: 'Салмақты, дана, байыпты ұстаз стилінде',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    promptRule:
      'SPEAKING MANNER (MATURE / ҮЛКЕНДЕРШЕ): Speak with calm wisdom, composure, and thoughtful dignity like a respected mentor ("Балам", "Байыппен қарасақ", "Білімнің негізі — тәртіп пен зейін").',
  },
];

function buildClientInstructions(manner: VoiceManner): string {
  const found = VOICE_MANNER_OPTIONS.find((m) => m.id === manner) || VOICE_MANNER_OPTIONS[0];
  return `You are Sana, the voice assistant of "Bilim Platform", a learning platform for school students in Kazakhstan.
1. LANGUAGE MATCHING (CRITICAL): Always reply in the EXACT SAME language the student just spoke (Kazakh -> pure natural Kazakh, Russian -> Russian, English -> English). If unclear, default to Kazakh.
2. NEVER SPEAK UZBEK OR KYRGYZ: Kazakh is NOT Uzbek or Kyrgyz. Never use Uzbek words like "salom", "qalay", "yaxshi", "sizga", "qanday".
3. ${found.promptRule}
4. CONCISE & FAST: Answer in 1-2 short sentences (maximum 25-30 words). Go straight to the point.
5. Plain spoken words only. Write numbers as words. No emojis or markdown.`;
}

// Whisper тыныштықта шығаратын жалған (галлюцинация) тіркестерді сүзгілеу
function isNoiseHallucination(text: string): boolean {
  const cleaned = text.trim();
  if (!cleaned || cleaned.length < 2) return true;
  if (/^[.,!?;:\-…\s]+$/.test(cleaned)) return true;
  const lower = cleaned.toLowerCase();
  const noisePatterns = [
    'субтитры',
    'редактор субтитров',
    'продолжение следует',
    'спасибо за просмотр',
    'подписывайтесь',
    'thank you for watching',
    'thanks for watching',
    'subtitles by',
    'amara.org',
    'mbc',
    'you',
  ];
  return noisePatterns.some((p) => lower === p || (lower.includes(p) && lower.length < 35));
}

// Мәтіннің тілін шамамен анықтау (тарихта сақтау үшін)
function detectLanguage(text: string): string {
  if (/[әғқңөұүһі]/i.test(text)) return 'kk';
  if (/[а-яё]/i.test(text)) return 'ru';
  if (/[a-z]/i.test(text)) return 'en';
  return 'kk';
}

interface VoiceAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoiceAssistantModal({
  open,
  onOpenChange,
}: VoiceAssistantModalProps) {
  const { session } = useAuth();

  // Режим: 'free' (Жазып алып -> STT -> LLM -> TTS) немесе 'pro' (ChatGPT WebRTC Realtime)
  const [mode, setMode] = useState<VoiceTierMode>(() => {
    try {
      const saved = localStorage.getItem(VOICE_MODE_STORAGE_KEY);
      return saved === 'pro' ? 'pro' : 'free';
    } catch {
      return 'free';
    }
  });

  // Сөйлесу манерасы: 'modern' | 'warm' | 'strict' | 'youth' | 'mature'
  const [manner, setManner] = useState<VoiceManner>(() => {
    try {
      const saved = localStorage.getItem(VOICE_MANNER_STORAGE_KEY) as VoiceManner | null;
      if (saved && VOICE_MANNER_OPTIONS.some((m) => m.id === saved)) {
        return saved;
      }
      return 'modern';
    } catch {
      return 'modern';
    }
  });
  const [showMannerPanel, setShowMannerPanel] = useState<boolean>(false);

  // Негізгі күйлер
  const [state, setState] = useState<VoiceState>('idle');
  const [emotion, setEmotion] = useState<VoiceEmotion>('happy');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<VoiceDialogRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Ағымдағы сессияның нақты уақыттағы диалогы (оқушы + көмекші)
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // WebRTC & Audio Рефтер
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Web Audio API (Visualizer үшін)
  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Тегін (Free) режимнің MediaRecorder рефтері
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenInFreeTurnRef = useRef<boolean>(false);
  const speechFrameCountRef = useRef<number>(0);

  // Сессия және транскрипт рефтері
  const sessionIdRef = useRef<string>(`sess_${Date.now()}`);
  const pendingUserRef = useRef<string>('');
  const pendingAiRef = useRef<string>('');
  const currentUserMsgIdRef = useRef<string | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const stateRef = useRef<VoiceState>('idle');
  const modeRef = useRef<VoiceTierMode>(mode);
  const mannerRef = useRef<VoiceManner>(manner);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    modeRef.current = mode;
    try {
      localStorage.setItem(VOICE_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  useEffect(() => {
    mannerRef.current = manner;
    try {
      localStorage.setItem(VOICE_MANNER_STORAGE_KEY, manner);
    } catch {
      // ignore
    }
  }, [manner]);

  // Диалог жаңарған сайын төменге авто-айналдыру
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Тазалау (Cleanup) функциясы
  // ---------------------------------------------------------------------------
  const cleanupSession = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];
    hasSpokenInFreeTurnRef.current = false;
    speechFrameCountRef.current = 0;

    if (ttsAudioRef.current) {
      try {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.src = '';
      } catch {
        // ignore
      }
      ttsAudioRef.current = null;
    }

    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch {
        // ignore
      }
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {
        // ignore
      }
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // ---------------------------------------------------------------------------
  // Тарихты жүктеу (Supabase RLS)
  // ---------------------------------------------------------------------------
  const loadHistory = useCallback(async () => {
    if (!session?.access_token) return;
    const records = await fetchVoiceHistory(session.access_token, 20);
    if (isMountedRef.current) {
      setHistoryList(records);
    }
  }, [session?.access_token]);

  // ---------------------------------------------------------------------------
  // Web Audio API Visualizer (кіріс және шығыс дыбыс деңгейін өлшеу + Шу сүзгісі)
  // ---------------------------------------------------------------------------
  const startAudioAnimationLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const updateLevel = () => {
      if (!isMountedRef.current) return;

      const currentState = stateRef.current;
      let activeAnalyser: AnalyserNode | null = null;

      if (currentState === 'speaking' && remoteAnalyserRef.current) {
        activeAnalyser = remoteAnalyserRef.current;
      } else if (localAnalyserRef.current) {
        activeAnalyser = localAnalyserRef.current;
      }

      if (activeAnalyser) {
        const dataArray = new Uint8Array(activeAnalyser.frequencyBinCount);
        activeAnalyser.getByteFrequencyData(dataArray);

        // Тек адам дауысының жиілік диапазонын басымдықпен есептеу
        let sum = 0;
        const binCount = Math.min(dataArray.length, 48);
        for (let i = 2; i < binCount; i++) {
          sum += dataArray[i];
        }
        const avg = sum / Math.max(1, binCount - 2);
        const rawLevel = Math.min(100, Math.round((avg / 145) * 100));

        // Шу қақпағы (Noise Gate): 22-ден төмен бөлме шуын 0 деп есептейміз
        const gatedLevel = rawLevel < 22 ? 0 : rawLevel;
        setAudioLevel(gatedLevel);

        // Тегін режимде: оқушы анық сөйлегенін тексеру және сөйлеп біткен соң авто-тоқтату
        if (
          modeRef.current === 'free' &&
          currentState === 'listening' &&
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === 'recording'
        ) {
          // Бөлмедегі кездейсоқ тықырды емес, кемінде 6 кадр бойы анық дауысты (> 38) күтеміз
          if (rawLevel > 38) {
            speechFrameCountRef.current += 1;
            if (speechFrameCountRef.current >= 6) {
              hasSpokenInFreeTurnRef.current = true;
            }
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (rawLevel < 20 && hasSpokenInFreeTurnRef.current && !silenceTimerRef.current) {
            // Оқушы сөйлеп болған соң 2.2 секунд тыныштық болса — автоматты жіберу
            silenceTimerRef.current = setTimeout(() => {
              if (
                mediaRecorderRef.current &&
                mediaRecorderRef.current.state === 'recording'
              ) {
                try {
                  mediaRecorderRef.current.stop();
                } catch {
                  // ignore
                }
              }
            }, 2200);
          }
        }
      } else {
        setAudioLevel(0);
      }

      animFrameRef.current = requestAnimationFrame(updateLevel);
    };

    animFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  // ---------------------------------------------------------------------------
  // Сөйлесу манерасын ауыстыру (Тікелей эфирде де бірден қолданылады)
  // ---------------------------------------------------------------------------
  const handleSelectManner = useCallback((newManner: VoiceManner) => {
    setManner(newManner);
    mannerRef.current = newManner;

    // Егер Pro (WebRTC) сессиясы ашық тұрса — session.update арқылы жаңа манераны бірден жібереміз
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        const updatedInstructions = buildClientInstructions(newManner);
        dataChannelRef.current.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: updatedInstructions,
            },
          }),
        );
      } catch (e) {
        console.warn('Could not update manner on active realtime session:', e);
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Диалог тізіміне хабарлама қосу немесе жаңарту
  // ---------------------------------------------------------------------------
  const upsertMessage = useCallback(
    (id: string, role: 'user' | 'assistant', text: string, append = false) => {
      if (!text) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            text: append ? updated[idx].text + text : text,
          };
          return updated;
        }
        const next = [...prev, { id, role, text }];
        return next.length > MAX_LIVE_MESSAGES
          ? next.slice(next.length - MAX_LIVE_MESSAGES)
          : next;
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // 1-РЕЖИМ (ТЕГІН / FREE): Аудио жазып алу -> STT -> LLM -> Text-to-Speech
  // ---------------------------------------------------------------------------
  const speakWithBrowserTtsFallback = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const lang = detectLanguage(text);
        utterance.lang = lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'kk-KZ';
        utterance.rate = 1.0;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve();
      }
    });
  }, []);

  const startFreeRecording = useCallback(async () => {
    cleanupSession();
    setErrorMessage(null);
    setIsMuted(false);
    setState('listening');
    setEmotion('listening');
    hasSpokenInFreeTurnRef.current = false;
    speechFrameCountRef.current = 0;

    try {
      // Қоршаған орта шуын басу (noiseSuppression + echoCancellation)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const localSource = audioCtx.createMediaStreamSource(stream);
      const localAnalyser = audioCtx.createAnalyser();
      localAnalyser.fftSize = 256;
      localAnalyser.smoothingTimeConstant = 0.78;
      localSource.connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;

      startAudioAnimationLoop();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
        }

        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];

        if (!isMountedRef.current || chunks.length === 0) {
          if (isMountedRef.current) {
            setState('idle');
            setEmotion('happy');
          }
          return;
        }

        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        if (blob.size < 800) {
          setState('idle');
          setEmotion('happy');
          return;
        }

        setState('thinking');
        setEmotion('thinking');

        try {
          const result = await sendVoiceInteractHttp(blob, {
            accessToken: session?.access_token,
            sessionId: sessionIdRef.current,
            manner: mannerRef.current,
          });

          if (!isMountedRef.current) return;

          const userMsgId = `u_${Date.now()}`;
          const aiMsgId = `a_${Date.now() + 1}`;

          if (result.userTranscript && !isNoiseHallucination(result.userTranscript)) {
            upsertMessage(userMsgId, 'user', result.userTranscript, false);
          }
          if (result.aiResponse) {
            upsertMessage(aiMsgId, 'assistant', result.aiResponse, false);
          }

          loadHistory();

          // Text-to-Speech дыбысын ойнату
          setState('speaking');
          setEmotion('speaking');

          if (result.audioUrl) {
            const audioEl = new Audio(result.audioUrl);
            ttsAudioRef.current = audioEl;

            try {
              if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                const srcNode = audioContextRef.current.createMediaElementSource(audioEl);
                const remAnalyser = audioContextRef.current.createAnalyser();
                remAnalyser.fftSize = 256;
                srcNode.connect(remAnalyser);
                remAnalyser.connect(audioContextRef.current.destination);
                remoteAnalyserRef.current = remAnalyser;
              }
            } catch {
              // ignore analyser binding error
            }

            audioEl.onended = () => {
              if (!isMountedRef.current) return;
              setState('idle');
              setEmotion('happy');
              setAudioLevel(0);
            };
            audioEl.onerror = async () => {
              if (!isMountedRef.current) return;
              await speakWithBrowserTtsFallback(result.aiResponse);
              if (isMountedRef.current) {
                setState('idle');
                setEmotion('happy');
                setAudioLevel(0);
              }
            };

            await audioEl.play();
          } else {
            await speakWithBrowserTtsFallback(result.aiResponse);
            if (isMountedRef.current) {
              setState('idle');
              setEmotion('happy');
              setAudioLevel(0);
            }
          }
        } catch (err: unknown) {
          if (!isMountedRef.current) return;
          const msg = err instanceof Error ? err.message : 'Аудионы өңдеу кезінде қате шықты.';
          setErrorMessage(msg);
          setState('error');
          setEmotion('happy');
        }
      };

      recorder.start(200);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : 'Микрофонға рұқсат берілмеді немесе құрылғы табылмады.';
      setErrorMessage(msg);
      setState('error');
      setEmotion('happy');
    }
  }, [
    cleanupSession,
    loadHistory,
    session?.access_token,
    speakWithBrowserTtsFallback,
    startAudioAnimationLoop,
    upsertMessage,
  ]);

  const stopFreeRecordingAndSend = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // 2-РЕЖИМ (PRO / АҚЫЛЫ): OpenAI Realtime DataChannel оқиғаларын өңдеу
  // ---------------------------------------------------------------------------
  const handleRealtimeEvent = useCallback(
    (rawEvent: MessageEvent) => {
      if (!isMountedRef.current) return;

      try {
        const event = JSON.parse(rawEvent.data);
        const type: string = event.type || '';

        switch (type) {
          // 1. Оқушы сөйлей бастады (Server VAD анықтады)
          case 'input_audio_buffer.speech_started': {
            setState('listening');
            setEmotion('listening');
            pendingAiRef.current = '';
            currentAiMsgIdRef.current = null;
            const newUserMsgId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            currentUserMsgIdRef.current = newUserMsgId;
            break;
          }

          // 2. Оқушы сөйлеуді аяқтады -> Ойлану режимі
          case 'input_audio_buffer.speech_stopped': {
            setState('thinking');
            setEmotion('thinking');
            break;
          }

          // 3. Оқушының сөзі транскрипцияланды (Whisper-1)
          case 'conversation.item.input_audio_transcription.delta': {
            const delta = (event.delta || '').trim();
            if (delta) {
              if (!currentUserMsgIdRef.current) {
                currentUserMsgIdRef.current = `u_${Date.now()}`;
              }
              upsertMessage(currentUserMsgIdRef.current, 'user', event.delta, true);
            }
            break;
          }

          case 'conversation.item.input_audio_transcription.completed': {
            const transcript = (event.transcript || '').trim();
            // Жалған шуды немесе бос транскриптті елемейміз
            if (transcript && !isNoiseHallucination(transcript)) {
              pendingUserRef.current = transcript;
              const msgId = currentUserMsgIdRef.current || `u_${Date.now()}`;
              currentUserMsgIdRef.current = msgId;
              upsertMessage(msgId, 'user', transcript, false);
            } else {
              pendingUserRef.current = '';
            }
            break;
          }

          case 'conversation.item.input_audio_transcription.failed': {
            // Шу немесе түсініксіз дыбыс болғанда жалған "[дауыстық хабарлама]" жазбаймыз
            pendingUserRef.current = '';
            break;
          }

          // 4. ЖИ жауап бере бастады (Delta транскрипті: GA + ескі атауы)
          case 'response.output_audio_transcript.delta':
          case 'response.audio_transcript.delta': {
            const delta = event.delta || '';
            if (delta) {
              setState('speaking');
              setEmotion('speaking');
              pendingAiRef.current += delta;

              if (!currentAiMsgIdRef.current) {
                currentAiMsgIdRef.current = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              }
              upsertMessage(currentAiMsgIdRef.current, 'assistant', delta, true);
            }
            break;
          }

          // 5. ЖИ толық жауап мәтіні дайын болды -> Supabase-ке бірден сақтау
          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done': {
            const fullAiText = (event.transcript || pendingAiRef.current || '').trim();
            if (fullAiText) {
              const msgId = currentAiMsgIdRef.current || `a_${Date.now()}`;
              currentAiMsgIdRef.current = msgId;
              upsertMessage(msgId, 'assistant', fullAiText, false);

              const userText = (pendingUserRef.current || '').trim();
              // Тек шынайы диалог болғанда ғана тарихқа сақтаймыз
              if (userText && !isNoiseHallucination(userText)) {
                const detectedLang = detectLanguage(`${userText} ${fullAiText}`);
                saveVoiceTurn(
                  {
                    userTranscript: userText,
                    aiResponse: fullAiText,
                    sessionId: sessionIdRef.current,
                    emotion: 'happy',
                    language: detectedLang,
                  },
                  session?.access_token,
                ).then(() => {
                  loadHistory();
                });
              }

              pendingUserRef.current = '';
              pendingAiRef.current = '';
              currentUserMsgIdRef.current = null;
              currentAiMsgIdRef.current = null;
            }
            break;
          }

          // 6. Аудио ағыны аяқталды -> Қайтадан тыңдау режиміне көшу
          case 'output_audio_buffer.stopped':
          case 'response.done': {
            setTimeout(() => {
              if (isMountedRef.current && stateRef.current === 'speaking') {
                setState('listening');
                setEmotion('listening');
              }
            }, 350);
            break;
          }

          case 'error': {
            console.warn('OpenAI Realtime event notice:', event.error);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.warn('Failed to parse OpenAI Realtime event:', err);
      }
    },
    [session?.access_token, loadHistory, upsertMessage],
  );

  // ---------------------------------------------------------------------------
  // 2-РЕЖИМ (PRO / АҚЫЛЫ): OpenAI WebRTC Realtime сессиясын бастау
  // ---------------------------------------------------------------------------
  const startRealtimeSession = useCallback(async () => {
    cleanupSession();
    setErrorMessage(null);
    setIsMuted(false);
    setState('thinking');
    setEmotion('thinking');

    try {
      // 1. Микрофон рұқсатын сұрау (шу мен жаңғырықты басу қосылған)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;

      // 2. Бэкендтен OpenAI Ephemeral Client Secret алу (таңдалған манерамен)
      const sessionData = await createRealtimeSession(
        session?.access_token,
        mannerRef.current,
      );
      if (!isMountedRef.current) return;

      sessionIdRef.current = sessionData.session_id || `sess_${Date.now()}`;
      const ephemeralKey = sessionData.client_secret;
      const sessionInstructions =
        sessionData.instructions || buildClientInstructions(mannerRef.current);
      const sessionVoice = sessionData.voice || 'coral';

      // 3. Web Audio API (Visualizer үшін)
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const localSource = audioCtx.createMediaStreamSource(stream);
      const localAnalyser = audioCtx.createAnalyser();
      localAnalyser.fftSize = 256;
      localAnalyser.smoothingTimeConstant = 0.78;
      localSource.connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;

      // 4. RTCPeerConnection құру
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Шығыс (ЖИ) аудиосын ойнату
      const audioEl = new Audio();
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          audioEl.srcObject = remoteStream;
          audioEl.play().catch((e) => console.warn('Remote audio play warning:', e));

          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try {
              const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
              const remoteAnalyser = audioContextRef.current.createAnalyser();
              remoteAnalyser.fftSize = 256;
              remoteAnalyser.smoothingTimeConstant = 0.78;
              remoteSource.connect(remoteAnalyser);
              remoteAnalyserRef.current = remoteAnalyser;
            } catch (e) {
              console.warn('Could not attach remote stream analyser:', e);
            }
          }
        }
      };

      // Жергілікті микрофон трегін WebRTC-ке қосу
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 5. OpenAI Events DataChannel ашу
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        if (!isMountedRef.current) return;
        setState('listening');
        setEmotion('listening');

        // Сессия параметрлерін жіберу (OpenAI Realtime GA форматы)
        // threshold=0.78 және silence_duration_ms=900 — бөгде дыбыстарды елемеу үшін!
        const sessionUpdate = {
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: sessionInstructions,
            output_modalities: ['audio'],
            audio: {
              input: {
                transcription: {
                  model: 'whisper-1',
                },
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.78,
                  prefix_padding_ms: 350,
                  silence_duration_ms: 900,
                  create_response: true,
                  interrupt_response: true,
                },
              },
              output: {
                voice: sessionVoice,
              },
            },
          },
        };
        dc.send(JSON.stringify(sessionUpdate));
      };

      dc.onmessage = handleRealtimeEvent;

      dc.onerror = (err) => {
        console.error('DataChannel error:', err);
      };

      // 6. SDP Offer жасау және ICE кандидаттарды жинау
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }, 2000);
        function checkState() {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        }
        pc.addEventListener('icegatheringstatechange', checkState);
      });

      const localSdp = pc.localDescription?.sdp || offer.sdp;
      if (!localSdp) {
        throw new Error('Браузер WebRTC SDP Offer құра алмады.');
      }

      const modelName = sessionData.model || 'gpt-4o-realtime-preview';
      const callsUrl = `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(modelName)}`;

      let sdpResponse = await fetch(callsUrl, {
        method: 'POST',
        body: localSdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok && sdpResponse.status === 400) {
        const legacyUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(modelName)}`;
        const retryResponse = await fetch(legacyUrl, {
          method: 'POST',
          body: localSdp,
          headers: {
            Authorization: `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
        });
        if (retryResponse.ok) {
          sdpResponse = retryResponse;
        }
      }

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`OpenAI WebRTC байланыс қатесі: ${errText || sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      startAudioAnimationLoop();
    } catch (err: unknown) {
      console.error('Failed to start Realtime WebRTC session:', err);
      cleanupSession();
      if (isMountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : 'Дауыстық сессияны қосу мүмкін болмады. Микрофонды немесе интернетті тексеріңіз.';
        setErrorMessage(message);
        setState('error');
        setEmotion('happy');
      }
    }
  }, [
    cleanupSession,
    handleRealtimeEvent,
    session?.access_token,
    startAudioAnimationLoop,
  ]);

  // ---------------------------------------------------------------------------
  // Микрофонды уақытша өшіру / қосу (Mute / Unmute)
  // ---------------------------------------------------------------------------
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const nextMuted = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  // ---------------------------------------------------------------------------
  // Сессияны тоқтату
  // ---------------------------------------------------------------------------
  const stopVoiceSession = useCallback(() => {
    cleanupSession();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setState('idle');
    setEmotion('happy');
    setIsMuted(false);
  }, [cleanupSession]);

  // ---------------------------------------------------------------------------
  // Режимді ауыстыру (Free <-> Pro)
  // ---------------------------------------------------------------------------
  const handleSwitchMode = useCallback(
    (nextMode: VoiceTierMode) => {
      if (nextMode === mode) return;
      stopVoiceSession();
      setErrorMessage(null);
      setMode(nextMode);
      if (nextMode === 'pro') {
        setTimeout(() => {
          if (isMountedRef.current) {
            startRealtimeSession();
          }
        }, 120);
      }
    },
    [mode, startRealtimeSession, stopVoiceSession],
  );

  // ---------------------------------------------------------------------------
  // Модаль ашылғанда / жабылғанда
  // ---------------------------------------------------------------------------
  useEffect(() => {
    isMountedRef.current = true;
    if (open) {
      loadHistory();
      if (modeRef.current === 'pro') {
        startRealtimeSession();
      } else {
        setState('idle');
        setEmotion('happy');
      }
    } else {
      cleanupSession();
      setState('idle');
      setEmotion('happy');
      setErrorMessage(null);
    }

    return () => {
      isMountedRef.current = false;
      cleanupSession();
    };
  }, [open, cleanupSession, loadHistory, startRealtimeSession]);

  // ---------------------------------------------------------------------------
  // Статус мәтіні
  // ---------------------------------------------------------------------------
  const statusLabel = (() => {
    if (state === 'error') return 'Байланыс үзілді';
    if (isMuted) return 'Микрофон өшірулі';
    if (mode === 'free') {
      switch (state) {
        case 'listening':
          return 'Сөйлей беріңіз, жазылып жатыр...';
        case 'thinking':
          return 'Сана жауап дайындауда...';
        case 'speaking':
          return 'Сана дауыстап оқуда...';
        default:
          return 'Тегін режим: Микрофонды басып сөйлеңіз';
      }
    }
    switch (state) {
      case 'listening':
        return 'Сана сізді мұқият тыңдап тұр...';
      case 'thinking':
        return 'Сана ойланып жатыр...';
      case 'speaking':
        return 'Сана жауап беруде...';
      default:
        return 'Сөйлесуге дайын';
    }
  })();

  const isSessionActive =
    state === 'listening' || state === 'thinking' || state === 'speaking';

  const currentMannerObj =
    VOICE_MANNER_OPTIONS.find((m) => m.id === manner) || VOICE_MANNER_OPTIONS[0];

  const getMannerIcon = (id: VoiceManner) => {
    switch (id) {
      case 'modern':
        return <Sparkles className="h-3.5 w-3.5" />;
      case 'warm':
        return <Heart className="h-3.5 w-3.5" />;
      case 'strict':
        return <ShieldAlert className="h-3.5 w-3.5" />;
      case 'youth':
        return <Flame className="h-3.5 w-3.5" />;
      case 'mature':
        return <GraduationCap className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-white via-slate-50/90 to-emerald-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 shadow-2xl rounded-3xl">
        {/* Жоғарғы тақырып (Header) */}
        <DialogHeader className="px-5 pt-4 pb-2.5 flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full transition-colors duration-300',
                state === 'listening'
                  ? 'bg-emerald-500 animate-ping'
                  : state === 'speaking'
                    ? 'bg-sky-500 animate-pulse'
                    : state === 'thinking'
                      ? 'bg-amber-500 animate-pulse'
                      : state === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-300',
              )}
            />
            <DialogTitle className="text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              Sana Voice AI
              <span
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1',
                  mode === 'pro'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
                )}
              >
                {mode === 'pro' ? (
                  <>
                    <Crown className="h-2.5 w-2.5" />
                    PRO Live
                  </>
                ) : (
                  <>
                    <Volume2 className="h-2.5 w-2.5" />
                    Тегін TTS
                  </>
                )}
              </span>
            </DialogTitle>
          </div>

          <div className="flex items-center gap-1 mr-6">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 rounded-full',
                showMannerPanel &&
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
              )}
              onClick={() => {
                setShowMannerPanel((v) => !v);
                setShowHistory(false);
              }}
              title="Сөйлесу манерасын баптау"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 rounded-full',
                showHistory &&
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
              )}
              onClick={() => {
                setShowHistory((v) => !v);
                setShowMannerPanel(false);
              }}
              title="Сөйлесу тарихы"
            >
              <History className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Тегін / Ақылы (PRO) режим ауыстырғышы + Сөйлесу манерасы батырмасы */}
        <div className="px-5 pt-2.5 pb-1 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              onClick={() => handleSwitchMode('free')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200',
                mode === 'free'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Тегін (Жазба + TTS)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('pro')}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200',
                mode === 'pro'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              <Crown className="h-3.5 w-3.5" />
              <span>PRO (ChatGPT Live)</span>
            </button>
          </div>

          {/* Ағымдағы сөйлесу манерасының жылдам панелі */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setShowMannerPanel((v) => !v);
                setShowHistory(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-200',
                currentMannerObj.badgeColor,
              )}
            >
              <span className="flex items-center gap-1.5">
                {getMannerIcon(currentMannerObj.id)}
                <span>Сөйлесу манерасы:</span>
                <strong className="font-bold">{currentMannerObj.label}</strong>
              </span>
              <span className="text-[11px] underline opacity-80">
                {showMannerPanel ? 'Жабу' : 'Өзгерту'}
              </span>
            </button>
          </div>
        </div>

        {/* Қосымша панель: Сөйлесу манерасын таңдау (5 стиль) */}
        {showMannerPanel && (
          <div className="mx-5 mt-1 mb-2 p-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Аудиокөмекшінің сөйлесу манерасын таңдаңыз:
              </p>
              <span className="text-[10px] text-slate-400">Автоматты сақталады</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {VOICE_MANNER_OPTIONS.map((opt) => {
                const isSelected = opt.id === manner;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectManner(opt.id)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all duration-150',
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-500 shadow-sm'
                        : 'bg-slate-50/80 hover:bg-slate-100 text-slate-700 border-slate-200/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'p-1.5 rounded-lg shrink-0',
                          isSelected
                            ? 'bg-white/15 text-white'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300',
                        )}
                      >
                        {getMannerIcon(opt.id)}
                      </span>
                      <div className="truncate">
                        <div className="text-xs font-bold leading-tight">{opt.label}</div>
                        <div
                          className={cn(
                            'text-[11px] truncate',
                            isSelected ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {opt.shortDesc}
                        </div>
                      </div>
                    </div>

                    {isSelected && <Check className="h-4 w-4 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Негізгі мазмұн */}
        <div className="px-5 py-3 flex flex-col items-center">
          {/* 2D Тақиялы Сана Аватары (бастапқы түрі мен анимациясы сақталған) */}
          <div className="my-1">
            <SanaTaqiyaAvatar
              state={state}
              emotion={emotion}
              audioLevel={audioLevel}
            />
          </div>

          {/* Күй атауы */}
          <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300 tracking-wide text-center">
            {statusLabel}
          </p>

          {/* Қате шықса */}
          {errorMessage && (
            <div className="mt-2.5 w-full flex items-start gap-2 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 p-3 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1">
                <p className="font-semibold">Қате орын алды</p>
                <p className="mt-0.5 opacity-90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Тікелей диалог немесе Тарих тізімі */}
          {!showHistory ? (
            <div className="mt-3 w-full h-44 overflow-y-auto rounded-2xl bg-white/85 dark:bg-slate-900/75 border border-slate-200/70 dark:border-slate-800/80 p-3 space-y-2.5 shadow-inner">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 text-slate-400 dark:text-slate-500">
                  <p className="text-xs leading-relaxed">
                    {mode === 'free'
                      ? 'Төмендегі «Сөйлеуді бастау» батырмасын басып, сұрағыңызды айтыңыз. Сана сіз сөйлеген тілде және таңдалған манерада дауыстап жауап береді.'
                      : 'Қазақша, орысша немесе ағылшынша сөйлей беріңіз — Сана сіз сөйлеген тілде нақты уақытта қысқа әрі заманауи жауап береді.'}
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col max-w-[86%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed',
                      msg.role === 'user'
                        ? 'ml-auto bg-slate-900 text-white dark:bg-slate-800 rounded-br-sm'
                        : 'mr-auto bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/50 text-slate-800 dark:text-slate-100 rounded-bl-sm',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[10px] font-semibold mb-0.5',
                        msg.role === 'user'
                          ? 'text-slate-300'
                          : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {msg.role === 'user' ? 'Сіз' : `Сана (${currentMannerObj.label})`}
                    </span>
                    <p>{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="mt-3 w-full h-44 overflow-y-auto rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-3 space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Соңғы диалогтар ({historyList.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="text-[11px] font-medium text-emerald-600 hover:underline"
                >
                  Диалогқа оралу
                </button>
              </div>
              {historyList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Әзірге сақталған диалог жоқ.
                </p>
              ) : (
                historyList.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5 text-xs space-y-1 border border-slate-100 dark:border-slate-800"
                  >
                    <p className="text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        Сіз:{' '}
                      </span>
                      {item.userTranscript}
                    </p>
                    <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                      <span className="font-bold">Сана: </span>
                      {item.aiResponse}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Басқару батырмалары (Тегін және PRO режимдеріне сай) */}
          <div className="mt-4 mb-1 flex items-center justify-center gap-3">
            {mode === 'free' ? (
              <>
                {state === 'listening' ? (
                  <Button
                    onClick={stopFreeRecordingAndSend}
                    className="rounded-full px-6 py-5 bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-lg shadow-rose-500/25 flex items-center gap-2"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Аяқтап жіберу
                  </Button>
                ) : state === 'thinking' || state === 'speaking' ? (
                  <Button
                    variant="destructive"
                    onClick={stopVoiceSession}
                    className="rounded-full px-6 py-5 font-semibold flex items-center gap-2"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Тоқтату
                  </Button>
                ) : (
                  <Button
                    onClick={startFreeRecording}
                    className="rounded-full px-6 py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 flex items-center gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    Сөйлеуді бастау
                  </Button>
                )}
              </>
            ) : (
              <>
                {isSessionActive ? (
                  <>
                    <Button
                      type="button"
                      variant={isMuted ? 'destructive' : 'outline'}
                      size="icon"
                      onClick={toggleMute}
                      className="h-12 w-12 rounded-full shadow-sm"
                      title={isMuted ? 'Микрофонды қосу' : 'Микрофонды уақытша өшіру'}
                    >
                      {isMuted ? (
                        <MicOff className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5 text-emerald-600" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={stopVoiceSession}
                      className="h-12 px-6 rounded-full font-semibold shadow-md flex items-center gap-2"
                    >
                      <PhoneOff className="h-4 w-4" />
                      Тоқтату
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={startRealtimeSession}
                    className="rounded-full px-6 py-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg shadow-amber-500/25 flex items-center gap-2"
                  >
                    <Radio className="h-4 w-4" />
                    Live сөйлесуді бастау
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
