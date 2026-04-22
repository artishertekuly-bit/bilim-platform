import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export type UserRole = 'student' | 'teacher' | 'parent' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  bio?: string;
}

export interface AuthActionResult {
  user: User | null;
  requiresEmailConfirmation?: boolean;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole
  ) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFullName(value: string) {
  return value.trim();
}

async function fetchUserRoleRecord(userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] || null;
}

async function fetchUserRole(userId: string): Promise<UserRole> {
  const data = await fetchUserRoleRecord(userId);
  return (data?.role as UserRole) || 'student';
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, bio')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function syncRequestedRole() {
  const { error } = await supabase.rpc('claim_requested_role');

  if (!error) return;

  const code = (error as { code?: string })?.code ?? '';
  const message = `${error.message ?? ''} ${code}`.trim();

  const isMissingRpc =
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message) ||
    (/not found/i.test(message) && /claim_requested_role/i.test(message));

  if (isMissingRpc) {
    console.warn('claim_requested_role RPC is missing, continuing without role sync');
    return;
  }

  throw new Error(error.message);
}

async function buildUser(supabaseUser: SupabaseUser): Promise<User> {
  const [role, profile] = await Promise.all([
    fetchUserRole(supabaseUser.id),
    fetchProfile(supabaseUser.id),
  ]);

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    fullName:
      profile?.full_name ||
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.email?.split('@')[0] ||
      '',
    role,
    avatarUrl: profile?.avatar_url || undefined,
    bio: profile?.bio || '',
  };
}

async function buildUserWithRetry(supabaseUser: SupabaseUser, retries = 6): Promise<User> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const appUser = await buildUser(supabaseUser);
      if (appUser.fullName && appUser.role) return appUser;
    } catch {
      // role/profile propagation delay болуы мүмкін
    }

    await sleep(250 * (attempt + 1));
  }

  return buildUser(supabaseUser);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrateSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setUser(null);
      setIsLoading(false);
      return null;
    }

    try {
      const appUser = await buildUserWithRetry(nextSession.user);
      setUser(appUser);
      return appUser;
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrateSession(nextSession).catch((error) => {
        console.error('Failed to hydrate auth session', error);
      });
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => hydrateSession(initialSession))
      .catch((error) => {
        console.error('Failed to get initial auth session', error);
        setUser(null);
        setSession(null);
        setIsLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [hydrateSession]);

  const refreshUser = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    return hydrateSession(currentSession);
  }, [hydrateSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const normalizedEmail = normalizeEmail(email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw new Error(error.message);

      if (!data.session || !data.user) {
        return {
          user: null,
          requiresEmailConfirmation: true,
          message: 'Email мекенжайын растағаннан кейін қайта кіріңіз.',
        };
      }

      await syncRequestedRole();

      const appUser = await hydrateSession(data.session);
      return { user: appUser };
    },
    [hydrateSession]
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: UserRole
    ): Promise<AuthActionResult> => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedFullName = normalizeFullName(fullName);

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedFullName,
            role,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw new Error(error.message);

      if (!data.user) {
        throw new Error('Пайдаланушы жасалмады');
      }

      if (!data.session) {
        return {
          user: null,
          requiresEmailConfirmation: true,
          message: 'Тіркелу аяқталды. Енді email-дағы сілтемені басып, қайта кіріңіз.',
        };
      }

      await syncRequestedRole();

      const appUser = await hydrateSession(data.session);
      return { user: appUser };
    },
    [hydrateSession]
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    setUser(null);
    setSession(null);
  }, []);

  const isAuthenticated = !!session && !!user;

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, session, isAuthenticated, isLoading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}