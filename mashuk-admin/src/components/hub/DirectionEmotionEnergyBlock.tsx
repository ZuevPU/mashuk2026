import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useInsights } from '../insights/InsightsContext';
import { DashCard } from '../analytics/dashboardUi';
import {
  ZONE_COLORS,
  ZONE_LABELS,
  formatForumDay,
  formatZoneName,
} from '../analytics/chartRu';

export type DirectionEmotionEnergyRow = {
  direction: string;
  day: number;
  energyAvg: number | null;
  responses: number;
  energyResponses?: number;
  zones: Record<string, number>;
  riskFatiguePct: number;
  engagementLiftPct: number;
  dominantZone: string;
};

type TableRow = DirectionEmotionEnergyRow & {
  riskPct: number;
  fatiguePct: number;
  balance: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(n: number | undefined): number {
  return round1(Number(n) || 0);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1).replace('.', ',')}%`;
}

function fmtEnergy(n: number | null): string {
  if (n == null) return '—';
  return n.toFixed(1).replace('.', ',');
}

function BubbleTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: TableRow }[];
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: '#1d1d1f',
      color: '#fff',
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 12,
      maxWidth: 260,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.direction}</div>
      <div>n: {p.responses}</div>
      <div>ср. энергия: {fmtEnergy(p.energyAvg)}</div>
      <div>% риск: {fmtPct(p.riskPct)}</div>
      <div>% усталость: {fmtPct(p.fatiguePct)}</div>
      <div>% риск+усталость: {fmtPct(p.riskFatiguePct)}</div>
      <div>% включение+подъём: {fmtPct(p.engagementLiftPct)}</div>
      <div>баланс (Y): {p.balance > 0 ? '+' : ''}{p.balance.toFixed(1).replace('.', ',')} п.п.</div>
      <div>доминанта: {formatZoneName(p.dominantZone)}</div>
    </div>
  );
}

/**
 * Штаб · Форум — «Эмоции × энергия по направлениям» за один день.
 * Таблица + bubble scatter; клик по направлению → линза «Направление».
 */
export function DirectionEmotionEnergyBlock({
  rows,
  onOpenDirection,
}: {
  rows?: DirectionEmotionEnergyRow[] | null;
  onOpenDirection: (direction: string) => void;
}) {
  const { forumDay, meta } = useInsights();
  const all = rows ?? [];

  const daysWithData = useMemo(() => {
    const set = new Set(
      all.filter(r => r.responses > 0 && (
        r.energyAvg != null
        || (r.zones && Object.values(r.zones).some(v => Number(v) > 0))
      )).map(r => r.day),
    );
    return [...set].sort((a, b) => a - b);
  }, [all]);

  const [day, setDay] = useState<number | null>(null);

  useEffect(() => {
    if (!daysWithData.length) {
      setDay(null);
      return;
    }
    const current = meta?.currentForumDay ?? (Number(forumDay) || daysWithData[daysWithData.length - 1]);
    const preferred = daysWithData.includes(current)
      ? current
      : daysWithData[daysWithData.length - 1];
    setDay(prev => (prev != null && daysWithData.includes(prev) ? prev : preferred));
  }, [daysWithData, meta?.currentForumDay, forumDay]);

  const tableRows = useMemo((): TableRow[] => {
    if (day == null) return [];
    return all
      .filter(r => r.day === day && r.responses > 0)
      .map(r => {
        const riskPct = pct(r.zones?.risk);
        const fatiguePct = pct(r.zones?.fatigue);
        const riskFatiguePct = pct(r.riskFatiguePct ?? riskPct + fatiguePct);
        const engagementLiftPct = pct(
          r.engagementLiftPct
          ?? (Number(r.zones?.engagement) || 0) + (Number(r.zones?.lift) || 0),
        );
        return {
          ...r,
          riskPct,
          fatiguePct,
          riskFatiguePct,
          engagementLiftPct,
          balance: round1(engagementLiftPct - riskFatiguePct),
        };
      })
      .sort((a, b) => b.riskFatiguePct - a.riskFatiguePct
        || a.direction.localeCompare(b.direction, 'ru'));
  }, [all, day]);

  const scatterData = useMemo(
    () => tableRows
      .filter(r => r.energyAvg != null)
      .map(r => ({
        ...r,
        x: r.energyAvg as number,
        y: r.balance,
        z: Math.max(r.responses, 1),
      })),
    [tableRows],
  );

  const insight = useMemo(() => {
    if (!tableRows.length) return null;
    const withEnergy = tableRows.filter(r => r.energyAvg != null);
    if (!withEnergy.length) return null;

    const stressed = [...withEnergy].sort((a, b) =>
      (a.energyAvg! - b.energyAvg!)
      || (b.riskFatiguePct - a.riskFatiguePct)
      || a.direction.localeCompare(b.direction, 'ru'),
    )[0];
    const lifted = [...withEnergy].sort((a, b) =>
      (b.energyAvg! - a.energyAvg!)
      || (b.engagementLiftPct - a.engagementLiftPct)
      || a.direction.localeCompare(b.direction, 'ru'),
    )[0];

    const a = `Минимум энергии при высоком риске: «${stressed.direction}» `
      + `(энергия ${fmtEnergy(stressed.energyAvg)}, риск+усталость ${fmtPct(stressed.riskFatiguePct)}).`;
    const b = stressed.direction === lifted.direction
      ? ' Отдельного лидера по энергии и подъёму за этот день нет — то же направление остаётся единственным ориентиром.'
      : ` Максимум энергии и подъёма: «${lifted.direction}» `
        + `(энергия ${fmtEnergy(lifted.energyAvg)}, включение+подъём ${fmtPct(lifted.engagementLiftPct)}).`;
    return a + b;
  }, [tableRows]);

  const title = day != null
    ? `Эмоции × энергия по направлениям · ${formatForumDay(day)}`
    : 'Эмоции × энергия по направлениям';

  if (!daysWithData.length) {
    return (
      <DashCard title="Эмоции × энергия по направлениям">
        <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
          Нет дней с ответами проверки состояния (энергия / зоны) в этом срезе.
        </p>
      </DashCard>
    );
  }

  return (
    <DashCard title={title} badge="день">
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <label className="adm-insights-filter">
          День
          <select
            className="adm-input"
            value={day ?? ''}
            onChange={e => setDay(Number(e.target.value))}
          >
            {daysWithData.map(d => (
              <option key={d} value={d}>{formatForumDay(d)}</option>
            ))}
          </select>
        </label>
        <span className="adm-muted" style={{ fontSize: 12 }}>
          Только дни с ответами проверки состояния · пузырь = n ответов
        </span>
      </div>

      {tableRows.length === 0 ? (
        <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>
          За {day != null ? formatForumDay(day) : 'выбранный день'} нет данных по направлениям.
        </p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table className="adm-table" style={{ fontSize: 12, minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Направление</th>
                  <th style={{ textAlign: 'right' }}>n</th>
                  <th style={{ textAlign: 'right' }}>ср. энергия</th>
                  <th style={{ textAlign: 'right' }}>% риск</th>
                  <th style={{ textAlign: 'right' }}>% усталость</th>
                  <th style={{ textAlign: 'right' }}>% риск+устал.</th>
                  <th style={{ textAlign: 'right' }}>% вкл.+подъём</th>
                  <th>доминанта</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(row => (
                  <tr
                    key={row.direction}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenDirection(row.direction)}
                    title="Открыть линзу «Направление»"
                  >
                    <td>
                      <button
                        type="button"
                        className="adm-link"
                        onClick={e => {
                          e.stopPropagation();
                          onOpenDirection(row.direction);
                        }}
                      >
                        {row.direction}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.responses}</td>
                    <td style={{ textAlign: 'right' }}>{fmtEnergy(row.energyAvg)}</td>
                    <td style={{ textAlign: 'right', color: ZONE_COLORS.risk }}>{fmtPct(row.riskPct)}</td>
                    <td style={{ textAlign: 'right', color: ZONE_COLORS.fatigue }}>{fmtPct(row.fatiguePct)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtPct(row.riskFatiguePct)}</td>
                    <td style={{ textAlign: 'right', color: ZONE_COLORS.lift }}>{fmtPct(row.engagementLiftPct)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: ZONE_COLORS[row.dominantZone] ?? '#718096',
                        marginRight: 6,
                      }} />
                      {ZONE_LABELS[row.dominantZone] ?? formatZoneName(row.dominantZone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scatterData.length === 0 ? (
            <p className="adm-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
              Есть зоны, но нет ответов с энергией — scatter недоступен.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="энергия"
                  domain={[0, 10]}
                  tickCount={6}
                  label={{ value: 'ср. энергия', position: 'insideBottom', offset: -2, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="баланс"
                  tickFormatter={v => `${v}`}
                  label={{
                    value: '% (вкл.+подъём) − % (риск+устал.)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 10 },
                  }}
                />
                <ZAxis type="number" dataKey="z" range={[60, 400]} />
                <Tooltip content={<BubbleTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter
                  data={scatterData}
                  onClick={(_data, _index, e) => {
                    const payload = (e as { payload?: { direction?: string } } | undefined)?.payload
                      ?? (_data as { payload?: { direction?: string }; direction?: string } | undefined);
                    const direction = payload && 'direction' in payload
                      ? payload.direction
                      : (payload as { payload?: { direction?: string } } | undefined)?.payload?.direction;
                    if (direction) onOpenDirection(direction);
                  }}
                >
                  {scatterData.map(entry => (
                    <Cell
                      key={entry.direction}
                      fill={ZONE_COLORS[entry.dominantZone] ?? '#718096'}
                      fillOpacity={0.75}
                      stroke="#1d1d1f"
                      strokeWidth={0.5}
                      cursor="pointer"
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          )}

          {scatterData.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 4,
              marginBottom: 8,
              fontSize: 11,
            }}>
              {scatterData.map(r => (
                <button
                  key={`lbl-${r.direction}`}
                  type="button"
                  className="adm-link"
                  style={{ fontSize: 11 }}
                  onClick={() => onOpenDirection(r.direction)}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: ZONE_COLORS[r.dominantZone] ?? '#718096',
                    marginRight: 4,
                  }} />
                  {r.direction}
                </button>
              ))}
            </div>
          )}

          {insight && (
            <p style={{
              margin: '8px 0 0',
              fontSize: 13,
              lineHeight: 1.45,
              color: '#3a3a3c',
            }}>
              {insight}
            </p>
          )}
        </>
      )}
    </DashCard>
  );
}
