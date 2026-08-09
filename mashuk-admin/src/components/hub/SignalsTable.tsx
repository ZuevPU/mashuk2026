import { DashCard, StatusFlag, flagFromActivityRate } from '../analytics/dashboardUi';

export type SignalRow = {
  direction: string;
  registered: number;
  activeParticipants: number;
  activityRatePct: number;
};

/** Единая таблица «сигналы по направлениям» (слабые сверху). */
export function SignalsTable({
  rows,
  title = 'Сигналы по направлениям',
  onOpenDirection,
}: {
  rows: SignalRow[] | null | undefined;
  title?: string;
  onOpenDirection?: (direction: string) => void;
}) {
  const sorted = [...(rows ?? [])].sort((a, b) => a.activityRatePct - b.activityRatePct);

  return (
    <DashCard title={title}>
      {sorted.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет среза по направлениям</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Направление</th>
              <th>Зарег.</th>
              <th>Активны</th>
              <th>%</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.direction}>
                <td>
                  {onOpenDirection ? (
                    <button type="button" className="adm-link" onClick={() => onOpenDirection(row.direction)}>
                      {row.direction}
                    </button>
                  ) : (
                    row.direction
                  )}
                </td>
                <td>{row.registered}</td>
                <td>{row.activeParticipants}</td>
                <td>{row.activityRatePct}%</td>
                <td><StatusFlag status={flagFromActivityRate(row.activityRatePct)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashCard>
  );
}
