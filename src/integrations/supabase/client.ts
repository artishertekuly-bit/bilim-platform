import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function getRequiredEnv(name: 'VITE_SUPABASE_URL'): string;
function getRequiredEnv(
  name: 'VITE_SUPABASE_PUBLISHABLE_KEY' | 'VITE_SUPABASE_ANON_KEY'
): string | undefined;
function getRequiredEnv(
  name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY' | 'VITE_SUPABASE_ANON_KEY'
) {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : undefined;
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const DEFAULT_SUPABASE_URL = 'https://xhkrvkwyvwvncywglrnv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoa3J2a3d5dnd2bmN5d2dscm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODgyNDQsImV4cCI6MjA5MTY2NDI0NH0.5n0f_fEgGdeR5-Da3dE1TNTektTMih8fGINJ4RzhMdE';

const SUPABASE_URL = getRequiredEnv('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  getRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getRequiredEnv('VITE_SUPABASE_ANON_KEY') ||
  DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: getBrowserStorage(),
      storageKey: 'bilim-auth-token',
      persistSession: true,
      autoRefreshToken: true,

      /*
        Маңызды:
        OAuth callback-ты src/pages/AuthCallbackPage.tsx өзі өңдейді.
        Егер detectSessionInUrl true болса, Supabase client code exchange-ті автоматты жасап,
        AuthCallbackPage тағы exchange жасап, PKCE verifier error береді.
      */
      detectSessionInUrl: false,

      flowType: 'pkce',
    },
  }
);
