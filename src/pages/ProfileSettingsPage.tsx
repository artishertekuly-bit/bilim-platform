import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bot,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  ImageIcon,
  KeyRound,
  Mail,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';

import AvatarCropDialog from '@/components/AvatarCropDialog';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type UserRole } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { cn, limitText, removeNullCharacters } from '@/lib/utils';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE_MB = 25;

const MAX_ID_CHARS = 160;
const MAX_FULL_NAME_CHARS = 180;
const MAX_EMAIL_CHARS = 320;
const MAX_BIO_CHARS = 1_000;
const MAX_PASSWORD_CHARS = 256;
const MAX_PROVIDER_CHARS = 80;
const MAX_URL_CHARS = 2_000;
const MAX_ERROR_CHARS = 700;

const ROLE_LABELS: Record<UserRole, string> = {
  student: t('role.student'),
  teacher: t('role.teacher'),
  parent: t('role.parent'),
  admin: t('role.admin'),
};

function cleanRawText(value: unknown): string {
  return removeNullCharacters(String(value ?? ''));
}

function cleanText(value: unknown, limit = MAX_ERROR_CHARS): string {
  return limitText(cleanRawText(value).replace(/\s+/g, ' ').trim(), limit);
}

function cleanMultilineText(value: unknown, limit = MAX_BIO_CHARS): string {
  return limitText(
    cleanRawText(value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
    limit,
  );
}

function cleanId(value: unknown): string {
  return cleanText(value, MAX_ID_CHARS);
}

function normalizePassword(value: unknown): string {
  return cleanRawText(value).slice(0, MAX_PASSWORD_CHARS);
}

function normalizeProvider(value: unknown): string {
  return cleanText(value, MAX_PROVIDER_CHARS).toLowerCase();
}

function normalizeUrl(value: unknown): string {
  return cleanText(value, MAX_URL_CHARS);
}

function normalizeHttpUrl(value: unknown): string | null {
  const rawUrl = normalizeUrl(value);

  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractStoragePath(url?: string | null) {
  const normalizedUrl = normalizeHttpUrl(url);

  if (!normalizedUrl) return null;

  const cleanUrl = normalizedUrl.split('?')[0];
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = cleanUrl.indexOf(marker);

  if (index === -1) return null;

  const path = safeDecodePath(cleanUrl.slice(index + marker.length))
    .replace(/^\/+/, '')
    .trim();

  if (!path || path.includes('..') || path.startsWith('/')) {
    return null;
  }

  return path;
}

function getDefaultFullName(
  user?: {
    fullName?: string | null;
    email?: string | null;
  } | null,
) {
  return (
    cleanText(user?.fullName, MAX_FULL_NAME_CHARS) ||
    cleanText(user?.email?.split('@')[0], MAX_FULL_NAME_CHARS) ||
    ''
  );
}

function getFallbackFullName(
  user?: {
    fullName?: string | null;
    email?: string | null;
  } | null,
) {
  return getDefaultFullName(user) || 'Пайдаланушы';
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return cleanText(error.message, MAX_ERROR_CHARS);
  }

  return fallback;
}

function getCacheBustedUrl(url: string) {
  const normalizedUrl = normalizeHttpUrl(url);

  if (!normalizedUrl) return null;

  const separator = normalizedUrl.includes('?') ? '&' : '?';

  return `${normalizedUrl}${separator}v=${Date.now()}`;
}

function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Za-zА-Яа-я]/.test(value) && /\d/.test(value);
}

function getProviderLabel(provider: string) {
  const normalizedProvider = normalizeProvider(provider);

  if (normalizedProvider === 'google') return 'Google';
  if (normalizedProvider === 'email') return 'Email';

  return cleanText(provider, MAX_PROVIDER_CHARS) || 'Басқа';
}

function getRoleLabel(role: UserRole | string | null | undefined) {
  if (role === 'student' || role === 'teacher' || role === 'parent' || role === 'admin') {
    return ROLE_LABELS[role];
  }

  return '—';
}

