import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
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
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';
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

  useEffect(() => {
    setFullName(user?.fullName || '');
    setBio(user?.bio || '');
    setAvatarUrl(user?.avatarUrl || null);
  }, [user]);

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

  const passwordMismatch =
    normalizedNewPassword.length > 0 &&
    normalizedConfirmPassword.length > 0 &&
    normalizedNewPassword !== normalizedConfirmPassword;

  const passwordTooShort =
    normalizedNewPassword.length > 0 && normalizedNewPassword.length < 8;

  const passwordMissingNumber =
    normalizedNewPassword.length > 0 && !/\d/.test(normalizedNewPassword);

  const passwordMissingLetter =
    normalizedNewPassword.length > 0 &&
    !/[A-Za-zА-Яа-я]/.test(normalizedNewPassword);

  const canSavePassword =
    Boolean(user) &&
    isValidPassword(normalizedNewPassword) &&
    normalizedConfirmPassword.length >= 8 &&
    normalizedNewPassword === normalizedConfirmPassword &&
    !savingPassword;

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

  const handleAvatarFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.invalid_file_type'),
        variant: 'destructive',
      });
      e.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_MB * 1024 * 1024) {
      toast({
        title: t('page.profile.toast.error_title'),
        description: t('page.profile.toast.file_too_large'),
        variant: 'destructive',
      });
      e.currentTarget.value = '';
      return;
    }

    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedImageSrc(objectUrl);
    setCropOpen(true);
    e.currentTarget.value = '';
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
      <div className="max-w-3xl space-y-6 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold">{t('page.profile.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.profile.subtitle')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('page.profile.card_title')}</CardTitle>
            <CardDescription>
              {t('page.profile.card_description')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <UserAvatar
                name={normalizedFullName || user?.fullName}
                avatarUrl={avatarUrl}
                className="h-24 w-24"
                fallbackClassName="text-xl"
              />

              <div className="flex-1 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="avatar">{t('page.profile.field.avatar')}</Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    onChange={handleAvatarFileSelect}
                    disabled={savingAvatar}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('page.profile.avatar_hint')}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={removeAvatar}
                    disabled={!canRemoveAvatar}
                  >
                    <Trash2 size={16} className="mr-2" />
                    {savingAvatar
                      ? t('page.profile.action.removing_avatar')
                      : t('page.profile.action.remove_avatar')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t('auth.full_name')}</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={savingProfile}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bio">{t('page.profile.field.bio')}</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('page.profile.placeholder.bio')}
                  rows={5}
                  disabled={savingProfile}
                />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Қауіпсіздік</CardTitle>
            <CardDescription>Құпия сөзді өзгерту</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Жаңа құпия сөз</Label>

              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
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

            {passwordTooShort ? (
              <p className="text-sm text-red-600">
                Құпия сөз кемінде 8 таңбадан тұруы керек.
              </p>
            ) : null}

            {passwordMissingLetter ? (
              <p className="text-sm text-red-600">
                Құпия сөзде кемінде бір әріп болуы керек.
              </p>
            ) : null}

            {passwordMissingNumber ? (
              <p className="text-sm text-red-600">
                Құпия сөзде кемінде бір сан болуы керек.
              </p>
            ) : null}

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
                {savingPassword ? 'Жаңартылуда...' : 'Құпия сөзді жаңарту'}
              </Button>
            </div>
          </CardContent>
        </Card>

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