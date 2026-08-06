import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Client-side QR — works in VK iOS WebView where external QR APIs are often blocked. */
export function QrCodeImage({
  value,
  size = 160,
  alt = 'QR',
}: {
  value: string;
  size?: number;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div style={{ fontSize: 12, color: '#888', margin: '12px 0' }}>
        Не удалось нарисовать QR — скопируйте ссылку ниже
      </div>
    );
  }

  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          margin: '12px auto',
          background: '#f0f2f5',
          borderRadius: 8,
        }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ margin: '12px auto', display: 'block' }}
    />
  );
}