function SectionCard({
  eyebrow,
  title,
  description,
  icon,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[2rem] border border-border bg-card shadow-soft',
        className,
      )}
    >
      <div className="flex items-start gap-4 border-b border-border/75 px-5 py-5 sm:px-6">
        {icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground">
            {icon}
          </span>
        ) : null}

        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {cleanText(eyebrow, MAX_FULL_NAME_CHARS)}
            </p>
          ) : null}

          <h2 className="mt-1 text-xl font-black tracking-[-0.035em]">
            {cleanText(title, MAX_FULL_NAME_CHARS)}
          </h2>

          {description ? (
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              {cleanText(description, MAX_BIO_CHARS)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function ProfileActionCard({
  title,
  text,
  href,
  icon,
  featured = false,
}: {
  title: string;
  text: string;
  href: string;
  icon: ReactNode;
  featured?: boolean;
}) {
  return (
    <Link
      to={href}
      className={cn(
        'group relative overflow-hidden rounded-[1.5rem] border p-4',
        'transition-[transform,border-color,box-shadow] duration-200 ease-soft',
        'hover:-translate-y-0.5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        featured
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:border-foreground/20',
      )}
    >
      <div className="relative flex items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
            featured
              ? 'border-background/20 bg-background/10'
              : 'border-border bg-background',
          )}
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-bold',
              featured ? 'text-background' : 'text-foreground',
            )}
          >
            {cleanText(title, MAX_FULL_NAME_CHARS)}
          </p>
          <p
            className={cn(
              'mt-1 text-xs leading-5',
              featured ? 'text-background/60' : 'text-muted-foreground',
            )}
          >
            {cleanText(text, MAX_BIO_CHARS)}
          </p>
        </div>

        <ArrowRight
          size={15}
          className="mt-1 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function getSanaRoleLabel(role: UserRole | null | undefined) {
  if (role === 'student') return 'Оқушы';
  if (role === 'teacher' || role === 'admin') return 'Автор';
  if (role === 'parent') return 'Ата-ана';

  return 'Қолданушы';
}

