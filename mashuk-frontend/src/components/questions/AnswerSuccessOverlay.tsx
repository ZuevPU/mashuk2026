import type React from 'react';
import { createPortal } from 'react-dom';

export type AnswerConfirmationConfig = {
  enabled: boolean;
  showPoints: boolean;
  titleTemplate: string;
};

export type SubmitSuccessPayload = {
  xpAwarded?: number;
  track?: 'path' | 'experience';
  newMedals?: { id: number; name: string }[];
  confirm?: AnswerConfirmationConfig;
  /** Optional subtitle under the title (status / error hint). */
  detail?: string;
  tone?: 'success' | 'error' | 'info';
};

type Props = {
  payload: SubmitSuccessPayload | null;
  onDone: () => void;
};

function trackLabel(track?: string): string {
  return track === 'experience' ? '⚡ Опыт' : '📍 Путь';
}

export const AnswerSuccessOverlay: React.FC<Props> = ({ payload, onDone }) => {
  if (!payload || payload.confirm?.enabled === false) return null;
  if (typeof document === 'undefined') return null;

  const { confirm, xpAwarded, track, newMedals, detail, tone = 'success' } = payload;
  const showPoints = confirm?.showPoints !== false && (xpAwarded ?? 0) > 0;
  const title = confirm?.titleTemplate || 'Ответ отправлен';
  const medals = newMedals?.length ? newMedals : [];
  const titleColor = tone === 'error' ? '#9B2C2C' : tone === 'info' ? '#2B6CB0' : '#1A1714';

  return createPortal(
    <div
      className="answer-success-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onDone}
    >
      <div className="answer-success-shell" onClick={e => e.stopPropagation()}>
        <div className="m-card answer-success-card">
          <div className="answer-success-title" style={{ color: titleColor }}>
            {tone === 'error' ? '✕ ' : tone === 'info' ? 'ℹ ' : '✓ '}
            {title}
          </div>
          {detail && (
            <div className="answer-success-detail">{detail}</div>
          )}
          {showPoints && (
            <div className="answer-success-points">
              +{xpAwarded} {trackLabel(track)}
            </div>
          )}
          {medals.map(m => (
            <div key={m.id} className="answer-success-medal">
              🏅 Ты получил медаль: {m.name}
            </div>
          ))}
          <button type="button" className="rq-btn answer-success-next" onClick={onDone}>
            Дальше →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
