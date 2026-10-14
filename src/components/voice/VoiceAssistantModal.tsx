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

  // Сұхбат мәтіндері
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [currentAiResponse, setCurrentAiResponse] = useState<string>('');

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

  // Диалог жазбасын сақтау үшін соңғы айтылған сөздерді бақылау
  const lastUserTranscriptRef = useRef<string>('');
  const lastAiResponseRef = useRef<string>('');
  const activeSessionIdRef = useRef<string>('');

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

  // OpenAI Realtime оқиғаларын өңдеу (Server Events)
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      const type = event.type || '';

      // 1. Оқушы сөйлей бастады (Automatic Server VAD)
      if (type === 'input_audio_buffer.speech_started') {
        console.log('[OpenAI Realtime] User started speaking');
        setState('listening');
        setEmotion('happy');
      }

      // 2. Оқушы сөйлеуін аяқтады
      else if (type === 'input_audio_buffer.speech_stopped') {
        console.log('[OpenAI Realtime] User stopped speaking');
        setState('thinking');
        setEmotion('thinking');
      }

      // 3. Оқушының даусын мәтінге айналдыру аяқталды (Whisper transcription)
      else if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = (event.transcript || '').trim();
        if (transcript) {
          console.log('[OpenAI Realtime] User transcript:', transcript);
          setCurrentTranscript(transcript);
          lastUserTranscriptRef.current = transcript;
        }
      }

      // 4. AI жауап бере бастады (Audio / Text delta)
      else if (type === 'response.audio_transcript.delta') {
        setState('speaking');
        setEmotion('happy');
        setCurrentAiResponse((prev) => prev + (event.delta || ''));
      }

      // 5. AI жауабының мәтіні толық аяқталды
      else if (type === 'response.audio_transcript.done') {
        const aiText = (event.transcript || '').trim();
        if (aiText) {
          setCurrentAiResponse(aiText);
          lastAiResponseRef.current = aiText;
        }
      }

      // 6. Жауаптың дыбыстық бөлігі аяқталды
      else if (type === 'response.audio.done') {
        // Дыбыс аяқталған соң тыңдау күйіне қайту
        setTimeout(() => {
          if (isOpenRef.current) {
            setState('listening');
            setEmotion('happy');
          }
        }, 300);
      }

      // 7. Сұрақ-жауап кезеңі толық аяқталды -> Supabase-ке сақтау
      else if (type === 'response.done') {
        console.log('[OpenAI Realtime] Turn completed, saving to Supabase');
        const userT = lastUserTranscriptRef.current;
        const aiT = lastAiResponseRef.current;

        if (userT && aiT) {
          saveVoiceTurn(
            {
              userTranscript: userT,
              aiResponse: aiT,
              sessionId: activeSessionIdRef.current,
              emotion: 'happy',
            },
            session?.access_token,
          );
        }

        setState('listening');
        setEmotion('happy');
      }

      // 8. Қате орын алса
      else if (type === 'error') {
        console.warn('[OpenAI Realtime] Server error event:', event);
        const errMsg = event.error?.message || 'OpenAI байланыс қатесі';
        setErrorMessage(errMsg);
      }
    },
    [session?.access_token],
  );

  // OpenAI Realtime WebRTC байланысын орнату (ChatGPT Advanced Voice Mode)
  const startRealtimeCall = useCallback(async () => {
    setErrorMessage(null);
    setState('thinking');
    setEmotion('thinking');

    try {
      // 1. Бэкендтен уақытша (ephemeral) кілт алу
      console.log('[OpenAI WebRTC] Requesting ephemeral session from backend...');
      const sessionInfo = await createRealtimeSession(session?.access_token);
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
          const sessionUpdate = {
            type: 'session.update',
            session: {
              modalities: ['audio', 'text'],
              voice: sessionInfo.voice || 'coral',
              instructions: `Сен — "Bilim Platform" қазақша оқу платформасының зиялы, мейірімді, заманауи жасанды интеллект көмекшісісің.
Оқушымен таза, табиғи, қазіргі жастарға сай әдемі ауызекі қазақ тілінде сөйлес.
Барлық сандарды міндетті түрде қазақша сөзбен айт (мысалы 5 емес бес, 10 емес он).
Жауаптарыңды қысқа (1-3 сөйлем), түсінікті және нақты қайтар.
Ешқандай жұлдызша, эмодзи немесе арнайы таңбаларды қолданба.`,
              input_audio_transcription: {
                model: 'whisper-1',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 600,
                create_response: true,
              },
            },
          };
          dc.send(JSON.stringify(sessionUpdate));
          console.log('[OpenAI WebRTC] session.update sent successfully');
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
  }, [handleRealtimeEvent, session?.access_token, startAudioAnimationLoop]);

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
    const records = await fetchVoiceHistory(session?.access_token);
    setHistoryList(records);
    setShowHistory(true);
  }, [session?.access_token]);

  // Модаль ашылғанда қосылу, жабылғанда толық өшіру
  useEffect(() => {
    if (open) {
      setCurrentTranscript('');
      setCurrentAiResponse('');
      lastUserTranscriptRef.current = '';
      lastAiResponseRef.current = '';
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
                ChatGPT Realtime
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
                    ChatGPT Advanced Voice: сөзіңізді тоқтатқанда автоматты түрде жауап береді
                  </p>
                </div>
              ) : state === 'thinking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-purple-600 dark:text-purple-400 animate-pulse">
                    ChatGPT ойланып жатыр...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Нақты уақытта жауап дайындауда
                  </p>
                </div>
              ) : state === 'speaking' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                    ChatGPT жауап беруде (coral дауысы)...
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    (Сөйлей бастасаңыз, көмекші бірден тоқтап сізді тыңдайды)
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

            {/* Нақты уақыттағы сұхбат бұлтшасы (Live Speech Bubble) */}
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
                      ChatGPT Voice:
                    </span>
                    <p className="text-xs text-foreground/90 sm:text-sm leading-relaxed">
                      {currentAiResponse}
                    </p>
                  </div>
                )}
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
