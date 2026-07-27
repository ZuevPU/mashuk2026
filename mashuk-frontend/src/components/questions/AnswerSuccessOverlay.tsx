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

  const { confirm, xpAwarded, track, newMedals } = payload;
  const showPoints = confirm?.showPoints !== false && (xpAwarded ?? 0) > 0;
  const title = confirm?.titleTemplate || 'Ответ отправлен';
  const medals = newMedals?.length ? newMedals : [];

  return (
    <div className="answer-success-backdrop" onClick={onDone}>
      <div className="answer-success-shell" onClick={e => e.stopPropagation()}>
        <div className="m-card answer-success-card">
          <div className="answer-success-title">✓ {title}</div>
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
    </div>
  );
};
