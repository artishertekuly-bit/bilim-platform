import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

export function useAppDeepLink() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleUrlOpen = async (event: URLOpenListenerEvent) => {
      try {
        await Browser.close();
      } catch {
        // In-app browser may already be closed
      }

      const rawUrl = event.url;
      if (!rawUrl) return;

      try {
        // 1. Fragment-based tokens (#access_token=...&refresh_token=...)
        if (rawUrl.includes('access_token=') && rawUrl.includes('refresh_token=')) {
          const hashPart = rawUrl.includes('#') ? rawUrl.split('#')[1] : rawUrl.split('?')[1] || '';
          const params = new URLSearchParams(hashPart);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (!error) {
              await refreshUser();
              navigate('/dashboard', { replace: true });
              return;
            }
          }
        }

        // 2. PKCE code-based flow (?code=...)
        if (rawUrl.includes('code=')) {
          const queryPart = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
          const params = new URLSearchParams(queryPart);
          const code = params.get('code');

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error) {
              await refreshUser();
              navigate('/dashboard', { replace: true });
              return;
            }
          }
        }

        // 3. Email verification link or navigation route
        if (rawUrl.includes('verify-email')) {
          navigate('/verify-email', { replace: true });
        } else if (rawUrl.includes('dashboard')) {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        console.error('Deep link processing error:', err);
      }
    };

    let listenerHandler: { remove: () => void } | null = null;

    void CapApp.addListener('appUrlOpen', handleUrlOpen).then((handler) => {
      listenerHandler = handler;
    });

    return () => {
      listenerHandler?.remove();
    };
  }, [navigate, refreshUser]);
}
