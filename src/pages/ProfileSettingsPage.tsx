import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  BadgeCheck,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  ImageIcon,
  KeyRound,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';

import AvatarCropDialog from '@/components/AvatarCropDialog';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-card/80 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary-muted bg-primary-soft text-primary shadow-inner-soft">
              {icon}
            </span>
          ) : null}
          {cleanText(title, MAX_FULL_NAME_CHARS)}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-soft/60 px-3 py-2.5 shadow-inner-soft">
      <span className="text-xs text-muted-foreground">
        {cleanText(label, MAX_FULL_NAME_CHARS)}
      </span>
      <div className="min-w-0 text-right text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
        <PageHeader
          eyebrow={
            <>
              <User size={13} />
              Аккаунт
            </>
          }
          icon={<User size={20} />}
          title={t('page.profile.title')}
          actions={
            <StatusBadge tone={hasEmailProvider ? 'success' : 'warning'}>
              {hasEmailProvider ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
              {hasEmailProvider ? 'Құпия сөз бар' : 'Құпия сөз жоқ'}
            </StatusBadge>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <SectionCard title="Аккаунт" icon={<BadgeCheck size={16} />}>
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full border border-primary-muted bg-primary-soft p-1.5 shadow-soft">
                  <UserAvatar
                    name={displayName}
                    avatarUrl={avatarUrl}
                    className="h-28 w-28"
                    fallbackClassName="text-2xl"
                  />
                </div>

                <h3 className="mt-4 max-w-full truncate text-base font-semibold text-foreground">
                  {displayName}
                </h3>

                <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
                  {cleanText(user?.email, MAX_EMAIL_CHARS)}
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {authProviders.length > 0 ? (
                    authProviders.map((provider) => (
                      <StatusBadge
                        key={provider}
                        tone={provider === 'google' ? 'primary' : 'success'}
                      >
                        {provider === 'google' ? (
                          <BadgeCheck size={12} />
                        ) : (
                          <Mail size={12} />
                        )}
                        {getProviderLabel(provider)}
                      </StatusBadge>
                    ))
                  ) : (
                    <StatusBadge tone="muted">Анықталмады</StatusBadge>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <InfoRow label="Рөл" value={getRoleLabel(user?.role)} />
                <InfoRow label="Email" value={cleanText(user?.email, MAX_EMAIL_CHARS) || '—'} />
                <InfoRow
                  label="Google"
                  value={hasGoogleProvider ? 'Қосылған' : 'Қосылмаған'}
                />
                <InfoRow
                  label="Құпия сөз"
                  value={hasEmailProvider ? 'Орнатылған' : 'Орнатылмаған'}
                />
              </div>
            </SectionCard>

            <SectionCard title="Аватар" icon={<Camera size={16} />}>
              <div className="space-y-4">
                <div className="rounded-3xl border border-dashed border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary-muted bg-card text-primary shadow-inner-soft">
                      <ImageIcon size={18} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        Сурет таңдау
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        PNG, JPG, JPEG немесе WEBP. Максимум {MAX_AVATAR_SIZE_MB} MB.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      onChange={handleAvatarFileSelect}
                      disabled={savingAvatar}
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={removeAvatar}
                  disabled={!canRemoveAvatar}
                  className="w-full"
                >
                  <Trash2 size={16} className="mr-2" />
                  {savingAvatar
                    ? t('page.profile.action.removing_avatar')
                    : t('page.profile.action.remove_avatar')}
                </Button>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title={t('page.profile.card_title')} icon={<User size={16} />}>
              <div className="space-y-5">
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">{t('auth.full_name')}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      maxLength={MAX_FULL_NAME_CHARS}
                      onChange={(event) =>
                        setFullName(cleanText(event.target.value, MAX_FULL_NAME_CHARS))
                      }
                      disabled={savingProfile}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio">Өзі туралы</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      maxLength={MAX_BIO_CHARS}
                      onChange={(event) =>
                        setBio(cleanMultilineText(event.target.value, MAX_BIO_CHARS))
                      }
                      placeholder="Қысқаша ақпарат"
                      rows={5}
                      disabled={savingProfile}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {bio.length}/{MAX_BIO_CHARS}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={saveProfile}
                    disabled={!canSaveProfile}
                  >
                    <Save size={16} className="mr-2" />
                    {savingProfile
                      ? t('page.profile.action.saving')
                      : t('page.profile.action.save_changes')}
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Қауіпсіздік" icon={<ShieldCheck size={16} />}>
              <div className="space-y-5">
                <div className="rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      Кіру әдістері
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {hasGoogleProvider ? (
                        <StatusBadge tone="primary">
                          <BadgeCheck size={12} />
                          Google
                        </StatusBadge>
                      ) : null}

                      <StatusBadge tone={hasEmailProvider ? 'success' : 'warning'}>
                        {hasEmailProvider ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <KeyRound size={12} />
                        )}
                        {hasEmailProvider ? 'Құпия сөз бар' : 'Құпия сөз керек'}
                      </StatusBadge>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <PasswordField
                    id="newPassword"
                    label="Жаңа құпия сөз"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Кемінде 8 таңба, әріп және сан"
                    visible={showNewPassword}
                    onToggleVisible={() => setShowNewPassword((prev) => !prev)}
                    disabled={savingPassword}
                  />

                  <PasswordField
                    id="confirmPassword"
                    label="Қайталау"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Құпия сөзді қайталаңыз"
                    visible={showConfirmPassword}
                    onToggleVisible={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={savingPassword}
                  />
                </div>

                <div className="grid gap-2 rounded-3xl border border-border bg-surface-soft/60 p-4 shadow-inner-soft sm:grid-cols-2">
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
                    Құпия сөздер сәйкес келмейді.
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={savePassword}
                    disabled={!canSavePassword}
                  >
                    <KeyRound size={16} className="mr-2" />
                    {savingPassword ? 'Жаңартылуда...' : 'Құпия сөзді жаңарту'}
                  </Button>
                </div>
              </div>
            </SectionCard>
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
