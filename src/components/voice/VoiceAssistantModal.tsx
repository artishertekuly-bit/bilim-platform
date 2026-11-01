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
  Radio,
  Sparkles,
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

const MAX_LIVE_MESSAGES = 40;

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
  const { user, session } = useAuth();

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

  // Рефтер
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioElRef = useRef<HTMLAudioElement | null>(null);

  const localAudioContextRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Диалогты Supabase-ке сақтау үшін жұп (оқушы сұрағы + көмекші жауабы) жинақтау
  const pendingUserRef = useRef<string>('');
  const pendingAiRef = useRef<string>('');
  const activeSessionIdRef = useRef<string>('');
  // Токен жаңарғанда WebRTC байланысы қайта қосылып кетпеуі үшін ref арқылы сақтаймыз
  const accessTokenRef = useRef<string | undefined>(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const stateRef = useRef<VoiceState>('idle');
  const isMutedRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(open);

  stateRef.current = state;
  isMutedRef.current = isMuted;
  isOpenRef.current = open;

  // Барлық байланыс пен аудио ресурстарды тазарту
  const cleanupConnection = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
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

    if (remoteAudioContextRef.current && remoteAudioContextRef.current.state !== 'closed') {
      try {
        remoteAudioContextRef.current.close();
      } catch {
        // ignore
      }
      remoteAudioContextRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    setAudioLevel(0);
  }, []);

  // Нақты уақыттағы WebRTC аудио деңгейін (Мұғалім және Оқушы) бақылау
  const startAudioAnimationLoop = useCallback(() => {
    const checkAudio = () => {
      if (!isOpenRef.current) return;

      let calculatedLevel = 0;

      // 1. Егер AI сөйлеп жатса (Speaking) -> қашықтағы OpenAI WebRTC ағынының дыбысын алу
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

  // OpenAI Realtime оқиғаларын өңдеу (GA + ескі beta атаулары қатар қолдау табады)
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      const type: string = event.type || '';
      const itemId: string = event.item_id || '';

      switch (type) {
        // 1. Оқушы сөйлей бастады (server VAD). Көмекші сөйлеп тұрса, OpenAI оны өзі тоқтатады.
        case 'input_audio_buffer.speech_started':
          setState('listening');
          setEmotion('happy');
          break;

        // 2. Оқушы сөйлеуін аяқтады
        case 'input_audio_buffer.speech_stopped':
          setState('thinking');
          setEmotion('thinking');
          break;

        // 3. Оқушы сөзі қабылданды — диалогта орын дайындап қоямыз (рет сақталуы үшін)
        case 'input_audio_buffer.committed':
          if (itemId) upsertMessage(itemId, 'user', (prev) => prev);
          break;

        // 4. Оқушы сөзінің мәтіні дайын
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
          // Жауап жұбы бұзылмауы үшін орнын толтырамыз
          pendingUserRef.current = pendingUserRef.current || '[дауыстық хабарлама]';
          trySaveTurn();
          break;

        // 5. Көмекші жауабының мәтіні ағынмен келуде
        case 'response.output_audio_transcript.delta':
        case 'response.audio_transcript.delta':
          setState('speaking');
          setEmotion('happy');
          if (itemId) upsertMessage(itemId, 'assistant', (prev) => prev + (event.delta || ''));
          break;

        // 6. Көмекші жауабының мәтіні толық дайын → сақтау
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

        // 7. WebRTC ойнатуы басталды / аяқталды (ерін анимациясы дәл осыған сай)
        case 'output_audio_buffer.started':
          setState('speaking');
          setEmotion('happy');
          break;

        case 'output_audio_buffer.stopped':
        case 'output_audio_buffer.cleared':
          goListening();
          break;

        // 8. Жауап генерациясы аяқталды. Дыбыс әлі ойнап тұрса, күйді өзгертпейміз.
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

  // OpenAI Realtime WebRTC байланысын орнату (ChatGPT Advanced Voice Mode)
  const startRealtimeCall = useCallback(async () => {
    setErrorMessage(null);
    setState('thinking');
    setEmotion('thinking');

    try {
      // 1. Бэкендтен уақытша (ephemeral) кілт алу
      console.log('[OpenAI WebRTC] Requesting ephemeral session from backend...');
      const sessionInfo = await createRealtimeSession(accessTokenRef.current);
      activeSessionIdRef.current = sessionInfo.session_id;

      // 2. Оқушының микрофонын қосу
      console.log('[OpenAI WebRTC] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      // 3. Микрофонның дыбыс талдаушысын баптау (Local Analyser)
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

      // 4. WebRTC PeerConnection құру
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // 5. Микрофон трегін PeerConnection-ге қосу
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 6. OpenAI-дан келетін қашықтағы аудио трегін қабылдау (Remote Audio)
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioElRef.current = remoteAudio;

      pc.ontrack = (event) => {
        console.log('[OpenAI WebRTC] Remote audio track received!');
        remoteAudio.srcObject = event.streams[0];

        // Қашықтағы аудионың дыбыс талдаушысын қосу (Mascot Lip-Sync үшін)
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

      // 7. Оқиғаларға арналған DataChannel ("oai-events")
      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log('[OpenAI WebRTC] DataChannel connected and ready!');
        try {
          // OpenAI Realtime GA құрылымы: audio.input / audio.output.
          // Транскрипция тілі әдейі көрсетілмейді — оқушы қай тілде сөйлесе, сол тілде жауап береді.
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
          console.log('[OpenAI WebRTC] session.update sent successfully without deprecated modalities');
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

      // 8. Локалды SDP Offer жасап, OpenAI Realtime WebRTC GA эндпоинтына жіберу
      console.log('[OpenAI WebRTC] Creating SDP offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const rawSdp = (offer.sdp || pc.localDescription?.sdp || '');
      if (!rawSdp) {
        throw new Error('Браузер микрофонынан SDP offer жасалмады.');
      }

      // RFC 4566 стандарты: әрбір жол және соңғы жол міндетті түрде CRLF (\r\n) болуы шарт (Pion SDP parser үшін)
      const cleanSdp = rawSdp
        .replace(/\r\n/g, '\n')
        .replace(/\n/g, '\r\n')
        .trim() + '\r\n';

      const targetModel = (sessionInfo.model || 'gpt-4o-realtime-preview-2024-12-17').trim();
      const clientSecret = (sessionInfo.client_secret || '').trim();
      const callsUrl = `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(targetModel)}`;
      console.log(`[OpenAI WebRTC] Sending SDP offer to ${callsUrl}...`);

      let sdpResponse = await fetch(callsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: cleanSdp,
      });

      // Егер таңдалған модель қабылданбаса, баламалы моделдермен сынау
      if (!sdpResponse.ok && (sdpResponse.status === 400 || sdpResponse.status === 404)) {
        const fallbackModels = [
          'gpt-4o-realtime-preview',
          'gpt-realtime',
          'gpt-realtime-1.5',
          'gpt-4o-mini-realtime-preview',
        ];
        for (const fbModel of fallbackModels) {
          if (fbModel === targetModel) continue;
          console.warn(`[OpenAI WebRTC] Retrying with model ${fbModel}...`);
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
        // Қалыпты plain text SDP
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      console.log('[OpenAI WebRTC] Realtime connection fully established!');
      startAudioAnimationLoop();
    } catch (err: any) {
      console.error('[OpenAI WebRTC] Connection failed:', err);
      const msg = err?.message || 'OpenAI Realtime байланысын орнату сәтсіз аяқталды.';
      setErrorMessage(msg);
      setState('error');
    }
  }, [handleRealtimeEvent, startAudioAnimationLoop]);

  // Микрофонды қосу / өшіру (Mute)
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

  // Модаль ашылғанда қосылу, жабылғанда толық өшіру
  useEffect(() => {
    if (open) {
      setMessages([]);
      pendingUserRef.current = '';
      pendingAiRef.current = '';
      startRealtimeCall();
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
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20 flex items-center gap-1">
                <Radio size={10} className="animate-pulse" />
                Realtime
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
          /* 2. Нақты уақыттағы ChatGPT Realtime интерфейсі */
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-between text-center pt-2 pb-1 space-y-4">
            {/* Ақ-қара тақиялы сүйкімді аватар (Дыбыс ағынымен нақты уақытта үндеседі) */}
            <div className="relative flex items-center justify-center my-2 select-none">
              <SanaTaqiyaAvatar
                state={state}
                emotion={emotion}
                audioLevel={audioLevel}
                isMuted={isMuted}
              />
            </div>

            {/* Тірі дыбыс деңгейінің бағаналары (Voice Spectrum) */}
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
                    Кез келген тілде сөйлеңіз — сол тілде жауап беремін
                  </p>
                </div>
              ) : state === 'thinking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-purple-600 dark:text-purple-400 animate-pulse">
                    Ойланып жатырмын...
                  </p>
                </div>
              ) : state === 'speaking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                    Sana жауап беріп жатыр...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Сөйлей бастасаңыз, бірден тоқтап тыңдаймын
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Байланыс орнатылуда...
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

            {/* Нақты уақыттағы диалог (сессия бойы сақталады, әр жұп бірден Supabase-ке жазылады) */}
            {messages.length > 0 && (
              <div className="w-full max-h-48 overflow-y-auto space-y-2 rounded-2xl bg-muted/40 p-3 text-left border border-border/40">
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

            {/* Басқару батырмалары (Ешқандай батырма басудың қажеті жоқ, толық автоматты VAD) */}
            <div className="w-full pt-1 pb-1 flex items-center justify-center gap-3">
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
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
