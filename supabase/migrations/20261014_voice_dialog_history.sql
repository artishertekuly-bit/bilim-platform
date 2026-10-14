-- ====================================================================
-- Migration: 20261014_voice_dialog_history.sql
-- Description: Real-time Voice Assistant dialogue history with Row Level Security (RLS)
-- ====================================================================

-- 1. Create the voice_dialog_history table
CREATE TABLE IF NOT EXISTS public.voice_dialog_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT,
    user_transcript TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    emotion VARCHAR(50) DEFAULT 'happy', -- 'happy', 'thinking', 'speaking', 'listening'
    audio_url TEXT,
    audio_duration_seconds NUMERIC(6, 2),
    language VARCHAR(10) DEFAULT 'kk',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_voice_dialog_history_user_id 
    ON public.voice_dialog_history(user_id);

CREATE INDEX IF NOT EXISTS idx_voice_dialog_history_created_at 
    ON public.voice_dialog_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_dialog_history_session_id 
    ON public.voice_dialog_history(session_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.voice_dialog_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Policy 1: Users can view only their own voice dialogue records
DROP POLICY IF EXISTS "Users can view own voice dialog history" ON public.voice_dialog_history;
CREATE POLICY "Users can view own voice dialog history"
    ON public.voice_dialog_history
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 2: Users can insert their own voice dialogue records
DROP POLICY IF EXISTS "Users can insert own voice dialog history" ON public.voice_dialog_history;
CREATE POLICY "Users can insert own voice dialog history"
    ON public.voice_dialog_history
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can delete their own voice dialogue records
DROP POLICY IF EXISTS "Users can delete own voice dialog history" ON public.voice_dialog_history;
CREATE POLICY "Users can delete own voice dialog history"
    ON public.voice_dialog_history
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 4: Service role (backend API) has full access
DROP POLICY IF EXISTS "Service role full access on voice_dialog_history" ON public.voice_dialog_history;
CREATE POLICY "Service role full access on voice_dialog_history"
    ON public.voice_dialog_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Helpful comment for Supabase Studio
COMMENT ON TABLE public.voice_dialog_history IS 'Stores real-time AI voice assistant conversation turns and emotions with RLS protection';
