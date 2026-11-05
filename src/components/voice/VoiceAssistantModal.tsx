import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SanaTaqiyaAvatar from '@/components/voice/SanaTaqiyaAvatar';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  createRealtimeSession,
  saveVoiceTurn,
  type VoiceEmotion,
  type VoiceState,
} from '@/lib/voice-api';

type CallPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export type VoiceAssistantModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId?: string;
  lessonId?: string;
};

const SPECTRUM_WEIGHTS = [0.55, 0.85, 1, 0.9, 0.75, 0.5];

export default function VoiceAssistantModal({
  open,
  onOpenChange,
}: VoiceAssistantModalProps) {
  const { user, session } = useAuth();
  const accessToken = session?.access_token?.trim() || '';

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorText, setErrorText] = useState('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const pendingUserTranscriptRef = useRef<string>('');
  const assistantDraftRef = useRef<string>('');
  const phaseRef = useRef<CallPhase>('idle');
  const isMicMutedRef = useRef<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const stopMeterLoop = useCallback(() => {
    if (meterFrameRef.current !== null) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startMeterLoop = useCallback(() => {
    stopMeterLoop();

    const buffer = new Uint8Array(64);

    const tick = () => {
      if (!mountedRef.current) return;

      const currentPhase = phaseRef.current;
      const activeAnalyser =
        currentPhase === 'speaking'
          ? remoteAnalyserRef.current || localAnalyserRef.current
          : localAnalyserRef.current;

      if (
        activeAnalyser &&
        !(currentPhase !== 'speaking' && isMicMutedRef.current)
      ) {
        activeAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length / 255;
        const normalized = Math.min(1, Math.max(0, avg * 2.4));
        setAudioLevel((prev) => prev * 0.62 + normalized * 0.38);
      } else {
        setAudioLevel((prev) => prev * 0.75);
      }

      meterFrameRef.current = window.requestAnimationFrame(tick);
    };

    meterFrameRef.current = window.requestAnimationFrame(tick);
  }, [stopMeterLoop]);

  const cleanupCall = useCallback(() => {
    stopMeterLoop();

    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch {
        // ignore
      }
      dcRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      localStreamRef.current = null;
    }

    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch {
        // ignore
      }
      remoteAudioRef.current = null;
    }

    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }

    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
    pendingUserTranscriptRef.current = '';
    assistantDraftRef.current = '';
  }, [stopMeterLoop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupCall();
    };
  }, [cleanupCall]);

  const trySaveTurn = useCallback(
    async (userTranscript: string, assistantText: string) => {
      const cleanUser = userTranscript.trim();
      const cleanAssistant = assistantText.trim();

      if (!accessToken || (!cleanUser && !cleanAssistant)) {
        return;
      }

      try {
        const savedSessionId = await saveVoiceTurn(
          {
            userTranscript: cleanUser || '...',
            aiResponse: cleanAssistant || '...',
            sessionId: sessionIdRef.current || undefined,
            emotion: 'happy',
          },
          accessToken,
        );

        if (mountedRef.current && savedSessionId) {
          setSessionId(savedSessionId);
        }
      } catch {
        // Background persistence error should not interrupt live voice call
      }
    },
    [accessToken],
  );

  const handleRealtimeEvent = useCallback(
    (rawEvent: MessageEvent) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(rawEvent.data || '{}')) as Record<
          string,
          unknown
        >;
      } catch {
        return;
      }

      const type = String(event.type || '');

      if (type === 'input_audio_buffer.speech_started') {
        assistantDraftRef.current = '';
        setPhase('listening');
        return;
      }

      if (type === 'input_audio_buffer.speech_stopped') {
        setPhase('thinking');
        return;
      }

      if (
        type === 'conversation.item.input_audio_transcription.completed'
      ) {
        const transcript = String(event.transcript || '').trim();
        if (transcript) {
          pendingUserTranscriptRef.current = transcript;
        }
        return;
      }

      if (
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio_transcript.delta'
      ) {
        const delta = String(event.delta || '');
        if (delta) {
          assistantDraftRef.current += delta;
          setPhase('speaking');
        }
        return;
      }

      if (
        type === 'response.audio.delta' ||
        type === 'response.output_audio.delta'
      ) {
        setPhase('speaking');
        return;
      }

      if (
        type === 'response.audio_transcript.done' ||
        type === 'response.output_audio_transcript.done'
      ) {
        const finalTranscript =
          String(event.transcript || '').trim() ||
          assistantDraftRef.current.trim();

        if (finalTranscript) {
          const userSide = pendingUserTranscriptRef.current;
          pendingUserTranscriptRef.current = '';
          assistantDraftRef.current = '';
          void trySaveTurn(userSide, finalTranscript);
        }
        return;
      }

      if (type === 'response.done' || type === 'output_audio_buffer.stopped') {
        setPhase((current) =>
          current === 'error' || current === 'idle' ? current : 'listening',
        );
        return;
      }

      if (type === 'error') {
        const errObj = (event.error || {}) as Record<string, unknown>;
        const message = String(
          errObj.message || 'Аудио көмекшіде қате орын алды.',
        ).trim();
        if (message) {
          setErrorText(message);
        }
      }
    },
    [trySaveTurn],
  );

  const startRealtimeCall = useCallback(async () => {
    if (!accessToken || !user) {
      setErrorText('Аудио көмекшіні қосу үшін жүйеге кіру қажет.');
      setPhase('error');
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setErrorText('Браузер тікелей дауыстық байланысты қолдамайды.');
      setPhase('error');
      return;
    }

    cleanupCall();
    setErrorText('');
    setIsMicMuted(false);
    setPhase('connecting');

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!mountedRef.current) {
        for (const track of localStream.getTracks()) track.stop();
        return;
      }

      localStreamRef.current = localStream;

      const realtimeSession = await createRealtimeSession(accessToken);

      if (!mountedRef.current) {
        cleanupCall();
        return;
      }

      if (realtimeSession.session_id) {
        setSessionId(realtimeSession.session_id);
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;

        const localSource = audioCtx.createMediaStreamSource(localStream);
        const localAnalyser = audioCtx.createAnalyser();
        localAnalyser.fftSize = 128;
        localSource.connect(localAnalyser);
        localAnalyserRef.current = localAnalyser;
      }

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;

        remoteAudio.srcObject = remoteStream;
        void remoteAudio.play().catch(() => {
          // Autoplay handled
        });

        if (audioCtxRef.current) {
          try {
            const remoteSource =
              audioCtxRef.current.createMediaStreamSource(remoteStream);
            const remoteAnalyser = audioCtxRef.current.createAnalyser();
            remoteAnalyser.fftSize = 128;
            remoteSource.connect(remoteAnalyser);
            remoteAnalyserRef.current = remoteAnalyser;
          } catch {
            // Ignore duplicate stream source errors
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return;
        const state = pc.connectionState;
        if (state === 'failed' || state === 'disconnected') {
          setErrorText('Дауыстық байланыс үзілді. Қайта қосып көріңіз.');
          setPhase('error');
        }
      };

      const [audioTrack] = localStream.getAudioTracks();
      if (audioTrack) {
        pc.addTrack(audioTrack, localStream);
      }

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        if (!mountedRef.current) return;
        setPhase('listening');
        startMeterLoop();
      };

      dc.onmessage = handleRealtimeEvent;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(
          realtimeSession.model || 'gpt-4o-mini-realtime-preview',
        )}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${realtimeSession.client_secret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp || '',
        },
      );

      if (!sdpResponse.ok) {
        throw new Error(
          `Realtime байланыс орнатылмады (${sdpResponse.status}).`,
        );
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      setPhase('listening');
      startMeterLoop();
    } catch (error) {
      cleanupCall();
      if (!mountedRef.current) return;

      const rawMessage =
        error instanceof Error
          ? error.message
          : 'Аудио көмекшіге қосылу мүмкін болмады.';
      const friendlyMessage =
        rawMessage.includes('Permission') || rawMessage.includes('NotAllowed')
          ? 'Микрофонға рұқсат берілмеді. Браузерден микрофонды қосыңыз.'
          : rawMessage;

      setErrorText(friendlyMessage);
      setPhase('error');
    }
  }, [
    accessToken,
    cleanupCall,
    handleRealtimeEvent,
    startMeterLoop,
    user,
  ]);

  useEffect(() => {
    if (open) {
      void startRealtimeCall();
    } else {
      cleanupCall();
      setPhase('idle');
      setErrorText('');
      setIsMicMuted(false);
    }
  }, [open, startRealtimeCall, cleanupCall]);

  const toggleMicMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextMuted = !isMicMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setIsMicMuted(nextMuted);
  }, [isMicMuted]);

  const handleEndCall = useCallback(() => {
    cleanupCall();
    setPhase('idle');
    onOpenChange(false);
  }, [cleanupCall, onOpenChange]);

  const statusLabel = (() => {
    if (phase === 'connecting') return 'Қосылуда...';
    if (phase === 'listening') {
      return isMicMuted ? 'Микрофон өшірулі' : 'Тыңдап тұрмын...';
    }
    if (phase === 'thinking') return 'Ойланып жатырмын...';
    if (phase === 'speaking') return 'Жауап беріп жатырмын...';
    if (phase === 'error') return 'Қосылу қатесі';
    return 'Дайын';
  })();

  const isCallActive =
    phase === 'listening' || phase === 'thinking' || phase === 'speaking';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[380px] overflow-hidden rounded-3xl border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="relative flex flex-col">
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute -top-24 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl transition-all duration-700',
              phase === 'listening' && !isMicMuted
                ? 'bg-emerald-500/20 scale-110'
                : phase === 'thinking'
                  ? 'bg-amber-500/20 scale-105'
                  : phase === 'speaking'
                    ? 'bg-primary/25 scale-125'
                    : 'bg-primary/10 scale-95',
            )}
          />

          <DialogHeader className="relative z-10 border-b border-border/50 px-5 py-4 text-left">
            <div className="flex items-center gap-2.5 pr-7">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full transition-colors',
                  isCallActive
                    ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                    : phase === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-muted-foreground/40',
                )}
              />
              <DialogTitle className="text-base font-bold tracking-tight">
                Аудио көмекші
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              Дауыстық аудио көмекші
            </DialogDescription>
          </DialogHeader>

          <div className="relative z-10 flex flex-col items-center px-5 py-6">
            <SanaTaqiyaAvatar
              state={
                (phase === 'connecting' ? 'thinking' : phase) as VoiceState
              }
              emotion={
                (phase === 'speaking'
                  ? 'speaking'
                  : phase === 'thinking' || phase === 'connecting'
                    ? 'thinking'
                    : phase === 'listening'
                      ? 'listening'
                      : 'happy') as VoiceEmotion
              }
              audioLevel={Math.round(audioLevel * 100)}
              isMuted={isMicMuted}
            />

            <div
              aria-hidden="true"
              className="mt-4 flex h-6 items-center justify-center gap-1.5"
            >
              {SPECTRUM_WEIGHTS.map((weight, index) => {
                const activeEnergy =
                  (phase === 'listening' && !isMicMuted) || phase === 'speaking'
                    ? Math.max(0.18, Math.min(1, audioLevel * 1.45 * weight))
                    : phase === 'thinking'
                      ? 0.32
                      : 0.16;

                return (
                  <span
                    key={index}
                    className={cn(
                      'w-1.5 rounded-full transition-all duration-100',
                      phase === 'speaking'
                        ? 'bg-primary'
                        : phase === 'listening' && !isMicMuted
                          ? 'bg-emerald-500'
                          : phase === 'thinking'
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-muted-foreground/30',
                    )}
                    style={{
                      height: `${Math.round(6 + activeEnergy * 18)}px`,
                    }}
                  />
                );
              })}
            </div>

            <p className="mt-3 text-sm font-semibold tracking-tight text-foreground">
              {statusLabel}
            </p>

            {errorText ? (
              <div className="mt-4 flex w-full flex-col gap-2.5 rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-xs text-destructive">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{errorText}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void startRealtimeCall()}
                  className="h-8 self-end rounded-xl border-destructive/30 text-xs"
                >
                  <RotateCcw size={13} className="mr-1.5" />
                  Қайта қосылу
                </Button>
              </div>
            ) : null}
          </div>

          <div className="relative z-10 flex items-center justify-center gap-3 border-t border-border/50 bg-background/60 px-5 py-4">
            <Button
              type="button"
              variant={isMicMuted ? 'outline' : 'secondary'}
              onClick={toggleMicMute}
              disabled={!isCallActive}
              className={cn(
                'h-11 flex-1 rounded-full font-semibold transition-all',
                isMicMuted &&
                  'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400',
              )}
            >
              {phase === 'connecting' ? (
                <Loader2 size={17} className="mr-2 animate-spin" />
              ) : isMicMuted ? (
                <MicOff size={17} className="mr-2" />
              ) : (
                <Mic size={17} className="mr-2" />
              )}
              {isMicMuted ? 'Қосу' : 'Микрофон'}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={handleEndCall}
              className="h-11 flex-1 rounded-full font-semibold shadow-sm"
            >
              <PhoneOff size={17} className="mr-2" />
              Аяқтау
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
