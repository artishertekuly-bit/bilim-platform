import { useState } from 'react';
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
  const [imageError, setImageError] = useState(false);

  const showImage = avatarUrl && !imageError;

  return (
    <Avatar className={className}>
      {showImage && (
        <AvatarImage
          src={avatarUrl}
          alt={name ? `${name} avatar` : 'User avatar'}
          onError={() => setImageError(true)}
        />
      )}

      <AvatarFallback
        className={`bg-muted text-muted-foreground font-medium ${fallbackClassName}`}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}