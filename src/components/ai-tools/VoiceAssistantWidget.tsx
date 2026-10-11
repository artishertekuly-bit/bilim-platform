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
  ExternalLink,
  Flame,
  Headphones,
  Info,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Send,
  Trash2,
  Volume2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrackPublication } from 'livekit-client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  fetchLiveKitToken,
  sendVoiceAssistantAudio,
  type VoiceAssistantResponse,
} from '@/lib/ai-api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

export type VoiceAssistantMode = 'livekit' | 'live' | 'manual';

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

const SILENCE_THRESHOLD_VOLUME = 16;
const SILENCE_DURATION_MS = 1300;
const MIN_SPEECH_DURATION_MS = 600;

export default function VoiceAssistantWidget({
  className,
  defaultLanguage = 'kk',
  systemPrompt,
  onResponse,
}: VoiceAssistantWidgetProps) {
  const { session } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<VoiceAssistantMode>('livekit');
  const [status, setStatus] = useState<VoiceAssistantStatus>('idle');
  const [language, setLanguage] = useState<'kk' | 'ru'>(defaultLanguage);
  const [selectedVoice, setSelectedVoice] = useState<string>(
    defaultLanguage === 'ru' ? 'ru-RU-DmitryNeural' : 'kk-KZ-DauletNeural',
  );

  // LiveKit WebRTC күйлері
  const [isLiveKitConnected, setIsLiveKitConnected] = useState<boolean>(false);
  const [isLiveKitConnecting, setIsLiveKitConnecting] = useState<boolean>(false);
  const [liveKitUnconfigured, setLiveKitUnconfigured] = useState<boolean>(false);
  const [liveKitRoomName, setLiveKitRoomName] = useState<string | null>(null);

  // Браузерлік Live және Manual күйлері
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<VoiceAssistantResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Рефтер
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveKitAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // VAD рефтері
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const isSpeakingNowRef = useRef<boolean>(false);
  const statusRef = useRef<VoiceAssistantStatus>('idle');
  const isLiveActiveRef = useRef<boolean>(false);

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

  // LiveKit тазалау
  const disconnectLiveKit = useCallback(() => {
    if (liveKitRoomRef.current) {
      liveKitRoomRef.current.disconnect();
      liveKitRoomRef.current = null;
    }
    if (liveKitAudioElementRef.current) {
      liveKitAudioElementRef.current.pause();
      liveKitAudioElementRef.current.remove();
      liveKitAudioElementRef.current = null;
    }
    setIsLiveKitConnected(false);
    setIsLiveKitConnecting(false);
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudio();
      disconnectLiveKit();
    };
  }, [cleanupAudio, disconnectLiveKit]);

  // --------------------------------------------------------------------------
  // LIVEKIT WEBRTC СЕССИЯСЫН БАСҚАРУ (100% GOPREP ARCHITECTURE)
  // --------------------------------------------------------------------------
  const startLiveKitSession = useCallback(async () => {
    setIsLiveKitConnecting(true);
    setErrorMessage(null);
    setLiveKitUnconfigured(false);

    try {
      // 1. Бэкендтен LiveKit JWT токенін сұрау
      const tokenData = await fetchLiveKitToken(undefined, {
        accessToken: session?.access_token,
      });

      if (!tokenData.is_configured || !tokenData.token || !tokenData.url) {
        setLiveKitUnconfigured(true);
        setIsLiveKitConnecting(false);
        return;
      }

      // 2. LiveKit Room құру
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      liveKitRoomRef.current = room;
      setLiveKitRoomName(tokenData.room || 'LiveKit Room');

      // Келген дыбыс трегін тыңдау
      room.on(
        RoomEvent.TrackSubscribed,
        (track: Track, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();
            liveKitAudioElementRef.current = audioElement;
            setStatus('speaking');
          }
        },
      );

      room.on(RoomEvent.TrackUnsubscribed, (track: Track) => {
        track.detach();
        setStatus('listening');
      });

      // Байланыс үзілгенде
      room.on(RoomEvent.Disconnected, () => {
        setIsLiveKitConnected(false);
        setIsLiveKitConnecting(false);
        setStatus('idle');
      });

      // 3. WebRTC серверге қосылу
      await room.connect(tokenData.url, tokenData.token);

      // 4. Микрофонды тікелей WebRTC арқылы ағынға шығару
      await room.localParticipant.setMicrophoneEnabled(true);

      setIsLiveKitConnected(true);
      setIsLiveKitConnecting(false);
      setStatus('listening');

      toast({
        title: 'GoPrep (LiveKit) қосылды!',
        description: 'WebRTC арқылы ~500 мс жылдамдықтағы тірі байланыс орнатылды.',
      });
    } catch (err) {
      console.error('LiveKit connection error:', err);
      const msg = err instanceof Error ? err.message : 'LiveKit WebRTC серверіне қосылу сәтсіз аяқталды.';
      setErrorMessage(msg);
      setIsLiveKitConnecting(false);
      setIsLiveKitConnected(false);
      toast({
        title: 'LiveKit қатесі',
        description: msg,
        variant: 'destructive',
      });
    }
  }, [session?.access_token, toast]);

  // --------------------------------------------------------------------------
  // БРАУЗЕРЛІК VAD & СӨЗ ЖАЗУ ЛОГИКАСЫ (FALLBACK LIVE MODE)
  // --------------------------------------------------------------------------
  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const playAudio = useCallback((audioUrl: string) => {
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
        setStatus('listening');
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

  const sendAudioToBackend = useCallback(
    async (blob: Blob) => {
      setStatus('processing');
      setErrorMessage(null);
      abortControllerRef.current = new AbortController();

      try {
        const historyContext = chatHistory.slice(-6).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await sendVoiceAssistantAudio(blob, {
          language,
          voice: selectedVoice,
          systemPrompt,
          history: historyContext,
          accessToken: session?.access_token,
          signal: abortControllerRef.current.signal,
        });

        setLastResponse(response);
        onResponse?.(response);

        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: response.userTranscript },
          { role: 'assistant', content: response.aiReply, audioUrl: response.audioUrl },
        ]);

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
    },
    [chatHistory, language, onResponse, playAudio, selectedVoice, session?.access_token, systemPrompt, toast],
  );

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

      // Barge-in (Сөзді бөлу)
      if (
        (currentStatus === 'speaking' || currentStatus === 'paused') &&
        normalizedVolume > SILENCE_THRESHOLD_VOLUME
      ) {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current = null;
        }
        setStatus('recording');
        startLiveSpeechChunk();
      }

      // Сөйлей бастаған сәт
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

      // Сөйлеп жатқан кезде
      if (isSpeakingNowRef.current) {
        if (normalizedVolume > SILENCE_THRESHOLD_VOLUME) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
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
  }, [finishLiveSpeechChunk, startLiveSpeechChunk]);

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

  const stopLiveConversation = useCallback(() => {
    cleanupAudio();
    setIsLiveActive(false);
    isLiveActiveRef.current = false;
    setStatus('idle');
  }, [cleanupAudio]);

  // Қолмен жазу
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
  }, []);

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
  };

  // Режимді ауыстыру
  const handleModeChange = (newMode: VoiceAssistantMode) => {
    if (newMode === mode) return;
    cleanupAudio();
    disconnectLiveKit();
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
        {/* Жоғарғы қатар: Режимдерді таңдау және Тіл / Дауыс ауыстыру */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
          {/* Режим таңдау: LiveKit (GoPrep), Тірі сұхбат немесе Қолмен */}
          <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => handleModeChange('livekit')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                mode === 'livekit'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Flame size={13} className={mode === 'livekit' ? 'fill-current' : ''} />
              <span>GoPrep WebRTC</span>
            </button>

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
              <span>Тірі сұхбат (VAD)</span>
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

          {/* Оң жақ: Дауыс таңдау және Тіл ауыстыру */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Дауыс түрін таңдау */}
            <div className="flex items-center gap-1 rounded-full bg-muted/50 p-1 text-xs">
              {language === 'kk' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedVoice('kk-KZ-DauletNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      selectedVoice === 'kk-KZ-DauletNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Дәулет — жылы әрі табиғи ер адам дауысы"
                  >
                    👨 Дәулет
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVoice('kk-KZ-AigulNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      selectedVoice === 'kk-KZ-AigulNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Айгүл — әйел адамның дауысы"
                  >
                    👩 Айгүл
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedVoice('ru-RU-DmitryNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      selectedVoice === 'ru-RU-DmitryNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Дмитрий — мужской голос"
                  >
                    👨 Дмитрий
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVoice('ru-RU-SvetlanaNeural')}
                    disabled={status === 'recording' || status === 'processing'}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
                      selectedVoice === 'ru-RU-SvetlanaNeural'
                        ? 'bg-card text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Светлана — женский голос"
                  >
                    👩 Светлана
                  </button>
                </>
              )}
            </div>

            {/* Тіл ауыстыру */}
            <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => {
                  setLanguage('kk');
                  setSelectedVoice('kk-KZ-DauletNeural');
                }}
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
                onClick={() => {
                  setLanguage('ru');
                  setSelectedVoice('ru-RU-DmitryNeural');
                }}
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
        </div>

        {/* ---------------------------------------------------- */}
        {/* РЕЖИМ 1: GOPREP WEBRTC (LIVEKIT + DEEPGRAM + CARTESIA) */}
        {/* ---------------------------------------------------- */}
        {mode === 'livekit' ? (
          <div className="my-6 flex flex-col items-center justify-center text-center space-y-6">
            {liveKitUnconfigured ? (
              /* Егер LiveKit кілттері әлі қосылмаған болса, нұсқаулық картасы */
              <div className="w-full max-w-lg rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left space-y-4">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Info size={18} />
                  <span>GoPrep WebRTC (LiveKit + Deepgram + Cartesia) баптауы</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  GoPrep сияқты ~500 мс нақты уақыттағы WebRTC дауысын іске қосу үшін сервердің <code>.env</code> файлына мына кілттерді қосу қажет:
                </p>
                <div className="space-y-1.5 text-[11px] font-mono bg-background/80 p-3 rounded-lg border border-border/50 overflow-x-auto">
                  <p>LIVEKIT_URL=wss://your-project.livekit.cloud</p>
                  <p>LIVEKIT_API_KEY=your-api-key</p>
                  <p>LIVEKIT_API_SECRET=your-api-secret</p>
                  <p>DEEPGRAM_API_KEY=your-deepgram-key</p>
                  <p>CARTESIA_API_KEY=your-cartesia-key</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  <a
                    href="https://cloud.livekit.io"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    <span>cloud.livekit.io (Тегін)</span>
                    <ExternalLink size={12} />
                  </a>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleModeChange('live')}
                    className="rounded-full text-xs font-semibold"
                  >
                    <Zap size={13} className="mr-1" />
                    Кірістірілген Тірі сұхбатқа көшу
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Visualizer Orb */}
                <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
                  {isLiveKitConnected ? (
                    <>
                      <span className="absolute h-36 w-36 animate-ping rounded-full bg-primary/15 sm:h-44 sm:w-44" />
                      <span className="absolute h-32 w-32 animate-pulse rounded-full bg-primary/20 sm:h-40 sm:w-40" />
                    </>
                  ) : null}

                  {!isLiveKitConnected ? (
                    <button
                      type="button"
                      onClick={startLiveKitSession}
                      disabled={isLiveKitConnecting}
                      className={cn(
                        'relative z-10 flex h-24 w-24 items-center justify-center rounded-full',
                        'bg-primary text-primary-foreground shadow-lg transition-all duration-300',
                        'hover:scale-105 active:scale-95 sm:h-28 sm:w-28',
                      )}
                      aria-label="GoPrep WebRTC сұхбатын бастау"
                    >
                      {isLiveKitConnecting ? (
                        <Loader2 size={36} className="animate-spin" />
                      ) : (
                        <Radio size={36} className="animate-pulse" />
                      )}
                    </button>
                  ) : (
                    <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg sm:h-28 sm:w-28">
                      <Headphones size={36} className="animate-pulse" />
                    </div>
                  )}
                </div>

                {/* Статустар */}
                <div className="space-y-2">
                  {!isLiveKitConnected ? (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-foreground">
                        {isLiveKitConnecting ? 'WebRTC серверіне қосылуда...' : 'GoPrep WebRTC сұхбатын бастау'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        LiveKit WebRTC + Deepgram + Groq + Cartesia (~500 мс кідіріс)
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                        <Wifi size={14} className="animate-pulse" />
                        <span>GoPrep бөлмесі белсенді ({liveKitRoomName})</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Микрофон тікелей WebRTC арқылы ағылуда. AI дауысы да кідіріссіз келеді.
                      </p>
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={disconnectLiveKit}
                          className="rounded-full text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <MicOff size={13} className="mr-1.5" />
                          Сұхбатты тоқтату
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : mode === 'live' ? (
          /* ---------------------------------------------------- */
          /* РЕЖИМ 2: ТІРІ СҰХБАТ (BROWSER VAD + STREAMING)       */
          /* ---------------------------------------------------- */
          <div className="my-6 flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
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

            {/* Waveform */}
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
          /* РЕЖИМ 3: ҚОЛМЕН БАСУ (MANUAL PUSH-TO-TALK)           */
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

        {/* ДИАЛОГ ТАРИХЫ */}
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
