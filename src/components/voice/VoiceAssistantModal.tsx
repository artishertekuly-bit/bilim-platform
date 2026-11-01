import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Check,
  History,
  Mic,
  MicOff,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  promptRule: string;
}

const VOICE_MANNER_OPTIONS: MannerOption[] = [
  {
    id: 'modern',
    label: 'Қазіргі заманға сай',
    promptRule:
      'SPEAKING MANNER (MODERN / ҚАЗІРГІ ЗАМАНҒА САЙ): Speak in a crisp, up-to-date, smart, and effortless modern tone. Be clear, direct, and relatable without unnecessary filler.',
  },
  {
    id: 'warm',
    label: 'Жылы',
    promptRule:
      'SPEAKING MANNER (WARM / ЖЫЛЫ): Speak with deep warmth, kindness, empathy, and gentle encouragement. Use caring phrases like "Жарайсың, күнім!", "Уайымдама, бірге шешеміз", "Тамаша сұрақ!".',
  },
  {
    id: 'strict',
    label: 'Қатты',
    promptRule:
      'SPEAKING MANNER (STRICT / ҚАТТЫ): Speak like a strict, disciplined, no-nonsense coach or demanding teacher. Be firm, direct, concise, and focused purely on discipline and results ("Мұқият тыңда", "Нақты іске көшейік").',
  },
  {
    id: 'youth',
    label: 'Жастарша',
    promptRule:
      'SPEAKING MANNER (YOUTH / ЖАСТАРША): Speak like an energetic peer or cool older friend using natural youth expressions ("Досым", "Керемет вайб", "Топ екен", "Қазір тез шашып тастаймыз"). Keep it lively and fun.',
  },
  {
    id: 'mature',
    label: 'Үлкендерше',
    promptRule:
      'SPEAKING MANNER (MATURE / ҮЛКЕНДЕРШЕ): Speak with calm wisdom, composure, and thoughtful dignity like a respected mentor ("Балам", "Байыппен қарасақ", "Білімнің негізі — тәртіп пен зейін").',
  },
];

