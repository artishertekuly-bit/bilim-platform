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

export async function sendVoiceInteractHttp(
  audioBlob: Blob,
  options?: {
    accessToken?: string;
    sessionId?: string;
  },
): Promise<{
  userTranscript: string;
  aiResponse: string;
  emotion: VoiceEmotion;
  audioBlob: Blob | null;
  audioUrl: string | null;
  recordId?: string;
}> {
  const baseUrl = getAiApiBaseUrl();
  const url = `${baseUrl}/api/voice/interact`;

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  if (options?.sessionId) {
    formData.append('session_id', options.sessionId);
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
    let detail = '';
    try {
      const errJson = JSON.parse(errorText);
      detail = errJson.detail || errJson.message || '';
    } catch {
      detail = errorText;
    }
    throw new Error(detail || `Сервер қатесі: ${res.status}`);
  }

  const data = await res.json();
  const rawBase64 = data.audio_base64 || '';
  let audioBlobResult: Blob | null = null;
  let audioUrl: string | null = null;

  if (rawBase64) {
    try {
      const byteChars = atob(rawBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      audioBlobResult = new Blob([byteArray], { type: 'audio/mpeg' });
      audioUrl = URL.createObjectURL(audioBlobResult);
    } catch (decodeErr) {
      console.warn('Audio base64 decode failed:', decodeErr);
    }
  }

  return {
    userTranscript: data.user_transcript || '',
    aiResponse: data.ai_response || '',
    emotion: (data.emotion as VoiceEmotion) || 'happy',
    audioBlob: audioBlobResult,
    audioUrl,
    recordId: data.record_id,
  };
}

// Backward compatibility alias
export const sendVoiceInteractRest = sendVoiceInteractHttp;

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