function PasswordRule({
  ok,
  children,
}: {
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium',
        ok
          ? 'border-success-muted bg-success-soft text-success-foreground'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{children}</span>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisible,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(normalizePassword(event.target.value))}
          placeholder={placeholder}
          className="pr-11"
          minLength={8}
          maxLength={MAX_PASSWORD_CHARS}
          disabled={disabled}
        />

        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          disabled={disabled}
          aria-label={visible ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const { user, refreshUser, updatePassword } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [cropOpen, setCropOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);

  const [authProviders, setAuthProviders] = useState<string[]>([]);
  const [passwordSetupCompleted, setPasswordSetupCompleted] = useState(false);

  const safeUserId = cleanId(user?.id);

  useEffect(() => {
    setFullName(getDefaultFullName(user));
    setBio(cleanMultilineText(user?.bio || '', MAX_BIO_CHARS));
    setAvatarUrl(normalizeHttpUrl(user?.avatarUrl));
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadAuthStatus = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const authUser = data.user;

        if (!authUser || cancelled) return;

        const providerSet = new Set<string>();

        const providers = authUser.app_metadata?.providers;

        if (Array.isArray(providers)) {
          providers.forEach((provider) => {
            const normalizedProvider = normalizeProvider(provider);

            if (normalizedProvider) {
              providerSet.add(normalizedProvider);
            }
          });
        }

        authUser.identities?.forEach((identity) => {
          const normalizedProvider = normalizeProvider(identity.provider);

          if (normalizedProvider) {
            providerSet.add(normalizedProvider);
          }
        });

        const nextProviders = Array.from(providerSet).slice(0, 8);

        setAuthProviders(nextProviders);
        setPasswordSetupCompleted(
          authUser.user_metadata?.password_setup_completed === true ||
            nextProviders.includes('email'),
        );
      } catch {
        if (!cancelled) {
          setAuthProviders([]);
          setPasswordSetupCompleted(false);
        }
      }
    };

    void loadAuthStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
      }
    };
  }, [selectedImageSrc]);

  const defaultFullName = useMemo(() => getDefaultFullName(user), [user]);
  const defaultBio = cleanMultilineText(user?.bio || '', MAX_BIO_CHARS);

  const normalizedFullName = cleanText(fullName, MAX_FULL_NAME_CHARS);
  const normalizedBio = cleanMultilineText(bio, MAX_BIO_CHARS);

  const isProfileDirty =
    normalizedFullName !== defaultFullName || normalizedBio !== defaultBio;

  const hasAvatar = Boolean(avatarUrl);
  const canSaveProfile = Boolean(safeUserId) && isProfileDirty && !savingProfile;
  const canRemoveAvatar = Boolean(safeUserId) && hasAvatar && !savingAvatar;

  const normalizedNewPassword = normalizePassword(newPassword);
  const normalizedConfirmPassword = normalizePassword(confirmPassword);

  const passwordHasMinLength = normalizedNewPassword.length >= 8;
  const passwordHasLetter = /[A-Za-zА-Яа-я]/.test(normalizedNewPassword);
  const passwordHasNumber = /\d/.test(normalizedNewPassword);

  const passwordMismatch =
    normalizedNewPassword.length > 0 &&
    normalizedConfirmPassword.length > 0 &&
    normalizedNewPassword !== normalizedConfirmPassword;

  const canSavePassword =
    Boolean(safeUserId) &&
    isValidPassword(normalizedNewPassword) &&
    normalizedConfirmPassword.length >= 8 &&
    normalizedNewPassword === normalizedConfirmPassword &&
    !savingPassword;

  const hasGoogleProvider = authProviders.includes('google');
  const hasEmailProvider = authProviders.includes('email') || passwordSetupCompleted;

  const displayName =
    normalizedFullName ||
    cleanText(user?.fullName, MAX_FULL_NAME_CHARS) ||
    cleanText(user?.email, MAX_FULL_NAME_CHARS) ||
    'Пайдаланушы';

  const upsertProfile = async (patch: {
    full_name?: string;
    bio?: string | null;
    avatar_url?: string | null;
  }) => {
    if (!safeUserId) {
      throw new Error('Пайдаланушы табылмады.');
    }

    const nextFullName =
      cleanText(
        patch.full_name ?? normalizedFullName ?? defaultFullName,
        MAX_FULL_NAME_CHARS,
      ) || getFallbackFullName(user);

    const nextBio =
      patch.bio === null ? null : cleanMultilineText(patch.bio ?? normalizedBio);

    const nextAvatarUrl = Object.prototype.hasOwnProperty.call(patch, 'avatar_url')
      ? normalizeHttpUrl(patch.avatar_url)
      : avatarUrl;

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: safeUserId,
          full_name: nextFullName,
          bio: nextBio || null,
          avatar_url: nextAvatarUrl,
        },
        {
          onConflict: 'user_id',
        },
      );

    if (error) {
      throw new Error(error.message);
    }
  };

  const closeCropDialog = () => {
    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
    }

    setSelectedImageSrc(null);
    setCropOpen(false);
  };

  const handleAvatarFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.invalid_file_type'),
        variant: 'destructive',
      });

      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.file_too_large'),
        variant: 'destructive',
      });

      event.currentTarget.value = '';
      return;
    }

    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
    }

    const objectUrl = URL.createObjectURL(file);

    setSelectedImageSrc(objectUrl);
    setCropOpen(true);

    event.currentTarget.value = '';
  };

  const handleAvatarCropped = async (croppedFile: File) => {
    if (!safeUserId) return;

    if (!croppedFile.type.startsWith('image/')) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.invalid_file_type'),
        variant: 'destructive',
      });

      return;
    }

    if (croppedFile.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.file_too_large'),
        variant: 'destructive',
      });

      return;
    }

    setSavingAvatar(true);

    try {
      const oldStoragePath = extractStoragePath(avatarUrl);
      const filePath = `${safeUserId}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, croppedFile, {
          upsert: false,
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
      const nextAvatarUrl = normalizeHttpUrl(data.publicUrl);

      if (!nextAvatarUrl) {
        throw new Error(t('page.profile.toast.avatar_save_error'));
      }

      await upsertProfile({
        avatar_url: nextAvatarUrl,
      });

      if (oldStoragePath && oldStoragePath !== filePath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([oldStoragePath]);
      }

      setAvatarUrl(getCacheBustedUrl(nextAvatarUrl));
      await refreshUser();
      closeCropDialog();

      toast({
        title: t('page.profile.toast.avatar_updated'),
      });
    } catch (error) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: getErrorMessage(error, t('page.profile.toast.avatar_save_error')),
        variant: 'destructive',
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveProfile = async () => {
    if (!safeUserId || !isProfileDirty) return;

    setSavingProfile(true);

    try {
      await upsertProfile({
        full_name: normalizedFullName || getFallbackFullName(user),
        bio: normalizedBio || null,
      });

      await refreshUser();

      toast({
        title: t('page.profile.toast.profile_updated'),
      });
    } catch (error) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: getErrorMessage(error, t('page.profile.toast.profile_save_error')),
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const removeAvatar = async () => {
    if (!safeUserId || !avatarUrl) return;

    setSavingAvatar(true);

    try {
      const storagePath = extractStoragePath(avatarUrl);

      if (storagePath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);
      }

      await upsertProfile({
        avatar_url: null,
      });

      setAvatarUrl(null);
      await refreshUser();

      toast({
        title: t('page.profile.toast.avatar_removed'),
      });
    } catch (error) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: getErrorMessage(error, t('page.profile.toast.avatar_remove_error')),
        variant: 'destructive',
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const savePassword = async () => {
    if (!canSavePassword) return;

    setSavingPassword(true);

    try {
      await updatePassword(normalizedNewPassword);

      const { error } = await supabase.auth.updateUser({
        data: {
          password_setup_completed: true,
          password_setup_completed_at: new Date().toISOString(),
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setPasswordSetupCompleted(true);
      setAuthProviders((current) => Array.from(new Set([...current, 'email'])));

      await refreshUser();

      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);

      toast({
        title: 'Құпия сөз жаңартылды',
      });
    } catch (error) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: getErrorMessage(error, 'Құпия сөзді жаңарту мүмкін болмады.'),
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const sanaRoleLabel = getSanaRoleLabel(user?.role);
  const shortUserId = safeUserId
    ? safeUserId.slice(0, 8).toUpperCase()
    : 'БЕЛГІСІЗ';

  const profileCompletion = [
    Boolean(normalizedFullName),
    Boolean(normalizedBio),
    Boolean(avatarUrl),
    hasEmailProvider,
  ].filter(Boolean).length * 25;

  const roleActions = useMemo(() => {
    if (user?.role === 'student') {
      return [
        {
          title: 'Курстарым',
          text: 'Оқуды жалғастыру',
          href: '/courses',
          icon: <BookOpen size={17} />,
          featured: true,
        },
        {
          title: 'ЖИ көмекші',
          text: 'Тақырыпты бірге түсіну',
          href: '/ai-tutor',
          icon: <Bot size={17} />,
          featured: false,
        },
        {
          title: 'Оқу барысы',
          text: 'Нәтиже мен белсенділік',
          href: '/analytics',
          icon: <BarChart3 size={17} />,
          featured: false,
        },
      ];
    }

    return [
      {
        title: 'Курстарым',
        text: 'Авторлық материалдарды басқару',
        href: user?.role === 'admin' ? '/manage-courses' : '/my-courses',
        icon: <BookOpen size={17} />,
        featured: true,
      },
      {
        title: 'Автор көмекшісі',
        text: 'Идея мен сабақ құрылымы',
        href: '/ai-assistant',
        icon: <Bot size={17} />,
        featured: false,
      },
      {
        title: 'Аналитика',
        text: 'Платформа көрінісі',
        href: user?.role === 'admin' ? '/admin-analytics' : '/analytics',
        icon: <BarChart3 size={17} />,
        featured: false,
      },
    ];
  }, [user?.role]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in space-y-6">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-foreground bg-foreground text-background shadow-soft-lg">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border border-background/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-16 h-52 w-52 rounded-full border border-background/10"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 bg-background/[0.04] blur-3xl"
          />

          <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end lg:p-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="relative w-fit shrink-0">
                <div className="rounded-full border border-background/20 bg-background/10 p-2 shadow-soft-lg">
                  <UserAvatar
                    name={displayName}
                    avatarUrl={avatarUrl}
                    className="h-28 w-28 sm:h-36 sm:w-36"
                    fallbackClassName="text-3xl"
                  />
                </div>

                <label
                  htmlFor="hero-avatar"
                  className={cn(
                    'absolute bottom-1 right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full',
                    'border border-background/20 bg-background text-foreground shadow-soft',
                    'transition-transform duration-200 hover:scale-105 active:scale-95',
                    savingAvatar && 'pointer-events-none opacity-50',
                  )}
                  aria-label="Аватарды өзгерту"
                >
                  <Camera size={16} />
                </label>

                <input
                  id="hero-avatar"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleAvatarFileSelect}
                  disabled={savingAvatar}
                  className="sr-only"
                />
              </div>

              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-background/20 bg-background/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-background/70">
                    Sana · {shortUserId}
                  </span>
                  <span className="rounded-full border border-background/20 bg-background/10 px-3 py-1 text-[10px] font-semibold text-background/80">
                    {sanaRoleLabel}
                  </span>
                </div>

                <h1 className="mt-4 break-words text-4xl font-black tracking-[-0.055em] text-background sm:text-5xl">
                  {displayName}
                </h1>

                <p className="mt-2 break-all text-sm text-background/55">
                  {cleanText(user?.email, MAX_EMAIL_CHARS)}
                </p>

                <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-6 text-background/70">
                  {normalizedBio ||
                    (user?.role === 'student'
                      ? 'Sana-дағы оқу жолыңыз осы жерден көрінеді.'
                      : 'Авторлық бағытыңызды қысқаша сипаттап, профильге мінез беріңіз.')}
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-background/15 bg-background/[0.07] p-5 backdrop-blur-sm">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/45">
                    Профиль күйі
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.045em] text-background">
                    {profileCompletion}%
                  </p>
                </div>

                <Sparkles size={20} className="text-background/55" />
              </div>

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/15">
                <div
                  className="h-full rounded-full bg-background transition-[width] duration-500 ease-soft"
                  style={{ width: `${profileCompletion}%` }}
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-background/55">
                Аватар, аты-жөн, био және қауіпсіздік күйі есепке алынады.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {roleActions.map((action) => (
            <ProfileActionCard
              key={action.title}
              title={action.title}
              text={action.text}
              href={action.href}
              icon={action.icon}
              featured={action.featured}
            />
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="space-y-6">
            <SectionCard
              eyebrow="Жеке кеңістік"
              title="Профильді құрастыру"
              description="Атыңыз бен қысқа сипаттамаңыз Sana-дағы жеке бейнеңізді қалыптастырады."
              icon={<User size={18} />}
            >
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">{t('auth.full_name')}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    maxLength={MAX_FULL_NAME_CHARS}
                    onChange={(event) =>
                      setFullName(
                        cleanText(event.target.value, MAX_FULL_NAME_CHARS),
                      )
                    }
                    disabled={savingProfile}
                    className="h-12 rounded-2xl"
                    placeholder="Аты-жөніңіз"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="bio">Өзіңіз туралы</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {bio.length}/{MAX_BIO_CHARS}
                    </span>
                  </div>

                  <Textarea
                    id="bio"
                    value={bio}
                    maxLength={MAX_BIO_CHARS}
                    onChange={(event) =>
                      setBio(
                        cleanMultilineText(
                          event.target.value,
                          MAX_BIO_CHARS,
                        ),
                      )
                    }
                    placeholder={
                      user?.role === 'student'
                        ? 'Не үйренгіңіз келеді? Қандай тақырыптар қызықтырады?'
                        : 'Қандай бағытта курс жасайсыз? Авторлық ұстанымыңыз қандай?'
                    }
                    rows={7}
                    disabled={savingProfile}
                    className="resize-none rounded-2xl"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Өзгеріс тек «Сақтау» батырмасынан кейін жарияланады.
                  </p>

                  <Button
                    type="button"
                    onClick={saveProfile}
                    disabled={!canSaveProfile}
                    className="rounded-full"
                  >
                    <Save size={15} className="mr-2" />
                    {savingProfile
                      ? t('page.profile.action.saving')
                      : t('page.profile.action.save_changes')}
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Қауіпсіздік"
              title="Кіру және құпиясөз"
              description="Google мен email арқылы кіру әдістерін осы жерден бақылаңыз."
              icon={<ShieldCheck size={18} />}
            >
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
                        <BadgeCheck size={15} />
                      </span>
                      <StatusBadge tone={hasGoogleProvider ? 'primary' : 'muted'}>
                        {hasGoogleProvider ? 'Қосылған' : 'Қосылмаған'}
                      </StatusBadge>
                    </div>
                    <p className="mt-4 text-sm font-bold">Google</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Жылдам авторизация
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
                        <Mail size={15} />
                      </span>
                      <StatusBadge tone={hasEmailProvider ? 'success' : 'warning'}>
                        {hasEmailProvider ? 'Орнатылған' : 'Қажет'}
                      </StatusBadge>
                    </div>
                    <p className="mt-4 text-sm font-bold">Email және құпиясөз</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {cleanText(user?.email, MAX_EMAIL_CHARS) || '—'}
                    </p>
                  </div>
                </div>

                <details className="group rounded-[1.5rem] border border-border bg-muted/35">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card">
                      <KeyRound size={15} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">Құпиясөзді жаңарту</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Кемінде 8 таңба, бір әріп және бір сан.
                      </p>
                    </div>

                    <ArrowRight
                      size={15}
                      className="text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                    />
                  </summary>

                  <div className="space-y-5 border-t border-border p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <PasswordField
                        id="newPassword"
                        label="Жаңа құпиясөз"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="Жаңа құпиясөз"
                        visible={showNewPassword}
                        onToggleVisible={() =>
                          setShowNewPassword((previous) => !previous)
                        }
                        disabled={savingPassword}
                      />

                      <PasswordField
                        id="confirmPassword"
                        label="Қайталау"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Қайта енгізіңіз"
                        visible={showConfirmPassword}
                        onToggleVisible={() =>
                          setShowConfirmPassword((previous) => !previous)
                        }
                        disabled={savingPassword}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <PasswordRule ok={passwordHasMinLength}>
                        Кемінде 8 таңба
                      </PasswordRule>
                      <PasswordRule ok={passwordHasLetter}>
                        Кемінде 1 әріп
                      </PasswordRule>
                      <PasswordRule ok={passwordHasNumber}>
                        Кемінде 1 сан
                      </PasswordRule>
                      <PasswordRule
                        ok={
                          normalizedConfirmPassword.length > 0 &&
                          normalizedNewPassword === normalizedConfirmPassword
                        }
                      >
                        Қайталау сәйкес
                      </PasswordRule>
                    </div>

                    {passwordMismatch ? (
                      <p className="rounded-2xl border border-destructive-muted bg-destructive-soft px-3 py-2 text-sm text-destructive">
                        Құпиясөздер сәйкес келмейді.
                      </p>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={savePassword}
                        disabled={!canSavePassword}
                        className="rounded-full"
                      >
                        <KeyRound size={15} className="mr-2" />
                        {savingPassword
                          ? 'Жаңартылуда...'
                          : 'Құпиясөзді жаңарту'}
                      </Button>
                    </div>
                  </div>
                </details>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              eyebrow="Көрнекі бейне"
              title="Профиль суреті"
              description="Аватар сіздің курстарыңызда, пікірлерде және жеке кеңістікте көрінеді."
              icon={<Camera size={18} />}
            >
              <div className="flex flex-col items-center text-center">
                <div className="relative rounded-full border border-border bg-muted p-2 shadow-soft-md">
                  <UserAvatar
                    name={displayName}
                    avatarUrl={avatarUrl}
                    className="h-32 w-32"
                    fallbackClassName="text-3xl"
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-soft">
                    <Sparkles size={14} />
                  </span>
                </div>

                <p className="mt-5 text-sm font-bold">{displayName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sanaRoleLabel} · Sana
                </p>
              </div>

              <label
                htmlFor="avatar"
                className={cn(
                  'mt-6 block cursor-pointer rounded-[1.5rem] border border-dashed border-foreground/25 bg-muted/40 p-5',
                  'transition-[border-color,background-color,transform] duration-200 ease-soft',
                  'hover:-translate-y-0.5 hover:border-foreground/45 hover:bg-muted/70',
                  savingAvatar && 'pointer-events-none opacity-50',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <ImageIcon size={17} />
                  </span>

                  <div className="min-w-0 text-left">
                    <p className="text-sm font-bold">Жаңа сурет таңдау</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      PNG, JPG немесе WEBP · {MAX_AVATAR_SIZE_MB} MB дейін
                    </p>
                  </div>
                </div>
              </label>

              <input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/jpg"
                onChange={handleAvatarFileSelect}
                disabled={savingAvatar}
                className="sr-only"
              />

              <Button
                type="button"
                variant="outline"
                onClick={removeAvatar}
                disabled={!canRemoveAvatar}
                className="mt-3 w-full rounded-full"
              >
                <Trash2 size={15} className="mr-2" />
                {savingAvatar
                  ? t('page.profile.action.removing_avatar')
                  : t('page.profile.action.remove_avatar')}
              </Button>
            </SectionCard>

            <section className="relative overflow-hidden rounded-[2rem] border border-border bg-muted/45 p-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full border border-foreground/10"
              />

              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Sana белгісі
                </p>
                <p className="mt-3 text-lg font-black tracking-[-0.035em]">
                  Профиль — жай баптау емес.
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Бұл сіздің платформадағы жеке белгіңіз: атыңыз, бағытыңыз
                  және жинақталған оқу жолыңыз.
                </p>

                <div className="mt-5 flex items-center gap-2 text-xs font-semibold">
                  <ShieldCheck size={14} />
                  {getRoleLabel(user?.role)} аккаунты қорғалған
                </div>
              </div>
            </section>
          </div>
        </div>

        <AvatarCropDialog
          open={cropOpen}
          imageSrc={selectedImageSrc}
          onClose={closeCropDialog}
          onCropped={handleAvatarCropped}
        />
      </div>
    </DashboardLayout>
  );
}

