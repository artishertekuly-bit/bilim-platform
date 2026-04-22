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

const SUPABASE_URL = getRequiredEnv('VITE_SUPABASE_URL');
const SUPABASE_PUBLISHABLE_KEY =
  getRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getRequiredEnv('VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL және VITE_SUPABASE_PUBLISHABLE_KEY немесе VITE_SUPABASE_ANON_KEY .env файлында көрсетілуі керек.'
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: getBrowserStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
);