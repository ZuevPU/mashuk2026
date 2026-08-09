import { useState } from 'react';
import { DashCard } from '../analytics/dashboardUi';
import {
  EMOTION_ORDER,
  PHASE_LABELS,
  ZONE_COLORS,
  ZONE_ORDER,
  formatEmotionName,
  formatZoneName,
} from '../analytics/chartRu';

type PhaseKey = 'morning' | 'day' | 'evening';

type PhaseCell = {
  zones?: Record<string, number>;
  emotions?: Record<string, number>;
  n?: number;
};

export type DirectionPhaseRow = {
  direction: string;
  byPhase: Partial<Record<PhaseKey, PhaseCell>>;
};

const PHASES: PhaseKey[] = ['morning', 'day', 'evening'];

function pct(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v}%`;
}

function delta(morning: number | undefined, evening: number | undefined): number | null {
  if (morning == null || evening == null) return null;
  return Math.round((evening - morning) * 10) / 10;
}

function formatDelta(d: number | null): string {
  if (d == null) return '—';
  if (d === 0) return '0';
  return `${d > 0 ? '+' : ''}${d}`;
}

function cellBg(zoneKey: string, value: number | undefined): string | undefined {
  if (value == null || value <= 0) return undefined;
  const base = ZONE_COLORS[zoneKey] ?? '#718096';
  const alpha = Math.min(0.08 + value / 200, 0.35);
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Смежная таблица: направления × (5 зон | 11 эмоций) × утро/день/вечер.
 * Данные — emotionalPulse.byDirectionPhase из pulse/hub.
 */
export function DirectionZonePhaseTable({
  rows,
  onOpenDirection,
}: {
  rows: DirectionPhaseRow[] | null | undefined;
  onOpenDirection?: (direction: string) => void;
}) {
  const [mode, setMode] = useState<'zones' | 'emotions'>('zones');
  const list = [...(rows ?? [])].sort((a, b) => a.direction.localeCompare(b.direction, 'ru'));
  const keys = mode === 'zones' ? [...ZONE_ORDER] : [...EMOTION_ORDER];
  const labelOf = mode === 'zones' ? formatZoneName : formatEmotionName;

  return (
    <DashCard title="Зоны по направлениям · утро / день / вечер">
      <p className="adm-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 10 }}>
        Доля ответов проверки состояния по фазам дня. Δ — вечер минус утро (п.п.).
      </p>
      <div className="adm-forum-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          className={mode === 'zones' ? 'adm-btn adm-btn-primary' : 'adm-btn'}
          onClick={() => setMode('zones')}
        >
          5 зон
        </button>
        <button
          type="button"
          className={mode === 'emotions' ? 'adm-btn adm-btn-primary' : 'adm-btn'}
          onClick={() => setMode('emotions')}
        >
          11 эмоций
        </button>
      </div>
      {list.length === 0 ? (
        <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>Нет среза по направлениям</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="adm-table" style={{ fontSize: 12, minWidth: mode === 'zones' ? 720 : 960 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Направление</th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>n</th>
                {keys.map(key => (
                  <th
                    key={key}
                    colSpan={4}
                    style={{
                      textAlign: 'center',
                      borderBottom: `2px solid ${ZONE_COLORS[mode === 'zones' ? key : 'neutral'] ?? '#cbd5e0'}`,
                    }}
                  >
                    {labelOf(key)}
                  </th>
                ))}
              </tr>
              <tr>
                {keys.flatMap(key => [
                  ...PHASES.map(phase => (
                    <th key={`${key}-${phase}`} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {PHASE_LABELS[phase]}
                    </th>
                  )),
                  <th key={`${key}-delta`} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Δ</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {list.map(row => {
                const nTotal = PHASES.reduce((s, p) => s + (row.byPhase[p]?.n ?? 0), 0);
                return (
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
                    <td style={{ whiteSpace: 'nowrap' }} title="ответов: утро / день / вечер">
                      {nTotal === 0 ? '—' : PHASES.map(p => row.byPhase[p]?.n ?? 0).join('/')}
                    </td>
                    {keys.flatMap(key => {
                      const vals = PHASES.map(phase => {
                        const cell = row.byPhase[phase];
                        if (!cell) return undefined;
                        return mode === 'zones'
                          ? cell.zones?.[key]
                          : cell.emotions?.[key];
                      });
                      const d = delta(vals[0], vals[2]);
                      const zoneTint = mode === 'zones' ? key : 'neutral';
                      return [
                        ...vals.map((v, i) => (
                          <td
                            key={`${row.direction}-${key}-${PHASES[i]}`}
                            style={{
                              textAlign: 'right',
                              background: cellBg(zoneTint, v),
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {pct(v)}
                          </td>
                        )),
                        <td
                          key={`${row.direction}-${key}-delta`}
                          style={{
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            color: d == null || d === 0 ? undefined : d > 0 ? '#276749' : '#c53030',
                            fontWeight: d && d !== 0 ? 600 : undefined,
                          }}
                        >
                          {formatDelta(d)}
                        </td>,
                      ];
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}
