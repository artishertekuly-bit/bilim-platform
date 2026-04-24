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
  loginWithGoogle: (role?: UserRole) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<User | null>;
  resendSignupOtp: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PENDING_OAUTH_ROLE_KEY = 'bilim.pendingOAuthRole';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeFullName(value: string) {
  return value.trim();
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'student' ||
    value === 'teacher' ||
    value === 'parent' ||
    value === 'admin'
  );
}

function getPendingOAuthRole(): UserRole | null {
  if (typeof window === 'undefined') return null;

  const value = window.localStorage.getItem(PENDING_OAUTH_ROLE_KEY);
  return isUserRole(value) ? value : null;
}

function setPendingOAuthRole(role?: UserRole) {
  if (typeof window === 'undefined') return;

  if (role) {
    window.localStorage.setItem(PENDING_OAUTH_ROLE_KEY, role);
    return;
  }

  window.localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
}

function clearPendingOAuthRole() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
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

async function applyPendingOAuthRoleIfNeeded(supabaseUser: SupabaseUser) {
  const pendingRole = getPendingOAuthRole();

  if (!pendingRole) return;

  try {
    const existingRole = await fetchUserRoleRecord(supabaseUser.id);

    if (existingRole?.role) {
      clearPendingOAuthRole();
      return;
    }

    const metadata = supabaseUser.user_metadata || {};
    const fullName =
      metadata.full_name ||
      metadata.name ||
      supabaseUser.email?.split('@')[0] ||
      '';

    const { error } = await supabase.auth.updateUser({
      data: {
        ...metadata,
        full_name: fullName,
        role: pendingRole,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    await syncRequestedRole();
    clearPendingOAuthRole();
  } catch (error) {
    console.error('Failed to apply pending OAuth role', error);
    throw error;
  }
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
      supabaseUser.user_metadata?.name ||
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
      await applyPendingOAuthRoleIfNeeded(nextSession.user);

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
          message: 'Email растау коды жіберілді. Кодты енгізіп тіркелуді аяқтаңыз.',
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
          emailRedirectTo: `${window.location.origin}/verify-email`,
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
          message: 'Email-ға жіберілген 6 таңбалы кодты енгізіңіз.',
        };
      }

      await syncRequestedRole();

      const appUser = await hydrateSession(data.session);
      return { user: appUser };
    },
    [hydrateSession]
  );

  const loginWithGoogle = useCallback(async (role?: UserRole) => {
    setPendingOAuthRole(role);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      clearPendingOAuthRole();
      throw new Error(error.message);
    }
  }, []);

  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedToken = token.trim();

      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });

      if (error) throw new Error(error.message);

      if (!data.session || !data.user) {
        throw new Error('Код расталғаннан кейін сессия ашылмады');
      }

      await syncRequestedRole();

      return hydrateSession(data.session);
    },
    [hydrateSession]
  );

  const resendSignupOtp = useCallback(async (email: string) => {
    const normalizedEmail = normalizeEmail(email);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
    });

    if (error) throw new Error(error.message);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalizedEmail = normalizeEmail(email);

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(
    async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw new Error(error.message);

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      await hydrateSession(currentSession);
    },
    [hydrateSession]
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    clearPendingOAuthRole();
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
      loginWithGoogle,
      verifyEmailOtp,
      resendSignupOtp,
      requestPasswordReset,
      updatePassword,
      logout,
      refreshUser,
    }),
    [
      user,
      session,
      isAuthenticated,
      isLoading,
      login,
      register,
      loginWithGoogle,
      verifyEmailOtp,
      resendSignupOtp,
      requestPasswordReset,
      updatePassword,
      logout,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}