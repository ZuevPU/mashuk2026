import { openExternalUrl } from '../../utils/openUrl';

export type HomeNoticeItem = {
  id: number;
  title: string;
  body: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  imageUrls?: string[];
};

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
};

export function HomeNoticeModalBody({ notice }: ModalBodyProps) {
  const images = Array.isArray(notice.imageUrls) ? notice.imageUrls : [];
  const ctaUrl = (notice.ctaUrl || '').trim();
  const ctaLabel = (notice.ctaLabel || '').trim() || 'Открыть';

  return (
    <div className="m-home-notice-modal">
      <div className="m-home-notice-modal__title">{notice.title}</div>
      {notice.body?.trim() && (
        <div className="m-home-notice-modal__body">{notice.body}</div>
      )}
      {images.length > 0 && (
        <div className="m-home-notice-modal__gallery">
          {images.map((url, i) => (
            <img key={`${url}-${i}`} src={url} alt="" className="m-home-notice-modal__img" />
          ))}
        </div>
      )}
      {ctaUrl && (
        <button
          type="button"
          className="m-home-notice-modal__cta"
          onClick={() => openExternalUrl(ctaUrl)}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
