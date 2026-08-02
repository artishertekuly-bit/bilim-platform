import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';
import { removeNullCharacters } from '@/lib/utils';

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

const MAX_EMAIL_CHARS = 320;
const MAX_NAME_CHARS = 180;
const MAX_PROFILE_TEXT_CHARS = 1_000;
const MAX_TOKEN_CHARS = 128;
const MAX_PASSWORD_CHARS = 256;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit?: number): string {
  const normalized = cleanRawText(value).replace(/\s+/g, ' ').trim();

  return typeof limit === 'number' ? normalized.slice(0, limit).trim() : normalized;
}

function normalizeEmail(value: string): string {
  return cleanText(value, MAX_EMAIL_CHARS).toLowerCase();
}

function normalizeFullName(value: string): string {
  return cleanText(value, MAX_NAME_CHARS);
}

function normalizePassword(value: string): string {
  return cleanRawText(value).slice(0, MAX_PASSWORD_CHARS);
}

function normalizeOtpToken(value: string): string {
  return cleanText(value, MAX_TOKEN_CHARS);
}

function normalizeOptionalText(value: unknown, limit = MAX_PROFILE_TEXT_CHARS) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = cleanText(value, limit);

  return normalized || undefined;
}

function requireEmail(email: string): string {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error('Email енгізіңіз.');
  }

  return normalizedEmail;
}

function requirePassword(password: string): string {
  const normalizedPassword = normalizePassword(password);

  if (!normalizedPassword) {
    throw new Error('Құпиясөз енгізіңіз.');
  }

  return normalizedPassword;
}

function requireFullName(fullName: string): string {
  const normalizedFullName = normalizeFullName(fullName);

  if (!normalizedFullName) {
    throw new Error('Аты-жөніңізді енгізіңіз.');
  }

  return normalizedFullName;
}

function isPublicRegistrationRole(value: unknown): value is 'student' {
  return value === 'student';
}

function normalizePublicRegistrationRole(role: UserRole): 'student' {
  if (!isPublicRegistrationRole(role)) {
    throw new Error('Ашық тіркелу тек оқушы аккаунтына қолжетімді.');
  }

  return 'student';
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'student' ||
    value === 'teacher' ||
    value === 'parent' ||
    value === 'admin'
  );
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getPendingOAuthRole(): UserRole | null {
  const storage = getStorage();
  const value = cleanText(storage?.getItem(PENDING_OAUTH_ROLE_KEY), 40);

  return isPublicRegistrationRole(value) ? value : null;
}

function setPendingOAuthRole(role: UserRole) {
  const storage = getStorage();

  if (!storage) return;

  const normalizedRole = normalizePublicRegistrationRole(role);

  storage.setItem(PENDING_OAUTH_ROLE_KEY, normalizedRole);
}

function clearPendingOAuthRole() {
  const storage = getStorage();

  try {
    storage?.removeItem(PENDING_OAUTH_ROLE_KEY);
  } catch {
    // localStorage cleanup failure should not block auth flow.
  }
}

function getSupabaseMetadataName(supabaseUser: SupabaseUser) {
  return (
    normalizeOptionalText(supabaseUser.user_metadata?.full_name, MAX_NAME_CHARS) ||
    normalizeOptionalText(supabaseUser.user_metadata?.name, MAX_NAME_CHARS) ||
    normalizeOptionalText(supabaseUser.email?.split('@')[0], MAX_NAME_CHARS) ||
    ''
  );
}

