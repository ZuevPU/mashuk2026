import { useEffect } from 'react';
import { apiPost } from '../../api/client';

export type PushBannerItem = {
  id: number;
  pushTitle?: string | null;
  personalizedBody: string;
  icon?: string | null;
  imageUrl?: string | null;
  visibleUntil?: string | null;
};

type Props = {
  banners: PushBannerItem[];
  onDismiss: (id: number) => void;
};

export function PushBanner({ banners, onDismiss }: Props) {
  useEffect(() => {
    for (const b of banners) {
      apiPost(`/push-banners/${b.id}/open`, {}).catch(() => {});
    }
  }, [banners]);

  if (!banners.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      {banners.map(b => (
        <div
          key={b.id}
          className="m-card"
          style={{
            borderLeft: '4px solid #B8621A',
            padding: 12,
            position: 'relative',
          }}
        >
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => {
              apiPost(`/push-banners/${b.id}/dismiss`, {}).then(() => onDismiss(b.id)).catch(() => {});
            }}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {b.icon ? `${b.icon} ` : ''}{b.pushTitle || 'Уведомление'}
          </div>
          <div style={{ fontSize: 13, marginTop: 6, paddingRight: 24 }}>{b.personalizedBody}</div>
          {b.imageUrl && (
            <img
              src={b.imageUrl}
              alt=""
              style={{ maxWidth: '100%', marginTop: 8, borderRadius: 8 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
