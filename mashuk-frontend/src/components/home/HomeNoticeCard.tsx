import type { MouseEvent } from 'react';
import { resolvePublicMediaUrl } from '../../api/client';
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
  const raw: unknown = notice.imageUrls ?? notice.image_urls;
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      list = Array.isArray(parsed) ? parsed : [raw];
    } catch {
      list = [raw];
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const url = resolvePublicMediaUrl(String(item || '').trim());
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

type CardProps = {
  notice: HomeNoticeItem;
  onOpen: () => void;
};

export function HomeNoticeCard({ notice, onOpen }: CardProps) {
  const images = noticeImages(notice);
  const cover = images[0] || null;

  return (
    <div className="m-home-notice">
      {cover && (
        <img
          className="m-home-notice__cover"
          src={cover}
          alt=""
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="m-home-notice__main">
        <div className="m-home-notice__title">{notice.title}</div>
        <button type="button" className="m-home-notice__btn" onClick={onOpen}>
          Посмотреть
        </button>
      </div>
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
              referrerPolicy="no-referrer"
            />
          ))}
        </div>
      )}
    </div>
  );
}
