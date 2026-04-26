import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'student' | 'teacher' | 'parent' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;

  /**
   * Маңызды:
   * Бұл avatar тек public.profiles.avatar_url ішінен ғана келеді.
   * Google metadata.picture / avatar_url fallback ретінде қолданылмайды.
   */
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

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed || undefined;
}

function isRegisterableRole(value: unknown): value is Exclude<UserRole, 'admin'> {
  return value === 'student' || value === 'teacher' || value === 'parent';
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
  return isRegisterableRole(value) ? value : null;
}

function setPendingOAuthRole(role: UserRole) {
  if (typeof window === 'undefined') return;
  if (!isRegisterableRole(role)) return;

  window.localStorage.setItem(PENDING_OAUTH_ROLE_KEY, role);
}

function clearPendingOAuthRole() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
}

function getSupabaseMetadataName(supabaseUser: SupabaseUser) {
  return (
    normalizeOptionalText(supabaseUser.user_metadata?.full_name) ||
    normalizeOptionalText(supabaseUser.user_metadata?.name) ||
    normalizeOptionalText(supabaseUser.email?.split('@')[0]) ||
    ''
  );
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
  const role = data?.role;

  return isUserRole(role) ? role : 'student';
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

async function syncRequestedRole(requestedRole?: UserRole | null) {
  const { error } = await supabase.rpc('claim_requested_role' as never, {
    p_requested_role: requestedRole ?? null,
  } as never);

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

async function applyPendingOAuthRoleIfNeeded(_supabaseUser: SupabaseUser) {
  const pendingRole = getPendingOAuthRole();

  if (!pendingRole) return;

  try {
    await syncRequestedRole(pendingRole);
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

  const profileFullName = normalizeOptionalText(profile?.full_name);
  const profileAvatarUrl = normalizeOptionalText(profile?.avatar_url);
  const profileBio = normalizeOptionalText(profile?.bio);

  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    fullName: profileFullName || getSupabaseMetadataName(supabaseUser),
    role,

    /**
     * Google avatar fallback әдейі жоқ.
     * Егер profiles.avatar_url null болса, UserAvatar initials fallback көрсетеді.
     */
    avatarUrl: profileAvatarUrl,

    bio: profileBio || '',
  };
}

async function buildUserWithRetry(
  supabaseUser: SupabaseUser,
  retries = 6
): Promise<User> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const appUser = await buildUser(supabaseUser);

      if (appUser.fullName && appUser.role) {
        return appUser;
      }
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
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const bootstrapAuth = async () => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw new Error(error.message);
        }

        if (!mounted) return;

        await hydrateSession(initialSession);

        if (!mounted) return;

        const {
          data: { subscription: authSubscription },
        } = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (event === 'INITIAL_SESSION') return;

          void hydrateSession(nextSession).catch((authError) => {
            console.error('Failed to hydrate auth session', authError);
          });
        });

        subscription = authSubscription;
      } catch (error) {
        console.error('Failed to bootstrap auth session', error);

        if (!mounted) return;

        setUser(null);
        setSession(null);
        setIsLoading(false);
      }
    };

    void bootstrapAuth();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
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

      await syncRequestedRole(null);

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

      await syncRequestedRole(role);

      const appUser = await hydrateSession(data.session);
      return { user: appUser };
    },
    [hydrateSession]
  );

  const loginWithGoogle = useCallback(async (role?: UserRole) => {
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);

    if (role && isRegisterableRole(role)) {
      setPendingOAuthRole(role);
      callbackUrl.searchParams.set('role', role);
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      if (role) {
        clearPendingOAuthRole();
      }

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

      await syncRequestedRole(null);

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

  const isAuthenticated = Boolean(session && user);

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
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be inside AuthProvider');
  }

  return context;
}