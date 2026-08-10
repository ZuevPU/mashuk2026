import type { MouseEvent } from 'react';
import { normalizeExternalUrl, openExternalUrl } from '../../utils/openUrl';

export type HomeNoticeItem = {
  id: number;
  title: string;
  body: string;
  ctaUrl?: string | null;
  cta_url?: string | null;
  ctaLabel?: string | null;
  cta_label?: string | null;
  imageUrls?: string[];
  image_urls?: string[];
};

function noticeCtaUrl(notice: HomeNoticeItem): string | null {
  return normalizeExternalUrl(notice.ctaUrl || notice.cta_url || '');
}

function noticeCtaLabel(notice: HomeNoticeItem): string {
  return (notice.ctaLabel || notice.cta_label || '').trim() || 'Открыть';
}

function noticeImages(notice: HomeNoticeItem): string[] {
  const raw = notice.imageUrls ?? notice.image_urls;
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

type CardProps = {
  notice: HomeNoticeItem;
  onOpen: () => void;
};

export function HomeNoticeCard({ notice, onOpen }: CardProps) {
  return (
    <div className="m-home-notice">
      <div className="m-home-notice__title">{notice.title}</div>
      <button type="button" className="m-home-notice__btn" onClick={onOpen}>
        Посмотреть
      </button>
    </div>
  );
}

type ModalBodyProps = {
  notice: HomeNoticeItem;
  /** Called after link open attempt — typically closes the modal. */
  onAfterOpenLink?: () => void;
};

export function HomeNoticeModalBody({ notice, onAfterOpenLink }: ModalBodyProps) {
  const images = noticeImages(notice);
  const ctaHref = noticeCtaUrl(notice);
  const ctaLabel = noticeCtaLabel(notice);

  const handleOpenLink = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ctaHref) return;
    // Open while the user gesture is still active, then close the sheet.
    openExternalUrl(ctaHref);
    onAfterOpenLink?.();
  };

  return (
    <div className="m-home-notice-modal">
      <div className="m-home-notice-modal__title">{notice.title}</div>
      {notice.body?.trim() && (
        <div className="m-home-notice-modal__body">{notice.body}</div>
      )}
      {ctaHref && (
        <button
          type="button"
          className="m-home-notice-modal__cta"
          onClick={handleOpenLink}
        >
          {ctaLabel}
        </button>
      )}
      {images.length > 0 && (
        <div className="m-home-notice-modal__gallery">
          {images.map((url, i) => (
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
              className="m-home-notice-modal__img"
              loading="lazy"
              decoding="async"
            />
          ))}
        </div>
      )}
    </div>
  );
}
