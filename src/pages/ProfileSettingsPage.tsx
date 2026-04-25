import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { useAuth } from '@/lib/auth-context';
import t from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE_MB = 25;

function extractStoragePath(url?: string | null) {
  if (!url) return null;

  const cleanUrl = url.split('?')[0];
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const idx = cleanUrl.indexOf(marker);

  if (idx === -1) return null;

  return decodeURIComponent(cleanUrl.slice(idx + marker.length));
}

function getDefaultFullName(
  user?: {
    fullName?: string | null;
    email?: string | null;
  } | null
) {
  return user?.fullName?.trim() || user?.email?.split('@')[0] || '';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getCacheBustedUrl(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

function normalizePassword(value: string) {
  return value.trim();
}

function isValidPassword(value: string) {
  return value.length >= 8 && /[A-Za-zА-Яа-я]/.test(value) && /\d/.test(value);
}

function getProviderLabel(provider: string) {
  if (provider === 'google') return 'Google';
  if (provider === 'email') return 'Email';
  return provider;
}

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>

        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>

      <CardContent>{children}</CardContent>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right text-sm font-medium">{value}</div>
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
      className={`flex items-center gap-2 text-xs ${
        ok ? 'text-emerald-700' : 'text-muted-foreground'
      }`}
    >
      {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span>{children}</span>
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

  useEffect(() => {
    setFullName(getDefaultFullName(user));
    setBio(user?.bio || '');
    setAvatarUrl(user?.avatarUrl || null);
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadAuthStatus = async () => {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;

      if (!authUser || cancelled) return;

      const providerSet = new Set<string>();

      const providers = authUser.app_metadata?.providers;
      if (Array.isArray(providers)) {
        providers.forEach((provider) => {
          if (typeof provider === 'string') providerSet.add(provider);
        });
      }

      authUser.identities?.forEach((identity) => {
        if (identity.provider) providerSet.add(identity.provider);
      });

      const nextProviders = Array.from(providerSet);
      setAuthProviders(nextProviders);

      setPasswordSetupCompleted(
        authUser.user_metadata?.password_setup_completed === true ||
          nextProviders.includes('email')
      );
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
  const defaultBio = user?.bio?.trim() || '';

  const normalizedFullName = fullName.trim();
  const normalizedBio = bio.trim();

  const isProfileDirty =
    normalizedFullName !== defaultFullName || normalizedBio !== defaultBio;

  const hasAvatar = Boolean(avatarUrl);
  const canSaveProfile = Boolean(user) && isProfileDirty && !savingProfile;
  const canRemoveAvatar = Boolean(user) && hasAvatar && !savingAvatar;

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
    Boolean(user) &&
    isValidPassword(normalizedNewPassword) &&
    normalizedConfirmPassword.length >= 8 &&
    normalizedNewPassword === normalizedConfirmPassword &&
    !savingPassword;

  const hasGoogleProvider = authProviders.includes('google');
  const hasEmailProvider = authProviders.includes('email') || passwordSetupCompleted;

  const displayName = normalizedFullName || user?.fullName || user?.email || 'User';

  const upsertProfile = async (patch: {
    full_name?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
  }) => {
    if (!user) {
      throw new Error('User not found');
    }

    const db = supabase as any;

    const { error } = await db
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          full_name: patch.full_name ?? (normalizedFullName || defaultFullName),
          bio: patch.bio ?? (normalizedBio || null),
          avatar_url:
            Object.prototype.hasOwnProperty.call(patch, 'avatar_url')
              ? patch.avatar_url
              : avatarUrl,
        },
        {
          onConflict: 'user_id',
        }
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
    if (!user) return;

    if (!croppedFile.type.startsWith('image/')) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.invalid_file_type'),
        variant: 'destructive',
      });
      return;
    }

    setSavingAvatar(true);

    try {
      const oldStoragePath = extractStoragePath(avatarUrl);
      const filePath = `${user.id}/avatar-${Date.now()}.jpg`;

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
      const nextAvatarUrl = data.publicUrl;

      await upsertProfile({
        avatar_url: nextAvatarUrl,
      });

      if (oldStoragePath && oldStoragePath !== filePath) {
        const { error: removeError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([oldStoragePath]);

        if (removeError) {
          console.warn('[ProfileSettingsPage] Old avatar remove failed', removeError);
        }
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
        description: getErrorMessage(
          error,
          t('page.profile.toast.avatar_save_error')
        ),
        variant: 'destructive',
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveProfile = async () => {
    if (!user || !isProfileDirty) return;

    setSavingProfile(true);

    try {
      await upsertProfile({
        full_name: normalizedFullName || defaultFullName,
        bio: normalizedBio || null,
      });

      await refreshUser();

      toast({
        title: t('page.profile.toast.profile_updated'),
      });
    } catch (error) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: getErrorMessage(
          error,
          t('page.profile.toast.profile_save_error')
        ),
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const removeAvatar = async () => {
    if (!user || !avatarUrl) return;

    setSavingAvatar(true);

    try {
      const storagePath = extractStoragePath(avatarUrl);

      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([storagePath]);

        if (removeError) {
          console.warn('[ProfileSettingsPage] Avatar remove failed', removeError);
        }
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
        description: getErrorMessage(
          error,
          t('page.profile.toast.avatar_remove_error')
        ),
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

      await supabase.auth.updateUser({
        data: {
          password_setup_completed: true,
          password_setup_completed_at: new Date().toISOString(),
        },
      });

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
        description: getErrorMessage(error, 'Құпия сөзді жаңарту мүмкін болмады'),
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
              Аккаунт баптаулары
            </>
          }
          icon={<User size={20} />}
          title={t('page.profile.title')}
          description={t('page.profile.subtitle')}
          actions={
            <StatusBadge
              tone={hasEmailProvider ? 'success' : 'warning'}
              icon={hasEmailProvider ? <ShieldCheck size={12} /> : <KeyRound size={12} />}
            >
              {hasEmailProvider ? 'Құпия сөз бар' : 'Құпия сөз қойылмаған'}
            </StatusBadge>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <SectionCard
              title="Аккаунт"
              description="Профильдің қысқаша көрінісі."
              icon={<BadgeCheck size={16} />}
            >
              <div className="flex flex-col items-center text-center">
                <UserAvatar
                  name={displayName}
                  avatarUrl={avatarUrl}
                  className="h-28 w-28"
                  fallbackClassName="text-2xl"
                />

                <h3 className="mt-4 max-w-full truncate text-base font-semibold">
                  {displayName}
                </h3>

                <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
                  {user?.email}
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {authProviders.length > 0 ? (
                    authProviders.map((provider) => (
                      <StatusBadge
                        key={provider}
                        tone={provider === 'google' ? 'info' : 'success'}
                        icon={provider === 'google' ? <BadgeCheck size={12} /> : <Mail size={12} />}
                      >
                        {getProviderLabel(provider)}
                      </StatusBadge>
                    ))
                  ) : (
                    <StatusBadge tone="muted">Provider анықталмады</StatusBadge>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <InfoRow
                  label="Рөл"
                  value={user?.role ? t(`role.${user.role}` as any) : '—'}
                />
                <InfoRow label="Email" value={user?.email || '—'} />
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

            <SectionCard
              title="Аватар"
              description="Суретті жүктеп, қиып, профильге сақтаңыз."
              icon={<Camera size={16} />}
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-primary">
                      <ImageIcon size={18} />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium">Сурет таңдау</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        PNG, JPG, JPEG немесе WEBP. Максимум {MAX_AVATAR_SIZE_MB} MB.
                        Таңдағаннан кейін crop терезесі ашылады.
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
            <SectionCard
              title={t('page.profile.card_title')}
              description={t('page.profile.card_description')}
              icon={<User size={16} />}
            >
              <div className="space-y-5">
                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">{t('auth.full_name')}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      disabled={savingProfile}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio">{t('page.profile.field.bio')}</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      placeholder={t('page.profile.placeholder.bio')}
                      rows={5}
                      disabled={savingProfile}
                    />
                    <p className="text-xs text-muted-foreground">
                      Бұл bio мұғалім карточкасында немесе профильде көрсетілуі мүмкін.
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

            <SectionCard
              title="Қауіпсіздік"
              description="Құпия сөзді орнатыңыз немесе жаңартыңыз."
              icon={<ShieldCheck size={16} />}
            >
              <div className="space-y-5">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Кіру әдістері</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Google арқылы кірген user үшін бөлек password қоюға болады.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {hasGoogleProvider ? (
                        <StatusBadge tone="info" icon={<BadgeCheck size={12} />}>
                          Google қосылған
                        </StatusBadge>
                      ) : null}

                      <StatusBadge
                        tone={hasEmailProvider ? 'success' : 'warning'}
                        icon={hasEmailProvider ? <CheckCircle2 size={12} /> : <KeyRound size={12} />}
                      >
                        {hasEmailProvider ? 'Password active' : 'Password керек'}
                      </StatusBadge>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword">Жаңа құпия сөз</Label>

                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Кемінде 8 таңба, әріп және сан"
                        className="pr-10"
                        minLength={8}
                        disabled={savingPassword}
                      />

                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground disabled:opacity-50"
                        disabled={savingPassword}
                        aria-label={
                          showNewPassword ? 'Құпия сөзді жасыру' : 'Құпия сөзді көрсету'
                        }
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">Қайталау</Label>

                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Құпия сөзді қайталаңыз"
                        className="pr-10"
                        minLength={8}
                        disabled={savingPassword}
                      />

                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground disabled:opacity-50"
                        disabled={savingPassword}
                        aria-label={
                          showConfirmPassword
                            ? 'Құпия сөзді жасыру'
                            : 'Құпия сөзді көрсету'
                        }
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
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
                    Қайталанған password сәйкес
                  </PasswordRule>
                </div>

                {passwordMismatch ? (
                  <p className="text-sm text-red-600">
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