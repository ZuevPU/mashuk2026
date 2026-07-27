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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onDone}
    >
      <div style={{ width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="m-card" style={{ marginBottom: 8, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ {title}</div>
          {showPoints && (
            <div style={{ fontSize: 14, color: '#444', marginBottom: medals.length ? 8 : 0 }}>
              +{xpAwarded} {trackLabel(track)}
            </div>
          )}
          {medals.map(m => (
            <div key={m.id} style={{ fontSize: 14, marginTop: 8, padding: 10, background: '#FFFAF0', borderRadius: 8 }}>
              🏅 Ты получил медаль: {m.name}
            </div>
          ))}
          <button
            type="button"
            className="rq-btn"
            style={{ marginTop: 12, width: '100%', textAlign: 'center' }}
            onClick={onDone}
          >
            Дальше →
          </button>
        </div>
      </div>
    </div>
  );
};
