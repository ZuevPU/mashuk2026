import React, { useEffect, useState } from 'react';

type Size = 'sm' | 'md';

const SIZE: Record<Size, number> = { sm: 32, md: 48 };

export function ParticipantAvatar({
  firstName,
  lastName,
  avatarUrl,
  size = 'sm',
}: {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: Size;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);
  const px = SIZE[size];
  const initials = `${(firstName || '?')[0]}${(lastName || '?')[0]}`.toUpperCase();
  const src = !failed && avatarUrl ? avatarUrl : null;

  return (
    <span
      className={`adm-participant-avatar adm-participant-avatar-${size}`}
      style={{ width: px, height: px, fontSize: size === 'sm' ? 11 : 14 }}
      aria-hidden={!src}
    >
      {src ? (
        <img src={src} alt="" className="adm-participant-avatar-img" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