function buildClientInstructions(manner: VoiceManner): string {
  const found =
    VOICE_MANNER_OPTIONS.find((m) => m.id === manner) || VOICE_MANNER_OPTIONS[0];
  return `You are Sana, the voice assistant of "Bilim Platform", a learning platform for school students in Kazakhstan.
1. LANGUAGE MATCHING (CRITICAL): Always reply in the EXACT SAME language the student just spoke (Kazakh -> pure natural Kazakh, Russian -> Russian, English -> English). If unclear, default to Kazakh.
2. NEVER SPEAK UZBEK OR KYRGYZ: Kazakh is NOT Uzbek or Kyrgyz. Never use Uzbek words like "salom", "qalay", "yaxshi", "sizga", "qanday".
3. ${found.promptRule}
4. CONCISE & FAST: Answer in 1-2 short sentences (maximum 25-30 words). Go straight to the point.
5. Plain spoken words only. Write numbers as words. No emojis or markdown.`;
}

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
  return noisePatterns.some(
    (p) => lower === p || (lower.includes(p) && lower.length < 35),
  );
}

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

  const [mode, setMode] = useState<VoiceTierMode>(() => {
    try {
      const saved = localStorage.getItem(VOICE_MODE_STORAGE_KEY);
      return saved === 'pro' ? 'pro' : 'free';
    } catch {
      return 'free';
    }
  });

  const [manner, setManner] = useState<VoiceManner>(() => {
    try {
      const saved = localStorage.getItem(
        VOICE_MANNER_STORAGE_KEY,
      ) as VoiceManner | null;
      if (saved && VOICE_MANNER_OPTIONS.some((m) => m.id === saved)) {
        return saved;
      }
      return 'modern';
    } catch {
      return 'modern';
    }
  });

  const [activePanel, setActivePanel] = useState<'main' | 'manner' | 'history'>('main');
  const [state, setState] = useState<VoiceState>('idle');
  const [emotion, setEmotion] = useState<VoiceEmotion>('happy');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<VoiceDialogRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  const sessionIdRef = useRef<string>(`sess_${Date.now()}`);
  const pendingUserRef = useRef<string>('');
  const pendingAiRef = useRef<string>('');
  const currentUserMsgIdRef = useRef<string | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const stateRef = useRef<VoiceState>('idle');
  const mannerRef = useRef<VoiceManner>(manner);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
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

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const cleanupSession = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
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

  const loadHistory = useCallback(async () => {
    if (!session?.access_token) return;
    const records = await fetchVoiceHistory(session.access_token, 20);
    if (isMountedRef.current) {
      setHistoryList(records);
    }
  }, [session?.access_token]);

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

        let sum = 0;
        const binCount = Math.min(dataArray.length, 48);
        for (let i = 2; i < binCount; i++) {
          sum += dataArray[i];
        }
        const avg = sum / Math.max(1, binCount - 2);
        const rawLevel = Math.min(100, Math.round((avg / 145) * 100));
        const gatedLevel = rawLevel < 24 ? 0 : rawLevel;
        setAudioLevel(gatedLevel);
      } else {
        setAudioLevel(0);
      }

      animFrameRef.current = requestAnimationFrame(updateLevel);
    };

    animFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const handleSelectManner = useCallback((newManner: VoiceManner) => {
    setManner(newManner);
    mannerRef.current = newManner;
    setActivePanel('main');

    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        dataChannelRef.current.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: buildClientInstructions(newManner),
            },
          }),
        );
      } catch {
        // ignore
      }
    }
  }, []);

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

  // ---------------------------------------------------------------------------
  // ТЕГІН РЕЖИМ: Оқушы өзі бастап, өзі аяқтайды (автоматты тоқтамайды)
  // ---------------------------------------------------------------------------
  const startFreeRecording = useCallback(async () => {
    cleanupSession();
    setErrorMessage(null);
    setIsMuted(false);
    setState('listening');
    setEmotion('listening');

    try {
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
        if (blob.size < 600) {
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
              // ignore
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
          const msg =
            err instanceof Error ? err.message : 'Аудионы өңдеу кезінде қате шықты.';
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

  const finishFreeRecordingAndSend = useCallback(() => {
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
  // PRO РЕЖИМ: OpenAI Realtime WebRTC (Оқушы диалогты өзі бастап, өзі аяқтайды)
  // ---------------------------------------------------------------------------
  const handleRealtimeEvent = useCallback(
    (rawEvent: MessageEvent) => {
      if (!isMountedRef.current) return;

      try {
        const event = JSON.parse(rawEvent.data);
        const type: string = event.type || '';

        switch (type) {
          case 'input_audio_buffer.speech_started': {
            setState('listening');
            setEmotion('listening');
            pendingAiRef.current = '';
            currentAiMsgIdRef.current = null;
            currentUserMsgIdRef.current = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            break;
          }

          case 'input_audio_buffer.speech_stopped': {
            setState('thinking');
            setEmotion('thinking');
            break;
          }

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
            pendingUserRef.current = '';
            break;
          }

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

          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done': {
            const fullAiText = (event.transcript || pendingAiRef.current || '').trim();
            if (fullAiText) {
              const msgId = currentAiMsgIdRef.current || `a_${Date.now()}`;
              currentAiMsgIdRef.current = msgId;
              upsertMessage(msgId, 'assistant', fullAiText, false);

              const userText = (pendingUserRef.current || '').trim();
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

          default:
            break;
        }
      } catch {
        // ignore
      }
    },
    [session?.access_token, loadHistory, upsertMessage],
  );

  const startRealtimeSession = useCallback(async () => {
    cleanupSession();
    setErrorMessage(null);
    setIsMuted(false);
    setState('thinking');
    setEmotion('thinking');

    try {
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

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audioEl = new Audio();
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          audioEl.srcObject = remoteStream;
          audioEl.play().catch(() => {});

          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try {
              const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
              const remoteAnalyser = audioContextRef.current.createAnalyser();
              remoteAnalyser.fftSize = 256;
              remoteAnalyser.smoothingTimeConstant = 0.78;
              remoteSource.connect(remoteAnalyser);
              remoteAnalyserRef.current = remoteAnalyser;
            } catch {
              // ignore
            }
          }
        }
      };

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        if (!isMountedRef.current) return;
        setState('listening');
        setEmotion('listening');

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
                  threshold: 0.8,
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
        throw new Error('WebRTC SDP қатесі.');
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
        throw new Error(errText || `Қате: ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      startAudioAnimationLoop();
    } catch (err: unknown) {
      cleanupSession();
      if (isMountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : 'Сессияны қосу мүмкін болмады.';
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

  const stopVoiceSession = useCallback(() => {
    cleanupSession();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setState('idle');
    setEmotion('happy');
    setIsMuted(false);
  }, [cleanupSession]);

  // Режимді ауыстырғанда ештеңе автоматты түрде басталмайды
  const handleSwitchMode = useCallback(
    (nextMode: VoiceTierMode) => {
      if (nextMode === mode) return;
      stopVoiceSession();
      setErrorMessage(null);
      setMode(nextMode);
    },
    [mode, stopVoiceSession],
  );

  // Терезе ашылғанда ештеңе автоматты түрде басталмайды — тек пайдаланушы өзі бастайды
  useEffect(() => {
    isMountedRef.current = true;
    if (open) {
      loadHistory();
      setState('idle');
      setEmotion('happy');
      setActivePanel('main');
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
  }, [open, cleanupSession, loadHistory]);

  const statusLabel = (() => {
    if (state === 'error') return 'Қате шықты';
    if (isMuted) return 'Микрофон өшірулі';
    switch (state) {
      case 'listening':
        return 'Тыңдауда...';
      case 'thinking':
        return 'Ойлануда...';
      case 'speaking':
        return 'Жауап беруде...';
      default:
        return 'Дайын';
    }
  })();

  const isSessionActive =
    state === 'listening' || state === 'thinking' || state === 'speaking';

  const currentMannerObj =
    VOICE_MANNER_OPTIONS.find((m) => m.id === manner) || VOICE_MANNER_OPTIONS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'left-auto right-4 sm:right-6 top-1/2 -translate-y-1/2 translate-x-0',
          'w-[340px] sm:w-[360px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden',
          'bg-white dark:bg-zinc-950 text-black dark:text-white',
          'border border-black/15 dark:border-white/15 rounded-3xl shadow-2xl',
        )}
      >
        {/* Тақырып (Минималды қара-ақ) */}
        <DialogHeader className="px-4 pt-3.5 pb-2.5 flex flex-row items-center justify-between border-b border-black/10 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                isSessionActive
                  ? 'bg-black dark:bg-white animate-pulse'
                  : 'bg-black/25 dark:bg-white/25',
              )}
            />
            <DialogTitle className="text-sm font-bold tracking-tight">
              Sana
            </DialogTitle>
          </div>

          <div className="flex items-center gap-1 mr-7">
            <button
              type="button"
              onClick={() =>
                setActivePanel((p) => (p === 'manner' ? 'main' : 'manner'))
              }
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center transition-colors',
                activePanel === 'manner'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10',
              )}
              title="Сөйлесу манерасы"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setActivePanel((p) => (p === 'history' ? 'main' : 'history'))
              }
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center transition-colors',
                activePanel === 'history'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10',
              )}
              title="Тарих"
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </div>
        </DialogHeader>

        {/* Режим және Манера таңдағыш (Минималды қара-ақ) */}
        <div className="px-4 pt-2.5 pb-2 flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 shrink-0">
          <div className="inline-flex p-0.5 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleSwitchMode('free')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold transition-all',
                mode === 'free'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white',
              )}
            >
              Тегін
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('pro')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-semibold transition-all',
                mode === 'pro'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white',
              )}
            >
              PRO
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              setActivePanel((p) => (p === 'manner' ? 'main' : 'manner'))
            }
            className="px-2.5 py-1 rounded-full border border-black/15 dark:border-white/15 text-[11px] font-medium truncate hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            {currentMannerObj.label}
          </button>
        </div>

        {/* Ортаңғы бөлік: Негізгі көрініс / Манера панелі / Тарих */}
        <div className="px-4 py-3 flex-1 overflow-y-auto flex flex-col items-center">
          {activePanel === 'manner' ? (
            <div className="w-full space-y-1.5 py-1">
              <div className="flex items-center justify-between pb-1.5">
                <span className="text-xs font-bold">Сөйлесу манерасы</span>
                <button
                  type="button"
                  onClick={() => setActivePanel('main')}
                  className="text-[11px] underline opacity-70 hover:opacity-100"
                >
                  Артқа
                </button>
              </div>
              {VOICE_MANNER_OPTIONS.map((opt) => {
                const isSelected = opt.id === manner;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectManner(opt.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl border text-xs font-semibold transition-all',
                      isSelected
                        ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                        : 'bg-white text-black border-black/15 hover:bg-black/5 dark:bg-zinc-900 dark:text-white dark:border-white/15 dark:hover:bg-white/5',
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ) : activePanel === 'history' ? (
            <div className="w-full space-y-2 py-1">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold">
                  Тарих ({historyList.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActivePanel('main')}
                  className="text-[11px] underline opacity-70 hover:opacity-100"
                >
                  Артқа
                </button>
              </div>
              {historyList.length === 0 ? (
                <p className="text-xs text-black/40 dark:text-white/40 text-center py-10">
                  Бос
                </p>
              ) : (
                historyList.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-black/10 dark:border-white/10 p-2.5 text-xs space-y-1"
                  >
                    <p className="text-black/60 dark:text-white/60">
                      <strong className="text-black dark:text-white">Сіз: </strong>
                      {item.userTranscript}
                    </p>
                    <p className="font-medium">
                      <strong>Сана: </strong>
                      {item.aiResponse}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {/* Компактты Тақиялы Сана Аватары (бастапқы түрі мен анимациясы) */}
              <SanaTaqiyaAvatar
                state={state}
                emotion={emotion}
                audioLevel={audioLevel}
                className="w-32 h-28 shrink-0"
              />

              <p className="mt-0.5 text-[11px] font-medium text-black/60 dark:text-white/60">
                {statusLabel}
              </p>

              {errorMessage && (
                <div className="mt-2 w-full rounded-xl border border-black/20 dark:border-white/20 px-3 py-2 text-[11px] text-center">
                  {errorMessage}
                </div>
              )}

              {/* Қысқа әрі жинақы диалог тізімі */}
              <div className="mt-2.5 w-full h-32 overflow-y-auto rounded-2xl border border-black/10 dark:border-white/10 p-2.5 space-y-2">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-black/35 dark:text-white/35">
                    Диалогты бастаңыз
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-1.5 text-xs leading-snug',
                        msg.role === 'user'
                          ? 'ml-auto bg-black text-white dark:bg-white dark:text-black rounded-br-sm'
                          : 'mr-auto bg-black/5 text-black dark:bg-white/10 dark:text-white border border-black/10 dark:border-white/10 rounded-bl-sm',
                      )}
                    >
                      {msg.text}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </>
          )}
        </div>

        {/* Төменгі басқару батырмалары: Диалогты / Жазбаны қолмен бастау және аяқтау */}
        <div className="px-4 py-3 border-t border-black/10 dark:border-white/10 flex items-center justify-center gap-2 shrink-0">
          {mode === 'free' ? (
            state === 'listening' ? (
              <>
                <button
                  type="button"
                  onClick={finishFreeRecordingAndSend}
                  className="flex-1 h-10 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span>Аяқтау</span>
                </button>
                <button
                  type="button"
                  onClick={stopVoiceSession}
                  className="h-10 w-10 rounded-full border border-black/20 dark:border-white/20 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
                  title="Болдырмау"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : state === 'thinking' || state === 'speaking' ? (
              <button
                type="button"
                onClick={stopVoiceSession}
                className="w-full h-10 rounded-full border border-black dark:border-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Диалогты аяқтау</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startFreeRecording}
                className="w-full h-10 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Диалогты бастау</span>
              </button>
            )
          ) : isSessionActive ? (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className={cn(
                  'h-10 w-10 rounded-full border flex items-center justify-center transition-colors',
                  isMuted
                    ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                    : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10',
                )}
                title={isMuted ? 'Микрофонды қосу' : 'Микрофонды өшіру'}
              >
                {isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={stopVoiceSession}
                className="flex-1 h-10 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Диалогты аяқтау</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startRealtimeSession}
              className="w-full h-10 rounded-full bg-black text-white dark:bg-white dark:text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>Диалогты бастау</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
