import { useState } from 'react';

const SIZE: Record<'sm' | 'md' | 'lg', number> = { sm: 28, md: 42, lg: 56 };

export function ParticipantAvatarCircle({
  firstName,
  lastName,
  avatarUrl,
  size = 'md',
}: {
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZE[size];
  const initials = `${(firstName || '')[0] || '?'}${(lastName || '')[0] || ''}`.toUpperCase();
  const src = !failed && avatarUrl ? avatarUrl : null;

  return (
    <span className="m-avatar-circle" style={{ width: px, height: px, fontSize: Math.round(px * 0.38) }}>
      {src ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
