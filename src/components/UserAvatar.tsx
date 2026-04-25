import { useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function getInitials(name?: string) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function normalizeAvatarUrl(url?: string | null) {
  const trimmed = (url || '').trim();
  return trimmed || null;
}

export default function UserAvatar({
  name,
  avatarUrl,
  className = 'h-10 w-10',
  fallbackClassName = '',
}: {
  name?: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const normalizedAvatarUrl = useMemo(
    () => normalizeAvatarUrl(avatarUrl),
    [avatarUrl]
  );

  const [imageError, setImageError] = useState(false);

  /**
   * Avatar URL өзгерген сайын error state reset болуы керек.
   * Әйтпесе бір рет image error болса, жаңа avatarUrl келсе де fallback тұра береді.
   */
  useEffect(() => {
    setImageError(false);
  }, [normalizedAvatarUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(normalizedAvatarUrl && !imageError);

  return (
    <Avatar
      className={`overflow-hidden rounded-full bg-muted ${className}`}
    >
      {showImage ? (
        <AvatarImage
          key={normalizedAvatarUrl}
          src={normalizedAvatarUrl || undefined}
          alt={name ? `${name} avatar` : 'User avatar'}
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      ) : null}

      <AvatarFallback
        className={`h-full w-full rounded-full bg-muted text-muted-foreground font-medium ${fallbackClassName}`}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}