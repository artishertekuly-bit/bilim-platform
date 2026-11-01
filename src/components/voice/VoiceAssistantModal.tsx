import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Crown,
  History,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
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

// Бэкенд нұсқаулығы келмей қалған жағдайға арналған сақтық промпт
const FALLBACK_INSTRUCTIONS = `You are Sana, the friendly voice assistant of "Bilim Platform", a learning platform for school students in Kazakhstan.
Always reply in the SAME language the student just spoke (Kazakh -> Kazakh, Russian -> Russian, English -> English). If unclear, use Kazakh.
Kazakh is NOT Uzbek or Kyrgyz: when speaking Kazakh use only pure modern Kazakh.
Answer in 1-2 short sentences (about 25 words max), modern, warm and casual. Speak numbers as words. No emojis, markdown or lists.`;

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
  const audioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null);

  // Тегін режим (MediaRecorder + TTS Audio) рефтері
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const ttsAudioElRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const hasSpokenInFreeTurnRef = useRef<boolean>(false);

  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Диалогты Supabase-ке сақтау үшін жұп (оқушы сұрағы + көмекші жауабы) жинақтау
  const pendingUserRef = useRef<string>('');
  const pendingAiRef = useRef<string>('');
  const activeSessionIdRef = useRef<string>(`sess_${Date.now()}`);
  // Токен жаңарғанда WebRTC байланысы қайта қосылып кетпеуі үшін ref арқылы сақтаймыз
  const accessTokenRef = useRef<string | undefined>(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const stateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(open);
  const modeRef = useRef<VoiceTierMode>(mode);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  isOpenRef.current = open;
  modeRef.current = mode;

  // Барлық байланыс пен аудио ресурстарды тазарту
  const cleanupConnection = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
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

    if (ttsAudioElRef.current) {
      try {
        ttsAudioElRef.current.pause();
        ttsAudioElRef.current.src = '';
      } catch {
        // ignore
      }
      ttsAudioElRef.current = null;
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

    if (remoteAudioElRef.current) {
      try {
        remoteAudioElRef.current.pause();
        remoteAudioElRef.current.srcObject = null;
      } catch {
        // ignore
      }
      remoteAudioElRef.current = null;
    }

    if (localAudioContextRef.current && localAudioContextRef.current.state !== 'closed') {
      try {
        localAudioContextRef.current.close();
      } catch {
        // ignore
      }
      localAudioContextRef.current = null;
    }
    localAnalyserRef.current = null;

    if (remoteAudioContextRef.current && remoteAudioContextRef.current.state !== 'closed') {
      try {
        remoteAudioContextRef.current.close();
      } catch {
        // ignore
      }
      remoteAudioContextRef.current = null;
    }
    remoteAnalyserRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    setAudioLevel(0);
  }, []);

  // Нақты уақыттағы аудио деңгейін (Көмекші және Оқушы) бақылау
  const startAudioAnimationLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const checkAudio = () => {
      if (!isOpenRef.current) return;

      let calculatedLevel = 0;

      // 1. Егер AI сөйлеп жатса (Speaking) -> қашықтағы немесе TTS аудио ағынының дыбысын алу
      if (stateRef.current === 'speaking' && remoteAnalyserRef.current) {
        const dataArray = new Uint8Array(remoteAnalyserRef.current.frequencyBinCount);
        remoteAnalyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        const bins = Math.min(40, dataArray.length);
        for (let i = 2; i < bins; i++) {
          sum += dataArray[i];
        }
        calculatedLevel = Math.min(100, Math.round((sum / (bins - 2)) * 1.8));
      }
      // 2. Егер оқушы сөйлеп жатса (Listening) -> микрофонның дыбысын алу
      else if (stateRef.current === 'listening' && localAnalyserRef.current && !isMutedRef.current) {
        const dataArray = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
        localAnalyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        const bins = Math.min(40, dataArray.length);
        for (let i = 2; i < bins; i++) {
          sum += dataArray[i];
        }
        calculatedLevel = Math.min(100, Math.round((sum / (bins - 2)) * 1.6));

        // Тегін режимде оқушы сөйлеп болып, 1.5 сек үнсіз қалса автоматты жіберу
        if (modeRef.current === 'free' && mediaRecorderRef.current?.state === 'recording') {
          if (calculatedLevel > 16) {
            hasSpokenInFreeTurnRef.current = true;
            if (silenceTimerRef.current) {
              window.clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (hasSpokenInFreeTurnRef.current && !silenceTimerRef.current) {
            silenceTimerRef.current = window.setTimeout(() => {
              silenceTimerRef.current = null;
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
            }, 1500);
          }
        }
      }

      setAudioLevel(calculatedLevel);
      animFrameRef.current = requestAnimationFrame(checkAudio);
    };

    animFrameRef.current = requestAnimationFrame(checkAudio);
  }, []);

  // Диалог хабарламасын жаңарту немесе қосу (item_id бойынша)
  const upsertMessage = useCallback(
    (id: string, role: LiveMessage['role'], update: (prev: string) => string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx === -1) {
          return [...prev, { id, role, text: update('') }].slice(-MAX_LIVE_MESSAGES);
        }
        const next = [...prev];
        next[idx] = { ...next[idx], text: update(next[idx].text) };
        return next;
      });
    },
    [],
  );

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Сұрақ пен жауап екеуі де дайын болғанда бірден Supabase-ке сақтау (нақты уақытта)
  const trySaveTurn = useCallback(() => {
    const userT = pendingUserRef.current.trim();
    const aiT = pendingAiRef.current.trim();
    if (!userT || !aiT) return;

    pendingUserRef.current = '';
    pendingAiRef.current = '';

    void saveVoiceTurn(
      {
        userTranscript: userT,
        aiResponse: aiT,
        sessionId: activeSessionIdRef.current,
        emotion: 'happy',
        language: detectLanguage(userT),
      },
      accessTokenRef.current,
    );
  }, []);

  const goListening = useCallback(() => {
    if (!isOpenRef.current) return;
    setState('listening');
    setEmotion('happy');
  }, []);

  // ============================================================================
  // 1. ТЕГІН РЕЖИМ (FREE TIER): Микрофоннан жазып алу -> STT/LLM -> Text-to-Speech
  // ============================================================================
  const playFreeTierTts = useCallback(
    async (audioUrl: string, aiEmotion: VoiceEmotion) => {
      setState('speaking');
      setEmotion(aiEmotion || 'happy');

      const audioEl = new Audio(audioUrl);
      ttsAudioElRef.current = audioEl;

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (remoteAudioContextRef.current && remoteAudioContextRef.current.state !== 'closed') {
          await remoteAudioContextRef.current.close().catch(() => {});
        }
        const ttsCtx = new AudioCtx();
        const source = ttsCtx.createMediaElementSource(audioEl);
        const analyser = ttsCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.15;
        source.connect(analyser);
        analyser.connect(ttsCtx.destination);
        remoteAnalyserRef.current = analyser;
        remoteAudioContextRef.current = ttsCtx;
      } catch (e) {
        console.warn('[Free Voice] Audio analyser warning:', e);
      }

      startAudioAnimationLoop();

      audioEl.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (isOpenRef.current && modeRef.current === 'free') {
          setState('idle');
          setEmotion('happy');
          setAudioLevel(0);
        }
      };

      audioEl.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        if (isOpenRef.current && modeRef.current === 'free') {
          setState('idle');
          setEmotion('happy');
          setAudioLevel(0);
        }
      };

      await audioEl.play();
    },
    [startAudioAnimationLoop],
  );

  const startFreeRecording = useCallback(async () => {
    setErrorMessage(null);

    // Егер көмекші сөйлеп тұрса, оны тоқтатып бірден тыңдауға көшу
    if (ttsAudioElRef.current) {
      try {
        ttsAudioElRef.current.pause();
        ttsAudioElRef.current.src = '';
      } catch {
        // ignore
      }
      ttsAudioElRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (localAudioContextRef.current && localAudioContextRef.current.state !== 'closed') {
        await localAudioContextRef.current.close().catch(() => {});
      }
      const localCtx = new AudioCtx();
      const localSource = localCtx.createMediaStreamSource(stream);
      const localAnalyser = localCtx.createAnalyser();
      localAnalyser.fftSize = 256;
      localAnalyser.smoothingTimeConstant = 0.2;
      localSource.connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;
      localAudioContextRef.current = localCtx;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      hasSpokenInFreeTurnRef.current = false;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // Микрофон трегін босату
        stream.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
        setAudioLevel(0);

        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        recordedChunksRef.current = [];

        if (!isOpenRef.current || modeRef.current !== 'free') return;

        if (blob.size < 400) {
          setState('idle');
          setErrorMessage('Дыбыс тым қысқа болды. Қайта басып сөйлеп көріңіз.');
          return;
        }

        setState('thinking');
        setEmotion('thinking');

        const tempUserId = `free_u_${Date.now()}`;
        const tempAiId = `free_a_${Date.now()}`;

        try {
          const result = await sendVoiceInteractHttp(blob, {
            accessToken: accessTokenRef.current,
            sessionId: activeSessionIdRef.current,
          });

          if (!isOpenRef.current || modeRef.current !== 'free') return;

          if (result.userTranscript) {
            upsertMessage(tempUserId, 'user', () => result.userTranscript);
          }
          if (result.aiResponse) {
            upsertMessage(tempAiId, 'assistant', () => result.aiResponse);
          }

          if (result.audioUrl) {
            await playFreeTierTts(result.audioUrl, result.emotion);
          } else {
            setState('idle');
            setEmotion('happy');
          }
        } catch (err: any) {
          if (!isOpenRef.current) return;
          setErrorMessage(err?.message || 'Дауысты өңдеу кезінде қате шықты.');
          setState('idle');
          setEmotion('happy');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(150);
      setState('listening');
      setEmotion('happy');
      startAudioAnimationLoop();
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Микрофонға рұқсат берілмеді. Браузер баптауын тексеріңіз.',
      );
      setState('idle');
    }
  }, [playFreeTierTts, startAudioAnimationLoop, upsertMessage]);

  const stopFreeRecordingAndSend = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ============================================================================
  // 2. АҚЫЛЫ РЕЖИМ (PRO TIER): OpenAI Realtime WebRTC (ChatGPT Advanced Voice)
  // ============================================================================
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      const type: string = event.type || '';
      const itemId: string = event.item_id || '';

      switch (type) {
        case 'input_audio_buffer.speech_started':
          setState('listening');
          setEmotion('happy');
          break;

        case 'input_audio_buffer.speech_stopped':
          setState('thinking');
          setEmotion('thinking');
          break;

        case 'input_audio_buffer.committed':
          if (itemId) upsertMessage(itemId, 'user', (prev) => prev);
          break;

        case 'conversation.item.input_audio_transcription.completed': {
          const transcript = String(event.transcript || '').trim();
          if (!transcript) {
            if (itemId) removeMessage(itemId);
            break;
          }
          if (itemId) upsertMessage(itemId, 'user', () => transcript);
          pendingUserRef.current = transcript;
          trySaveTurn();
          break;
        }

        case 'conversation.item.input_audio_transcription.failed':
          if (itemId) removeMessage(itemId);
          pendingUserRef.current = pendingUserRef.current || '[дауыстық хабарлама]';
          trySaveTurn();
          break;

        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta':
          setState('speaking');
          setEmotion('happy');
          if (itemId) upsertMessage(itemId, 'assistant', (prev) => prev + (event.delta || ''));
          break;

        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done': {
          const aiText = String(event.transcript || '').trim();
          if (aiText) {
            if (itemId) upsertMessage(itemId, 'assistant', () => aiText);
            pendingAiRef.current = aiText;
            trySaveTurn();
          }
          break;
        }

        case 'output_audio_buffer.started':
          setState('speaking');
          setEmotion('happy');
          break;

        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          goListening();
          break;

        case 'response.done':
          if (stateRef.current !== 'speaking') goListening();
          break;

        case 'session.updated':
          console.log('[OpenAI Realtime] Session configured');
          break;

        case 'error': {
          console.warn('[OpenAI Realtime] Server error event:', event);
          const errMsg = event.error?.message || 'OpenAI байланыс қатесі';
          setErrorMessage(errMsg);
          break;
        }

        default:
          break;
      }
    },
    [goListening, removeMessage, trySaveTurn, upsertMessage],
  );

  const startRealtimeCall = useCallback(async () => {
    setErrorMessage(null);
    setState('thinking');
    setEmotion('thinking');

    try {
      const sessionInfo = await createRealtimeSession(accessTokenRef.current);
      activeSessionIdRef.current = sessionInfo.session_id;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const localCtx = new AudioCtx();
      const localSource = localCtx.createMediaStreamSource(stream);
      const localAnalyser = localCtx.createAnalyser();
      localAnalyser.fftSize = 256;
      localAnalyser.smoothingTimeConstant = 0.2;
      localSource.connect(localAnalyser);
      localAnalyserRef.current = localAnalyser;
      localAudioContextRef.current = localCtx;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioElRef.current = remoteAudio;

      pc.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];

        try {
          const remoteCtx = new AudioCtx();
          const remoteSource = remoteCtx.createMediaStreamSource(event.streams[0]);
          const remoteAnalyser = remoteCtx.createAnalyser();
          remoteAnalyser.fftSize = 256;
          remoteAnalyser.smoothingTimeConstant = 0.15;
          remoteSource.connect(remoteAnalyser);
          remoteAnalyserRef.current = remoteAnalyser;
          remoteAudioContextRef.current = remoteCtx;
        } catch (e) {
          console.warn('Remote audio analyser setup warning:', e);
        }
      };

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        try {
          const sessionUpdate = {
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: sessionInfo.instructions || FALLBACK_INSTRUCTIONS,
              output_modalities: ['audio'],
              audio: {
                input: {
                  transcription: { model: 'whisper-1' },
                  noise_reduction: { type: 'near_field' },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                    create_response: true,
                    interrupt_response: true,
                  },
                },
                output: {
                  voice: sessionInfo.voice || 'coral',
                },
              },
            },
          };
          dc.send(JSON.stringify(sessionUpdate));
        } catch (e) {
          console.warn('[OpenAI WebRTC] Could not send initial session.update:', e);
        }
        setState('listening');
        setEmotion('happy');
      };

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleRealtimeEvent(msg);
        } catch (err) {
          console.warn('Realtime event parse warning:', err);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const rawSdp = offer.sdp || pc.localDescription?.sdp || '';
      if (!rawSdp) {
        throw new Error('Браузер микрофонынан SDP offer жасалмады.');
      }

      const cleanSdp =
        rawSdp
          .replace(/\r\n/g, '\n')
          .replace(/\n/g, '\r\n')
          .trim() + '\r\n';

      const targetModel = (sessionInfo.model || 'gpt-4o-realtime-preview-2024-12-17').trim();
      const clientSecret = (sessionInfo.client_secret || '').trim();
      const callsUrl = `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(targetModel)}`;

      let sdpResponse = await fetch(callsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: cleanSdp,
      });

      if (!sdpResponse.ok && (sdpResponse.status === 400 || sdpResponse.status === 404)) {
        const fallbackModels = [
          'gpt-4o-realtime-preview',
          'gpt-realtime',
          'gpt-realtime-1.5',
          'gpt-4o-mini-realtime-preview',
        ];
        for (const fbModel of fallbackModels) {
          if (fbModel === targetModel) continue;
          const fbUrl = `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(fbModel)}`;
          const fbResp = await fetch(fbUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${clientSecret}`,
              'Content-Type': 'application/sdp',
            },
            body: cleanSdp,
          });
          if (fbResp.ok) {
            sdpResponse = fbResp;
            break;
          }
        }
      }

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`OpenAI WebRTC байланыс қатесі: ${errText || sdpResponse.statusText}`);
      }

      let answerSdp = await sdpResponse.text();
      try {
        const parsed = JSON.parse(answerSdp);
        if (parsed.sdp) {
          answerSdp = parsed.sdp;
        }
      } catch {
        // plain SDP
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      startAudioAnimationLoop();
    } catch (err: any) {
      console.error('[OpenAI WebRTC] Connection failed:', err);
      const msg = err?.message || 'OpenAI Realtime байланысын орнату сәтсіз аяқталды.';
      setErrorMessage(msg);
      setState('error');
    }
  }, [handleRealtimeEvent, startAudioAnimationLoop]);

  // Режимді ауыстыру (Тегін <-> Pro)
  const handleSelectMode = useCallback(
    (nextMode: VoiceTierMode) => {
      if (nextMode === modeRef.current) return;
      cleanupConnection();
      setErrorMessage(null);
      setIsMuted(false);
      setMode(nextMode);
      modeRef.current = nextMode;
      try {
        localStorage.setItem(VOICE_MODE_STORAGE_KEY, nextMode);
      } catch {
        // ignore
      }

      if (nextMode === 'pro') {
        void startRealtimeCall();
      } else {
        setState('idle');
        setEmotion('happy');
      }
    },
    [cleanupConnection, startRealtimeCall],
  );

  // Микрофонды қосу / өшіру (Pro режимде Mute)
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
    const records = await fetchVoiceHistory(accessTokenRef.current);
    setHistoryList(records);
    setShowHistory(true);
  }, []);

  // Жаңа хабарлама келгенде диалогты төменге айналдыру
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Модаль ашылғанда таңдалған режимге сай қосылу, жабылғанда толық өшіру
  useEffect(() => {
    if (open) {
      setMessages([]);
      setErrorMessage(null);
      pendingUserRef.current = '';
      pendingAiRef.current = '';
      activeSessionIdRef.current = `sess_${Date.now()}`;

      if (modeRef.current === 'pro') {
        void startRealtimeCall();
      } else {
        setState('idle');
        setEmotion('happy');
      }
    } else {
      cleanupConnection();
      setShowHistory(false);
    }
    return () => {
      cleanupConnection();
    };
  }, [cleanupConnection, open, startRealtimeCall]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-[calc(100%-1.5rem)] max-w-md sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden',
          'rounded-3xl border border-border/70 p-5 sm:p-6',
          'bg-card/95 backdrop-blur-2xl shadow-2xl transition-all duration-300',
        )}
      >
        {/* Жоғарғы тақырыпша */}
        <DialogHeader className="flex flex-col gap-3 pb-3 border-b border-border/50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-2.5 w-2.5 rounded-full transition-colors duration-300',
                  state === 'listening'
                    ? 'bg-emerald-500 animate-pulse'
                    : state === 'thinking'
                    ? 'bg-amber-500 animate-pulse'
                    : state === 'speaking'
                    ? 'bg-cyan-500 animate-ping'
                    : 'bg-muted-foreground/40',
                )}
              />
              <DialogTitle className="text-sm sm:text-base font-bold tracking-tight text-foreground">
                Sana Voice AI
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
          </div>

          {/* Тегін / Pro режим ауыстырғышы */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted/60 p-1 border border-border/50">
            <button
              type="button"
              onClick={() => handleSelectMode('free')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-200',
                mode === 'free'
                  ? 'bg-card text-foreground shadow-xs border border-border/60'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Volume2 size={13} />
              <span>Тегін (TTS)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectMode('pro')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-semibold transition-all duration-200',
                mode === 'pro'
                  ? 'bg-foreground text-background shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Crown size={13} className={cn(mode === 'pro' ? 'text-amber-400' : 'text-amber-500')} />
              <span>Pro (ChatGPT Live)</span>
            </button>
          </div>
        </DialogHeader>

        {/* 1. Сұхбат тарихы панелі */}
        {showHistory ? (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-left my-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Диалог тарихы
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
          /* 2. Негізгі дауыстық интерфейс */
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-between text-center pt-2 pb-1 space-y-3.5">
            {/* Режим белгісі */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              {mode === 'pro' ? (
                <>
                  <Radio size={11} className="text-emerald-500 animate-pulse" />
                  <span>Pro: Үздіксіз тірі диалог (ChatGPT Realtime)</span>
                </>
              ) : (
                <>
                  <Volume2 size={11} className="text-sky-500" />
                  <span>Тегін: Дауыс жазу және Text-to-Speech</span>
                </>
              )}
            </div>

            {/* Тақиялы аватар */}
            <div
              className="relative flex items-center justify-center my-1 select-none"
              onClick={() => {
                if (mode === 'free') {
                  if (state === 'listening') {
                    stopFreeRecordingAndSend();
                  } else if (state !== 'thinking') {
                    void startFreeRecording();
                  }
                }
              }}
            >
              <SanaTaqiyaAvatar
                state={state}
                emotion={emotion}
                audioLevel={audioLevel}
                isMuted={isMuted}
              />
            </div>

            {/* Дыбыс деңгейінің бағаналары (Voice Spectrum) */}
            <div className="flex items-center justify-center gap-1.5 h-3">
              {[1, 2, 3, 4, 5, 6].map((bar) => {
                const active = audioLevel > bar * 9;
                return (
                  <span
                    key={bar}
                    className={cn(
                      'w-1.5 rounded-full transition-all duration-75',
                      active
                        ? state === 'speaking'
                          ? 'bg-cyan-500 h-3.5'
                          : 'bg-emerald-500 h-3.5'
                        : 'bg-muted-foreground/20 h-1',
                    )}
                  />
                );
              })}
            </div>

            {/* Статус мәтіні */}
            <div className="space-y-1 px-2">
              {state === 'listening' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {isMuted ? 'Микрофон өшірулі' : 'Тыңдап тұрмын, сөйлей беріңіз...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {mode === 'pro'
                      ? 'Қай тілде сөйлесеңіз, сол тілде бірден жауап беремін'
                      : 'Сөйлеп болып «Жіберу» басыңыз немесе сәл кідіріңіз'}
                  </p>
                </div>
              ) : state === 'thinking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-foreground/80 animate-pulse">
                    Ойланып жатырмын...
                  </p>
                </div>
              ) : state === 'speaking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                    Sana жауап беріп жатыр...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {mode === 'pro'
                      ? 'Сөйлей бастасаңыз, бірден тоқтап тыңдаймын'
                      : 'Жауапты тыңдап болған соң келесі сұрақты қоя аласыз'}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {mode === 'free' ? 'Сөйлесуге дайынмын' : 'Байланыс орнатылуда...'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {mode === 'free'
                      ? 'Төмендегі микрофонды басып, кез келген тілде сұрағыңызды айтыңыз'
                      : 'Микрофон қосылуда...'}
                  </p>
                </div>
              )}

              {/* Қате шықса көрсету */}
              {errorMessage ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive text-left">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>

            {/* Нақты уақыттағы диалог */}
            {messages.length > 0 && (
              <div className="w-full max-h-44 overflow-y-auto space-y-2 rounded-2xl bg-muted/40 p-3 text-left border border-border/40">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <p
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-1.5 text-xs sm:text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-card text-foreground border border-border/50 rounded-bl-md',
                      )}
                    >
                      {m.text || <span className="opacity-60">…</span>}
                    </p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Басқару батырмалары */}
            <div className="w-full pt-1 pb-1 flex items-center justify-center gap-3">
              {mode === 'free' ? (
                <>
                  {state === 'listening' ? (
                    <Button
                      type="button"
                      onClick={stopFreeRecordingAndSend}
                      className="h-12 px-7 rounded-full font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 transition-all text-xs sm:text-sm flex items-center gap-2"
                    >
                      <Square size={15} className="fill-current" />
                      <span>Жіберу</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={state === 'thinking'}
                      onClick={() => void startFreeRecording()}
                      className="h-12 px-7 rounded-full font-semibold shadow-md bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all text-xs sm:text-sm flex items-center gap-2"
                    >
                      <Mic size={17} />
                      <span>{state === 'speaking' ? 'Тоқтатып, жаңадан сөйлеу' : 'Сөйлеу'}</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    className="h-12 px-5 rounded-full font-semibold border-border/60 text-xs sm:text-sm"
                  >
                    Жабу
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={toggleMute}
                    className={cn(
                      'h-12 w-12 rounded-full border-border/60 transition-all shadow-xs',
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
                    variant="destructive"
                    onClick={() => onOpenChange(false)}
                    className="h-12 px-7 rounded-full font-semibold shadow-md bg-rose-500 hover:bg-rose-600 text-white active:scale-95 transition-all text-xs sm:text-sm flex items-center gap-2"
                  >
                    <PhoneOff size={16} />
                    <span>Аяқтау</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
