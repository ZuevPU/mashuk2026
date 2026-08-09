import { DashCard } from '../analytics/dashboardUi';

type ReasonRow = {
  direction: string;
  topTokens?: { token: string; count: number }[];
};

/**
 * Топ-3 слова из текстовых причин проверки состояния — по направлениям.
 * Данные: pulse.stateReasons.byDirection.
 */
export function StateReasonsByDirectionTable({
  rows,
  directions,
  onOpenDirection,
}: {
  rows?: ReasonRow[] | null;
  /** Полный список направлений среза — чтобы показать строки даже без причин. */
  directions?: string[] | null;
  onOpenDirection?: (direction: string) => void;
}) {
  const byDir = new Map((rows ?? []).map(r => [r.direction, r.topTokens ?? []]));
  const names = (directions?.length
    ? directions
    : [...byDir.keys()]
  ).slice().sort((a, b) => a.localeCompare(b, 'ru'));

  return (
    <DashCard title="Частые слова в причинах состояния — по направлениям">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: -4,
        marginBottom: 10,
      }}>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          Что именно стоит за цифрами
        </span>
      </div>
      {names.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
          Нет текстовых причин проверки состояния в срезе.
        </p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Направление</th>
              <th>Топ-3 слова</th>
            </tr>
          </thead>
          <tbody>
            {names.map(direction => {
              const tokens = (byDir.get(direction) ?? []).slice(0, 3);
              return (
                <tr key={direction}>
                  <td>
                    {onOpenDirection ? (
                      <button
                        type="button"
                        className="adm-link"
                        style={{ fontWeight: 600 }}
                        onClick={() => onOpenDirection(direction)}
                      >
                        {direction}
                      </button>
                    ) : (
                      <strong>{direction}</strong>
                    )}
                  </td>
                  <td style={{ color: tokens.length ? undefined : '#9ca3af' }}>
                    {tokens.length
                      ? tokens.map(t => t.token).join(' · ')
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DashCard>
  );
}
