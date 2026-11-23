// Профиль суреті немесе аты-жөннің бас әріптері (прототип: #DDD5C8 дөңгелек, қалың әріп).
import { useEffect, useState } from 'react';

import { initialsOf } from '@/components/bl/styles';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-11 w-11 text-[15px]',
  md: 'h-[52px] w-[52px] text-lg',
  lg: 'h-14 w-14 text-xl',
  xl: 'h-16 w-16 text-[22px]',
  hero: 'h-40 w-40 text-5xl',
} as const;

export default function Avatar({
  name,
  url,
  size = 'sm',
  tone = 'warm',
  className,
}: {
  name?: string | null;
  url?: string | null;
  size?: keyof typeof SIZES;
  tone?: 'warm' | 'soft';
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = (url ?? '').trim();

  useEffect(() => setBroken(false), [src]);

  return (
    <span
      className={cn(
        'relative flex flex-none items-center justify-center overflow-hidden rounded-full font-bold text-bl-ink',
        tone === 'warm' ? 'bg-bl-avatar' : 'bg-bl-soft',
        SIZES[size],
        className,
      )}
    >
      {src && !broken ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
