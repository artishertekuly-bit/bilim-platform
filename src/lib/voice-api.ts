import { getAiApiBaseUrl } from './ai-api';

export type VoiceEmotion = 'happy' | 'thinking' | 'speaking' | 'listening';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
export type VoiceManner = 'modern' | 'warm' | 'strict' | 'youth' | 'mature';

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

export interface RealtimeSessionResponse {
  status: string;
  client_secret: string;
  session_id: string;
  model: string;
  voice: string;
  instructions?: string;
}

/**
 * OpenAI Realtime API WebRTC үшін уақытша (ephemeral) кілт алады.
 */
export async function createRealtimeSession(
  accessToken?: string,
  manner: VoiceManner = 'modern',
): Promise<RealtimeSessionResponse> {
  const baseUrl = getAiApiBaseUrl();
  const url = `${baseUrl}/api/voice/realtime/session?manner=${encodeURIComponent(manner)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
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
    throw new Error(detail || `OpenAI Realtime сессиясын бастау қатесі: ${res.status}`);
  }

  return res.json();
}

/**
 * WebRTC арқылы сөйлесілген әрбір сұрақ-жауапты Supabase-ке сақтайды.
 */
export async function saveVoiceTurn(
  payload: {
    userTranscript: string;
    aiResponse: string;
    sessionId?: string;
    emotion?: string;
    language?: string;
  },
  accessToken?: string,
): Promise<string | null> {
  try {
    const baseUrl = getAiApiBaseUrl();
    const url = `${baseUrl}/api/voice/history/save`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_transcript: payload.userTranscript,
        ai_response: payload.aiResponse,
        session_id: payload.sessionId,
        emotion: payload.emotion || 'happy',
        language: payload.language,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch (e) {
    console.warn('Could not save voice turn to history:', e);
    return null;
  }
}

/**
 * Сақтық REST режимі (егер WebRTC іске қосылмаса).
 */
export async function sendVoiceInteractHttp(
  audioBlob: Blob,
  options?: {
    accessToken?: string;
    sessionId?: string;
    manner?: VoiceManner;
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
  if (options?.manner) {
    formData.append('manner', options.manner);
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
