import { getAiApiBaseUrl } from './ai-api';

export type VoiceEmotion = 'happy' | 'thinking' | 'speaking' | 'listening';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceDialogRecord {
  id: string;
  sessionId?: string;
  userTranscript: string;
  aiResponse: string;
  emotion: VoiceEmotion;
  audioUrl?: string;
  audioBase64?: string;
  language?: string;
  createdAt?: string;
}

export function getVoiceWsUrl(): string {
  try {
    const httpBase = getAiApiBaseUrl();
    if (httpBase.startsWith('https://')) {
      return httpBase.replace('https://', 'wss://') + '/api/voice/ws';
    }
    if (httpBase.startsWith('http://')) {
      return httpBase.replace('http://', 'ws://') + '/api/voice/ws';
    }
  } catch {
    // ignore
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/voice/ws`;
}

export async function sendVoiceInteractRest(
  audioBlob: Blob,
  options?: {
    accessToken?: string;
    sessionId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
): Promise<{
  userTranscript: string;
  aiResponse: string;
  emotion: VoiceEmotion;
  audioBlob: Blob;
  audioUrl: string;
  recordId?: string;
}> {
  const baseUrl = getAiApiBaseUrl();
  const url = `${baseUrl}/api/voice/interact`;

  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice_recording.webm');
  if (options?.sessionId) {
    formData.append('session_id', options.sessionId);
  }
  if (options?.history && options.history.length > 0) {
    formData.append('history_json', JSON.stringify(options.history));
  }

  const headers: Record<string, string> = {};
  if (options?.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    headers,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Аудио өңдеу қатесі: ${errorText || res.statusText}`);
  }

  const data = await res.json();
  const rawBase64 = data.audio_base64 || '';
  const byteChars = atob(rawBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const audioBlobResult = new Blob([byteArray], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(audioBlobResult);

  return {
    userTranscript: data.user_transcript || '',
    aiResponse: data.ai_response || '',
    emotion: (data.emotion as VoiceEmotion) || 'happy',
    audioBlob: audioBlobResult,
    audioUrl,
    recordId: data.record_id,
  };
}

export async function fetchVoiceHistory(
  accessToken?: string,
  limit: number = 20,
): Promise<VoiceDialogRecord[]> {
  try {
    const baseUrl = getAiApiBaseUrl();
    const url = `${baseUrl}/api/voice/history?limit=${limit}`;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: item.id,
      sessionId: item.session_id,
      userTranscript: item.user_transcript,
      aiResponse: item.ai_response,
      emotion: (item.emotion as VoiceEmotion) || 'happy',
      createdAt: item.created_at,
    }));
  } catch {
    return [];
  }
}
