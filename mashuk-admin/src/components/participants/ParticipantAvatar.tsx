import React, { useEffect, useState } from 'react';

type Size = 'sm' | 'md';

const SIZE: Record<Size, number> = { sm: 32, md: 48 };

export function ParticipantAvatar({
  firstName,
  lastName,
  avatarUrl,
  avatarFallbackUrl,
  size = 'sm',
}: {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  /** Tried when primary URL fails to load (e.g. broken /uploads mirror). */
  avatarFallbackUrl?: string | null;
  size?: Size;
}) {
  const [src, setSrc] = useState<string | null>(avatarUrl || avatarFallbackUrl || null);
  useEffect(() => {
    setSrc(avatarUrl || avatarFallbackUrl || null);
  }, [avatarUrl, avatarFallbackUrl]);
  const px = SIZE[size];
  const initials = `${(firstName || '?')[0]}${(lastName || '?')[0]}`.toUpperCase();

  return (
    <span
      className={`adm-participant-avatar adm-participant-avatar-${size}`}
      style={{ width: px, height: px, fontSize: size === 'sm' ? 11 : 14 }}
      aria-hidden={!src}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="adm-participant-avatar-img"
          referrerPolicy="no-referrer"
          onError={() => {
            if (src === avatarUrl && avatarFallbackUrl && avatarFallbackUrl !== avatarUrl) {
              setSrc(avatarFallbackUrl);
              return;
            }
            setSrc(null);
          }}
        />
      ) : (
        initials
      )}
    </span>
  );
}