async function fetchUserRoleRecord(userId: string) {
  const normalizedUserId = cleanText(userId, 160);

  if (!normalizedUserId) {
    throw new Error('Пайдаланушы ID табылмады.');
  }

  const { data, error } = await supabase
    .from('user_roles')
    .select('role, created_at')
    .eq('user_id', normalizedUserId)
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
  const normalizedUserId = cleanText(userId, 160);

  if (!normalizedUserId) {
    throw new Error('Пайдаланушы ID табылмады.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, bio')
    .eq('user_id', normalizedUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function syncRequestedRole(requestedRole?: UserRole | null) {
  const safeRole =
    requestedRole && isPublicRegistrationRole(requestedRole)
      ? requestedRole
      : null;

  const { error } = await supabase.rpc('claim_requested_role' as never, {
    p_requested_role: safeRole,
  } as never);

  if (!error) return;

  const code = (error as { code?: string })?.code ?? '';
  const message = `${error.message ?? ''} ${code}`.trim();

  const isMissingRpc =
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message) ||
    (/not found/i.test(message) && /claim_requested_role/i.test(message));

  if (isMissingRpc) {
    return;
  }

  throw new Error(error.message);
}

async function applyPendingOAuthRoleIfNeeded(_supabaseUser: SupabaseUser) {
  const pendingRole = getPendingOAuthRole();

  if (!pendingRole) return;

  await syncRequestedRole(pendingRole);
  clearPendingOAuthRole();
}

async function buildUser(supabaseUser: SupabaseUser): Promise<User> {
  const [role, profile] = await Promise.all([
    fetchUserRole(supabaseUser.id),
    fetchProfile(supabaseUser.id),
  ]);

  const profileFullName = normalizeOptionalText(profile?.full_name, MAX_NAME_CHARS);
  const profileAvatarUrl = normalizeOptionalText(profile?.avatar_url, 1_000);
  const profileBio = normalizeOptionalText(profile?.bio, MAX_PROFILE_TEXT_CHARS);

  return {
    id: supabaseUser.id,
    email: normalizeEmail(supabaseUser.email || ''),
    fullName: profileFullName || getSupabaseMetadataName(supabaseUser),
    role,
    avatarUrl: profileAvatarUrl,
    bio: profileBio || '',
  };
}

async function buildUserWithRetry(
  supabaseUser: SupabaseUser,
  retries = 6,
): Promise<User> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const appUser = await buildUser(supabaseUser);

      if (appUser.fullName && appUser.role) {
        return appUser;
      }
    } catch {
      // Profile/role trigger propagation may be delayed.
    }

    await sleep(250 * (attempt + 1));
  }

  return buildUser(supabaseUser);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrationVersionRef = useRef(0);

  const hydrateSession = useCallback(async (nextSession: Session | null) => {
    const hydrationVersion = hydrationVersionRef.current + 1;
    hydrationVersionRef.current = hydrationVersion;

    setSession(nextSession);

    if (!nextSession?.user) {
      if (hydrationVersionRef.current === hydrationVersion) {
        setUser(null);
        setIsLoading(false);
      }

      return null;
    }

    try {
      await applyPendingOAuthRoleIfNeeded(nextSession.user);

      const appUser = await buildUserWithRetry(nextSession.user);

      if (hydrationVersionRef.current === hydrationVersion) {
        setUser(appUser);
      }

      return appUser;
    } catch (error) {
      if (hydrationVersionRef.current === hydrationVersion) {
        setUser(null);
      }

      throw error;
    } finally {
      if (hydrationVersionRef.current === hydrationVersion) {
        setIsLoading(false);
      }
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

          void hydrateSession(nextSession).catch(() => undefined);
        });

        subscription = authSubscription;
      } catch {
        if (!mounted) return;

        hydrationVersionRef.current += 1;
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
      const normalizedEmail = requireEmail(email);
      const normalizedPassword = requirePassword(password);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
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
    [hydrateSession],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<AuthActionResult> => {
      const normalizedEmail = requireEmail(email);
      const normalizedPassword = requirePassword(password);
      const normalizedFullName = requireFullName(fullName);
      const normalizedRole: 'student' = 'student';

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: normalizedPassword,
        options: {
          data: {
            full_name: normalizedFullName,
            role: normalizedRole,
          },
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      if (error) throw new Error(error.message);

      if (!data.user) {
        throw new Error('Пайдаланушы жасалмады.');
      }

      if (!data.session) {
        return {
          user: null,
          requiresEmailConfirmation: true,
          message: 'Email-ға жіберілген 6 таңбалы кодты енгізіңіз.',
        };
      }

      await syncRequestedRole(normalizedRole);

      const appUser = await hydrateSession(data.session);

      return { user: appUser };
    },
    [hydrateSession],
  );

  const loginWithGoogle = useCallback(async (role?: UserRole) => {
    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);

    if (role) {
      const normalizedRole = normalizePublicRegistrationRole(role);
      setPendingOAuthRole(normalizedRole);
      callbackUrl.searchParams.set('role', normalizedRole);
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
      const normalizedEmail = requireEmail(email);
      const normalizedToken = normalizeOtpToken(token);

      if (!normalizedToken) {
        throw new Error('Растау кодын енгізіңіз.');
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedToken,
        type: 'email',
      });

      if (error) throw new Error(error.message);

      if (!data.session || !data.user) {
        throw new Error('Код расталды, бірақ сессия ашылмады.');
      }

      await syncRequestedRole(null);

      return hydrateSession(data.session);
    },
    [hydrateSession],
  );

  const resendSignupOtp = useCallback(async (email: string) => {
    const normalizedEmail = requireEmail(email);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
    });

    if (error) throw new Error(error.message);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalizedEmail = requireEmail(email);

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(
    async (newPassword: string) => {
      const normalizedPassword = requirePassword(newPassword);

      const { error } = await supabase.auth.updateUser({
        password: normalizedPassword,
      });

      if (error) throw new Error(error.message);

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      await hydrateSession(currentSession);
    },
    [hydrateSession],
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw new Error(error.message);

    hydrationVersionRef.current += 1;
    clearPendingOAuthRole();
    setUser(null);
    setSession(null);
    setIsLoading(false);
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
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth AuthProvider ішінде қолданылуы керек.');
  }

  return context;
}