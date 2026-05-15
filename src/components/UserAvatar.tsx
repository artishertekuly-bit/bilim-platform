import { useEffect, useMemo, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

function getInitials(name?: string | null) {
  const trimmed = (name || '').trim();

  if (!trimmed) {
    return '?';
  }

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
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const normalizedAvatarUrl = useMemo(
    () => normalizeAvatarUrl(avatarUrl),
    [avatarUrl]
  );

  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [normalizedAvatarUrl]);

  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(normalizedAvatarUrl && !imageError);

  return (
    <Avatar
      className={cn(
        'overflow-hidden rounded-full border border-primary-muted bg-primary-soft text-primary',
        className
      )}
    >
      {showImage ? (
        <AvatarImage
          key={normalizedAvatarUrl}
          src={normalizedAvatarUrl || undefined}
          alt={name ? `${name} профиль суреті` : 'Профиль суреті'}
          className="h-full w-full rounded-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
        />
      ) : null}

      <AvatarFallback
        className={cn(
          'h-full w-full rounded-full bg-primary-soft text-xs font-semibold text-primary',
          fallbackClassName
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}